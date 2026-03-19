#pragma once
#include <eventide/deco/decl.h>
#include <eventide/deco/macro.h>

namespace catter::core {
// clang-format off
struct Option {
    struct CatterOption {
        constexpr static deco::decl::Category category_info = {
            .exclusive = true,
            .required = false,
            .name = "catter",
            .description = "Options for catter",
        };

        DecoKV(
            names = {"-s", "--script"},
            meta_var = "<Script Path>",
            help = "path to the js script to run",
            required = true
        ) <std::string> script_path;

        DecoKV(
            names = {"-m", "--mode"},
            meta_var = "<Mode>",
            help = "mode of operation, e.g. 'inject'",
            required = true
        ) <std::string> mode;

        DecoPack(
            meta_var = "<Args>",
            help = "build system arguments for the executable, must be after a '--'",
            required = true
        ) <std::vector<std::string>> args;

    };

    struct HelpOpt {
        constexpr static deco::decl::Category category_info = {
            .exclusive = true,
            .required = false,
            .name = "help",
            .description = "Options for showing help message",
        };

        DecoFlag(names = {"-h", "--help"}, help = "show this help message")
        help;
    };    
    
    
    DECO_CFG(category = CatterOption::category_info)
    CatterOption proxy_opt;

    DECO_CFG(category = HelpOpt::category_info)
    HelpOpt help_opt;
};

// clang-format on
}  // namespace catter::proxy
