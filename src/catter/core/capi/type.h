#pragma once
#include <cstdint>
#include <format>
#include <optional>
#include <string>
#include <string_view>
#include <type_traits>
#include <utility>
#include <vector>

#include <eventide/common/meta.h>
#include <eventide/reflection/enum.h>
#include <eventide/reflection/struct.h>

#include "qjs.h"

namespace catter::js {

namespace detail {
namespace et = eventide;

template <typename E>
E enum_value(std::string_view name) {
    if(auto val = et::refl::enum_value<E>(name); val.has_value()) {
        return *val;
    }
    throw std::runtime_error(std::format("Invalid enum value name: {}", name));
}

template <typename E>
std::string_view enum_name(E value) {
    return et::refl::enum_name(value, "unknown");
}

template <typename E>
std::vector<E> enum_values(const std::vector<std::string>& names) {
    std::vector<E> values;
    values.reserve(names.size());
    for(const auto& name: names) {
        values.push_back(enum_value<E>(name));
    }
    return values;
}

template <typename E>
std::vector<std::string> enum_names(const std::vector<E>& values) {
    std::vector<std::string> names;
    names.reserve(values.size());
    for(const auto& value: values) {
        names.push_back(std::string(enum_name(value)));
    }
    return names;
}

template <typename T>
struct property_name_mapper {
    constexpr static std::string_view map(std::string_view field_name) {
        return field_name;
    }
};

template <typename T>
T make_reflected_object(qjs::Object object);

template <typename T>
qjs::Object to_reflected_object(JSContext* ctx, const T& value);

template <typename T>
struct Bridge {
    static T from_js(const qjs::Value& value) {
        return value.as<T>();
    }

    static auto to_js(JSContext* ctx, const T& value) {
        return qjs::Value::from(ctx, value);
    }
};

template <typename T>
    requires et::refl::reflectable_class<T>
struct Bridge<T> {
    static T from_js(const qjs::Value& value) {
        return make_reflected_object<T>(value.as<qjs::Object>());
    }

    static auto to_js(JSContext* ctx, const T& value) {
        return to_reflected_object(ctx, value);
    }
};

template <typename T>
    requires std::is_enum_v<T>
struct Bridge<T> {
    static T from_js(const qjs::Value& value) {
        return enum_value<T>(value.as<std::string>());
    }

    static auto to_js(JSContext* ctx, const T& value) {
        return qjs::Value::from(ctx, std::string(enum_name(value)));
    }
};

template <typename T>
    requires std::is_enum_v<T>
struct Bridge<std::vector<T>> {
    static std::vector<T> from_js(const qjs::Value& value) {
        auto names = value.as<qjs::Array<std::string>>().as<std::vector<std::string>>();
        return enum_values<T>(names);
    }

    static auto to_js(JSContext* ctx, const std::vector<T>& vec) {
        return qjs::Array<std::string>::from(ctx, enum_names(vec));
    }
};

template <typename T>
struct Bridge<std::vector<T>> {
    static std::vector<T> from_js(const qjs::Value& value) {
        return value.as<qjs::Array<T>>().template as<std::vector<T>>();
    }

    static auto to_js(JSContext* ctx, const std::vector<T>& vec) {
        return qjs::Array<T>::from(ctx, vec);
    }
};

template <typename T>
T read_property(const qjs::Object& object, std::string_view property_name) {
    if constexpr(et::is_optional_v<T>) {
        using value_type = typename T::value_type;
        auto prop_val = object[std::string(property_name)];
        if(!prop_val.is_undefined()) {
            return Bridge<value_type>::from_js(prop_val);
        } else {
            return std::nullopt;
        }
    } else {
        return Bridge<T>::from_js(object[std::string(property_name)]);
    }
}

template <typename T>
void write_property(qjs::Object& object,
                    std::string_view property_name,
                    JSContext* ctx,
                    const T& value) {
    if constexpr(et::is_optional_v<T>) {
        using value_type = typename T::value_type;
        if(value.has_value()) {
            object.set_property(std::string(property_name), Bridge<value_type>::to_js(ctx, *value));
        }
    } else {
        object.set_property(std::string(property_name), Bridge<T>::to_js(ctx, value));
    }
}

template <typename T>
T make_reflected_object(qjs::Object object) {
    T value{};
    et::refl::for_each(value, [&]<typename FieldType>(FieldType field) {
        using field_type = std::remove_const_t<typename FieldType::type>;
        field.value() =
            read_property<field_type>(object, property_name_mapper<T>::map(FieldType::name()));
    });
    return value;
}

template <typename T>
qjs::Object to_reflected_object(JSContext* ctx, const T& value) {
    auto object = qjs::Object::empty_one(ctx);
    et::refl::for_each(value, [&]<typename FieldType>(FieldType field) {
        write_property(object, property_name_mapper<T>::map(FieldType::name()), ctx, field.value());
    });
    return object;
}

}  // namespace detail

enum class ActionType { skip, drop, abort, modify };

enum class EventType { finish, output };

struct CatterOptions {
    static CatterOptions make(qjs::Object object) {
        return detail::make_reflected_object<CatterOptions>(std::move(object));
    }

    qjs::Object to_object(JSContext* ctx) const {
        return detail::to_reflected_object(ctx, *this);
    }

    bool operator== (const CatterOptions&) const = default;

public:
    bool log;
};

struct CatterRuntime {
    enum class Type { inject, eslogger, env };

    static CatterRuntime make(qjs::Object object) {
        return detail::make_reflected_object<CatterRuntime>(std::move(object));
    }

    qjs::Object to_object(JSContext* ctx) const {
        return detail::to_reflected_object(ctx, *this);
    }

    bool operator== (const CatterRuntime&) const = default;

public:
    std::vector<ActionType> supportActions;
    std::vector<EventType> supportEvents;
    Type type;
    bool supportParentId;
};

struct CatterConfig {
    static CatterConfig make(qjs::Object object) {
        return detail::make_reflected_object<CatterConfig>(std::move(object));
    }

    qjs::Object to_object(JSContext* ctx) const {
        return detail::to_reflected_object(ctx, *this);
    }

    bool operator== (const CatterConfig&) const = default;

public:
    std::string scriptPath;
    std::vector<std::string> scriptArgs;
    std::vector<std::string> buildSystemCommand;
    CatterRuntime runtime;
    CatterOptions options;
    bool isScriptSupported;
};

struct CommandData {
    static CommandData make(qjs::Object object) {
        return detail::make_reflected_object<CommandData>(std::move(object));
    }

    qjs::Object to_object(JSContext* ctx) const {
        return detail::to_reflected_object(ctx, *this);
    }

    bool operator== (const CommandData&) const = default;

public:
    std::string cwd;
    std::string exe;
    std::vector<std::string> argv;
    std::vector<std::string> env;
    CatterRuntime runtime;
    std::optional<int64_t> parent;
};

struct CatterErr {
    static CatterErr make(qjs::Object object) {
        return detail::make_reflected_object<CatterErr>(std::move(object));
    }

    qjs::Object to_object(JSContext* ctx) const {
        return detail::to_reflected_object(ctx, *this);
    }

    bool operator== (const CatterErr&) const = default;

public:
    std::string msg;
};

struct Action {
    static Action make(qjs::Object object) {
        return detail::make_reflected_object<Action>(std::move(object));
    }

    qjs::Object to_object(JSContext* ctx) const {
        return detail::to_reflected_object(ctx, *this);
    }

    bool operator== (const Action&) const = default;

public:
    std::optional<CommandData> data;
    ActionType type;
};

struct ExecutionEvent {
    static ExecutionEvent make(qjs::Object object) {
        return detail::make_reflected_object<ExecutionEvent>(std::move(object));
    }

    qjs::Object to_object(JSContext* ctx) const {
        return detail::to_reflected_object(ctx, *this);
    }

    bool operator== (const ExecutionEvent&) const = default;

public:
    std::optional<std::string> stdOut;
    std::optional<std::string> stdErr;
    int64_t code;
    EventType type;
};

template <>
struct detail::property_name_mapper<ExecutionEvent> {
    constexpr static std::string_view map(std::string_view field_name) {
        if(field_name == "stdOut") {
            return "stdout";
        }
        if(field_name == "stdErr") {
            return "stderr";
        }
        return field_name;
    }
};

}  // namespace catter::js
