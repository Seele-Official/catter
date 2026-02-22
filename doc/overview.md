## Architecture Overview

Catter probably can be divided into 3 parts:

1. **HOOK**: Intercept compilation commands from any build system.
2. **PROXY**: Act as a proxy compiler to capture commands.
3. **DECISION**: Communicate with the PROXY to determine how to handle commands.

General process follows like this:
1. User runs `catter <build command>`.
2. `catter` starts the Decision-making Server and delegates execution by spawning `<catter-proxy> <build command>`.
3. **PROXY** starts. It queries **DECISION**, which instructs it to execute the build command with **HOOK** attached (e.g., via `LD_PRELOAD` or DLL Injection etc.).
4. The build system runs. When it attempts to spawn a compiler (e.g., `g++ ...`), the **HOOK** intercepts the call.
5. **HOOK** rewrites the execution call to redirect to `<catter-proxy> <compiler command>`.
6. **PROXY** starts. It sends the captured arguments to **DECISION**.
7. **DECISION** analyzes the arguments (using the user's JS script) and replies with an action (e.g., "Execute", "Hook and Execute", "Skip", etc).
8. **PROXY** performs the action requested by **DECISION**.

---

## Components

1. `catter` acts as **DECISION**:
   The user entry point. It runs as a daemon/server that holds the JS runtime. It instructs the PROXY on what to do but never interacts with the OS processes directly.
2. `catter-proxy` acts as **PROXY**:
   The platform-specific tool, which private to users. It handles process creation, hook injection, and IPC communication. It acts in two modes:
   - **Injector Mode:** Launches the build system (e.g., `make`) with hooks attached.
   - **Wrapper Mode:** Masquerades as the compiler (e.g., `g++`) to capture arguments.

> `catter-proxy` includes processing logic of **HOOK**, which has different implementations on different platforms and we can't give a specific name here. For example, on Windows, it uses DLL injection with a specific DLL name like `catter-hook.dll`.


We use `--` to separate commands for `catter` and commands for the actual build system. For example:

```bash
catter [options] -- <build system command>
catter-proxy [options] -- <compiler command>
```

- The first parameter of `catter` is always used to specify the script.
- Then, you can provide specific options for scripts.
- Finally, after `--`, you provide the actual build system command that you want to run.

To specify a built-in script:
```bash
catter script::<script-name> [options] -- <build system command>
```

or custom script path:
```bash
catter /path/to/custom/script.js [options] -- <build system command>
```
---

## A Simple Example

1. User runs:
   ```bash
   catter script::cdb -o path/to/compile_commands.json -- make
   ```
2. `catter` starts the Decision-making Server and spawns:
   ```bash
    catter-proxy -- make
   ```
3. `catter-proxy` (PID: 100) starts.
   - Connects to `catter` Server.
   - `catter` instructs: This is a build command, execute it with hooks.
   - `catter-proxy` injects hooks and starts `make` (PID: 101).
4. `make` (PID: 101) runs with hooks. It parses the Makefile and prepares to execute `g++`.
5. **HOOK** (inside `make`): Intercepts the spawn call for `g++`. It rewrites the arguments to `catter-proxy -- g++` and spawns a new process.
6. `catter-proxy` (PID: 102) starts.
   - Connects to `catter` Server.
   - `catter` instructs: This is a compile command, record it in the database and then execute the original command.
   - `catter-proxy` executes `g++` (PID: 103).
7. `g++` (PID: 103) compiles normally.
8. `catter` collects all compilation commands in its database and can export them as a `compile_commands.json` file when `make` finishes.
