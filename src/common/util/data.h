#pragma once
#include <cstddef>
#include <cstdint>
#include <string>

#include "util/serde.h"

namespace catter::data {

using ipcid_t = int32_t;
using timestamp_t = uint64_t;

struct command {
    std::string cwd{};
    std::string executable{};
    std::vector<std::string> args{};
    std::vector<std::string> env{};
};

struct action {
    enum : uint8_t {
        DROP,    // Do not execute the command
        INJECT,  // Inject <catter-payload> into the command
        WRAP,    // Wrap the command execution, and return its exit code
    } type;

    command cmd;
};

enum class ServiceMode : uint8_t {
    DEFAULT,
};

enum class Request : uint8_t {
    CREATE,
    MAKE_DECISION,
    REPORT_ERROR,
    FINISH,
};

template <Request Req>
struct RequestHelper {
    using RequestType = void;
};

template <>
struct RequestHelper<Request::CREATE> {
    using RequestType = ipcid_t(ipcid_t parent_id);
};

template <>
struct RequestHelper<Request::MAKE_DECISION> {
    using RequestType = action(command cmd);
};

template <>
struct RequestHelper<Request::REPORT_ERROR> {
    using RequestType = void(ipcid_t parent_id, std::string error_msg);
};

template <>
struct RequestHelper<Request::FINISH> {
    using RequestType = void(int64_t ret_code);
};

template <Request Req>
using RequestType = typename RequestHelper<Req>::RequestType;

using packet = std::vector<char>;

}  // namespace catter::data

namespace catter {
template <>
struct Serde<data::command> {
    static std::vector<char> serialize(const data::command& cmd) {
        return merge_range_to_vector(Serde<std::string>::serialize(cmd.cwd),
                                     Serde<std::string>::serialize(cmd.executable),
                                     Serde<std::vector<std::string>>::serialize(cmd.args),
                                     Serde<std::vector<std::string>>::serialize(cmd.env));
    }

    template <Reader Invocable>
    static data::command deserialize(Invocable&& reader) {
        data::command cmd;
        cmd.cwd = Serde<std::string>::deserialize(std::forward<Invocable>(reader));
        cmd.executable = Serde<std::string>::deserialize(std::forward<Invocable>(reader));
        cmd.args = Serde<std::vector<std::string>>::deserialize(std::forward<Invocable>(reader));
        cmd.env = Serde<std::vector<std::string>>::deserialize(std::forward<Invocable>(reader));
        return cmd;
    }
};

template <>
struct Serde<data::action> {
    static std::vector<char> serialize(const data::action& act) {
        return merge_range_to_vector(Serde<uint8_t>::serialize(static_cast<uint8_t>(act.type)),
                                     Serde<data::command>::serialize(act.cmd));
    }

    template <Reader Invocable>
    static data::action deserialize(Invocable&& reader) {
        using enum_type = decltype(data::action::type);
        return {
            static_cast<enum_type>(Serde<uint8_t>::deserialize(std::forward<Invocable>(reader))),
            Serde<data::command>::deserialize(std::forward<Invocable>(reader))};
    }
};
}  // namespace catter
