#pragma once
#include "util/data.h"

namespace catter::proxy::ipc {

void set_service_mode(data::ServiceMode mode);

data::ipcid_t create(data::ipcid_t parent_id);

data::action make_decision(data::command cmd);

void finish(int64_t ret_code);

void report_error(data::ipcid_t parent_id, std::string error_msg) noexcept;
}  // namespace catter::proxy::ipc
