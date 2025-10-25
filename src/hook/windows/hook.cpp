#include <format>
#include <string_view>
#include <system_error>
#include <utility>
#include <vector>
#include <print>

#include <windows.h>
#include <detours.h>

#include "common.h"
#include "hook/output.h"
#include "hook/windows/env.h"

// https://github.com/microsoft/Detours/wiki/DetourCreateProcessWithDll#remarks
#pragma comment(linker, "/export:DetourFinishHelperProcess,@1,NONAME")
#pragma comment(lib, "Advapi32.lib")

// Use anonymous namespace to avoid exporting symbols
namespace {

std::string wstring_to_utf8(const std::wstring& wstr, std::error_code& ec) {
    if(wstr.empty())
        return {};

    auto size_needed =
        WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), NULL, 0, NULL, NULL);

    if(size_needed == 0) {
        switch(GetLastError()) {
            case ERROR_NO_UNICODE_TRANSLATION:
                ec = std::make_error_code(std::errc::illegal_byte_sequence);
                break;
            default: ec = std::make_error_code(std::errc::io_error);
        }
        return {};
    }

    std::string to(size_needed, 0);

    auto written = WideCharToMultiByte(CP_UTF8,
                                       0,
                                       &wstr[0],
                                       (int)wstr.size(),
                                       &to[0],
                                       size_needed,
                                       NULL,
                                       NULL);
    if(written == 0) {
        switch(GetLastError()) {
            case ERROR_NO_UNICODE_TRANSLATION:
                ec = std::make_error_code(std::errc::illegal_byte_sequence);
                break;
            default: ec = std::make_error_code(std::errc::io_error);
        }
        return {};
    }
    ec.clear();
    return to;
}

template <typename... args_t>
void wwriteln(std::wformat_string<args_t...> fmt, args_t&&... args) {
    std::error_code ec;
    auto message = wstring_to_utf8(std::format(fmt, std::forward<args_t>(args)...), ec);
    if(ec) {
        output_file().writeln("Failed to convert wide string to UTF-8: {}", ec.message());
    } else {
        output_file().writeln("{}", std::move(message));
    }
}

template <typename... args_t>
void writeln(std::format_string<args_t...> fmt, args_t&&... args) {
    output_file().writeln(fmt, std::forward<args_t>(args)...);
}

namespace detour {
struct CreateProcessA {
    inline static decltype(::CreateProcessA)* target = ::CreateProcessA;

    static BOOL WINAPI detour(LPCSTR lpApplicationName,
                              LPSTR lpCommandLine,
                              LPSECURITY_ATTRIBUTES lpProcessAttributes,
                              LPSECURITY_ATTRIBUTES lpThreadAttributes,
                              BOOL bInheritHandles,
                              DWORD dwCreationFlags,
                              LPVOID lpEnvironment,
                              LPCSTR lpCurrentDirectory,
                              LPSTARTUPINFOA lpStartupInfo,
                              LPPROCESS_INFORMATION lpProcessInformation) {
        writeln("{} {}",
                lpApplicationName ? lpApplicationName : "",
                lpCommandLine ? lpCommandLine : "");

        return DetourCreateProcessWithDllExA(lpApplicationName,
                                             lpCommandLine,
                                             lpProcessAttributes,
                                             lpThreadAttributes,
                                             bInheritHandles,
                                             dwCreationFlags,
                                             lpEnvironment,
                                             lpCurrentDirectory,
                                             lpStartupInfo,
                                             lpProcessInformation,
                                             catter::win::hook_dll,
                                             target);
    }
};

struct CreateProcessW {
    inline static decltype(::CreateProcessW)* target = ::CreateProcessW;

    static BOOL WINAPI detour(LPCWSTR lpApplicationName,
                              LPWSTR lpCommandLine,
                              LPSECURITY_ATTRIBUTES lpProcessAttributes,
                              LPSECURITY_ATTRIBUTES lpThreadAttributes,
                              BOOL bInheritHandles,
                              DWORD dwCreationFlags,
                              LPVOID lpEnvironment,
                              LPCWSTR lpCurrentDirectory,
                              LPSTARTUPINFOW lpStartupInfo,
                              LPPROCESS_INFORMATION lpProcessInformation) {
        wwriteln(L"{} {}",
                 lpApplicationName ? lpApplicationName : L"",
                 lpCommandLine ? lpCommandLine : L"");
        return DetourCreateProcessWithDllExW(lpApplicationName,
                                             lpCommandLine,
                                             lpProcessAttributes,
                                             lpThreadAttributes,
                                             bInheritHandles,
                                             dwCreationFlags,
                                             lpEnvironment,
                                             lpCurrentDirectory,
                                             lpStartupInfo,
                                             lpProcessInformation,
                                             catter::win::hook_dll,
                                             target);
    }
};

struct CreateProcessAsUserA {
    inline static decltype(::CreateProcessAsUserA)* target = ::CreateProcessAsUserA;

    static BOOL WINAPI detour(HANDLE hToken,
                              LPCSTR lpApplicationName,
                              LPSTR lpCommandLine,
                              LPSECURITY_ATTRIBUTES lpProcessAttributes,
                              LPSECURITY_ATTRIBUTES lpThreadAttributes,
                              BOOL bInheritHandles,
                              DWORD dwCreationFlags,
                              LPVOID lpEnvironment,
                              LPCSTR lpCurrentDirectory,
                              LPSTARTUPINFOA lpStartupInfo,
                              LPPROCESS_INFORMATION lpProcessInformation) {

        PROCESS_INFORMATION backup;
        if(lpProcessInformation == NULL) {
            lpProcessInformation = &backup;
            ZeroMemory(&backup, sizeof(backup));
        }

        if(!target(hToken,
                   lpApplicationName,
                   lpCommandLine,
                   lpProcessAttributes,
                   lpThreadAttributes,
                   bInheritHandles,
                   dwCreationFlags | CREATE_SUSPENDED,
                   lpEnvironment,
                   lpCurrentDirectory,
                   lpStartupInfo,
                   lpProcessInformation)) {
            return FALSE;
        }

        LPCSTR szDll = catter::win::hook_dll;

        if(!DetourUpdateProcessWithDll(lpProcessInformation->hProcess, &szDll, 1) &&
           !DetourProcessViaHelperA(lpProcessInformation->dwProcessId,
                                    catter::win::hook_dll,
                                    CreateProcessA::target)) {

            TerminateProcess(lpProcessInformation->hProcess, ~0u);
            CloseHandle(lpProcessInformation->hProcess);
            CloseHandle(lpProcessInformation->hThread);
            return FALSE;
        }

        if(!(dwCreationFlags & CREATE_SUSPENDED)) {
            ResumeThread(lpProcessInformation->hThread);
        }

        if(lpProcessInformation == &backup) {
            CloseHandle(lpProcessInformation->hProcess);
            CloseHandle(lpProcessInformation->hThread);
        }

        return TRUE;
    }
};

struct CreateProcessAsUserW {
    inline static decltype(::CreateProcessAsUserW)* target = ::CreateProcessAsUserW;

    static BOOL WINAPI detour(HANDLE hToken,
                              LPCWSTR lpApplicationName,
                              LPWSTR lpCommandLine,
                              LPSECURITY_ATTRIBUTES lpProcessAttributes,
                              LPSECURITY_ATTRIBUTES lpThreadAttributes,
                              BOOL bInheritHandles,
                              DWORD dwCreationFlags,
                              LPVOID lpEnvironment,
                              LPCWSTR lpCurrentDirectory,
                              LPSTARTUPINFOW lpStartupInfo,
                              LPPROCESS_INFORMATION lpProcessInformation) {

        PROCESS_INFORMATION backup;
        if(lpProcessInformation == NULL) {
            lpProcessInformation = &backup;
            ZeroMemory(&backup, sizeof(backup));
        }

        if(!target(hToken,
                   lpApplicationName,
                   lpCommandLine,
                   lpProcessAttributes,
                   lpThreadAttributes,
                   bInheritHandles,
                   dwCreationFlags | CREATE_SUSPENDED,
                   lpEnvironment,
                   lpCurrentDirectory,
                   lpStartupInfo,
                   lpProcessInformation)) {
            return FALSE;
        }

        LPCSTR szDll = catter::win::hook_dll;

        if(!DetourUpdateProcessWithDll(lpProcessInformation->hProcess, &szDll, 1) &&
           !DetourProcessViaHelperW(lpProcessInformation->dwProcessId,
                                    catter::win::hook_dll,
                                    CreateProcessW::target)) {

            TerminateProcess(lpProcessInformation->hProcess, ~0u);
            CloseHandle(lpProcessInformation->hProcess);
            CloseHandle(lpProcessInformation->hThread);
            return FALSE;
        }

        if(!(dwCreationFlags & CREATE_SUSPENDED)) {
            ResumeThread(lpProcessInformation->hThread);
        }

        if(lpProcessInformation == &backup) {
            CloseHandle(lpProcessInformation->hProcess);
            CloseHandle(lpProcessInformation->hThread);
        }

        return TRUE;
    }
};

struct detour_meta {
    std::string_view name;
    void** target;
    void* detour;
};

template <typename... args_t>
std::vector<detour_meta> collect_fn() noexcept {
    return {
        {meta::type_name<args_t>(), (void**)(&args_t::target), (void*)(&args_t::detour)}
        ...
    };
}

auto& fn() noexcept {
    static auto instance =
        collect_fn<CreateProcessA, CreateProcessW, CreateProcessAsUserA, CreateProcessAsUserW>();
    return instance;
}

void attach() noexcept {
    for(auto& m: detour::fn()) {
        std::println("Attaching hook for `{}`", m.name);
        DetourAttach(m.target, m.detour);
    }
}

void detach() noexcept {
    for(auto& m: detour::fn()) {
        DetourDetach(m.target, m.detour);
    }
}
}  // namespace detour

};  // namespace

BOOL WINAPI DllMain(HINSTANCE hinst, DWORD dwReason, LPVOID reserved) {
    if(DetourIsHelperProcess()) {
        return TRUE;
    }

    if(dwReason == DLL_PROCESS_ATTACH) {
        DetourRestoreAfterWith();

        DetourTransactionBegin();
        DetourUpdateThread(GetCurrentThread());

        detour::attach();

        DetourTransactionCommit();
    } else if(dwReason == DLL_PROCESS_DETACH) {
        DetourTransactionBegin();
        DetourUpdateThread(GetCurrentThread());

        detour::detach();

        DetourTransactionCommit();
    }
    return TRUE;
}
