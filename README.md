# catter
A new tool to capture C++ compilation command

## The Problem

A significant challenge in the C++ ecosystem is that many build tools do not natively support the generation of a Compilation Database (CDB). Examples include traditional Makefiles, CMake when using the MSBuild generator, and other complex build systems like Bazel or MSBuild itself.

While solutions like `bear` exist, they often require installing a different, specialized tool for each build system, which is inconvenient. Furthermore, these solutions are not always cross-platform.

I am currently developing a new C++ language server that relies on a CDB to locate files and provide accurate language features. To ensure a seamless experience for my users, I aim to create a single, unified, cross-platform tool to capture compilation commands from **any** build process.

This tool should have the following key characteristics:

1.  **Cross-Platform:** It must run on Windows, macOS, and Linux, even if this requires platform-specific implementations.
2.  **Build-System Agnostic:** It should support any build system without requiring modifications to the user's existing build scripts. This can be achieved by monitoring process creation to capture compiler invocations or through other similar methods.
3.  **Avoid Full Compilation (If Possible):** The primary goal is to obtain the compilation commands without executing a time-consuming full build of the entire project. This could be done using techniques like a "fake" compiler that creates empty object files (`.o`) or other interception methods. However, if avoiding the build is not feasible, performing a one-time full compilation is an acceptable fallback.
