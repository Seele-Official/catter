

// clang-format off
// RUN: %it_catter_proxy
// clang-format on
#include <coroutine>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <exception>
#include <filesystem>
#include <list>
#include <memory>
#include <stdexcept>
#include <vector>
#include <string>
#include <print>
#include <ranges>
#include <algorithm>
#include <cassert>
#include <format>
#include <print>

#include <eventide/process.h>
#include <eventide/stream.h>
#include <eventide/loop.h>
#include <reflection/name.h>

#include "session.h"
#include "ipc.h"
#include "config/ipc.h"
#include "config/catter-proxy.h"
#include "util/crossplat.h"
#include "util/eventide.h"
#include "util/serde.h"
#include "util/data.h"
#include "opt-data/catter/table.h"

using namespace catter;

class ServiceImpl : public ipc::DefaultService {
public:
    ServiceImpl(data::ipcid_t id) : id(id) {};
    ~ServiceImpl() override = default;

    data::ipcid_t create(data::ipcid_t parent_id) override {
        this->create_called = true;
        std::println("Creating new command with parent id: {}", parent_id);
        return ++this->id;
    }

    data::action make_decision(data::command cmd) override {
        this->make_decision_called = true;
        std::string args_str;
        for(const auto& arg: cmd.args) {
            args_str.append(arg).append(" ");
        }

        std::println("Received command: \n    cwd = {} \n    exe = {} \n    args = {}",
                     cmd.cwd,
                     cmd.executable,
                     args_str);
        return data::action{.type = data::action::WRAP, .cmd = cmd};
    }

    void finish(int64_t code) override {
        this->finish_called = true;
        std::println("Command finished with code: {}", code);
    }

    void report_error(data::ipcid_t parent_id, data::ipcid_t id, std::string error_msg) override {
        this->error_reported = true;
        std::println("Error reported for command with parent id {} and id {}: {}",
                     parent_id,
                     id,
                     error_msg);
    }

    struct Factory {
        data::ipcid_t id;

        std::unique_ptr<ServiceImpl> operator() () {
            return std::make_unique<ServiceImpl>(++id);
        }
    };

public:
    bool create_called = false;
    bool make_decision_called = false;
    bool finish_called = false;
    bool error_reported = false;
    data::ipcid_t id;
};

class SessionImpl : public Session {
public:
    void start() override {
        std::println("Session started.");
    }

    void finish(int64_t code) override {
        std::println("Session finished with code: {}", code);
    }
};

int main(int argc, char* argv[]) {
    try {
        SessionImpl session;
        session.run({"echo", "Hello, World!"}, ServiceImpl::Factory{0});
    } catch(const std::exception& ex) {
        std::println("Fatal error: {}", ex.what());
        return 1;
    } catch(...) {
        std::println("Unknown fatal error.");
        return 1;
    }
    return 0;
}
