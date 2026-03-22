#include <optional>

#include <eventide/zest/macro.h>
#include <eventide/zest/zest.h>

#include "qjs.h"
#include "capi/type.h"

using namespace catter;
using namespace catter::js;

namespace {

template <typename T>
bool is_roundtrip_equal(const qjs::Context& ctx, const T& value) {
    auto converted_back = T::make(value.to_object(ctx.js_context()));
    return converted_back == value;
}

}  // namespace

TEST_SUITE(api_tests) {
    TEST_CASE(catter_runtime_conversion) {
        auto f = [&]() {
            auto runtime = qjs::Runtime::create();
            auto& ctx = runtime.context();

            catter::js::CatterRuntime catter_runtime{
                .supportActions = {catter::js::ActionType::skip, catter::js::ActionType::modify},
                .supportEvents = {catter::js::EventType::finish},
                .type = catter::js::CatterRuntime::Type::inject,
                .supportParentId = true
            };

            EXPECT_TRUE(is_roundtrip_equal(ctx, catter_runtime));
        };

        EXPECT_NOTHROWS(f());
    };

    TEST_CASE(command_data_and_action_conversion) {
        auto f = [&]() {
            auto runtime = qjs::Runtime::create();
            auto& ctx = runtime.context();

            catter::js::CommandData command_data{
                .cwd = "D:/Code/hook/catter",
                .exe = "clang++",
                .argv = {"clang++", "main.cc", "-c"},
                .env = {"CC=clang++", "CATTER_LOG=1"},
                .runtime = {.supportActions = {catter::js::ActionType::skip,
                                               catter::js::ActionType::modify},
                         .supportEvents = {catter::js::EventType::finish,
                                              catter::js::EventType::output},
                         .type = catter::js::CatterRuntime::Type::env,
                         .supportParentId = true},
                .parent = 42
            };

            Action modify_action = Tag<ActionType::modify>{.data = command_data};

            Action skip_action = Tag<ActionType::skip>{

            };

            EXPECT_TRUE(is_roundtrip_equal(ctx, command_data));
            EXPECT_TRUE(is_roundtrip_equal(ctx, modify_action));
            EXPECT_TRUE(is_roundtrip_equal(ctx, skip_action));
        };

        EXPECT_NOTHROWS(f());
    };

    TEST_CASE(execution_event_and_config_conversion) {
        auto f = [&]() {
            auto runtime = qjs::Runtime::create();
            auto& ctx = runtime.context();

            catter::js::ExecutionEvent output_event =
                catter::js::Tag<catter::js::EventType::output>{
                    .stdOut = "hello",
                    .stdErr = "warn",
                    .code = 0,
                };
            catter::js::ExecutionEvent finish_event =
                catter::js::Tag<catter::js::EventType::finish>{
                    .code = 1,
                };

            catter::js::CatterConfig config{
                .scriptPath = "scripts/demo.js",
                .scriptArgs = {"--input", "compile_commands.json"},
                .buildSystemCommand = {"xmake", "build"},
                .runtime = {.supportActions = {catter::js::ActionType::drop,
                                               catter::js::ActionType::abort},
                               .supportEvents = {catter::js::EventType::finish},
                               .type = catter::js::CatterRuntime::Type::inject,
                               .supportParentId = false},
                .options = {.log = true},
                .isScriptSupported = true
            };

            EXPECT_TRUE(is_roundtrip_equal(ctx, output_event));
            EXPECT_TRUE(is_roundtrip_equal(ctx, finish_event));
            EXPECT_TRUE(is_roundtrip_equal(ctx, config));
        };

        EXPECT_NOTHROWS(f());
    };
};
