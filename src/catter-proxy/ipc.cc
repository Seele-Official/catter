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

    template <data::Request Req, typename Ret, typename... Args>
    Ret request(Args&&... args) {
        static_assert(std::is_same_v<Ret(std::remove_cvref_t<Args>...), data::RequestType<Req>>,
                      "RequestType mismatch");
        this->write(Serde<data::Request>::serialize(Req),
                    Serde<std::remove_cvref_t<Args>>::serialize(std::forward<Args>(args))...);
        if constexpr(!std::is_same_v<Ret, void>) {
            return Serde<Ret>::deserialize(this->reader());
        }
    }

public:
    eventide::pipe client_pipe{};
};

static Impl& impl() noexcept {
    static Impl instance;
    return instance;
}

void set_service_mode(data::ServiceMode mode) {
    impl().write(Serde<data::ServiceMode>::serialize(mode));
}

data::ipcid_t create(data::ipcid_t parent_id) {
    return impl().request<data::Request::CREATE, data::ipcid_t>(parent_id);
}

data::action make_decision(data::command cmd) {
    return impl().request<data::Request::MAKE_DECISION, data::action>(cmd);
}

void finish(int64_t ret_code) {
    impl().request<data::Request::FINISH, void>(ret_code);
}

void report_error(data::ipcid_t parent_id, std::string error_msg) noexcept {
    try {
        impl().request<data::Request::REPORT_ERROR, void>(parent_id, error_msg);
    } catch(...) {
        // cannot do anything here
    }
    return;
};

}  // namespace catter::proxy::ipc
