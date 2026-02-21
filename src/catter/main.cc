#include <functional>
#include <print>

#include "js.h"
#include "ipc.h"
#include "session.h"

using namespace catter;

class ServiceImpl : public ipc::DefaultService {
public:
    ServiceImpl(data::ipcid_t id) : id(id) {};
    ~ServiceImpl() override = default;

    data::ipcid_t create(data::ipcid_t parent_id) override {
        std::println("Creating new command with parent id: {}", parent_id);
        return this->id;
    }

    data::action make_decision(data::command cmd) override {
        std::println("Making decision for command: {}", cmd.executable);
        return data::action{.type = data::action::WRAP, .cmd = cmd};
    }

    void finish(int64_t code) override {
        std::println("Command finished with code: {}", code);
    }

    void report_error(data::ipcid_t parent_id, data::ipcid_t id, std::string error_msg) override {
        std::println("Error reported for command with parent id {} and id {}: {}",
                     parent_id,
                     id,
                     error_msg);
    }

    struct Factory {
        data::ipcid_t id;

        ServiceImpl* operator() () {
            return new ServiceImpl(++id);
        }
    };

private:
    data::ipcid_t id;
};

class SessionImpl : public Session {
public:
    void start() override {
        std::println("Session started.");
    }

    void finish(int64_t code) override {
        std::println("Session finished with code: {}", code);
    }
};

int main(int argc, char* argv[]) {

    if(argc < 2 || std::string(argv[1]) != "--") {
        std::println("Usage: catter -- <target program> [args...]");
        return 1;
    }

    std::vector<std::string> shell;

    for(int i = 2; i < argc; ++i) {
        shell.push_back(argv[i]);
    }

    try {
        SessionImpl session;

        session.run(shell, ServiceImpl::Factory{0});
    } catch(const std::exception& ex) {
        std::println("Fatal error: {}", ex.what());
        return 1;
    } catch(...) {
        std::println("Unknown fatal error.");
        return 1;
    }
    return 0;
}
