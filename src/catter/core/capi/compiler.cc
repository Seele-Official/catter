#include <eventide/reflection/enum.h>

#include "apitool.h"
#include "compiler.h"

using namespace catter;

namespace {

CAPI(identify_compiler, (std::string compiler_name)->std::string) {
    return std::string{eventide::refl::enum_name(catter::identify_compiler(compiler_name))};
}

}  // namespace
