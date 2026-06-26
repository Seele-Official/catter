#include "compiler.h"

#include <optional>
#include <kota/zest/macro.h>
#include <kota/zest/zest.h>

using namespace catter;

TEST_SUITE(compiler_tests) {
TEST_CASE(identify_compiler) {
    struct TestCase {
        std::string_view input;
        Compiler expected;
    };

    std::vector<TestCase> test_cases = {
        {"gcc",                                                                                                          Compiler::gcc     },
        {"g++",                                                                                                          Compiler::gcc     },
        {"gcc-10",                                                                                                       Compiler::gcc     },
        {"g++-10.2",                                                                                                     Compiler::gcc     },
        {"/usr/bin/gcc",                                                                                                 Compiler::gcc     },
        {"/usr/bin/g++",                                                                                                 Compiler::gcc     },
        {"/usr/bin/x86_64-linux-gnu-gcc-13",                                                                             Compiler::gcc     },
        {"/usr/bin/aarch64-linux-gnu-c++",                                                                               Compiler::gcc     },
        {"/usr/local/gcc-15.1.0/bin/c++",                                                                                Compiler::gcc     },
        {"/usr/local/gcc-15.1.0/libexec/gcc/x86_64-pc-linux-gnu/15.1.0/cc1plus",                                         Compiler::gcc     },
        {R"(C:\msys64\ucrt64\bin\gcc.exe)",                                                                              Compiler::gcc     },
        {R"(C:\msys64\ucrt64\bin\g++.exe)",                                                                              Compiler::gcc     },
        {"C:/msys64/ucrt64/bin/x86_64-w64-mingw32-g++.exe",                                                              Compiler::gcc     },
        {"clang",                                                                                                        Compiler::clang   },
        {"clang++",                                                                                                      Compiler::clang   },
        {"clang-12",                                                                                                     Compiler::clang   },
        {"clang++-20",                                                                                                   Compiler::clang   },
        {"/usr/bin/clang",                                                                                               Compiler::clang   },
        {"/usr/bin/clang++",                                                                                             Compiler::clang   },
        {"/opt/homebrew/opt/llvm/bin/clang++",                                                                           Compiler::clang   },
        {"/opt/llvm-20/bin/aarch64-apple-darwin23-clang++",                                                              Compiler::clang   },
        {R"(D:\LLVM\bin\clang.exe)",                                                                                     Compiler::clang   },
        {R"(D:\LLVM\bin\clang++.exe)",                                                                                   Compiler::clang   },
        {"C:/Program Files/LLVM/bin/clang.exe",                                                                          Compiler::clang   },
        {"clang-cl",                                                                                                     Compiler::clang_cl},
        {"clang-cl.exe",                                                                                                 Compiler::clang_cl},
        {"clang-cl-18",                                                                                                  Compiler::clang_cl},
        {"clang-cl_20.1",                                                                                                Compiler::clang_cl},
        {R"(C:\Program Files\LLVM\bin\clang-cl.exe)",                                                                    Compiler::clang_cl},
        {R"(D:\LLVM\bin\clang-cl.exe)",                                                                                  Compiler::clang_cl},
        {"C:/Program Files/LLVM/bin/clang-cl.exe",                                                                       Compiler::clang_cl},
        {"x86_64-pc-windows-msvc-clang-cl.exe",                                                                          Compiler::clang_cl},
        {"cl",                                                                                                           Compiler::msvc    },
        {"cl.exe",                                                                                                       Compiler::msvc    },
        {R"(C:\Program Files\Microsoft Visual Studio\VC\Tools\MSVC\bin\cl.exe)",                                         Compiler::msvc    },
        {R"(D:\MSVC\BuildTools\VC\Tools\MSVC\14.44.35207\bin\HostX64\x64\cl.exe)",                                       Compiler::msvc    },
        {R"(C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\cl.exe)",
         Compiler::msvc                                                                                                                    },
        {"C:/Program Files/Microsoft Visual Studio/2022/Community/VC/Tools/MSVC/14.44.35207/bin/Hostx64/x64/cl.exe",
         Compiler::msvc                                                                                                                    },
        {R"(C:\PROGRA~1\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\cl.exe)",
         Compiler::msvc                                                                                                                    },
        {"flang",                                                                                                        Compiler::flang   },
        {"flang-new",                                                                                                    Compiler::flang   },
        {"/opt/llvm/bin/flang-new",                                                                                      Compiler::flang   },
        {"aarch64-linux-gnu-flang-19",                                                                                   Compiler::flang   },
        {"ifort",                                                                                                        Compiler::ifort   },
        {"ifx",                                                                                                          Compiler::ifort   },
        {R"(C:\Program Files (x86)\Intel\oneAPI\compiler\latest\bin\ifx.exe)",                                           Compiler::ifort   },
        {"crayftn",                                                                                                      Compiler::crayftn },
        {"ftn",                                                                                                          Compiler::crayftn },
        {"/opt/cray/pe/craype/default/bin/ftn",                                                                          Compiler::crayftn },
        {"nvcc",                                                                                                         Compiler::nvcc    },
        {"nvcc-12.6",                                                                                                    Compiler::nvcc    },
        {"/usr/local/cuda/bin/nvcc",                                                                                     Compiler::nvcc    },
        {R"(C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6\bin\nvcc.exe)",
         Compiler::nvcc                                                                                                                    },
        {"ccache",                                                                                                       Compiler::wrapper },
        {"distcc",                                                                                                       Compiler::wrapper },
        {"sccache",                                                                                                      Compiler::wrapper },
        {"/usr/lib/ccache/ccache",                                                                                       Compiler::wrapper },
        {R"(C:\Program Files\Mozilla Build\sccache.exe)",                                                                Compiler::wrapper },
        {"clang-cl.exe.bak",                                                                                             Compiler::unknown },
        {"cl-wrapper.exe",                                                                                               Compiler::unknown },
        {R"(C:\Tools\cl-wrapper.exe)",                                                                                   Compiler::unknown },
        {"/usr/bin/collect2-wrapper",                                                                                    Compiler::unknown },
        {"unknown-compiler",                                                                                             Compiler::unknown }
    };

    for(const auto& test_case: test_cases) {
        EXPECT_EQ(test_case.expected, identify_compiler(test_case.input));
    }

#ifdef _WIN32
    test_cases = {
        {R"(C:\LLVM\BIN\CLANG.EXE)",                                                 Compiler::clang   },
        {R"(C:\LLVM\BIN\CLANG-CL.EXE)",                                              Compiler::clang_cl},
        {"CL.EXE",                                                                   Compiler::msvc    },
        {R"(C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6\bin\NVCC.EXE)",
         Compiler::nvcc                                                                                }
    };

    for(const auto& test_case: test_cases) {
        EXPECT_EQ(test_case.expected, identify_compiler(test_case.input));
    }
#endif
};
};  // TEST_SUITE(compiler_tests)
