import { Analysis } from "../model.js";
import type { Analysis as AnyAnalysis, Analyzer } from "../model.js";
import { identifyCompilerCommand } from "./identify.js";
import { parseCompilerCommand } from "./parsers/index.js";
import type { CompilerParseResult } from "./parsers/types.js";
import type {
  CompilerArtifact,
  CompilerInput,
  UnwrappedCompilerCommand,
} from "./types.js";
import { unwrapCompilerCommand } from "./unwrap.js";

/**
 * Analysis result for a recognized compiler driver command.
 *
 * The base `Analysis` fields expose generic file effects:
 * `reads`, `writes`, and `edges`. Compiler-specific fields describe how the
 * command was identified and parsed.
 */
export class CompilerAnalysis extends Analysis {
  /** Stable registry key for the compiler analyzer. */
  static readonly key = "compiler";

  /** Analyzes a compiler command, returning `undefined` when it is unsupported. */
  static analyze(cmd: readonly string[]): CompilerAnalysis | undefined {
    const unwrapped = unwrapCompilerCommand(cmd);
    const identity = identifyCompilerCommand(unwrapped.argv);
    if (identity === undefined) {
      return undefined;
    }

    const model = parseCompilerCommand(unwrapped.argv, identity);
    if (model) {
      return new CompilerAnalysis(model, unwrapped);
    }
    return undefined;
  }

  /** Narrows a generic analysis result back to a compiler analysis. */
  static from(analysis: AnyAnalysis | undefined): CompilerAnalysis | undefined {
    return analysis instanceof CompilerAnalysis ? analysis : undefined;
  }

  /** Discriminator for command analysis unions. */
  readonly kind = "compiler" as const;
  /** Command argv after wrapper removal. */
  readonly argv: readonly string[];
  /** Original command argv before wrapper removal. */
  readonly originalArgv: readonly string[];
  /** Main artifact kind inferred from parsed options. */
  readonly artifact: CompilerArtifact;
  /** Structured compiler input entries, including source/link role and argv index. */
  readonly inputFiles: readonly CompilerInput[];
  /** Source input paths selected from `inputFiles`. */
  readonly sourceFiles: readonly string[];

  private constructor(
    model: CompilerParseResult,
    unwrapped: UnwrappedCompilerCommand,
  ) {
    super({
      reads: model.reads,
      writes: model.writes,
      edges: model.edges,
    });

    this.argv = [...unwrapped.argv];
    this.originalArgv = [...unwrapped.originalArgv];
    this.artifact = model.artifact;
    this.inputFiles = model.inputs.map((input) => ({ ...input }));
    this.sourceFiles = this.inputFiles
      .filter((input) => input.kind === "source")
      .map((input) => input.path);
  }
}

const _compilerAnalyzerCheck: Analyzer<CompilerAnalysis> = CompilerAnalysis;
