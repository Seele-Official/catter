#pragma once

#include <string>
#include <string_view>

namespace catter::win::payload {

std::string resolve_abspath(const char* application_name, const char* command_line);
std::wstring resolve_abspath(const wchar_t* application_name, const wchar_t* command_line);

std::string get_proxy_path();
std::wstring get_proxy_path_wide();

std::string get_ipc_id();
std::wstring get_ipc_id_wide();

}  // namespace catter::win::payload
