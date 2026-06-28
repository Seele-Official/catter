import { cmd, debug } from "catter";

function expectEq<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function expectArrayEq(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  if (actual.length !== expected.length) {
    throw new Error(
      `${label}: expected [${expected.join(", ")}], got [${actual.join(", ")}]`,
    );
  }

  for (let index = 0; index < actual.length; ++index) {
    if (actual[index] !== expected[index]) {
      throw new Error(
        `${label}: expected [${expected.join(", ")}], got [${actual.join(", ")}]`,
      );
    }
  }
}

function expectEdgeEq(
  actual: cmd.Edge,
  expected: cmd.Edge,
  label: string,
): void {
  expectEq(actual.output, expected.output, `${label} output`);
  expectArrayEq(actual.inputs, expected.inputs, `${label} inputs`);
}

const compileCommand = ["clang", "-c", "src/a.c", "src/b.c"];
const compileAnalysis = cmd.CompilerAnalysis.from(cmd.analyze(compileCommand));
debug.assertThrow(compileAnalysis !== undefined);
if (compileAnalysis === undefined) {
  throw new Error("expected compiler analysis");
}

expectEq(compileAnalysis.kind, "compiler", "compile kind");
expectArrayEq(compileAnalysis.argv, compileCommand, "compile argv");
expectEq(
  compileAnalysis.artifact,
  cmd.CompilerArtifact.Object,
  "compile artifact",
);
expectArrayEq(compileAnalysis.reads, ["src/a.c", "src/b.c"], "compile reads");
expectArrayEq(compileAnalysis.writes, ["a.o", "b.o"], "compile writes");
expectArrayEq(
  compileAnalysis.sourceFiles,
  ["src/a.c", "src/b.c"],
  "compile sources",
);

const genericCompileAnalysis = cmd.analyze(compileCommand);
if (genericCompileAnalysis?.kind !== "compiler") {
  throw new Error("expected compiler command analysis variant");
}
expectArrayEq(
  genericCompileAnalysis.sourceFiles,
  ["src/a.c", "src/b.c"],
  "generic compile sources",
);

const compileEdges = compileAnalysis.edges;
expectEq(compileEdges.length, 2, "compile edge count");
expectEdgeEq(
  compileEdges[0],
  {
    output: "a.o",
    inputs: ["src/a.c"],
  },
  "compile first edge",
);
expectEdgeEq(
  compileEdges[1],
  {
    output: "b.o",
    inputs: ["src/b.c"],
  },
  "compile second edge",
);

const cdbItems = cmd.cdbItemsOf(
  {
    cwd: "/tmp/build",
    argv: [...compileCommand],
  },
  [
    {
      file: "src/a.c",
      output: "a.o",
    },
    {
      file: "src/b.c",
      output: "b.o",
    },
  ],
);
expectEq(cdbItems.length, 2, "cdb item count");
expectEq(cdbItems[0].directory, "/tmp/build", "cdb directory");
expectEq(cdbItems[0].file, "src/a.c", "cdb first file");
expectEq(cdbItems[0].output, "a.o", "cdb first output");

const preprocessAnalysis = cmd.CompilerAnalysis.from(
  cmd.analyze(["gcc", "-E", "src/a.c", "-o", "a.i"]),
);
debug.assertThrow(preprocessAnalysis !== undefined);
if (preprocessAnalysis === undefined) {
  throw new Error("expected preprocess compiler analysis");
}
expectEq(
  preprocessAnalysis.artifact,
  cmd.CompilerArtifact.Stdout,
  "preprocess artifact",
);
expectArrayEq(preprocessAnalysis.reads, ["src/a.c"], "preprocess reads");
expectArrayEq(preprocessAnalysis.writes, ["a.i"], "preprocess writes");
expectEq(preprocessAnalysis.edges.length, 1, "preprocess edge count");

const archiverAnalysis = cmd.ArchiverAnalysis.from(
  cmd.analyze(["llvm-ar", "--thin", "rcs", "libfoo.a", "a.o", "b.o"]),
);
debug.assertThrow(archiverAnalysis !== undefined);
if (archiverAnalysis === undefined) {
  throw new Error("expected archiver analysis");
}

expectEq(archiverAnalysis.kind, "archiver", "archiver kind");
expectEq(
  archiverAnalysis.operation,
  cmd.ArchiverOperation.ReplaceOrInsert,
  "archiver operation",
);
debug.assertThrow(archiverAnalysis.thin);
expectArrayEq(archiverAnalysis.reads, ["a.o", "b.o"], "archiver reads");
expectArrayEq(archiverAnalysis.writes, ["libfoo.a"], "archiver writes");

const archiveEdges = archiverAnalysis.edges;
expectEq(archiveEdges.length, 1, "archiver edge count");
expectEdgeEq(
  archiveEdges[0],
  {
    output: "libfoo.a",
    inputs: ["a.o", "b.o"],
  },
  "archiver edge",
);

const gnuArchiverAnalysis = cmd.ArchiverAnalysis.from(
  cmd.analyze(["ar", "-cr", "libcommon.a", "a.o", "b.o"]),
);
debug.assertThrow(gnuArchiverAnalysis !== undefined);
if (gnuArchiverAnalysis === undefined) {
  throw new Error("expected gnu archiver analysis");
}
expectEq(
  gnuArchiverAnalysis.operation,
  cmd.ArchiverOperation.ReplaceOrInsert,
  "gnu archiver operation",
);
expectArrayEq(gnuArchiverAnalysis.modifiers, ["c"], "gnu archiver modifiers");
expectArrayEq(
  gnuArchiverAnalysis.writes,
  ["libcommon.a"],
  "gnu archiver writes",
);
expectArrayEq(gnuArchiverAnalysis.reads, ["a.o", "b.o"], "gnu archiver reads");

const tableArchiverAnalysis = cmd.ArchiverAnalysis.from(
  cmd.analyze(["ar", "t", "libcommon.a"]),
);
debug.assertThrow(tableArchiverAnalysis !== undefined);
if (tableArchiverAnalysis === undefined) {
  throw new Error("expected table archiver analysis");
}
expectEq(
  tableArchiverAnalysis.operation,
  cmd.ArchiverOperation.Table,
  "table archiver operation",
);
expectArrayEq(
  tableArchiverAnalysis.reads,
  ["libcommon.a"],
  "table archiver reads",
);
expectArrayEq(tableArchiverAnalysis.writes, [], "table archiver writes");

debug.assertThrow(
  cmd.ArchiverAnalysis.analyze(["ar", "--version"]) === undefined,
);
debug.assertThrow(
  cmd.ArchiverAnalysis.analyze(["ar", "x", "libcommon.a"]) === undefined,
);

class ToyAnalysis extends cmd.Analysis {
  static readonly key = "toy-bundle";

  static analyze(argv: readonly string[]): ToyAnalysis | undefined {
    if (
      argv[0] !== "toy-bundle" ||
      argv[1] === undefined ||
      argv[2] === undefined
    ) {
      return undefined;
    }
    return new ToyAnalysis(argv[1], argv[2]);
  }

  static from(analysis: cmd.Analysis | undefined): ToyAnalysis | undefined {
    return analysis instanceof ToyAnalysis ? analysis : undefined;
  }

  readonly stage = "bundle";
  readonly kind = "toy" as const;

  constructor(input: string, output: string) {
    super({
      reads: [input],
      writes: [output],
    });
  }
}

const localRegistry = new cmd.Registry().register(ToyAnalysis);
const localResult = ToyAnalysis.from(
  localRegistry.analyze(["toy-bundle", "input.dat", "output.pkg"]),
);
debug.assertThrow(localResult !== undefined);
if (localResult === undefined) {
  throw new Error("expected local analysis");
}
expectEq(localResult.stage, "bundle", "local stage");
expectArrayEq(localResult.reads, ["input.dat"], "local reads");
expectArrayEq(localResult.writes, ["output.pkg"], "local writes");
expectEq(localResult.edges.length, 1, "local edge count");
expectEq(localResult.edges[0].output, "output.pkg", "local edge output");

const sample = cmd.CompilerAnalysis.analyze(["gcc", "-c", "sample.c"]);
debug.assertThrow(sample !== undefined);
if (sample === undefined) {
  throw new Error("expected sample compiler analysis");
}
expectArrayEq(sample.writes, ["sample.o"], "sample writes");
