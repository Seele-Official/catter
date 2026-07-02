import { cmd, debug, fs } from "catter";

type ExpectedAnalysis = {
  label: string;
  cmd: string[];
  compilerMode: cmd.CompilerMode;
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

function invocation(argv: string[], exe = argv[0]!): cmd.AnalyzedData {
  return {
    exe,
    argv,
  };
}

function expectCompilerAnalysis(
  result: ReturnType<cmd.CompilerAnalyzer["analyze"]>,
  label: string,
): cmd.CompilerAnalysis {
  debug.assertThrow(result.isOk());
  if (result.isErr()) {
    throw new Error(
      `${label}: expected compiler analysis, got ${result.error}`,
    );
  }
  const analysis = result.value;
  if (!isCompilerAnalysis(analysis)) {
    throw new Error(`${label}: expected compiler analysis`);
  }
  return analysis;
}

function isCompilerAnalysis(
  analysis: cmd.Analysis,
): analysis is cmd.CompilerAnalysis {
  return analysis.kind === "compiler";
}

function expectAnalysisError(
  result: ReturnType<cmd.CompilerAnalyzer["analyze"]>,
  label: string,
): cmd.AnalysisError {
  debug.assertThrow(result.isErr());
  if (result.isOk()) {
    throw new Error(`${label}: expected analysis error`);
  }
  debug.assertThrow(result.error instanceof Error);
  debug.assertThrow(result.error instanceof cmd.AnalysisError);
  return result.error;
}

const compilerIdentifier = new cmd.CompilerIdentifier();
const compilerAnalyzer = new cmd.CompilerAnalyzer({
  identifier: compilerIdentifier,
});

function expectAnalysis(expected: ExpectedAnalysis) {
  const analysis = expectCompilerAnalysis(
    compilerAnalyzer.analyze(invocation(expected.cmd)),
    expected.label,
  );

  expectEq(analysis.kind, "compiler", `${expected.label} kind`);
  expectEq(analysis.exe, expected.cmd[0], `${expected.label} exe`);
  expectArrayEq(analysis.argv, expected.cmd, `${expected.label} argv`);
  expectEq(
    analysis.unwrappedExe,
    expected.cmd[0],
    `${expected.label} unwrapped exe`,
  );
  expectArrayEq(
    analysis.unwrappedArgv,
    expected.cmd,
    `${expected.label} unwrapped argv`,
  );
  expectEq(
    analysis.compilerMode.phase,
    expected.compilerMode.phase,
    `${expected.label} phase`,
  );
  expectEq(
    analysis.compilerMode.artifact,
    expected.compilerMode.artifact,
    `${expected.label} artifact`,
  );
  expectArrayEq(analysis.reads, expected.inputs, `${expected.label} reads`);
  expectArrayEq(analysis.writes, expected.outputs, `${expected.label} writes`);
}

debug.assertThrow(
  compilerAnalyzer.analyze(invocation(["clang", "-c", "main.cc"])).isOk(),
);
debug.assertThrow(
  compilerAnalyzer.analyze(invocation(["gcc", "-c", "main.cc"])).isOk(),
);
debug.assertThrow(
  compilerAnalyzer.analyze(invocation(["clang-cl", "/c", "main.cc"])).isOk(),
);
debug.assertThrow(
  compilerAnalyzer.analyze(invocation(["cl.exe", "/c", "main.cc"])).isOk(),
);
debug.assertThrow(
  expectAnalysisError(
    compilerAnalyzer.analyze(invocation(["nvcc", "-c", "kernel.cu"])),
    "nvcc",
  ) instanceof cmd.CompilerUnsupportedError,
);
const nvccIdentity = compilerIdentifier.identifyCompilerCommand(
  invocation(["nvcc", "-c", "kernel.cu"]),
);
debug.assertThrow(nvccIdentity?.dialect === cmd.CompilerDialect.Nvcc);

const absoluteExeAnalysis = expectCompilerAnalysis(
  compilerAnalyzer.analyze(
    invocation(["gcc", "-c", "absolute.c"], "/opt/toolchains/bin/gcc"),
  ),
  "absolute executable compiler analysis",
);
expectEq(
  absoluteExeAnalysis.exe,
  "/opt/toolchains/bin/gcc",
  "absolute executable path",
);
expectArrayEq(
  absoluteExeAnalysis.writes,
  ["absolute.o"],
  "absolute executable writes",
);

let capturedParse: cmd.CompilerParseResult | undefined;
const parserIrAnalyzer = new cmd.CompilerAnalyzer({
  resolver(parsed) {
    capturedParse = parsed;
    return cmd.resolveCompilerCommand(parsed);
  },
});
const parserIrAnalysis = expectCompilerAnalysis(
  parserIrAnalyzer.analyze(
    invocation(["clang", "-S", "-emit-llvm", "src/t.c", "-o", "-"]),
  ),
  "parser ir compiler analysis",
);
debug.assertThrow(capturedParse !== undefined);
if (capturedParse === undefined) {
  throw new Error("parser ir did not capture parse result");
}
const parserIr = capturedParse;
expectEq(
  parserIrAnalysis.compilerMode.artifact,
  cmd.CompilerArtifact.LlvmIR,
  "parser ir resolved artifact",
);
expectEq(parserIr.compilerActions.length, 2, "parser ir action count");
expectEq(
  parserIr.compilerActions[0]!.kind,
  "compile-assembly-like",
  "parser ir first action",
);
expectEq(
  parserIr.compilerActions[1]!.kind,
  "compile-llvm-like",
  "parser ir second action",
);
expectEq(parserIr.inputs.length, 0, "parser ir definite input count");
expectEq(parserIr.inputCandidates.length, 1, "parser ir input candidate count");
expectEq(
  parserIr.inputCandidates[0]!.path,
  "src/t.c",
  "parser ir input candidate path",
);
expectEq(parserIr.outputs.length, 1, "parser ir output fact count");
expectEq(
  parserIr.outputCandidates.length,
  0,
  "parser ir output candidate count",
);
expectEq(parserIr.outputs[0]!.path, "-", "parser ir output fact path");

let capturedRemainderParse: cmd.CompilerParseResult | undefined;
const remainderIrAnalyzer = new cmd.CompilerAnalyzer({
  resolver(parsed) {
    capturedRemainderParse = parsed;
    return cmd.resolveCompilerCommand(parsed);
  },
});
expectCompilerAnalysis(
  remainderIrAnalyzer.analyze(
    invocation([
      "clang",
      "--driver-mode=cl",
      "foo.obj",
      "/link",
      "/dll",
      "/out:bin/tool.dll",
      "bar.res",
    ]),
  ),
  "parser ir linker remainder analysis",
);
debug.assertThrow(capturedRemainderParse !== undefined);
if (capturedRemainderParse === undefined) {
  throw new Error("parser ir did not capture linker remainder parse result");
}
const remainderIr = capturedRemainderParse;
expectEq(
  remainderIr.compilerActions[0]!.index,
  3,
  "parser ir linker remainder action index",
);
expectEq(
  remainderIr.outputs[0]!.index,
  4,
  "parser ir linker remainder output index",
);
expectEq(
  remainderIr.inputs[0]!.index,
  5,
  "parser ir linker remainder input index",
);
expectEq(
  remainderIr.outputs[0]!.kind,
  "linked-artifact",
  "parser ir linker remainder output kind",
);
expectEq(
  remainderIr.inputs[0]!.source.kind,
  "remainder-argument",
  "parser ir linker remainder input source",
);

let capturedAssemblyListingParse: cmd.CompilerParseResult | undefined;
const assemblyListingIrAnalyzer = new cmd.CompilerAnalyzer({
  resolver(parsed) {
    capturedAssemblyListingParse = parsed;
    return cmd.resolveCompilerCommand(parsed);
  },
});
expectCompilerAnalysis(
  assemblyListingIrAnalyzer.analyze(
    invocation(["clang", "--driver-mode=cl", "/FA", "/Faasm/", "src/main.cpp"]),
  ),
  "parser ir assembly listing analysis",
);
debug.assertThrow(capturedAssemblyListingParse !== undefined);
if (capturedAssemblyListingParse === undefined) {
  throw new Error("parser ir did not capture assembly listing parse result");
}
const assemblyListingIr = capturedAssemblyListingParse;
expectEq(
  assemblyListingIr.compilerActions.length,
  2,
  "parser ir assembly listing action count",
);
expectEq(
  assemblyListingIr.compilerActions[0]!.kind,
  "emit-assembly-listing",
  "parser ir first assembly listing action",
);
expectEq(
  assemblyListingIr.compilerActions[1]!.kind,
  "emit-assembly-listing",
  "parser ir second assembly listing action",
);
const assemblyListingPathAction = assemblyListingIr.compilerActions[1]!;
if (assemblyListingPathAction.kind !== "emit-assembly-listing") {
  throw new Error("parser ir expected assembly listing path action");
}
expectEq(
  assemblyListingPathAction.path,
  "asm/",
  "parser ir assembly listing path",
);
expectEq(
  assemblyListingIr.outputs.length,
  0,
  "parser ir assembly listing output fact count",
);

const cases: ExpectedAnalysis[] = [
  {
    label: "clang llvm ir explicit stdout output",
    cmd: ["clang", "src/t.c", "-S", "-emit-llvm", "-o", "-"],
    compilerMode: {
      phase: cmd.CompilerPhase.Compile,
      artifact: cmd.CompilerArtifact.LlvmIR,
    },
    inputs: ["src/t.c"],
    outputs: ["-"],
  },
  {
    label: "gcc preprocess explicit language without suffix",
    cmd: ["gcc", "-x", "c", "generated_input", "-E", "-P"],
    compilerMode: {
      phase: cmd.CompilerPhase.Preprocess,
      artifact: cmd.CompilerArtifact.PreprocessedSource,
    },
    inputs: ["generated_input"],
    outputs: [],
  },
  {
    label: "gcc preprocess to file",
    cmd: ["gcc", "-E", "src/a.c", "-o", "a.i"],
    compilerMode: {
      phase: cmd.CompilerPhase.Preprocess,
      artifact: cmd.CompilerArtifact.PreprocessedSource,
    },
    inputs: ["src/a.c"],
    outputs: ["a.i"],
  },
  {
    label: "gcc syntax-only explicit language",
    cmd: ["gcc", "-x", "c++", "generated", "-fsyntax-only", "-fno-exceptions"],
    compilerMode: {
      phase: cmd.CompilerPhase.SyntaxOnly,
      artifact: cmd.CompilerArtifact.None,
    },
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
    compilerMode: {
      phase: cmd.CompilerPhase.Link,
      artifact: cmd.CompilerArtifact.Executable,
    },
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
    compilerMode: {
      phase: cmd.CompilerPhase.RelocatableLink,
      artifact: cmd.CompilerArtifact.Object,
    },
    inputs: ["a.o", "b.o"],
    outputs: ["partial.o"],
  },
  {
    label: "gcc compile link input has no default source output",
    cmd: ["gcc", "-x", "none", "obj/plain.o", "-c"],
    compilerMode: {
      phase: cmd.CompilerPhase.Compile,
      artifact: cmd.CompilerArtifact.Object,
    },
    inputs: ["obj/plain.o"],
    outputs: [],
  },
  {
    label: "gcc joined output spelling",
    cmd: ["gcc", "-c", "src/joined.c", "-oobj/joined.o"],
    compilerMode: {
      phase: cmd.CompilerPhase.Compile,
      artifact: cmd.CompilerArtifact.Object,
    },
    inputs: ["src/joined.c"],
    outputs: ["obj/joined.o"],
  },
  {
    label: "clang llvm bitcode action survives object stop phase",
    cmd: ["clang", "-emit-llvm", "-c", "src/t.c"],
    compilerMode: {
      phase: cmd.CompilerPhase.Compile,
      artifact: cmd.CompilerArtifact.LlvmBitcode,
    },
    inputs: ["src/t.c"],
    outputs: ["t.bc"],
  },
  {
    label: "clang assembly action survives object stop phase",
    cmd: ["clang", "-S", "-c", "src/t.c"],
    compilerMode: {
      phase: cmd.CompilerPhase.Compile,
      artifact: cmd.CompilerArtifact.Assembly,
    },
    inputs: ["src/t.c"],
    outputs: ["t.s"],
  },
  {
    label: "clang compile action survives shared link option",
    cmd: ["clang", "-c", "-shared", "src/t.c"],
    compilerMode: {
      phase: cmd.CompilerPhase.Compile,
      artifact: cmd.CompilerArtifact.Object,
    },
    inputs: ["src/t.c"],
    outputs: ["t.o"],
  },
  {
    label: "clang default executable output",
    cmd: ["clang", "src/t.c"],
    compilerMode: {
      phase: cmd.CompilerPhase.Link,
      artifact: cmd.CompilerArtifact.Executable,
    },
    inputs: ["src/t.c"],
    outputs: ["a.out"],
  },
  {
    label: "clang default executable output from object input",
    cmd: ["clang", "obj/t.o"],
    compilerMode: {
      phase: cmd.CompilerPhase.Link,
      artifact: cmd.CompilerArtifact.Executable,
    },
    inputs: ["obj/t.o"],
    outputs: ["a.out"],
  },
  {
    label: "clang archive static lib from object inputs",
    cmd: ["clang", "--emit-static-lib", "a.o", "b.o", "-o", "libstuff.a"],
    compilerMode: {
      phase: cmd.CompilerPhase.Archive,
      artifact: cmd.CompilerArtifact.StaticLibrary,
    },
    inputs: ["a.o", "b.o"],
    outputs: ["libstuff.a"],
  },
  {
    label: "clang compile multiple translation units with default outputs",
    cmd: ["clang", "-c", "src/a.c", "src/b.cc"],
    compilerMode: {
      phase: cmd.CompilerPhase.Compile,
      artifact: cmd.CompilerArtifact.Object,
    },
    inputs: ["src/a.c", "src/b.cc"],
    outputs: ["a.o", "b.o"],
  },
  {
    label: "clang-cl cl-style compile no suffix into object dir",
    cmd: ["clang-cl", "/c", "/Tp", "src/noext", "/Fo:build/"],
    compilerMode: {
      phase: cmd.CompilerPhase.Compile,
      artifact: cmd.CompilerArtifact.Object,
    },
    inputs: ["src/noext"],
    outputs: [normalizedJoin("build", "noext.obj")],
  },
  {
    label: "clang-cl cl-style default executable output",
    cmd: ["clang-cl", "src/main.cpp"],
    compilerMode: {
      phase: cmd.CompilerPhase.Link,
      artifact: cmd.CompilerArtifact.Executable,
    },
    inputs: ["src/main.cpp"],
    outputs: ["main.exe"],
  },
  {
    label: "clang-cl dash preprocess to file mode",
    cmd: ["clang-cl", "-P", "src/main.cpp"],
    compilerMode: {
      phase: cmd.CompilerPhase.Preprocess,
      artifact: cmd.CompilerArtifact.PreprocessedSource,
    },
    inputs: ["src/main.cpp"],
    outputs: [], // TODO: clang-cl /P default output is stdout, but we don't have a way to represent that yet
  },
  {
    label: "clang-cl assembly listing does not stop link",
    cmd: ["clang-cl", "/FA", "src/main.cpp"],
    compilerMode: {
      phase: cmd.CompilerPhase.Link,
      artifact: cmd.CompilerArtifact.Executable,
    },
    inputs: ["src/main.cpp"],
    outputs: ["main.exe", "main.asm"],
  },
  {
    label: "clang-cl assembly listing directory output",
    cmd: ["clang-cl", "/c", "/FA", "/Faasm/", "src/main.cpp"],
    compilerMode: {
      phase: cmd.CompilerPhase.Compile,
      artifact: cmd.CompilerArtifact.Object,
    },
    inputs: ["src/main.cpp"],
    outputs: ["main.obj", normalizedJoin("asm", "main.asm")],
  },
  {
    label: "clang-cl assembly listing single file output",
    cmd: ["clang-cl", "/c", "/Faasm.lst", "src/main.cpp"],
    compilerMode: {
      phase: cmd.CompilerPhase.Compile,
      artifact: cmd.CompilerArtifact.Object,
    },
    inputs: ["src/main.cpp"],
    outputs: ["main.obj", "asm.lst"],
  },
  {
    label: "clang-cl cl-style default shared library output",
    cmd: ["clang-cl", "/LD", "src/plugin.cpp"],
    compilerMode: {
      phase: cmd.CompilerPhase.Link,
      artifact: cmd.CompilerArtifact.SharedLibrary,
    },
    inputs: ["src/plugin.cpp"],
    outputs: ["plugin.dll"],
  },
  {
    label: "msvc cl-style compile explicit object output",
    cmd: ["cl.exe", "/c", "src/main.cpp", "/Foobj/main.obj"],
    compilerMode: {
      phase: cmd.CompilerPhase.Compile,
      artifact: cmd.CompilerArtifact.Object,
    },
    inputs: ["src/main.cpp"],
    outputs: ["obj/main.obj"],
  },
  {
    label: "msvc cl-style shared output directory",
    cmd: ["cl.exe", "/LD", "src/plugin.cpp", "/Fe:bin/"],
    compilerMode: {
      phase: cmd.CompilerPhase.Link,
      artifact: cmd.CompilerArtifact.SharedLibrary,
    },
    inputs: ["src/plugin.cpp"],
    outputs: [normalizedJoin("bin", "plugin.dll")],
  },
  {
    label: "msvc cl-style shared link via linker remainder",
    cmd: ["cl.exe", "/link", "/dll", "/out:bin/tool.dll", "foo.obj", "bar.res"],
    compilerMode: {
      phase: cmd.CompilerPhase.Link,
      artifact: cmd.CompilerArtifact.SharedLibrary,
    },
    inputs: ["foo.obj", "bar.res"],
    outputs: ["bin/tool.dll"],
  },
  {
    label: "clang driver-mode cl compile no suffix into object dir",
    cmd: ["clang", "--driver-mode=cl", "/c", "/Tp", "src/noext", "/Fo:build/"],
    compilerMode: {
      phase: cmd.CompilerPhase.Compile,
      artifact: cmd.CompilerArtifact.Object,
    },
    inputs: ["src/noext"],
    outputs: [normalizedJoin("build", "noext.obj")],
  },
  {
    label: "clang driver-mode cl shared output directory",
    cmd: ["clang", "--driver-mode=cl", "/LD", "src/plugin.cpp", "/Fe:bin/"],
    compilerMode: {
      phase: cmd.CompilerPhase.Link,
      artifact: cmd.CompilerArtifact.SharedLibrary,
    },
    inputs: ["src/plugin.cpp"],
    outputs: [normalizedJoin("bin", "plugin.dll")],
  },
  {
    label: "clang driver-mode cl assembly listing keeps shared link mode",
    cmd: [
      "clang",
      "--driver-mode=cl",
      "/FA",
      "src/plugin.cpp",
      "/link",
      "/dll",
      "/out:bin/plugin.dll",
    ],
    compilerMode: {
      phase: cmd.CompilerPhase.Link,
      artifact: cmd.CompilerArtifact.SharedLibrary,
    },
    inputs: ["src/plugin.cpp"],
    outputs: ["bin/plugin.dll", "plugin.asm"],
  },
  {
    label: "clang driver-mode cl default object output",
    cmd: ["clang", "--driver-mode=cl", "-c", "main.c"],
    compilerMode: {
      phase: cmd.CompilerPhase.Compile,
      artifact: cmd.CompilerArtifact.Object,
    },
    inputs: ["main.c"],
    outputs: ["main.obj"],
  },
  {
    label: "clang driver-mode cl parses linker remainder after input",
    cmd: [
      "clang",
      "--driver-mode=cl",
      "foo.obj",
      "/link",
      "/dll",
      "/out:bin/tool.dll",
      "bar.res",
    ],
    compilerMode: {
      phase: cmd.CompilerPhase.Link,
      artifact: cmd.CompilerArtifact.SharedLibrary,
    },
    inputs: ["foo.obj", "bar.res"],
    outputs: ["bin/tool.dll"],
  },
];

for (const testCase of cases) {
  expectAnalysis(testCase);
}

expectAnalysisError(
  compilerAnalyzer.analyze(invocation(["clang-cl", "-S", "src/main.cpp"])),
  "clang-cl gnu assembly stop action",
);
expectAnalysisError(
  compilerAnalyzer.analyze(
    invocation(["clang-cl", "-emit-llvm", "-c", "src/main.cpp"]),
  ),
  "clang-cl gnu llvm artifact action",
);

compilerIdentifier.registerCompilerRule("test:cross-gcc", {
  dialect: cmd.CompilerDialect.Gcc,
  match: [/^my-cross-tool$/, /^\/opt\/bin\/my-cross-tool$/],
});
expectAnalysis({
  label: "custom gnu compiler rule",
  cmd: ["my-cross-tool", "-c", "src/custom.c"],
  compilerMode: {
    phase: cmd.CompilerPhase.Compile,
    artifact: cmd.CompilerArtifact.Object,
  },
  inputs: ["src/custom.c"],
  outputs: ["custom.o"],
});
const customAbsoluteExeAnalysis = expectCompilerAnalysis(
  compilerAnalyzer.analyze(
    invocation(
      ["my-cross-tool", "-c", "src/custom-absolute.c"],
      "/opt/bin/my-cross-tool",
    ),
  ),
  "custom absolute executable compiler analysis",
);
expectArrayEq(
  customAbsoluteExeAnalysis.writes,
  ["custom-absolute.o"],
  "custom absolute executable writes",
);

compilerIdentifier.registerCompilerRule("test:cross-gcc", {
  dialect: cmd.CompilerDialect.Clang,
  match: /^my-cross-tool$/,
});
expectAnalysis({
  label: "custom compiler rule replacement",
  cmd: ["my-cross-tool", "-c", "src/custom.c"],
  compilerMode: {
    phase: cmd.CompilerPhase.Compile,
    artifact: cmd.CompilerArtifact.Object,
  },
  inputs: ["src/custom.c"],
  outputs: ["custom.o"],
});
compilerIdentifier.unregisterCompilerRule("test:cross-gcc");
debug.assertThrow(
  expectAnalysisError(
    compilerAnalyzer.analyze(
      invocation(["my-cross-tool", "-c", "src/custom.c"]),
    ),
    "unregistered custom compiler",
  ) instanceof cmd.CompilerUnsupportedError,
);
