import { Analysis, Analyzer } from "../model.js";
import type { Analysis as AnyAnalysis, AnalyzedData } from "../model.js";
import { CompilerIdentifier } from "./identify.js";
import { parseCompilerCommand } from "./parsers/index.js";
import type { CompilerParseResult } from "./types.js";
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
  /** Narrows a generic analysis result back to a compiler analysis. */
  static from(analysis: AnyAnalysis | undefined): CompilerAnalysis | undefined {
    return analysis instanceof CompilerAnalysis ? analysis : undefined;
  }

  /** Discriminator for command analysis unions. */
  readonly kind = "compiler" as const;
  /** Executable path or name after wrapper removal. */
  readonly unwrappedExe: string;
  /** Command argv after wrapper removal. */
  readonly unwrappedArgv: readonly string[];
  /** Main artifact kind inferred from parsed options. */
  readonly artifact: CompilerArtifact;
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
    this.artifact = model.artifact;
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
  analyze(command: AnalyzedData): CompilerAnalysis | undefined {
    const unwrapped = unwrapCompilerCommand(command);
    const identity = this.identifier.identifyCompilerCommand(unwrapped);
    const model = parseCompilerCommand(unwrapped.argv, identity);

    if (model) {
      return new CompilerAnalysis(model, command, unwrapped);
    }
    return undefined;
  }
}
