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

#include "js.h"
#include "ipc.h"
#include "config/ipc.h"
#include "config/catter-proxy.h"
#include "util/crossplat.h"
#include "util/eventide.h"
#include "util/function_ref.h"
#include "util/serde.h"
#include "util/data.h"
#include "opt-data/catter/table.h"

using namespace catter;

class Handler {
public:
    virtual void start() = 0;
    virtual void finish(int64_t code) = 0;
};

using acceptor = eventide::acceptor<eventide::pipe>;

eventide::task<void> spawn(std::vector<std::string> shell, std::shared_ptr<acceptor> acceptor) {
    // co_await std::suspend_always{};  // placeholder

    std::string exe_path =
        (util::get_catter_root_path() / catter::config::proxy::EXE_NAME).string();

    std::vector<std::string> args = {exe_path, "-p", "0", "--exec", shell[0], "--"};

    append_range_to_vector(args, shell);

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

eventide::task<void> loop(ipc::Handler& handler, std::shared_ptr<acceptor> acceptor) {
    std::list<eventide::task<void>> linked_clients;
    while(true) {
        auto client = co_await acceptor->accept();
        if(!client) {
            assert(client.error() == eventide::error::operation_aborted);
            // Accept can fail with operation_aborted when the acceptor is stopped, which is
            // expected
            break;
        }
        linked_clients.push_back(ipc::accept(handler, std::move(*client)));
        default_loop().schedule(linked_clients.back());
    }

    try {
        for(auto& client_task: linked_clients) {
            client_task.result();  // Await completion and propagate exceptions
        }
    } catch(const std::exception& ex) {
        std::println("Exception in client task: {}", ex.what());
    }
    co_return;
}

class IpcImpl : public ipc::Handler {
public:
    data::ipcid_t create(data::ipcid_t parent_id) override {
        std::println("Creating new command with parent id: {}", parent_id);
        return ++id;
    }

    data::action make_decision(data::command cmd) override {
        std::println("Making decision for command: {}", cmd.executable);
        return data::action{.type = data::action::WRAP, .cmd = cmd};
    }

    void finish(int64_t code) override {
        std::println("Command finished with code: {}", code);
    }

    void report_error(data::ipcid_t parent_id, data::ipcid_t id, std::string error_msg) override {
        std::println("Error reported for command with parent id {} and id {}: {}",
                     parent_id,
                     id,
                     error_msg);
    }

private:
    data::ipcid_t id = 0;
};

int main(int argc, char* argv[]) {
#ifndef _WIN32
    if(std::filesystem::exists(catter::config::ipc::PIPE_NAME)) {
        std::filesystem::remove(catter::config::ipc::PIPE_NAME);
    }
#endif

    if(argc < 2 || std::string(argv[1]) != "--") {
        std::println("Usage: catter -- <target program> [args...]");
        return 1;
    }

    std::vector<std::string> shell;

    for(int i = 2; i < argc; ++i) {
        shell.push_back(argv[i]);
    }

    auto acc_ret = eventide::pipe::listen(catter::config::ipc::PIPE_NAME,
                                          eventide::pipe::options(),
                                          default_loop());

    if(!acc_ret) {
        std::println("Failed to create pipe server: {}", acc_ret.error().message());
        return 1;
    }

    try {
        auto handler = IpcImpl{};
        auto acc = std::make_shared<acceptor>(std::move(*acc_ret));
        // becareful, msvc has a bug that asan will report false positive UAF
        default_loop().schedule(loop(handler, acc));
        default_loop().schedule(spawn(shell, acc));
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
