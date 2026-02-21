#pragma once
#include <cstdint>
#include <format>
#include <functional>
#include <list>
#include <memory>
#include <stdexcept>
#include <string>
#include <type_traits>
#include <utility>

#include <eventide/process.h>
#include <eventide/stream.h>
#include <eventide/loop.h>
#include <reflection/name.h>

#include "ipc.h"
#include "util/crossplat.h"
#include "util/eventide.h"
#include "config/ipc.h"
#include "config/catter-proxy.h"

namespace catter {

template <typename ServiceFactoryResult>
struct ServiceFactoryLike_helper : std::false_type {};

template <typename ServiceType>
    requires std::derived_from<ServiceType, ipc::Service>
struct ServiceFactoryLike_helper<std::unique_ptr<ServiceType>> : std::true_type {};

// Concept to check if a type is a ServiceFactory, which is defined as any invocable that returns a
// std::unique_ptr to a type derived from ipc::Service
template <typename ServiceFactoryType>
concept ServiceFactoryLike =
    std::invocable<ServiceFactoryType> &&
    ServiceFactoryLike_helper<std::invoke_result_t<ServiceFactoryType>>::value;

class Session {
public:
    using acceptor = eventide::acceptor<eventide::pipe>;

    virtual void start() = 0;
    virtual void finish(int64_t code) = 0;

    using ServiceFactory = std::move_only_function<std::unique_ptr<ipc::Service>()>;

    template <typename ServiceFactoryType>
        requires ServiceFactoryLike<ServiceFactoryType>
    void run(std::vector<std::string> shell, ServiceFactoryType&& factory) {

        struct FactoryWrapper {
            ServiceFactoryType factory;

            std::unique_ptr<ipc::Service> operator() () {
                return this->factory();
            }
        };

        this->run_(std::move(shell),
                   FactoryWrapper{.factory = std::forward<ServiceFactoryType>(factory)});
    }

private:
    void run_(std::vector<std::string> shell, ServiceFactory factory) {
#ifndef _WIN32
        if(std::filesystem::exists(config::ipc::PIPE_NAME)) {
            std::filesystem::remove(config::ipc::PIPE_NAME);
        }
#endif
        auto acc_ret = eventide::pipe::listen(config::ipc::PIPE_NAME,
                                              eventide::pipe::options(),
                                              default_loop());

        if(!acc_ret) {
            throw std::runtime_error(
                std::format("Failed to create acceptor: {}", acc_ret.error().message()));
        }

        this->acc = std::make_unique<acceptor>(std::move(*acc_ret));

        this->start();

        auto loop_task = this->loop(std::move(factory));
        auto spawn_task = this->spawn(std::move(shell));
        default_loop().schedule(loop_task);
        default_loop().schedule(spawn_task);
        default_loop().run();

        spawn_task.result();  // Propagate exceptions from spawn task
        this->finish(spawn_task.result());
    }

    eventide::task<int64_t> spawn(std::vector<std::string> shell) {

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

    eventide::task<void> loop(ServiceFactory factory) {
        std::list<eventide::task<void>> linked_clients;
        while(true) {
            auto client = co_await this->acc->accept();
            if(!client) {
                assert(client.error() == eventide::error::operation_aborted);
                // Accept can fail with operation_aborted when the acceptor is stopped, which is
                // expected
                break;
            }
            linked_clients.push_back(ipc::accept(factory(), std::move(*client)));
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

    std::unique_ptr<acceptor> acc = nullptr;
};

}  // namespace catter
