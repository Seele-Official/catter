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
    edges?: readonly Edge[];
  }) {
    this.exe = data.exe;
    this.argv = [...data.argv];
    this.reads = [...data.reads];
    this.writes = [...data.writes];
    this.edges =
      data.edges?.map((edge) => ({
        output: edge.output,
        inputs: [...edge.inputs],
      })) ??
      data.writes.map((output) => ({
        output,
        inputs: [...data.reads],
      }));
  }
}

/**
 * Pluggable analyzer contract used by `Registry`.
 *
 * A concrete analysis type usually implements this interface through static
 * `key` and `analyze()` members.
 *
 * @example
 * ```ts
 * class ToyAnalysis extends cmd.Analysis {
 *   static readonly key = "toy";
 *   static analyze(command: cmd.AnalyzedData) {
 *     return command.exe === "toy" ? new ToyAnalysis() : undefined;
 *   }
 *   constructor() {
 *     super({ exe: "toy", argv: ["toy"], reads: [], writes: [] });
 *   }
 * }
 * ```
 */
export interface Analyzer<A extends Analysis = Analysis> {
  /** Stable registry key used for replacement and removal. */
  readonly key: string;
  /** Performs analysis and returns a typed result when successful. */
  analyze(command: AnalyzedData): A | undefined;
}

/** Built-in command analysis result variants. */
export type CommandAnalysis =
  | import("./compiler-cmd.js").CompilerAnalysis
  | import("./archiver-cmd.js").ArchiverAnalysis;
