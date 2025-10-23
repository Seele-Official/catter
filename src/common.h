#pragma once
#include <string>
#include <system_error>
#include <string_view>

#ifdef _WIN32
#include <windows.h>
#endif
namespace catter {
static constexpr char capture_root[] = "catter-captured";

#ifdef _WIN32
static constexpr char hook_dll[] = "catter-hook64.dll";

std::string wstring_to_utf8(const std::wstring &wstr, std::error_code& ec) {
    if (wstr.empty()) return {};

    auto size_needed = WideCharToMultiByte(
        CP_UTF8, 0, &wstr[0], 
        (int)wstr.size(), NULL, 0, NULL, NULL
    );
    
    if (size_needed == 0) {
        switch (GetLastError()) {
            case ERROR_NO_UNICODE_TRANSLATION:
                ec = std::make_error_code(std::errc::illegal_byte_sequence);
                break;
            default:
                ec = std::make_error_code(std::errc::io_error);
        }
        return {};
    }

    std::string to(size_needed, 0);

    WideCharToMultiByte(
        CP_UTF8, 0, &wstr[0], 
        (int)wstr.size(), &to[0], size_needed, NULL, NULL
    );

    return to;
}
#endif
}

namespace meta {
template <typename T>
consteval std::string_view type_name() {
    std::string_view name = 
        #if defined(__clang__) || defined(__GNUC__)
            __PRETTY_FUNCTION__;  // Clang / GCC
        #elif defined(_MSC_VER)
            __FUNCSIG__;         // MSVC
        #else
            static_assert(false, "Unsupported compiler");
        #endif
    
#if defined(__clang__)
    constexpr std::string_view prefix = "std::string_view meta::type_name() [T = ";
    constexpr std::string_view suffix = "]";
#elif defined(__GNUC__)
    constexpr std::string_view prefix = "consteval std::string_view meta::type_name() [with T = ";
    constexpr std::string_view suffix = "; std::string_view = std::basic_string_view<char>]";
#elif defined(_MSC_VER)
    constexpr std::string_view prefix = "class std::basic_string_view<char,struct std::char_traits<char> > __cdecl meta::type_name<";
    constexpr std::string_view suffix = ">(void)";
#endif
    name.remove_prefix(prefix.size());
    name.remove_suffix(suffix.size());
    return name;
}

}