#include <iostream>
#include <vector>
#include <string>
#include <regex>
#include <utility>
#include <stdexcept>

// 假设的 CompilerType 枚举
enum class CompilerType {
    Gcc,
    Clang,
    Flang,
    IntelFortran,
    CrayFortran,
    Cuda,
    Wrapper
};

inline const std::vector<std::pair<CompilerType, std::regex>>& get_default_patterns() {
    
    static const std::vector<std::pair<CompilerType, std::regex>> DEFAULT_PATTERNS = []() {
        
        auto create_compiler_regex = [](const std::string& base_pattern, bool with_version) -> std::regex {
            std::string exe_suffix = R"((?:\.exe)?)";

            std::string pattern_with_version = base_pattern;
            if (with_version) {
                pattern_with_version += R"((?:[-_]?([0-9]+(?:[._-][0-9a-zA-Z]+)*))?)";
            }

            std::string full_pattern = "^" + pattern_with_version + exe_suffix + "$";

            try {
                return std::regex(full_pattern);
            } catch (const std::regex_error& e) {
                // 等价于 Rust 的 panic!
                throw std::runtime_error("Invalid regex pattern: " + full_pattern + " (" + e.what() + ")");
            }
        };

        return std::vector<std::pair<CompilerType, std::regex>>{
            // simple cc and c++ (no version support)
            {CompilerType::Gcc, create_compiler_regex(R"((?:[^/]*-)?(?:cc|c\+\+))", false)},
            // GCC pattern
            {CompilerType::Gcc, create_compiler_regex(R"((?:[^/]*-)?(?:gcc|g\+\+|gfortran|egfortran|f95))", true)},
            // GCC internal executables pattern: matches GCC's internal compiler phases
            {CompilerType::Gcc, create_compiler_regex(R"((?:cc1(?:plus|obj|objplus)?|f951|collect2|lto1))", false)},
            // Clang pattern: matches clang, clang++, cross-compilation variants, and versioned variants
            {CompilerType::Clang, create_compiler_regex(R"((?:[^/]*-)?clang(?:\+\+)?)", true)},
            // Fortran pattern: matches flang, cross-compilation variants, and versioned variants
            {CompilerType::Flang, create_compiler_regex(R"((?:[^/]*-)?(?:flang|flang-new))", true)},
            // Intel Fortran pattern: matches ifort, ifx, and versioned variants
            {CompilerType::IntelFortran, create_compiler_regex(R"((?:ifort|ifx))", true)},
            // Cray Fortran pattern: matches crayftn, ftn
            {CompilerType::CrayFortran, create_compiler_regex(R"((?:crayftn|ftn))", true)},
            // CUDA pattern: matches nvcc (NVIDIA CUDA Compiler) with optional cross-compilation prefixes and version suffixes
            {CompilerType::Cuda, create_compiler_regex(R"((?:[^/]*-)?nvcc)", true)},
            // Wrapper pattern: matches common compiler wrappers (no version support)
            {CompilerType::Wrapper, create_compiler_regex(R"((?:ccache|distcc|sccache))", false)},
        };
    }();

    return DEFAULT_PATTERNS;
}