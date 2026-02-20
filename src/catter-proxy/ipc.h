#pragma once
#include "util/data.h"

namespace catter::proxy::ipc {

data::ipcid_t create(data::ipcid_t parent_id);

data::action make_decision(data::command cmd);

void finish(int64_t ret_code);

void report_error(std::string error_msg) noexcept;
}  // namespace catter::proxy::ipc
