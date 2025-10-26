set_project("catter")
set_allowedplats("windows")


set_languages("c++23")

option("dev", {default = true})
if has_config("dev") then
   add_rules("plugin.compile_commands.autoupdate", {outputdir = "build", lsp = "clangd"})
end


add_requires("microsoft-detours")

if is_plat("windows") then
    target("catter-hook64")
        set_kind("shared")
        add_includedirs("src")
        add_files("src/hook/windows/hook.cpp")
        add_syslinks("user32")

        add_packages("microsoft-detours")
end



target("catter")
    set_kind("binary")
    add_includedirs("src")
    add_files("src/main.cpp")
    if is_plat("windows") then
        add_files("src/hook/windows/impl.cpp")
        add_packages("microsoft-detours")
    end
