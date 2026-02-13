# ruff: noqa: F821
import sys
import os
import subprocess
import json
import platform
import lit.formats
from lit.llvm import config as cfg


def run(cmd: str) -> str:
    process = subprocess.run(cmd, shell=True, capture_output=True, text=True)

    if process.returncode != 0:
        error_msg = f"Command '{cmd}' failed with exit code {process.returncode}:\n{process.stderr}"
        print(error_msg, file=sys.stderr)
        raise RuntimeError(error_msg)
    return process.stdout


def run_with_json(cmd: str) -> dict:
    return json.loads(run(cmd))


llvm_config = cfg.LLVMConfig(lit_config, config)

config.name = "Catter Integration Test"
config.test_format = lit.formats.ShTest(True)
config.suffixes = [".test"]

project_root = run_with_json("xmake show --json")["project"]["projectdir"]

config.test_source_root = os.path.normpath(f"{project_root}/tests/integration/test")
config.test_exec_root = os.path.normpath(f"{project_root}/build/lit-tests")

hook_config = run_with_json("xmake show -t it-catter-hook --json")
proxy_config = run_with_json("xmake show -t it-catter-proxy --json")

hook_path = os.path.join(project_root, hook_config["targetfile"])
proxy_path = os.path.join(project_root, proxy_config["targetfile"])

match platform.system():
    case "Windows":
        config.test_format = lit.formats.ShTest(False)
    case "Linux":
        mode = run_with_json("xmake show --json")["project"]["mode"]

        if mode == "debug":
            hook_compiler = hook_config["compilers"][0]["program"]
            if "g++" in hook_compiler:
                hook_asan_path = run(
                    f"{hook_compiler} -print-file-name=libasan.so"
                ).strip()
                hook_path = f"LD_PRELOAD={hook_asan_path} {hook_path}"

            proxy_compiler = proxy_config["compilers"][0]["program"]
            if "g++" in proxy_compiler:
                proxy_asan_path = run(
                    f"{proxy_compiler} -print-file-name=libasan.so"
                ).strip()
                proxy_path = f"LD_PRELOAD={proxy_asan_path} {proxy_path}"


config.substitutions.append(("%it_catter_hook", hook_path))
config.substitutions.append(("%it_catter_proxy", proxy_path))
