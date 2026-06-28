import { cmd, debug, fs, os } from "catter";

type ExpectedAnalysis = {
  label: string;
  cmd: string[];
  artifact: (typeof cmd.CompilerArtifact)[keyof typeof cmd.CompilerArtifact];
  inputs: string[];
  outputs: string[];
};

function expectEq<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function expectArrayEq(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
) {
  if (actual.length !== expected.length) {
    throw new Error(
      `${label}: expected [${expected.join(", ")}], got [${actual.join(", ")}]`,
    );
  }

  for (let idx = 0; idx < actual.length; ++idx) {
    if (actual[idx] !== expected[idx]) {
      throw new Error(
        `${label}: expected [${expected.join(", ")}], got [${actual.join(", ")}]`,
      );
    }
  }
}

function normalizedJoin(...parts: string[]) {
  return fs.path.lexicalNormal(fs.path.joinAll(...parts));
}

function expectAnalysis(expected: ExpectedAnalysis) {
  const analysis = cmd.CompilerAnalysis.analyze(expected.cmd);
  debug.assertThrow(analysis !== undefined);
  if (analysis === undefined) {
    throw new Error(`${expected.label}: expected compiler analysis`);
  }

  expectEq(analysis.kind, "compiler", `${expected.label} kind`);
  expectArrayEq(analysis.argv, expected.cmd, `${expected.label} argv`);
  expectArrayEq(
    analysis.originalArgv,
    expected.cmd,
    `${expected.label} original argv`,
  );
  expectEq(analysis.artifact, expected.artifact, `${expected.label} artifact`);
  expectArrayEq(analysis.reads, expected.inputs, `${expected.label} reads`);
  expectArrayEq(analysis.writes, expected.outputs, `${expected.label} writes`);
}

debug.assertThrow(
  cmd.CompilerAnalysis.analyze(["clang", "-c", "main.cc"]) !== undefined,
);
debug.assertThrow(
  cmd.CompilerAnalysis.analyze(["gcc", "-c", "main.cc"]) !== undefined,
);
debug.assertThrow(
  cmd.CompilerAnalysis.analyze(["clang-cl", "/c", "main.cc"]) !== undefined,
);
debug.assertThrow(
  cmd.CompilerAnalysis.analyze(["cl.exe", "/c", "main.cc"]) !== undefined,
);
debug.assertThrow(
  cmd.CompilerAnalysis.analyze(["nvcc", "-c", "kernel.cu"]) === undefined,
);
const nvccIdentity = cmd.identifyCompilerCommand(["nvcc", "-c", "kernel.cu"]);
debug.assertThrow(nvccIdentity?.dialect === cmd.CompilerDialect.Nvcc);

const cases: ExpectedAnalysis[] = [
  {
    label: "clang llvm ir explicit stdout output",
    cmd: ["clang", "src/t.c", "-S", "-emit-llvm", "-o", "-"],
    artifact: cmd.CompilerArtifact.LlvmIR,
    inputs: ["src/t.c"],
    outputs: ["-"],
  },
  {
    label: "gcc preprocess explicit language without suffix",
    cmd: ["gcc", "-x", "c", "generated_input", "-E", "-P"],
    artifact: cmd.CompilerArtifact.Stdout,
    inputs: ["generated_input"],
    outputs: [],
  },
  {
    label: "gcc preprocess to file",
    cmd: ["gcc", "-E", "src/a.c", "-o", "a.i"],
    artifact: cmd.CompilerArtifact.Stdout,
    inputs: ["src/a.c"],
    outputs: ["a.i"],
  },
  {
    label: "gcc syntax-only explicit language",
    cmd: ["gcc", "-x", "c++", "generated", "-fsyntax-only", "-fno-exceptions"],
    artifact: cmd.CompilerArtifact.None,
    inputs: ["generated"],
    outputs: [],
  },
  {
    label: "gcc x-none resets classification for later object inputs",
    cmd: [
      "gcc",
      "-x",
      "c",
      "generated_input",
      "-x",
      "none",
      "obj/plain.o",
      "-o",
      "bin/app",
    ],
    artifact: cmd.CompilerArtifact.Executable,
    inputs: ["generated_input", "obj/plain.o"],
    outputs: ["bin/app"],
  },
  {
    label: "gcc relocatable link with extra linker flags",
    cmd: [
      "gcc",
      "-nostdlib",
      "-Wl,--build-id=sha1",
      "-r",
      "a.o",
      "b.o",
      "-o",
      "partial.o",
    ],
    artifact: cmd.CompilerArtifact.Object,
    inputs: ["a.o", "b.o"],
    outputs: ["partial.o"],
  },
  {
    label: "clang archive static lib from object inputs",
    cmd: ["clang", "--emit-static-lib", "a.o", "b.o", "-o", "libstuff.a"],
    artifact: cmd.CompilerArtifact.StaticLibrary,
    inputs: ["a.o", "b.o"],
    outputs: ["libstuff.a"],
  },
  {
    label: "clang compile multiple translation units with default outputs",
    cmd: ["clang", "-c", "src/a.c", "src/b.cc"],
    artifact: cmd.CompilerArtifact.Object,
    inputs: ["src/a.c", "src/b.cc"],
    outputs: ["a.o", "b.o"],
  },
  {
    label: "clang-cl cl-style compile no suffix into object dir",
    cmd: ["clang-cl", "/c", "/Tp", "src/noext", "/Fo:build/"],
    artifact: cmd.CompilerArtifact.Object,
    inputs: ["src/noext"],
    outputs: [normalizedJoin("build", "noext.obj")],
  },
  {
    label: "msvc cl-style compile explicit object output",
    cmd: ["cl.exe", "/c", "src/main.cpp", "/Foobj/main.obj"],
    artifact: cmd.CompilerArtifact.Object,
    inputs: ["src/main.cpp"],
    outputs: ["obj/main.obj"],
  },
  {
    label: "msvc cl-style shared link via linker remainder",
    cmd: ["cl.exe", "/link", "/dll", "/out:bin/tool.dll", "foo.obj", "bar.res"],
    artifact: cmd.CompilerArtifact.SharedLibrary,
    inputs: ["foo.obj", "bar.res"],
    outputs: ["bin/tool.dll"],
  },
];

if (os.platform() === "windows") {
  cases.splice(1, 0, {
    label: "clang cl-style compile no suffix into object dir",
    cmd: ["clang", "--driver-mode=cl", "/c", "/Tp", "src/noext", "/Fo:build/"],
    artifact: cmd.CompilerArtifact.Object,
    inputs: ["src/noext"],
    outputs: [normalizedJoin("build", "noext.obj")],
  });
  cases.push({
    label: "clang cl-style shared link via linker remainder",
    cmd: [
      "clang",
      "--driver-mode=cl",
      "/link",
      "/dll",
      "/out:bin/tool.dll",
      "foo.obj",
      "bar.res",
    ],
    artifact: cmd.CompilerArtifact.SharedLibrary,
    inputs: ["foo.obj", "bar.res"],
    outputs: ["bin/tool.dll"],
  });
} else {
  cases.push({
    label: "clang cl-style visibility suppressed default output",
    cmd: ["clang", "--driver-mode=cl", "-c", "main.c"],
    artifact: cmd.CompilerArtifact.Object,
    inputs: ["main.c"],
    outputs: ["main.o"],
  });
}

for (const testCase of cases) {
  expectAnalysis(testCase);
}

cmd.registerCompilerRule({
  key: "test:cross-gcc",
  dialect: cmd.CompilerDialect.Gnu,
  match: /^my-cross-tool$/,
});
expectAnalysis({
  label: "custom gnu compiler rule",
  cmd: ["my-cross-tool", "-c", "src/custom.c"],
  artifact: cmd.CompilerArtifact.Object,
  inputs: ["src/custom.c"],
  outputs: ["custom.o"],
});

cmd.registerCompilerRule({
  key: "test:cross-gcc",
  dialect: cmd.CompilerDialect.Clang,
  match: /^my-cross-tool$/,
});
expectAnalysis({
  label: "custom compiler rule replacement",
  cmd: ["my-cross-tool", "-c", "src/custom.c"],
  artifact: cmd.CompilerArtifact.Object,
  inputs: ["src/custom.c"],
  outputs: ["custom.o"],
});
cmd.unregisterCompilerRule("test:cross-gcc");
debug.assertThrow(
  cmd.CompilerAnalysis.analyze(["my-cross-tool", "-c", "src/custom.c"]) ===
    undefined,
);
