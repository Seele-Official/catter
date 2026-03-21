#pragma once
#include "util/crossplat.h"

namespace catter::config::ipc {

inline std::string_view pipe_name() {
#ifdef CATTER_WINDOWS
    return R"(\\.\pipe\catter-ipc)";
#else
    static std::string path = util::get_catter_data_path() / "pipe-catter-ipc.sock";
    return path;
#endif
}

}  // namespace catter::config::ipc
