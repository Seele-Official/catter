#pragma once

#include <eventide/stream.h>

#include "util/data.h"

namespace catter::ipc {

class Handler {
public:
    virtual data::ipcid_t create(data::ipcid_t parent_id) = 0;
    virtual data::action make_decision(data::command cmd) = 0;
    virtual void finish(int64_t code) = 0;
    virtual void report_error(data::ipcid_t parent_id, data::ipcid_t id, std::string error_msg) = 0;
};

eventide::task<void> accept(Handler& handler, eventide::pipe client);

}  // namespace catter::ipc
