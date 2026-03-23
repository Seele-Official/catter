#include <type_traits>

#include <windows.h>


namespace catter::win::payload {

template <typename char_t>
concept CharT = std::is_same_v<char_t, char> || std::is_same_v<char_t, wchar_t>;

template <CharT char_t>
DWORD FixGetEnvironmentVariable(const char_t* name, char_t* buffer, DWORD size) {
    if constexpr(std::is_same_v<char_t, char>) {
        return GetEnvironmentVariableA(name, buffer, size);
    } else {
        return GetEnvironmentVariableW(name, buffer, size);
    }
}

template <CharT char_t>
DWORD FixGetFullPathName(const char_t* file_name,
                         DWORD buffer_size,
                         char_t* buffer,
                         char_t** file_part) {
    if constexpr(std::is_same_v<char_t, char>) {
        return GetFullPathNameA(file_name, buffer_size, buffer, file_part);
    } else {
        return GetFullPathNameW(file_name, buffer_size, buffer, file_part);
    }
}

template <CharT char_t>
DWORD FixGetFileAttributes(const char_t* path) {
    if constexpr(std::is_same_v<char_t, char>) {
        return GetFileAttributesA(path);
    } else {
        return GetFileAttributesW(path);
    }
}

template <CharT char_t>
DWORD FixGetCurrentDirectory(DWORD size, char_t* buffer) {
    if constexpr(std::is_same_v<char_t, char>) {
        return GetCurrentDirectoryA(size, buffer);
    } else {
        return GetCurrentDirectoryW(size, buffer);
    }
}

template <CharT char_t>
DWORD FixGetModuleFileName(HMODULE module, char_t* buffer, DWORD size) {
    if constexpr(std::is_same_v<char_t, char>) {
        return GetModuleFileNameA(module, buffer, size);
    } else {
        return GetModuleFileNameW(module, buffer, size);
    }
}

template <CharT char_t>
UINT FixGetSystemDirectory(char_t* buffer, UINT size) {
    if constexpr(std::is_same_v<char_t, char>) {
        return GetSystemDirectoryA(buffer, size);
    } else {
        return GetSystemDirectoryW(buffer, size);
    }
}

template <CharT char_t>
UINT FixGetWindowsDirectory(char_t* buffer, UINT size) {
    if constexpr(std::is_same_v<char_t, char>) {
        return GetWindowsDirectoryA(buffer, size);
    } else {
        return GetWindowsDirectoryW(buffer, size);
    }
}
}