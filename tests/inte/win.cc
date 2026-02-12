
#include <iostream>
#include <string>
#include <format>
#include <print>

#include <unordered_map>
#include <vector>
#include <windows.h>

#include "hook.h"
#include "util/crossplat.h"

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

using func_t = void();
std::unordered_map<std::string, func_t*> funcs = {
    {"CreateProcessA", CreateProcessA},
    {"CreateProcessW", CreateProcessW},
};
}  // namespace test

int main(int argc, char* argv[]) {
    try {
        if(argc == 1) {
            std::println("Running with no arguments, launching self with hook...");
            std::string executable = catter::util::get_executable_path().string();
            std::vector<std::string> args = {
                executable,
                "CreateProcessA",
            };

            catter::ipc::data::command cmd{
                .working_dir = std::filesystem::current_path().string(),
                .executable = executable,
                .args = args,
                .env = catter::util::get_environment(),
            };

            return catter::proxy::hook::run(cmd, 0);
        } else if(argc == 2) {
            std::println("Running function: {}", argv[1]);
            std::string func_name = argv[1];
            if(test::funcs.contains(func_name)) {
                test::funcs[func_name]();
                return 0;
            } else {
                std::println("Unknown function: {}", func_name);
                return -1;
            }
        } else {
            for(int i = 0; i < argc; ++i) {
                std::println("argv[{}]: {}", i, argv[i]);
            }
            return 0;
        }
    } catch(const std::exception& e) {
        std::println("Exception: {}", e.what());
        return -1;
    }
}
