#pragma once
#include <system_error>
#include <string_view>

namespace catter::hook {
    int attach_run(std::string_view command, std::error_code& ec);
};
