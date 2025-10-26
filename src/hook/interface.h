#pragma once
#include <system_error>
#include <string_view>
#include <span>

namespace catter::hook {
int attach_run(std::span<const char* const> command, std::error_code& ec);
};
