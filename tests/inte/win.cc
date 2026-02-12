
#include <functional>
#include <iostream>
#include <string>
#include <format>
#include <print>

#include <unordered_map>
#include <vector>
#include <windows.h>

#include "hook.h"
#include "util/crossplat.h"
#include "util/option.h"

namespace test {

void CreateProcessA() {
    char cmdline[] = "C:\\WINDOWS\\system32\\cmd.exe /c ver";

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
    wchar_t cmdline[] = L"C:\\WINDOWS\\system32\\cmd.exe /c ver";
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
}  // namespace test

int main(int argc, char* argv[]) {
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
            for(auto arg: args) {
                std::print("{} ", arg);
            }
            std::println();
            return 0;
        }
    } catch(const std::exception& e) {
        std::println("Exception: {}", e.what());
        return -1;
    }
}
