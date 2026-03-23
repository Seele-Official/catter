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
           })
           != value.end();
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

template class Resolver<char>;
template class Resolver<wchar_t>;

}  // namespace catter::win::payload
