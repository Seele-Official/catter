
#include <functional>
#include <iostream>
#include <ranges>
#include <string>
#include <format>
#include <print>
#include <unordered_map>
#include <vector>

#include <windows.h>

#include "hook.h"
#include "util/crossplat.h"
#include "util/log.h"
#include "util/option.h"

namespace test {
#ifdef CATTER_WINDOWS
void CreateProcessA() {
    char cmdline[] = "echo Hello, World!";

    PROCESS_INFORMATION pi{};
    STARTUPINFOA si{.cb = sizeof(STARTUPINFOA)};
    if(!CreateProcessA(nullptr, cmdline, nullptr, nullptr, FALSE, 0, nullptr, nullptr, &si, &pi)) {
        // https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessa
        throw std::system_error(GetLastError(),
                                std::system_category(),
                                "Failed to create process with injected dll");
    }
    WaitForSingleObject(pi.hProcess, INFINITE);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
}

void CreateProcessW() {
    wchar_t cmdline[] = L"echo Hello, World!";
    PROCESS_INFORMATION pi{};
    STARTUPINFOW si{.cb = sizeof(STARTUPINFOW)};
    if(!CreateProcessW(nullptr, cmdline, nullptr, nullptr, FALSE, 0, nullptr, nullptr, &si, &pi)) {
        // https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw
        throw std::system_error(GetLastError(),
                                std::system_category(),
                                "Failed to create process with injected dll");
    }
    WaitForSingleObject(pi.hProcess, INFINITE);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
}

std::unordered_map<std::string, std::function<void()>> funcs = {
    {"CreateProcessA", CreateProcessA},
    {"CreateProcessW", CreateProcessW},
};
#else

int execve() {
    auto argv = argvify(exec_name.c_str(), "-a");
    ::execve(exec_path.c_str(), argv.data(), environ);
    std::perror("execve");
    return 1;
}

int execv() {
    auto argv = argvify(exec_name.c_str(), "-a");
    ::execv(exec_path.c_str(), argv.data());
    std::perror("execv");
    return 1;
}

int execvp() {
    auto argv = argvify(exec_name.c_str(), "-a");
    ::execvp(exec_name.c_str(), argv.data());
    std::perror("execvp");
    return 1;
}

int execl() {
    ::execl(exec_path.c_str(), exec_name.c_str(), "-a", static_cast<char*>(nullptr));
    std::perror("execl");
    return 1;
}


#endif
}  // namespace test

int main(int argc, char* argv[]) {
    catter::log::mute_logger();

    try {
        auto args = catter::util::save_argv(argc, argv);

        if(args.size() == 3 && args[1] == "--test") {
            std::string executable = catter::util::get_executable_path().string();

            catter::ipc::data::command cmd{
                .working_dir = std::filesystem::current_path().string(),
                .executable = executable,
                .args =
                    {
                           executable, args[2],
                           },
                .env = catter::util::get_environment(),
            };

            return catter::proxy::hook::run(cmd, 0);
        } else if(args.size() == 2) {
            if(auto it = test::funcs.find(args[1]); it != test::funcs.end()) {
                std::invoke(it->second);
                return 0;
            } else {
                std::println("Unknown function: {}", args[1]);
                return -1;
            }
        } else {
            auto line = args
                | std::views::join_with(std::string(" "))
                | std::ranges::to<std::string>();
            std::print("{}", line);
            return 0;
        }
    } catch(const std::exception& e) {
        std::println("Exception: {}", e.what());
        return -1;
    }
}
