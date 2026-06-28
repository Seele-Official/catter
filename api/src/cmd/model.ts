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
export interface Edge {
  output: string;
  inputs: readonly string[];
}

/**
 * Shared file effects for one analyzed command invocation.
 *
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
 *       reads: ["in.dat"],
 *       writes: ["out.pkg"],
 *     });
 *   }
 * }
 * ```
 */
export abstract class Analysis {
  /** Files read by the command. */
  readonly reads: readonly string[];
  /** Files written by the command. */
  readonly writes: readonly string[];
  /** Explicit output-to-input dependency edges for this analysis. */
  readonly edges: readonly Edge[];

  protected constructor(data: {
    reads: readonly string[];
    writes: readonly string[];
    edges?: readonly Edge[];
  }) {
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
 *   static analyze(argv: readonly string[]) {
 *     return argv[0] === "toy" ? new ToyAnalysis() : undefined;
 *   }
 *   constructor() {
 *     super({ reads: [], writes: [] });
 *   }
 * }
 * ```
 */
export interface Analyzer<A extends Analysis = Analysis> {
  /** Stable registry key used for replacement and removal. */
  readonly key: string;
  /** Performs analysis and returns a typed result when successful. */
  analyze(cmd: readonly string[]): A | undefined;
}

/** Built-in command analysis result variants. */
export type CommandAnalysis =
  | import("./compiler-cmd.js").CompilerAnalysis
  | import("./archiver-cmd.js").ArchiverAnalysis;
