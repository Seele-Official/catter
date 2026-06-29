import type { CompilerAnalysis, CompilerAnalyzer } from "./compiler-cmd.js";
import type { ArchiverAnalysis, ArchiverAnalyzer } from "./archiver-cmd.js";

/**
 * Describes one concrete dependency edge produced by a command.
 *
 * @example
 * ```ts
 * const edge: cmd.Edge = {
 *   output: "app.o",
 *   inputs: ["app.c"],
 * };
 * ```
 */
export type Edge = {
  output: string;
  inputs: readonly string[];
};

/**
 * Minimal process data needed by command analyzers.
 *
 * `exe` is the captured executable path or name. `argv` is the full argument
 * vector as captured for the process, including the executable argument.
 */
export type AnalyzedData = {
  readonly exe: string;
  readonly argv: readonly string[];
};

/**
 * Shared process invocation data and file effects for one analyzed command.
 *
 * `exe` and `argv` preserve the command invocation facts used for analysis.
 * `reads` records the files the command reads, `writes` records the files it
 * writes, and `edges` refines that into explicit output-to-input mappings when
 * an analyzer knows more.
 *
 * @example
 * ```ts
 * class ToyAnalysis extends cmd.Analysis {
 *   readonly kind = "toy" as const;
 *
 *   constructor() {
 *     super({
 *       exe: "toy",
 *       argv: ["toy", "in.dat", "out.pkg"],
 *       reads: ["in.dat"],
 *       writes: ["out.pkg"],
 *       edges: [
 *         {
 *           output: "out.pkg",
 *           inputs: ["in.dat"],
 *         },
 *       ],
 *     });
 *   }
 * }
 * ```
 */
export abstract class Analysis {
  /** Executable path or name used for analysis. */
  readonly exe: string;
  /** Full argument vector used for analysis. */
  readonly argv: readonly string[];
  /** Files read by the command. */
  readonly reads: readonly string[];
  /** Files written by the command. */
  readonly writes: readonly string[];
  /** Explicit output-to-input dependency edges for this analysis. */
  readonly edges: readonly Edge[];

  protected constructor(data: {
    exe: string;
    argv: readonly string[];
    reads: readonly string[];
    writes: readonly string[];
    edges: readonly Edge[];
  }) {
    this.exe = data.exe;
    this.argv = [...data.argv];
    this.reads = [...data.reads];
    this.writes = [...data.writes];
    this.edges = [...data.edges];
  }
}

/**
 * Pluggable analyzer contract used by `Registry`.
 *
 * Concrete analyzers are stateful objects registered into a `Registry`.
 *
 * @example
 * ```ts
 * class ToyAnalyzer extends cmd.Analyzer {
 *   analyze(command: cmd.AnalyzedData) {
 *     return command.exe === "toy"
 *       ? new ToyAnalysis(command, "in.dat", "out.pkg")
 *       : undefined;
 *   }
 * }
 *
 * class ToyAnalysis extends cmd.Analysis {
 *   constructor(command: cmd.AnalyzedData, input: string, output: string) {
 *     super({
 *       exe: command.exe,
 *       argv: command.argv,
 *       reads: [input],
 *       writes: [output],
 *       edges: [{ output, inputs: [input] }],
 *     });
 *   }
 * }
 * ```
 */
export abstract class Analyzer {
  /** Performs analysis and returns a typed result when successful. */
  abstract analyze(command: AnalyzedData): Analysis | undefined;
}

/** Built-in command analysis result variants. */
export type CommandAnalysis = CompilerAnalysis | ArchiverAnalysis;

export type CommandAnalyzer = CompilerAnalyzer | ArchiverAnalyzer;
