#include <cassert>
#include <memory>
#include <format>
#include <utility>

#include "ipc.h"

#include "util/serde.h"
#include "util/data.h"

namespace catter::ipc {

eventide::task<void> accept(DefaultService* service, eventide::pipe client) {

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

    try {
        auto service_mode = co_await Serde<data::ServiceMode>::co_deserialize(reader);
        assert(service_mode == data::ServiceMode::DEFAULT && "Unsupported service mode received");
        while(true) {
            data::Request req = co_await Serde<data::Request>::co_deserialize(reader);
            switch(req) {
                case data::Request::CREATE: {
                    data::ipcid_t parent_id = co_await Serde<data::ipcid_t>::co_deserialize(reader);
                    auto err = co_await client.write(
                        Serde<data::ipcid_t>::serialize(service->create(parent_id)));

                    if(err.has_error()) {
                        throw std::runtime_error(
                            std::format("Failed to send command ID to client: {}", err.message()));
                    }

                    break;
                }

                case data::Request::MAKE_DECISION: {
                    data::command cmd = co_await Serde<data::command>::co_deserialize(reader);

                    auto err = co_await client.write(
                        Serde<data::action>::serialize(service->make_decision(cmd)));
                    if(err.has_error()) {
                        throw std::runtime_error(
                            std::format("Failed to send action to client: {}", err.message()));
                    }

                    break;
                }
                case data::Request::FINISH: {
                    service->finish(co_await Serde<int64_t>::co_deserialize(reader));
                    break;
                }
                case data::Request::REPORT_ERROR: {
                    service->report_error(co_await Serde<data::ipcid_t>::co_deserialize(reader),
                                          co_await Serde<std::string>::co_deserialize(reader));
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

eventide::task<void> accept(Service* service, eventide::pipe client) {
    if(dynamic_cast<DefaultService*>(service) != nullptr) {
        return accept(static_cast<DefaultService*>(service), std::move(client));
    } else {
        throw std::runtime_error("Unsupported service type for IPC communication");
    }
}

}  // namespace catter::ipc
