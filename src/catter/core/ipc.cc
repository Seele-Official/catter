#include <cassert>
#include <memory>
#include <format>
#include <utility>

#include <eventide/reflection/enum.h>

#include "ipc.h"

#include "util/serde.h"
#include "util/data.h"
#include "util/function_ref.h"

namespace catter::ipc {
using namespace data;

template <Request Req, typename T>
struct Helper {};

template <Request Req, typename Ret, typename... Args>
struct Helper<Req, Ret(Args...)> {
    template <typename Writer>
    eventide::task<void> operator() (util::function_ref<Ret(Args...)> callback,
                                     BufferReader& buf_reader,
                                     Writer&& writer) {
        if constexpr(!std::is_same_v<Ret, void>) {
            auto response =
                Serde<Ret>::serialize(callback(Serde<Args>::deserialize(buf_reader)...));
            auto ret = co_await writer(
                merge_range_to_vector(Serde<size_t>::serialize(response.size()), response));
            if(ret.has_error()) {
                throw std::runtime_error(std::format("Failed to send response [{}] to client: {}",
                                                     eventide::refl::enum_name<Req>(),
                                                     ret.message()));
            }
        } else {
            callback(Serde<Args>::deserialize(buf_reader)...);
            co_return;
        }
    }
};

template <Request Req, typename Writer>
eventide::task<void> handle_req(util::function_ref<RequestType<Req>> callback,
                                BufferReader& buf_reader,
                                Writer&& writer) {
    return Helper<Req, RequestType<Req>>{}(callback, buf_reader, std::forward<Writer>(writer));
}

eventide::task<void> accept(std::unique_ptr<DefaultService> service, eventide::pipe client) {

    auto reader = [&](char* dst, size_t len) -> eventide::task<void> {
        size_t total_read = 0;
        while(total_read < len) {
            auto ret = co_await client.read_some({dst + total_read, len - total_read});
            if(ret == 0) {
                throw total_read;  // EOF
            }
            total_read += ret;
        }
        co_return;
    };

    auto read_packet = [&]() -> eventide::task<std::vector<char>> {
        size_t packet_size = co_await Serde<size_t>::co_deserialize(reader);
        std::vector<char> buffer(packet_size);
        co_await reader(buffer.data(), packet_size);
        co_return buffer;
    };

    auto writer = [&](auto&& payload) -> eventide::task<eventide::error> {
        return client.write(std::forward<decltype(payload)>(payload));
    };

    try {
        auto sm_buffer = co_await read_packet();
        BufferReader sm_reader(sm_buffer);
        auto service_mode = Serde<ServiceMode>::deserialize(sm_reader);
        assert(service_mode == ServiceMode::DEFAULT && "Unsupported service mode received");
        while(true) {
            auto req_buffer = co_await read_packet();
            BufferReader buf_reader(req_buffer);
            Request req = Serde<Request>::deserialize(buf_reader);
            switch(req) {
                case Request::CREATE: {
                    co_await handle_req<Request::CREATE>(
                        {service.get(), util::mem_fn<&DefaultService::create>{}},
                        buf_reader,
                        writer);
                    break;
                }

                case Request::MAKE_DECISION: {
                    co_await handle_req<Request::MAKE_DECISION>(
                        {service.get(), util::mem_fn<&DefaultService::make_decision>{}},
                        buf_reader,
                        writer);
                    break;
                }
                case Request::FINISH: {
                    co_await handle_req<Request::FINISH>(
                        {service.get(), util::mem_fn<&DefaultService::finish>{}},
                        buf_reader,
                        writer);
                    break;
                }
                case Request::REPORT_ERROR: {
                    co_await handle_req<Request::REPORT_ERROR>(
                        {service.get(), util::mem_fn<&DefaultService::report_error>{}},
                        buf_reader,
                        writer);
                    break;
                }
                default: {
                    assert(false && "Unknown request type received");
                }
            }
        }
    } catch(size_t err) {
        // EOF or client disconnected
        assert(err == 0 && "Unexpected error in IPC communication");
    }
    co_return;
}

}  // namespace catter::ipc
