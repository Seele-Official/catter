#include <algorithm>
#include <string>
#include <string_view>
#include <vector>

#include <windows.h>

#include "win/env.h"

#include "resolver.h"
#include "util.h"


namespace catter::win::payload {

namespace {

template <catter::win::payload::CharT char_t>
constexpr char_t k_path_delimiter = char_t(';');

template <catter::win::payload::CharT char_t>
constexpr char_t k_path_sep = char_t('\\');

template <catter::win::payload::CharT char_t>
std::vector<std::basic_string<char_t>> split_path_var(std::basic_string_view<char_t> value) {
    std::vector<std::basic_string<char_t>> segments;
    size_t start = 0;
    while(start <= value.size()) {
        auto split_pos = value.find(k_path_delimiter<char_t>, start);
        auto token = value.substr(start, split_pos == std::basic_string_view<char_t>::npos
                                             ? value.size() - start
                                             : split_pos - start);
        if(!token.empty()) {
            segments.emplace_back(token);
        }

        if(split_pos == std::basic_string_view<char_t>::npos) {
            break;
        }
        start = split_pos + 1;
    }
    return segments;
}

template <catter::win::payload::CharT char_t>
void push_if_non_empty(std::vector<std::basic_string<char_t>>& out,
                       std::basic_string<char_t> value) {
    if(!value.empty()) {
        out.push_back(std::move(value));
    }
}

template <catter::win::payload::CharT char_t>
std::basic_string<char_t> get_env_var(const char_t* name, size_t stack_buffer_size) {
    std::basic_string<char_t> value;
    value.resize(stack_buffer_size);

    auto len = FixGetEnvironmentVariable<char_t>(name, value.data(), static_cast<DWORD>(value.size()));
    if(len == 0) {
        return {};
    }

    if(len < value.size()) {
        value.resize(len);
        return value;
    }

    value.resize(len);
    len = FixGetEnvironmentVariable<char_t>(name, value.data(), static_cast<DWORD>(value.size()));
    if(len == 0 || len > value.size()) {
        return {};
    }

    if(len > 0 && value[len - 1] == char_t('\0')) {
        value.resize(len - 1);
    } else {
        value.resize(len);
    }

    return value;
}

template <catter::win::payload::CharT char_t>
std::basic_string<char_t> get_current_directory() {
    auto required_size = FixGetCurrentDirectory<char_t>(0, nullptr);
    if(required_size == 0) {
        return {};
    }

    std::basic_string<char_t> value(required_size, char_t('\0'));
    auto written = FixGetCurrentDirectory<char_t>(required_size, value.data());
    if(written == 0 || written >= required_size) {
        return {};
    }

    value.resize(written);
    return value;
}

template <catter::win::payload::CharT char_t>
std::basic_string<char_t> get_module_directory() {
    std::basic_string<char_t> module_path(MAX_PATH, char_t('\0'));
    while(true) {
        auto written = FixGetModuleFileName<char_t>(nullptr,
                                                    module_path.data(),
                                                    static_cast<DWORD>(module_path.size()));
        if(written == 0) {
            return {};
        }
        if(written < module_path.size() - 1) {
            module_path.resize(written);
            break;
        }
        module_path.resize(module_path.size() * 2);
    }

    auto pos = module_path.find_last_of(k_path_sep<char_t>);
    if(pos == std::basic_string<char_t>::npos) {
        return {};
    }

    return module_path.substr(0, pos);
}

template <catter::win::payload::CharT char_t>
std::basic_string<char_t> get_system_directory() {
    std::basic_string<char_t> value(MAX_PATH, char_t('\0'));
    while(true) {
        auto written =
            FixGetSystemDirectory<char_t>(value.data(), static_cast<UINT>(value.size()));
        if(written == 0) {
            return {};
        }
        if(written < value.size()) {
            value.resize(written);
            return value;
        }
        value.resize(written + 1);
    }
}

template <catter::win::payload::CharT char_t>
std::basic_string<char_t> get_windows_directory() {
    std::basic_string<char_t> value(MAX_PATH, char_t('\0'));
    while(true) {
        auto written =
            FixGetWindowsDirectory<char_t>(value.data(), static_cast<UINT>(value.size()));
        if(written == 0) {
            return {};
        }
        if(written < value.size()) {
            value.resize(written);
            return value;
        }
        value.resize(written + 1);
    }
}

template <catter::win::payload::CharT char_t>
std::basic_string<char_t> get_current_drive_root() {
    auto cwd = get_current_directory<char_t>();
    if(cwd.size() < 2 || cwd[1] != char_t(':')) {
        return {};
    }

    std::basic_string<char_t> root;
    root.push_back(cwd[0]);
    root.push_back(char_t(':'));
    root.push_back(k_path_sep<char_t>);
    return root;
}

template <catter::win::payload::CharT char_t>
constexpr std::basic_string_view<char_t> k_path_env_name = {};

template <>
constexpr std::basic_string_view<char> k_path_env_name<char> = "PATH";

template <>
constexpr std::basic_string_view<wchar_t> k_path_env_name<wchar_t> = L"PATH";

template <catter::win::payload::CharT char_t>
constexpr std::basic_string_view<char_t> k_system16_name = {};

template <>
constexpr std::basic_string_view<char> k_system16_name<char> = "System";

template <>
constexpr std::basic_string_view<wchar_t> k_system16_name<wchar_t> = L"System";

}  // namespace

template <CharT char_t>
std::basic_string<char_t> extract_first_token(std::basic_string_view<char_t> command_line) {
    constexpr char_t quote_char = char_t('"');
    constexpr char_t space_char = char_t(' ');

    auto trimmed = [](std::basic_string_view<char_t> value) {
        auto first_non_space = std::find_if_not(value.begin(), value.end(), [](char_t c) {
            return c == space_char;
        });
        return std::basic_string<char_t>(first_non_space, value.end());
    }(command_line);

    std::basic_string_view<char_t> view(trimmed);
    if(view.empty()) {
        return {};
    }

    if(view.front() == quote_char) {
        auto closing_quote = view.find(quote_char, 1);
        if(closing_quote == std::basic_string_view<char_t>::npos) {
            return std::basic_string<char_t>(view.substr(1));
        }
        return std::basic_string<char_t>(view.substr(1, closing_quote - 1));
    }

    auto first_space = std::find_if(view.begin(), view.end(), [](char_t c) {
        return c == space_char;
    });
    return std::basic_string<char_t>(view.begin(), first_space);
}

template <catter::win::payload::CharT char_t>
Resolver<char_t> create_app_name_resolver() {
    std::vector<std::basic_string<char_t>> search_paths;
    // Search order for explicit application_name:
    // 1) current drive root, 2) current directory.
    push_if_non_empty(search_paths, get_current_drive_root<char_t>());
    push_if_non_empty(search_paths, get_current_directory<char_t>());
    return Resolver<char_t>(std::move(search_paths));
}

template <catter::win::payload::CharT char_t>
Resolver<char_t> create_command_line_resolver() {
    std::vector<std::basic_string<char_t>> search_paths;

    // Search order for command line token:
    // 1) directory of current process image.
    // 2) current directory.
    // 3) 32-bit system directory.
    // 4) 16-bit system directory named "System" under Windows directory.
    // 5) Windows directory.
    // 6) directories listed in PATH.
    auto module_dir = get_module_directory<char_t>();
    auto current_dir = get_current_directory<char_t>();
    auto system_dir = get_system_directory<char_t>();
    auto windows_dir = get_windows_directory<char_t>();

    push_if_non_empty(search_paths, std::move(module_dir));
    push_if_non_empty(search_paths, std::move(current_dir));
    push_if_non_empty(search_paths, std::move(system_dir));
    if(!windows_dir.empty()) {
        auto system16_dir = windows_dir;
        if(system16_dir.back() != k_path_sep<char_t> && system16_dir.back() != char_t('/')) {
            system16_dir.push_back(k_path_sep<char_t>);
        }
        system16_dir.append(k_system16_name<char_t>);
        push_if_non_empty(search_paths, std::move(system16_dir));
    }
    push_if_non_empty(search_paths, windows_dir);

    auto path_value = get_env_var<char_t>(k_path_env_name<char_t>.data(), 4096);
    auto path_segments = split_path_var<char_t>(path_value);
    for(auto& segment: path_segments) {
        push_if_non_empty(search_paths, std::move(segment));
    }

    return Resolver<char_t>(std::move(search_paths));
}

template <catter::win::payload::CharT char_t>
std::basic_string<char_t> resolve_abspath_impl(const char_t* application_name,
                                               const char_t* command_line) {
    std::basic_string<char_t> raw_app_name;

    // CreateProcess takes lpApplicationName first; when absent, the executable
    // is parsed from the first token in lpCommandLine.
    if(application_name != nullptr && application_name[0] != char_t('\0')) {
        raw_app_name.assign(application_name);
        return create_app_name_resolver<char_t>().resolve(raw_app_name);
    }

    raw_app_name = extract_first_token<char_t>(command_line == nullptr
                                                   ? std::basic_string_view<char_t>{}
                                                   : std::basic_string_view<char_t>{command_line});
    if(raw_app_name.empty()) {
        return {};
    }

    return create_command_line_resolver<char_t>().resolve(raw_app_name);
}

template Resolver<char> create_app_name_resolver<char>();
template Resolver<wchar_t> create_app_name_resolver<wchar_t>();
template Resolver<char> create_command_line_resolver<char>();
template Resolver<wchar_t> create_command_line_resolver<wchar_t>();



std::string resolve_abspath(const char* application_name, const char* command_line) {
    return resolve_abspath_impl<char>(application_name, command_line);
}

std::wstring resolve_abspath(const wchar_t* application_name, const wchar_t* command_line) {
    return resolve_abspath_impl<wchar_t>(application_name, command_line);
}

std::string get_proxy_path() {
    return get_env_var<char>(catter::win::ENV_VAR_PROXY_PATH<char>, 256);
}

std::wstring get_proxy_path_wide() {
    return get_env_var<wchar_t>(catter::win::ENV_VAR_PROXY_PATH<wchar_t>, 256);
}

std::string get_ipc_id() {
    return get_env_var<char>(catter::win::ENV_VAR_IPC_ID<char>, 64);
}

std::wstring get_ipc_id_wide() {
    return get_env_var<wchar_t>(catter::win::ENV_VAR_IPC_ID<wchar_t>, 64);
}

}  // namespace catter::win::payload
