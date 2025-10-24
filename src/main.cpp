#include <cstddef>
#include <string>
#include <filesystem>
#include <vector>
#include <format>
#include <iostream>
#include <ranges>
#include <fstream>
#include <print>


#include "hook/interface.h"

#include "common.h"

namespace fs = std::filesystem;

std::vector<std::string> collect_all(){
    std::vector<std::string> result;

    std::error_code ec;

    if (!fs::exists(catter::capture_root, ec)) {
        return result;
    }

    if (ec) {
        std::println("Failed to access capture root directory: {}: {}", catter::capture_root, ec.message());
        return result;
    }

    auto dir_iter = fs::recursive_directory_iterator(
        catter::capture_root,
        fs::directory_options::skip_permission_denied,
        ec
    ); 

    for (; dir_iter != fs::end(dir_iter); dir_iter.increment(ec)) {
        if (ec) {
            std::println("Failed to access directory entry: {}: {}", dir_iter->path().string(), ec.message());
            continue;
        }
        if (dir_iter->is_regular_file()){
            std::ifstream ifs(dir_iter->path(), std::ios::in | std::ios::binary);
            std::string line;
            while (std::getline(ifs, line)) {
                result.push_back(line);
            }
        }
    }

    fs::remove_all(catter::capture_root, ec);
    if (ec) {
        std::println("Failed to remove capture root directory: {}: {}", catter::capture_root, ec.message());
    }
    return result;
}



int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::println("Usage: {} <command>", argv[0]);
        return 1;
    }

    std::string command_line;
    for (auto i : std::views::iota(1, argc)) {
        if (!command_line.empty()) {
            command_line += " ";
        }
        command_line += argv[i];
    }

    std::error_code ec;

    auto ret = catter::hook::attach_run(command_line, ec);

    if (ec) {
        std::println("Failed to attach hook: {}", ec.message());
        return 1;
    }
    
    if (ret != 0) {
        std::println("Command failed with exit code: {}", ret);
    }

    auto captured_output = collect_all();
    for (const auto& line : captured_output) {
        std::println("{}", line);
    }
    
    return 0;
}
