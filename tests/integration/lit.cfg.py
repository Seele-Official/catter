# ruff: noqa: F821
import sys
import os
import subprocess
import json
import platform
from typing import Callable
import lit.formats
from lit.llvm import config as cfg


def get_cmd_output(cmd: str, fn: Callable[[str], str]) -> str:
    process = subprocess.run(cmd, shell=True, capture_output=True, text=True)

    if process.returncode != 0:
        error_msg = f"Command '{cmd}' failed with exit code {process.returncode}:\n{process.stderr}"
        print(error_msg, file=sys.stderr)
        raise RuntimeError(error_msg)

    try:
        res = fn(process.stdout)
        if not res:
            raise ValueError("Parser returned empty result")
        return res
    except Exception as e:
        print(f"Error parsing output of {cmd}: {e}")
        print(f"Original output was: {process.stdout}")
        raise RuntimeError(f"Could not parse info from {cmd}") from e


llvm_config = cfg.LLVMConfig(lit_config, config)

config.name = "Catter Integration Test"
config.test_format = lit.formats.ShTest(True)
config.suffixes = [".test"]

project_root = get_cmd_output(
    "xmake show --json", lambda r: json.loads(r)["project"]["projectdir"]
)

config.test_source_root = os.path.normpath(f"{project_root}/tests/integration/test")
config.test_exec_root = os.path.normpath(f"{project_root}/build/lit-tests")

hook_path = get_cmd_output(
    "xmake show -t it-catter-hook --json", lambda r: json.loads(r)["targetfile"]
)
hook_path = os.path.join(project_root, hook_path)

proxy_path = get_cmd_output(
    "xmake show -t it-catter-proxy --json", lambda r: json.loads(r)["targetfile"]
)
proxy_path = os.path.join(project_root, proxy_path)

match platform.system():
    case "Windows":
        config.test_format = lit.formats.ShTest(False)
    case "Linux":
        mode = get_cmd_output(
            "xmake show --json", lambda r: json.loads(r)["project"]["mode"]
        )
        if mode == "debug":
            asan_path = get_cmd_output(
                "g++ -print-file-name=libasan.so", lambda x: x.strip()
            )
            if not os.path.isabs(asan_path):
                raise RuntimeError(
                    f"Could not resolve absolute path for libasan.so (got '{asan_path}'). "
                    "Is ASan installed?"
                )
            hook_path = f"LD_PRELOAD={asan_path}:{hook_path}"
            proxy_path = f"LD_PRELOAD={asan_path}:{proxy_path}"


config.substitutions.append(("%it_catter_hook", hook_path))
config.substitutions.append(("%it_catter_proxy", proxy_path))
