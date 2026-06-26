#include "compiler.h"

#include <kota/meta/enum.h>

#include "../apitool.h"

using namespace catter;

namespace {

CAPI(identify_compiler, (std::string compiler_name)->std::string) {
    auto compiler = catter::identify_compiler(compiler_name);
    if(compiler == Compiler::clang_cl) {
        return "clang-cl";
    }
    return std::string{kota::meta::enum_name(compiler)};
}

}  // namespace
