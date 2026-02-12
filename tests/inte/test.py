import os
import sys
import subprocess
import platform
import json
import difflib
from typing import Callable


def run(cmd: str) -> str:
    process = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if process.returncode != 0:
        error_msg = f"Command '{cmd}' failed with exit code {process.returncode}:\n{process.stderr}"
        print(error_msg, file=sys.stderr)
        raise RuntimeError(error_msg)
    return process.stdout



def test_hook(it_path: str, fn_list: list[str]):

    def check_output(output: str):
        print(f"Output for {fn}:\n{output}")
    

    for fn in fn_list:
        ret = run(f"{it_path} --test {fn}")
        check_output(ret)

    
if __name__ == "__main__":
    it_path = json.loads(run("xmake show -t it-hook --json"))["targetfile"]
    match platform.system():
        case "Windows":
            fn_list = [
                "CreateProcessA",
                "CreateProcessW",
            ]
        case "Linux" | "Darwin":
            fn_list = [
                "execve",
                "execv",
                "execl",
                "execlp",
                "execle",
                "execvp",
                "execvpe",
            ]
        case _:
            pass
    test_hook(it_path, fn_list)