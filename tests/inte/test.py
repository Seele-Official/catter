import sys
import subprocess
import platform
import json


def run(cmd: str) -> str:
    process = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if process.returncode != 0:
        error_msg = f"Command '{cmd}' failed with exit code {process.returncode}:\n{process.stderr}"
        print(error_msg, file=sys.stderr)
        raise RuntimeError(error_msg)
    return process.stdout


def test_hook():
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
                "execvp",
                "execl",
                "posix_spawn",
                "posix_spawnp",
            ]
        case _:
            pass

    js = json.loads(run("xmake show -t it-catter-hook --json"))

    integration_test_path = js["targetfile"]

    def check_output(output: str):
        if "-p 0 --exec /bin/echo -- /bin/echo Hello, World!" not in output:
            error_msg = f"Expected output not found in command output:\n{output}"
            print(error_msg, file=sys.stderr)
            raise RuntimeError(error_msg)
        print(f"Output for {fn}:\n{output}")

    for fn in fn_list:
        ret = run(f"{integration_test_path} --test {fn}")
        check_output(ret)


def test_proxy():
    js = json.loads(run("xmake show -t it-catter-proxy --json"))
    integration_test_path = js["targetfile"]
    ret = run(f"{integration_test_path}")
    print(ret)


if __name__ == "__main__":
    print("Testing catter-hook...")
    test_hook()
    print("Testing catter-proxy...")
    test_proxy()
