#pragma once
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

enum class Request : uint8_t {
    CREATE,
    MAKE_DECISION,
    REPORT_ERROR,
    FINISH,
};
}  // namespace catter::data

namespace catter {
template <>
struct Serde<data::Request> {
    static std::vector<char> serialize(const data::Request& req) {
        return Serde<uint8_t>::serialize(static_cast<uint8_t>(req));
    }

    template <Reader Invocable>
    static data::Request deserialize(Invocable&& reader) {
        uint8_t value = Serde<uint8_t>::deserialize(std::forward<Invocable>(reader));
        return static_cast<data::Request>(value);
    }

    template <CoReader Invocable>
    static eventide::task<data::Request> co_deserialize(Invocable&& reader) {
        uint8_t value = co_await Serde<uint8_t>::co_deserialize(std::forward<Invocable>(reader));
        co_return static_cast<data::Request>(value);
    }
};

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

    template <CoReader Invocable>
    static eventide::task<data::command> co_deserialize(Invocable&& reader) {
        data::command cmd;
        cmd.cwd =
            co_await Serde<std::string>::co_deserialize(std::forward<Invocable>(reader));
        cmd.executable =
            co_await Serde<std::string>::co_deserialize(std::forward<Invocable>(reader));
        cmd.args = co_await Serde<std::vector<std::string>>::co_deserialize(
            std::forward<Invocable>(reader));
        cmd.env = co_await Serde<std::vector<std::string>>::co_deserialize(
            std::forward<Invocable>(reader));
        co_return cmd;
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

    template <CoReader Invocable>
    static eventide::task<data::action> co_deserialize(Invocable&& reader) {
        using enum_type = decltype(data::action::type);
        data::action act;
        act.type = static_cast<enum_type>(
            co_await Serde<uint8_t>::co_deserialize(std::forward<Invocable>(reader)));
        act.cmd =
            co_await Serde<data::command>::co_deserialize(std::forward<Invocable>(reader));
        co_return act;
    }
};
}  // namespace catter
