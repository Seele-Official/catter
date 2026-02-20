#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <format>
#include <stdexcept>
#include <string>
#include <system_error>

#include <eventide/process.h>

#include "ipc.h"
#include "hook.h"

#include "util/log.h"
#include "util/eventide.h"
#include "util/crossplat.h"
#include "config/catter-proxy.h"
#include "opt-data/catter-proxy/parser.h"

using namespace catter;

namespace catter::proxy {
int64_t run(data::action act, data::ipcid_t id) {
    using catter::data::action;
    switch(act.type) {
        case action::WRAP: {
            eventide::process::options opts{
                .file = act.cmd.executable,
                .args = act.cmd.args,
                .cwd = act.cmd.cwd,
                .creation = {.windows_hide = true, .windows_verbatim_arguments = true}
            };
            return wait(spawn(opts));
        }
        case action::INJECT: {
            return proxy::hook::run(act.cmd, id);
        }
        case action::DROP: {
            return 0;
        }
        default: {
            return -1;
        }
    }
}
}  // namespace catter::proxy

// we do not output in proxy, it must be invoked by main program.
// usage: catter-proxy.exe -p <parent ipc id> --exec <exe path> -- <args...>
int main(int argc, char* argv[], char* envp[]) {
    try {
        log::init_logger("catter-proxy.log",
                         util::get_catter_data_path() / config::proxy::LOG_PATH_REL,
                         false);
    } catch(const std::exception& e) {
        // cannot init logger
        log::mute_logger();
    }

    try {

        auto opt = optdata::catter_proxy::parse_opt(argc, argv);

        if(!opt.argv.has_value()) {
            throw opt.argv.error();
        }
        data::command cmd = {
            .cwd = std::filesystem::current_path().string(),
            .executable = opt.executable,
            .args = opt.argv.value(),
            .env = util::get_environment(),
        };

        auto id = proxy::ipc::create(std::stoi(opt.parent_id));

        auto received_act = proxy::ipc::make_decision(cmd);

        int64_t ret = proxy::run(received_act, id);

        proxy::ipc::finish(ret);

        return ret;
    } catch(const std::exception& e) {
        std::string args;
        for(int i = 0; i < argc; ++i) {
            args += std::format("{} ", argv[i]);
        }

        LOG_CRITICAL("Exception in catter-proxy: {}. Args: {}", e.what(), args);
        proxy::ipc::report_error(e.what());
        return -1;
    } catch(...) {
        LOG_CRITICAL("Unknown exception in catter-proxy.");
        proxy::ipc::report_error("Unknown exception in catter-proxy.");
        return -1;
    }
}
