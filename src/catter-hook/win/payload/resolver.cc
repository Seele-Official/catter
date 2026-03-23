#include "resolver.h"

namespace catter::win::payload {

template <CharT char_t>
std::basic_string<char_t> Resolver<char_t>::resolve(std::basic_string_view<char_t> app_name) const {
    if(app_name.empty()) {
        return {};
    }

    auto original_name = std::basic_string<char_t>(app_name);
    auto fixed_name = fix_app_name(app_name);
    if(contains_path(fixed_name)) {
        auto direct = to_absolute(fixed_name);
        if(!direct.empty() && is_file(direct)) {
            return direct;
        }
        // Keep original input when the path cannot be resolved to an existing file.
        return original_name;
    }

    for(const auto& search_path: m_search_paths) {
        auto candidate = join_path(search_path, fixed_name);
        auto absolute_candidate = to_absolute(candidate);
        if(absolute_candidate.empty()) {
            continue;
        }
        if(is_file(absolute_candidate)) {
            return absolute_candidate;
        }
    }

    // Keep original input when search paths do not resolve an existing file.
    return original_name;
}

template <CharT char_t>
bool Resolver<char_t>::contains_path(std::basic_string_view<char_t> value) {
    return std::find_if(value.begin(), value.end(), [](char_t c) {
               return is_path_sep(c) || c == char_t(':');
           }) != value.end();
}

template <CharT char_t>
bool Resolver<char_t>::has_extension(std::basic_string_view<char_t> file_name) {
    return file_name.find(char_t('.')) != std::basic_string_view<char_t>::npos;
}

template <CharT char_t>
std::basic_string_view<char_t> Resolver<char_t>::exe_suffix() {
    if constexpr(std::is_same_v<char_t, char>) {
        return ".exe";
    } else {
        return L".exe";
    }
}

template <CharT char_t>
std::basic_string<char_t> Resolver<char_t>::fix_app_name(std::basic_string_view<char_t> app_name) {
    if(contains_path(app_name) || app_name.back() == char_t('.') || has_extension(app_name)) {
        return std::basic_string<char_t>(app_name);
    }

    std::basic_string<char_t> fixed(app_name);
    fixed.append(exe_suffix());
    return fixed;
}

template <CharT char_t>
std::basic_string<char_t> Resolver<char_t>::join_path(std::basic_string_view<char_t> directory,
                                                      std::basic_string_view<char_t> file_name) {
    if(directory.empty()) {
        return std::basic_string<char_t>(file_name);
    }

    std::basic_string<char_t> out(directory);
    if(!is_path_sep(out.back())) {
        out.push_back(path_sep);
    }
    out.append(file_name);
    return out;
}

template <CharT char_t>
std::basic_string<char_t> Resolver<char_t>::to_absolute(std::basic_string_view<char_t> path) {
    return GetFullPathNameDynamic<char_t>(path);
}

template <CharT char_t>
bool Resolver<char_t>::is_file(std::basic_string_view<char_t> path) {
    auto attrs = FixGetFileAttributes<char_t>(std::basic_string<char_t>(path).c_str());
    return attrs != INVALID_FILE_ATTRIBUTES && (attrs & FILE_ATTRIBUTE_DIRECTORY) == 0;
}

namespace detail {

template <CharT char_t>
constexpr char_t k_path_delimiter = char_t(';');

template <CharT char_t>
constexpr char_t k_path_sep = char_t('\\');

template <CharT char_t>
std::vector<std::basic_string<char_t>> split_path_var(std::basic_string_view<char_t> value) {
    std::vector<std::basic_string<char_t>> segments;
    size_t start = 0;
    while(start <= value.size()) {
        auto split_pos = value.find(k_path_delimiter<char_t>, start);
        auto token =
            value.substr(start,
                         split_pos == std::basic_string_view<char_t>::npos ? value.size() - start
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

template <CharT char_t>
void push_if_non_empty(std::vector<std::basic_string<char_t>>& out,
                       std::basic_string<char_t> value) {
    if(!value.empty()) {
        out.push_back(std::move(value));
    }
}

template <CharT char_t>
std::basic_string<char_t> get_current_drive_root() {
    auto cwd = GetCurrentDirectoryDynamic<char_t>();
    if(cwd.size() < 2 || cwd[1] != char_t(':')) {
        return {};
    }

    std::basic_string<char_t> root;
    root.push_back(cwd[0]);
    root.push_back(char_t(':'));
    root.push_back(k_path_sep<char_t>);
    return root;
}

template <CharT char_t>
constexpr std::basic_string_view<char_t> k_path_env_name = {};

template <>
constexpr std::basic_string_view<char> k_path_env_name<char> = "PATH";

template <>
constexpr std::basic_string_view<wchar_t> k_path_env_name<wchar_t> = L"PATH";

template <CharT char_t>
constexpr std::basic_string_view<char_t> k_system16_name = {};

template <>
constexpr std::basic_string_view<char> k_system16_name<char> = "System";

template <>
constexpr std::basic_string_view<wchar_t> k_system16_name<wchar_t> = L"System";

}  // namespace detail

template <CharT char_t>
Resolver<char_t> create_app_name_resolver() {
    std::vector<std::basic_string<char_t>> search_paths;
    search_paths.reserve(2);
    // Search order for explicit application_name:
    // 1) current drive root, 2) current directory.
    detail::push_if_non_empty(search_paths, detail::get_current_drive_root<char_t>());
    detail::push_if_non_empty(search_paths, GetCurrentDirectoryDynamic<char_t>());
    return Resolver<char_t>(std::move(search_paths));
}

template <CharT char_t>
Resolver<char_t> create_command_line_resolver() {
    std::vector<std::basic_string<char_t>> search_paths;
    search_paths.reserve(64);
    // Search order for command line token:
    // 1) directory of current process image.
    // 2) current directory.
    // 3) 32-bit system directory.
    // 4) 16-bit system directory named "System" under Windows directory.
    // 5) Windows directory.
    // 6) directories listed in PATH.
    auto module_dir = GetModuleDirectory<char_t>(nullptr);
    auto current_dir = GetCurrentDirectoryDynamic<char_t>();
    auto system_dir = GetSystemDirectoryDynamic<char_t>();
    auto windows_dir = GetWindowsDirectoryDynamic<char_t>();

    detail::push_if_non_empty(search_paths, std::move(module_dir));
    detail::push_if_non_empty(search_paths, std::move(current_dir));
    detail::push_if_non_empty(search_paths, std::move(system_dir));
    if(!windows_dir.empty()) {
        auto system16_dir = windows_dir;
        if(system16_dir.back() != detail::k_path_sep<char_t> &&
           system16_dir.back() != char_t('/')) {
            system16_dir.push_back(detail::k_path_sep<char_t>);
        }
        system16_dir.append(detail::k_system16_name<char_t>);
        detail::push_if_non_empty(search_paths, std::move(system16_dir));
    }
    detail::push_if_non_empty(search_paths, windows_dir);

    auto path_value =
        GetEnvironmentVariableDynamic<char_t>(detail::k_path_env_name<char_t>.data(), 4096);
    auto path_segments = detail::split_path_var<char_t>(path_value);
    for(auto& segment: path_segments) {
        detail::push_if_non_empty(search_paths, std::move(segment));
    }

    return Resolver<char_t>(std::move(search_paths));
}

template class Resolver<char>;
template class Resolver<wchar_t>;

template Resolver<char> create_app_name_resolver();
template Resolver<wchar_t> create_app_name_resolver();
template Resolver<char> create_command_line_resolver();
template Resolver<wchar_t> create_command_line_resolver();

}  // namespace catter::win::payload
