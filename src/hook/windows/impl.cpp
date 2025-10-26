#include <print>
#include <string>
#include <ranges>
#include <system_error>

#include <vector>
#include <windows.h>
#include <detours.h>

#include "hook/interface.h"
#include "hook/windows/env.h"

namespace catter::hook {
namespace detail {
std::string quote_win32_arg(std::string_view arg) {
    // No quoting needed if it's empty or has no special characters.
    if(arg.empty() || arg.find_first_of(" \t\n\v\"") == std::string_view::npos) {
        return std::string(arg);
    }

    std::string quoted_arg;
    quoted_arg.push_back('"');

    for(auto it = arg.begin();; ++it) {
        int num_backslashes = 0;
        while(it != arg.end() && *it == '\\') {
            ++it;
            ++num_backslashes;
        }

        if(it == arg.end()) {
            // End of string; append backslashes and a closing quote.
            quoted_arg.append(num_backslashes * 2, '\\');
            break;
        }

        if(*it == '"') {
            // Escape all backslashes and the following double quote.
            quoted_arg.append(num_backslashes * 2 + 1, '\\');
            quoted_arg.push_back(*it);
        } else {
            // Backslashes aren't special here.
            quoted_arg.append(num_backslashes, '\\');
            quoted_arg.push_back(*it);
        }
    }
    quoted_arg.push_back('"');
    return quoted_arg;
}
}  // namespace detail

int attach_run(std::span<const char* const> command, std::error_code& ec) {
    std::string command_line;

    auto view = command | std::views::transform([](auto&& s) {
                    return std::string_view{s, std::char_traits<char>::length(s)};
                }) |
                std::views::transform(detail::quote_win32_arg);

    for(auto&& c: view) {
        command_line.append(c);
        command_line.push_back(' ');
    }

    PROCESS_INFORMATION pi{};
    STARTUPINFOA si{.cb = sizeof(STARTUPINFOA)};

    auto ret = DetourCreateProcessWithDllExA(nullptr,
                                             command_line.data(),
                                             nullptr,
                                             nullptr,
                                             FALSE,
                                             CREATE_NEW_CONSOLE,
                                             nullptr,
                                             nullptr,
                                             &si,
                                             &pi,
                                             catter::win::hook_dll,
                                             nullptr);

    if(!ret) {
        // Error see
        // https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessa
        ec = std::error_code(GetLastError(), std::system_category());
        return 0;
    }

    WaitForSingleObject(pi.hProcess, INFINITE);

    DWORD exit_code = 0;

    if(GetExitCodeProcess(pi.hProcess, &exit_code) == FALSE) {
        ec = std::error_code(GetLastError(), std::system_category());
        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
        return 0;
    }
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    ec.clear();
    return static_cast<int>(exit_code);
}

};  // namespace catter::hook
