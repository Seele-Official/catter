#include <filesystem>
#include <format>
#include <stdexcept>
#include <cassert>
#include <list>

#include "session.h"

#include "util/crossplat.h"
#include "util/eventide.h"
#include "config/ipc.h"
#include "config/catter-proxy.h"

namespace catter {

void Session::do_run(const std::vector<std::string>& shell, ServiceFactory factory) {
#ifndef _WIN32
    if(std::filesystem::exists(config::ipc::PIPE_NAME)) {
        std::filesystem::remove(config::ipc::PIPE_NAME);
    }
#endif
    auto acc_ret =
        eventide::pipe::listen(config::ipc::PIPE_NAME, eventide::pipe::options(), default_loop());

    if(!acc_ret) {
        throw std::runtime_error(
            std::format("Failed to create acceptor: {}", acc_ret.error().message()));
    }

    this->acc = std::make_unique<Acceptor>(std::move(*acc_ret));

    this->start();

    auto loop_task = this->loop(factory);
    auto spawn_task = this->spawn(shell);
    default_loop().schedule(loop_task);
    default_loop().schedule(spawn_task);
    default_loop().run();

    loop_task.result();  // Propagate exceptions from spawn task
    this->finish(spawn_task.result());
}

eventide::task<int64_t> Session::spawn(const std::vector<std::string>& shell) {

    std::string exe_path = (util::get_catter_root_path() / config::proxy::EXE_NAME).string();

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

    auto error = this->acc->stop();  // Stop accepting new clients after spawning the process
    if(error) {
        throw std::runtime_error(std::format("Failed to stop acceptor: {}", error.message()));
    }

    this->acc.reset();  // Ensure acceptor is destroyed after stopping
    co_return ret;
}

eventide::task<void> Session::loop(ServiceFactory factory) {
    std::vector<std::unique_ptr<ipc::Service>> services;
    std::list<eventide::task<void>> linked_clients;
    while(true) {
        auto client = co_await this->acc->accept();
        if(!client) {
            assert(client.error() == eventide::error::operation_aborted);
            // Accept can fail with operation_aborted when the acceptor is stopped, which is
            // expected
            break;
        }
        services.push_back(factory());  // Create a new service for each client
        linked_clients.push_back(ipc::accept(services.back().get(), std::move(*client)));
        default_loop().schedule(linked_clients.back());
    }

    std::string error_msg;

    for(auto& client_task: linked_clients) {
        try {
            client_task.result();  // Await completion and propagate exceptions
        } catch(const std::exception& ex) {
            error_msg += std::format("Exception in client task: {}\n", ex.what());
        }
    }
    if(!error_msg.empty()) {
        throw std::runtime_error(error_msg);
    }
    co_return;
}

}  // namespace catter
