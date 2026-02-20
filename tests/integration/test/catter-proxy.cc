

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

#include "ipc.h"
#include "config/ipc.h"
#include "config/catter-proxy.h"
#include "util/crossplat.h"
#include "util/eventide.h"
#include "util/serde.h"
#include "util/data.h"
#include "opt-data/catter/table.h"

using namespace catter;

using acceptor = eventide::acceptor<eventide::pipe>;

class ServiceImpl : public ipc::Service {
public:
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

public:
    bool create_called = false;
    bool make_decision_called = false;
    bool finish_called = false;
    bool error_reported = false;
    data::ipcid_t id = 0;
};

eventide::task<void> spawn(std::shared_ptr<acceptor> acceptor) {
    std::string exe_path =
        (util::get_catter_root_path() / catter::config::proxy::EXE_NAME).string();

    std::vector<std::string> args = {exe_path, "-p", "0", "--exec", "echo", "--", "Hello, World!"};

    eventide::process::options opts{
        .file = exe_path,
        .args = args,
        .creation = {.windows_hide = true, .windows_verbatim_arguments = true},
        .streams = {eventide::process::stdio::ignore(),
                     eventide::process::stdio::ignore(),
                     eventide::process::stdio::ignore()}
    };
    auto ret = co_await catter::spawn(opts);
    auto error = acceptor->stop();  // Stop accepting new clients after spawning the process
    if(error) {
        std::println("Failed to stop acceptor: {}", error.message());
    }
    co_return;
}

eventide::task<void> loop(std::shared_ptr<acceptor> acceptor) {
    ServiceImpl service{};
    std::list<eventide::task<void>> linked_clients;
    while(true) {
        auto client = co_await acceptor->accept();
        if(!client) {
            assert(client.error() == eventide::error::operation_aborted);
            // Accept can fail with operation_aborted when the acceptor is stopped, which is
            // expected
            break;
        }
        linked_clients.push_back(ipc::accept(service, std::move(*client)));
        default_loop().schedule(linked_clients.back());
    }

    assert(service.create_called && service.make_decision_called && service.finish_called &&
           !service.error_reported &&
           "Expected all IPC handler methods to be called appropriately");

    try {
        for(auto& client_task: linked_clients) {
            client_task.result();  // Await completion and propagate exceptions
        }
    } catch(const std::exception& ex) {
        std::println("Exception in client task: {}", ex.what());
    }
    co_return;
}

int main(int argc, char* argv[]) {
#ifndef _WIN32
    if(std::filesystem::exists(catter::config::ipc::PIPE_NAME)) {
        std::filesystem::remove(catter::config::ipc::PIPE_NAME);
    }
#endif

    auto acc_ret = eventide::pipe::listen(catter::config::ipc::PIPE_NAME,
                                          eventide::pipe::options(),
                                          default_loop());

    if(!acc_ret) {
        std::println("Failed to create pipe server: {}", acc_ret.error().message());
        return 1;
    }

    try {
        auto acc = std::make_shared<acceptor>(std::move(*acc_ret));
        // becareful, msvc has a bug that asan will report false positive UAF
        default_loop().schedule(loop(acc));
        default_loop().schedule(spawn(acc));
        acc.reset();  // We can release our reference to the acceptor since the loop task will keep
                      // it alive
        default_loop().run();
    } catch(const std::exception& ex) {
        std::println("Fatal error: {}", ex.what());
        return 1;
    } catch(...) {
        std::println("Unknown fatal error.");
        return 1;
    }
    return 0;
}
