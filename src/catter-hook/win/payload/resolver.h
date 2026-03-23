#pragma once

#include <algorithm>
#include <string>
#include <string_view>
#include <type_traits>
#include <utility>
#include <vector>

#include "winapi.h"

namespace catter::win::payload {

template <CharT char_t>
class Resolver {
public:
    explicit Resolver(std::vector<std::basic_string<char_t>> search_paths) :
        m_search_paths(std::move(search_paths)) {}

    std::basic_string<char_t> resolve(std::basic_string_view<char_t> app_name) const;

private:
    constexpr static char_t path_sep = char_t('\\');

    constexpr static bool is_path_sep(char_t c) {
        return c == char_t('\\') || c == char_t('/');
    }

    static bool contains_path(std::basic_string_view<char_t> value);
    static bool has_extension(std::basic_string_view<char_t> file_name);
    static std::basic_string_view<char_t> exe_suffix();
    static std::basic_string<char_t> fix_app_name(std::basic_string_view<char_t> app_name);
    static std::basic_string<char_t> join_path(std::basic_string_view<char_t> directory,
                                               std::basic_string_view<char_t> file_name);
    static std::basic_string<char_t> to_absolute(std::basic_string_view<char_t> path);
    static bool is_file(std::basic_string_view<char_t> path);

    std::vector<std::basic_string<char_t>> m_search_paths;
};

template <CharT char_t>
Resolver<char_t> create_app_name_resolver();

template <CharT char_t>
Resolver<char_t> create_command_line_resolver();

extern template class Resolver<char>;
extern template class Resolver<wchar_t>;

template <CharT char_t>
Resolver<char_t> create_app_name_resolver();

template <CharT char_t>
Resolver<char_t> create_command_line_resolver();

}  // namespace catter::win::payload
