import { Analysis } from "../model.js";
import type { Analysis as AnyAnalysis, Analyzer } from "../model.js";
import { identifyCompilerCommand } from "./identify.js";
import { parseCompilerCommand } from "./parsers/index.js";
import { resolveCompilerEdges, resolveOutputs } from "./parsers/clang.js";
import type {
  CompilerArtifact,
  CompilerDialect,
  CompilerExe,
  CompilerInput,
  CompilerPhase,
  CompilerStyle,
  CommandModel,
} from "./types.js";
import { unwrapCompilerCommand } from "./unwrap.js";

function analyzeCompilerModel(
  cmd: readonly string[],
): CommandModel | undefined {
  const unwrapped = unwrapCompilerCommand(cmd);
  const identity = identifyCompilerCommand(unwrapped.argv);
  if (identity === undefined) {
    return undefined;
  }

  return parseCompilerCommand(unwrapped.argv, identity);
}

export class CompilerAnalysis extends Analysis<"compiler", CompilerExe> {
  static readonly key = "compiler";

  static analyze(cmd: readonly string[]): CompilerAnalysis | undefined {
    const model = analyzeCompilerModel(cmd);
    return model === undefined ? undefined : new CompilerAnalysis(model);
  }

  static from(analysis: AnyAnalysis | undefined): CompilerAnalysis | undefined {
    return analysis instanceof CompilerAnalysis ? analysis : undefined;
  }

  readonly dialect: CompilerDialect;
  readonly phase: CompilerPhase;
  readonly artifact: CompilerArtifact;
  readonly style: CompilerStyle;
  readonly inputFiles: readonly CompilerInput[];
  readonly sourceFiles: readonly string[];

  private constructor(model: CommandModel) {
    const writes = resolveOutputs(model);
    super({
      kind: "compiler",
      exe: model.compiler,
      reads: model.inputs.map((input) => input.path),
      writes,
      edges: resolveCompilerEdges(model, writes),
    });

    this.dialect = model.dialect;
    this.phase = model.phase;
    this.artifact = model.artifact;
    this.style = model.style;
    this.inputFiles = model.inputs.map((input) => ({ ...input }));
    this.sourceFiles = this.inputFiles
      .filter((input) => input.kind === "source")
      .map((input) => input.path);
  }
}

const _compilerAnalyzerCheck: Analyzer<CompilerAnalysis> = CompilerAnalysis;
