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

/**
 * Analysis result for a recognized compiler driver command.
 *
 * The base `Analysis` fields expose generic file effects:
 * `reads`, `writes`, and `edges`. Compiler-specific fields describe how the
 * command was identified and parsed.
 */
export class CompilerAnalysis extends Analysis<"compiler", CompilerExe> {
  /** Stable registry key for the compiler analyzer. */
  static readonly key = "compiler";

  /** Analyzes a compiler command, returning `undefined` when it is unsupported. */
  static analyze(cmd: readonly string[]): CompilerAnalysis | undefined {
    const model = analyzeCompilerModel(cmd);
    return model === undefined ? undefined : new CompilerAnalysis(model);
  }

  /** Narrows a generic analysis result back to a compiler analysis. */
  static from(analysis: AnyAnalysis | undefined): CompilerAnalysis | undefined {
    return analysis instanceof CompilerAnalysis ? analysis : undefined;
  }

  /** Parser dialect selected by the identify stage. */
  readonly dialect: CompilerDialect;
  /** High-level driver phase inferred from parsed options. */
  readonly phase: CompilerPhase;
  /** Main artifact kind inferred from parsed options. */
  readonly artifact: CompilerArtifact;
  /** Option syntax style observed by the parser. */
  readonly style: CompilerStyle;
  /** Structured compiler input entries, including source/link role and argv index. */
  readonly inputFiles: readonly CompilerInput[];
  /** Source input paths selected from `inputFiles`. */
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
