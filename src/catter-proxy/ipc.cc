#include <cstddef>
#include <print>
#include <span>
#include <stdexcept>

#include <eventide/async/loop.h>
#include <eventide/async/stream.h>
#include <type_traits>

#include "config/ipc.h"
#include "util/data.h"
#include "util/eventide.h"

namespace catter::proxy::ipc {
using namespace data;
class Impl {
public:
    Impl() noexcept {
        auto ret = wait(eventide::pipe::connect(config::ipc::PIPE_NAME,
                                                eventide::pipe::options(),
                                                default_loop()));
        if(!ret) {
            std::println("pipe connect failed: {}", ret.error().message());
            std::terminate();
        }
        this->client_pipe = std::move(ret.value());
    };

    Impl(const Impl&) = delete;
    Impl& operator= (const Impl&) = delete;
    Impl(Impl&&) = delete;
    Impl& operator= (Impl&&) = delete;
    ~Impl() = default;

    static Impl& instance() noexcept {
        static Impl instance;
        return instance;
    }

    auto reader() {
        return [this](char* dst, size_t len) {
            this->read(dst, len);
        };
    }

    void read(char* dst, size_t len) {
        size_t total_read = 0;
        while(total_read < len) {
            auto ret = wait(this->client_pipe.read_some({dst + total_read, len - total_read}));
            if(ret == 0) {
                throw std::runtime_error("ipc_handler read failed: EOF/invalid");
            }
            total_read += ret;
        }
    }

    template <typename... Args>
    void write(Args&&... payload) {
        (this->write(std::forward<Args>(payload)), ...);
    }

    template <typename T>
    void write(T&& payload) {
        auto err = wait(this->client_pipe.write(std::forward<T>(payload)));
        if(err.has_error()) {
            throw std::runtime_error(std::format("ipc_handler write failed: {}", err.message()));
        }
    }

    template <typename T>
    struct request_helper {};

    template <typename Ret, typename... Args>
    struct request_helper<Ret(Args...)> {
        using type = Ret;
    };

    template <Request Req, typename... Args>
    static auto request(Args&&... args) {
        using Ret = typename request_helper<RequestType<Req>>::type;

        instance().write(Serde<Request>::serialize(Req),
                         Serde<std::remove_cvref_t<Args>>::serialize(args)...);

        if constexpr(!std::is_same_v<Ret, void>) {
            return Serde<Ret>::deserialize(instance().reader());
        }
    }

    static void set_service_mode(ServiceMode mode) {
        instance().write(Serde<ServiceMode>::serialize(mode));
    }

public:
    eventide::pipe client_pipe{};
};

void set_service_mode(ServiceMode mode) {
    Impl::set_service_mode(mode);
}

ipcid_t create(ipcid_t parent_id) {
    return Impl::request<Request::CREATE>(parent_id);
}

action make_decision(command cmd) {
    return Impl::request<Request::MAKE_DECISION>(cmd);
}

void finish(int64_t ret_code) {
    Impl::request<Request::FINISH>(ret_code);
}

void report_error(ipcid_t parent_id, std::string error_msg) noexcept {
    try {
        Impl::request<Request::REPORT_ERROR>(parent_id, error_msg);
    } catch(...) {
        // cannot do anything here
    }
    return;
};

}  // namespace catter::proxy::ipc
