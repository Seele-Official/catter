import { fromThrowable, type Result } from "../../neverthrow/index.js";
import { Analysis, AnalysisError, Analyzer } from "../model.js";
import type { AnalyzedData } from "../model.js";
import { CompilerAnalysisError, toCompilerAnalysisError } from "./errors.js";
import { CompilerIdentifier } from "./identify.js";
import { parseCompilerCommand } from "./parsers/index.js";
import type { CompilerParseResult } from "./types.js";
import type {
  CompilerInput,
  CompilerMode,
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
  /** Discriminator for command analysis unions. */
  readonly kind = "compiler" as const;
  /** Executable path or name after wrapper removal. */
  readonly unwrappedExe: string;
  /** Command argv after wrapper removal. */
  readonly unwrappedArgv: readonly string[];
  /** Compiler phase and artifact content kind inferred from parsed options. */
  readonly compilerMode: CompilerMode;
  /** Structured compiler input entries, including source/link role and argv index. */
  readonly inputFiles: readonly CompilerInput[];
  /** Source input paths selected from `inputFiles`. */
  readonly sourceFiles: readonly string[];

  constructor(
    model: CompilerParseResult,
    command: AnalyzedData,
    unwrapped: UnwrappedCompilerCommand,
  ) {
    super({
      exe: command.exe,
      argv: command.argv,
      reads: model.reads,
      writes: model.writes,
      edges: model.edges,
    });

    this.unwrappedExe = unwrapped.exe;
    this.unwrappedArgv = [...unwrapped.argv];
    this.compilerMode = { ...model.compilerMode };
    this.inputFiles = model.inputs.map((input) => ({ ...input }));
    this.sourceFiles = this.inputFiles
      .filter((input) => input.kind === "source")
      .map((input) => input.path);
  }
}

/** Analyzer for recognized compiler driver commands. */
export class CompilerAnalyzer extends Analyzer {
  readonly kind = "compiler" as const;

  private readonly identifier;

  constructor(identifier: CompilerIdentifier = new CompilerIdentifier()) {
    super();
    this.identifier = identifier;
  }

  analyze(
    command: AnalyzedData,
  ): Result<CompilerAnalysis, CompilerAnalysisError> {
    return fromThrowable(
      () => {
        const unwrapped = unwrapCompilerCommand(command);
        const identity = this.identifier.identifyCompilerCommand(unwrapped);

        const model = parseCompilerCommand(unwrapped.argv, identity);
        return new CompilerAnalysis(model, command, unwrapped);
      },
      (error) => toCompilerAnalysisError(error, "compiler analysis failed"),
    )();
  }
}
