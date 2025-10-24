#include <string>

#include <system_error>
#include <windows.h>
#include <detours.h>


#include "hook/interface.h"
#include "hook/windows/env.h"


namespace catter::hook {
    int attach_run(std::string_view command, std::error_code& ec) {

        std::string command_line(command);

        PROCESS_INFORMATION pi{};
        STARTUPINFOA si{
            .cb = sizeof(STARTUPINFOA)
        };

        auto ret = DetourCreateProcessWithDllExA(
            nullptr,
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
            nullptr
        );

        if (!ret) {
            // Error see https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessa
            ec = std::error_code(GetLastError(), std::system_category());
            return 0;
        }

        WaitForSingleObject(pi.hProcess, INFINITE);

        DWORD exit_code = 0;

        if (GetExitCodeProcess(pi.hProcess, &exit_code) == FALSE) {
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

};