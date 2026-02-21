#pragma once
#include <cstdint>
#include <memory>
#include <string>
#include <type_traits>
#include <vector>

#include <eventide/process.h>
#include <eventide/stream.h>
#include <eventide/loop.h>

#include "ipc.h"
#include "util/function_ref.h"

namespace catter {

template <typename T>
concept ServicePointerTypeLike =
    std::is_pointer_v<T> && std::derived_from<std::remove_pointer_t<T>, ipc::Service>;

class Session {
public:
    using acceptor = eventide::acceptor<eventide::pipe>;

    virtual void start() = 0;
    virtual void finish(int64_t code) = 0;

    using ServiceFactory = util::function_ref<ipc::Service*()>;

    template <typename ServiceFactoryType>
        requires std::invocable<ServiceFactoryType> &&
                 ServicePointerTypeLike<std::invoke_result_t<ServiceFactoryType>>
    void run(const std::vector<std::string>& shell, ServiceFactoryType&& factory) {
        auto factory_wrapper = [&]() -> ipc::Service* {
            return factory();
        };
        this->do_run(shell, factory_wrapper);
    }

private:
    void do_run(const std::vector<std::string>& shell, ServiceFactory factory);
    eventide::task<int64_t> spawn(const std::vector<std::string>& shell);
    eventide::task<void> loop(ServiceFactory factory);

    std::unique_ptr<acceptor> acc = nullptr;
};

}  // namespace catter
