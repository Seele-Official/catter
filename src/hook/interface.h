#pragma once
#include <system_error>
#include <string_view>
#include <span>
#include <vector>

namespace catter::hook {
int attach_run(std::vector<std::span<const char>> command, std::error_code& ec);
};
