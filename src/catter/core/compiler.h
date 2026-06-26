#pragma once
#include <cstdint>
#include <string_view>

namespace catter {
enum Compiler : uint8_t {
    gcc,
    clang,
    clang_cl,
    msvc,
    flang,
    ifort,
    crayftn,
    nvcc,
    wrapper,
    unknown
};

Compiler identify_compiler(std::string_view compiler_name);

}  // namespace catter
