#pragma once
#include <cstdint>
#include <memory>
#include <string>
#include <type_traits>
#include <concepts>
#include <vector>

#include <eventide/process.h>
#include <eventide/stream.h>
#include <eventide/loop.h>

#include "ipc.h"
#include "util/function_ref.h"

namespace catter {

template <typename ServiceFactoryResult>
struct ServiceFactoryLike_helper : std::false_type {};

template <typename ServiceType>
    requires std::derived_from<ServiceType, ipc::Service>
struct ServiceFactoryLike_helper<std::unique_ptr<ServiceType>> : std::true_type {};

template <typename ServiceFactoryType>
concept ServiceFactoryLike =
    std::invocable<ServiceFactoryType> &&
    ServiceFactoryLike_helper<std::invoke_result_t<ServiceFactoryType>>::value;

class Session {
public:
    using Acceptor = eventide::acceptor<eventide::pipe>;
    using ServiceFactory = util::function_ref<std::unique_ptr<ipc::Service>()>;

    virtual void start() = 0;
    virtual void finish(int64_t code) = 0;

    template <typename ServiceFactoryType>
        requires ServiceFactoryLike<ServiceFactoryType>
    void run(const std::vector<std::string>& shell, ServiceFactoryType&& factory) {
        auto factory_wrapper = [&]() -> std::unique_ptr<ipc::Service> {
            return factory();
        };
        this->do_run(shell, factory_wrapper);
    }

private:
    void do_run(const std::vector<std::string>& shell, ServiceFactory factory);
    eventide::task<int64_t> spawn(const std::vector<std::string>& shell);
    eventide::task<void> loop(ServiceFactory factory);

    std::unique_ptr<Acceptor> acc = nullptr;
};

}  // namespace catter
