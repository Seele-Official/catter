#include <iostream>
#include <print>
#include <ranges>
#include <algorithm>
#include <cassert>
#include <format>
#include <print>

#include <eventide/async/async.h>
#include <eventide/reflection/name.h>
#include <eventide/deco/runtime.h>
#include <sstream>
#include <string_view>
#include <unordered_map>
#include "capi/type.h"
#include "opt/main/option.h"

#include "js.h"
#include "ipc.h"
#include "qjs.h"
#include "session.h"
#include "util/crossplat.h"
#include "util/data.h"
#include "util/log.h"

using namespace catter;

static std::unordered_map<data::ServiceMode, js::CatterRuntime> catter_runtime_map = {
    {data::ServiceMode::INJECT,
     js::CatterRuntime{
         .supportActions = {js::ActionType::drop, js::ActionType::skip, js::ActionType::modify},
         .supportEvents = {js::EventType::finish},
         .type = js::CatterRuntime::Type::inject,
         .supportParentId = true,
     }},
};

class ServiceImpl : public ipc::InjectService {
public:
    ServiceImpl(data::ipcid_t id) : id(id) {};
    ~ServiceImpl() override = default;

    data::ipcid_t create(data::ipcid_t parent_id) override {
        this->parent_id = parent_id;
        return this->id;
    }

    data::action make_decision(data::command cmd) override {
        auto act = js::on_command(this->id,
                                  js::CommandData{
                                      .cwd = cmd.cwd,
                                      .exe = cmd.executable,
                                      .argv = cmd.args,
                                      .env = cmd.env,
                                      .parent = this->parent_id,
                                  });

        switch(act.type) {
            case js::ActionType::drop:
            case js::ActionType::skip: {
                return data::action{.type = data::action::INJECT, .cmd = cmd};
            }

            case js::ActionType::modify: {
                if(!act.data.has_value()) {
                    throw std::runtime_error("Modify action must have data");
                }

                return data::action{
                    .type = data::action::INJECT,
                    .cmd = {
                            .cwd = std::move(act.data->cwd),
                            .executable = std::move(act.data->exe),
                            .args = std::move(act.data->argv),
                            .env = std::move(act.data->env),
                            }
                };
            }
            default: throw std::runtime_error("Unhandled action type");
        }
    }

    void finish(int64_t code) override {
        js::on_execution(this->id,
                         {
                             .code = code,
                             .type = js::EventType::finish,
                         });
    }

    void report_error(data::ipcid_t parent_id, std::string error_msg) override {
        std::println("[{}] Error reported for command with parent id {} : {}",
                     this->id,
                     parent_id,
                     error_msg);
    }

    struct Factory {
        std::unique_ptr<ServiceImpl> operator() (data::ipcid_t id) {
            return std::make_unique<ServiceImpl>(id);
        }
    };

private:
    data::ipcid_t id = 0;
    data::ipcid_t parent_id = 0;
};

void dispatch(const core::Option::CatterOption& opt) {
    log::mute_logger();

    struct Config {
        bool log;
        ipc::ServiceMode mode;
        std::string script_path;
        std::vector<std::string> script_args;
        std::vector<std::string> build_system_command;
        js::CatterRuntime runtime;
    };

    Config config{
        .log = true,
        .script_path = *opt.script_path,
        .script_args = {},
        .build_system_command = *opt.args,
    };
    js::init_qjs({.pwd = std::filesystem::current_path()});

    if(*opt.mode == "inject") {
        config.mode = data::ServiceMode::INJECT;
        config.runtime = catter_runtime_map.at(config.mode);
        std::string_view script = R"(
        import { scripts, service } from "catter";
        service.register(new scripts.CDB());
        )";
        js::run_js_file(script, config.script_path);
    } else {
        throw std::runtime_error(std::format("Unsupported mode: {}", *opt.mode));
    }

    js::on_start({
        .scriptPath = config.script_path,
        .scriptArgs = {},
        .buildSystemCommand = config.build_system_command,
        .runtime = config.runtime,
        .options =
            {
                       .log = config.log,
                       },
        .isScriptSupported = true
    });

    Session session;

    session.run(*opt.args, ServiceImpl::Factory{});

    js::on_finish();
}

// catter -m inject -s ./test.js -- make -j8
int main(int argc, char* argv[]) {
    auto args = deco::util::argvify(argc, argv, 1);

    try {
        deco::cli::Dispatcher<core::Option> cli("catter [options] -- <target program> [args...]");
        cli.dispatch(core::Option::HelpOpt::category_info,
                     [&](const core::Option& opt) { cli.usage(std::cout); })
            .dispatch(core::Option::CatterOption::category_info,
                      [&](const auto& opt) { dispatch(opt.proxy_opt); })
            .dispatch([&](const auto&) { cli.usage(std::cout); })
            .when_err([&](const deco::cli::ParseError& err) {
                std::println("Error parsing options: {}", err.message);
                std::println("Use -h or --help for usage.");
            })
            .parse(args);
    } catch(const qjs::JSException& ex) {
        std::println("Eval JavaScript file failed: \n{}", ex.what());
        return 1;
    } catch(const std::exception& ex) {
        std::println("Fatal error: {}", ex.what());
        return 1;
    } catch(...) {
        std::println("Unknown fatal error.");
        return 1;
    }
    return 0;
}
