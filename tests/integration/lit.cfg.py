# ruff: noqa: F821
import sys
import os
import subprocess
import json
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

config.test_source_root = os.path.join(project_root, "tests", "integration", "test")
config.test_exec_root = os.path.join(project_root, "build", "lit-tests")
