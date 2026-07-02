import { fromThrowable, type Result } from "../../neverthrow/index.js";
import { Analysis, Analyzer } from "../model.js";
import type { AnalyzedData } from "../model.js";
import { CompilerAnalysisError, toCompilerAnalysisError } from "./errors.js";
import { CompilerIdentifier } from "./identify.js";
import { parseCompilerCommand } from "./parsers/index.js";
import { resolveCompilerCommand } from "./resolver.js";
import type {
  CompilerAnalyzerOptions,
  CompilerParseResult,
  CompilerResolveResult,
  CompilerMode,
  UnwrappedCompilerCommand,
} from "./types.js";
import { unwrapCompilerCommand } from "./unwrap.js";

/**
 * Analysis result for a recognized compiler driver invocation.
 *
 * This is driver-level analysis, not compile-only analysis. A compiler driver
 * can preprocess, compile, link, archive, or dispatch another tool; the
 * `compilerMode` field describes the high-level action inferred for this
 * invocation. The base `Analysis` fields expose the logical file effects that
 * the driver command is expected to produce: `reads`, `writes`, and `edges`.
 * Compiler-specific fields describe how the command was identified and parsed.
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
  /** Source input paths resolved from parser facts and candidates. */
  readonly sourceFiles: readonly string[];

  constructor(
    parsed: CompilerParseResult,
    resolved: CompilerResolveResult,
    command: AnalyzedData,
    unwrapped: UnwrappedCompilerCommand,
  ) {
    super({
      exe: command.exe,
      argv: command.argv,
      reads: resolved.reads,
      writes: resolved.writes,
      edges: resolved.edges,
    });

    this.unwrappedExe = unwrapped.exe;
    this.unwrappedArgv = [...unwrapped.argv];
    this.compilerMode = { ...parsed.compilerMode };
    this.sourceFiles = [...resolved.sourceFiles];
  }
}

/** Analyzer for recognized compiler driver commands. */
export class CompilerAnalyzer extends Analyzer {
  readonly kind = "compiler" as const;

  private readonly identifier;
  private readonly resolver;

  constructor(options: CompilerAnalyzerOptions = {}) {
    super();
    this.identifier = options.identifier ?? new CompilerIdentifier();
    this.resolver = options.resolver ?? resolveCompilerCommand;
  }

  analyze(
    command: AnalyzedData,
  ): Result<CompilerAnalysis, CompilerAnalysisError> {
    return fromThrowable(
      () => {
        const unwrapped = unwrapCompilerCommand(command);
        const identity = this.identifier.identifyCompilerCommand(unwrapped);

        const parsed = parseCompilerCommand(unwrapped.argv, identity);
        const resolved = this.resolver(parsed);
        return new CompilerAnalysis(parsed, resolved, command, unwrapped);
      },
      (error) => toCompilerAnalysisError(error, "compiler analysis failed"),
    )();
  }
}
