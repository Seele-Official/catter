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
    if(arg.empty())
        return "\"\"";
    bool need_quotes = arg.find_first_of(" \t\"") != std::string_view::npos;
    if(!need_quotes)
        return std::string(arg);
    std::string out;
    out.push_back('"');
    size_t backslashes = 0;
    for(char ch: arg) {
        if(ch == '\\') {
            ++backslashes;
        } else if(ch == '"') {
            out.append(backslashes * 2 + 1, '\\');
            out.push_back('"');
            backslashes = 0;
        } else {
            out.append(backslashes, '\\');
            backslashes = 0;
            out.push_back(ch);
        }
    }
    out.append(backslashes * 2, '\\');
    out.push_back('"');
    return out;
}
}  // namespace detail

int attach_run(std::vector<std::span<const char>> command, std::error_code& ec) {
    std::string command_line;

    auto view =
        command |
        std::views::transform([](auto&& s) { return std::string_view{s.data(), s.size()}; }) |
        std::views::transform(detail::quote_win32_arg);

    for(auto&& c: view) {
        command_line.append(c);
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
