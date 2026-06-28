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
 * Base class for one analyzed command invocation.
 *
 * `reads` records the files the command reads, `writes` records the files it
 * writes, and `edges` refines that into explicit output-to-input mappings when
 * an analyzer knows more.
 *
 * @example
 * ```ts
 * class ToyAnalysis extends cmd.Analysis<"toy", "toy-bundle"> {
 *   constructor() {
 *     super({
 *       kind: "toy",
 *       exe: "toy-bundle",
 *       reads: ["in.dat"],
 *       writes: ["out.pkg"],
 *     });
 *   }
 * }
 * ```
 */
export abstract class Analysis<
  Kind extends string = string,
  Exe extends string = string,
> {
  /** Analyzer category for the command. */
  readonly kind: Kind;
  /** Normalized executable identifier for the analyzed command. */
  readonly exe: Exe;
  /** Files read by the command. */
  readonly reads: readonly string[];
  /** Files written by the command. */
  readonly writes: readonly string[];
  /** Explicit output-to-input dependency edges for this analysis. */
  readonly edges: readonly Edge[];

  protected constructor(data: {
    kind: Kind;
    exe: Exe;
    reads: readonly string[];
    writes: readonly string[];
    edges?: readonly Edge[];
  }) {
    this.kind = data.kind;
    this.exe = data.exe;
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
 * class ToyAnalysis extends cmd.Analysis<"toy", "toy-bundle"> {
 *   static readonly key = "toy";
 *   static analyze(argv: readonly string[]) {
 *     return argv[0] === "toy" ? new ToyAnalysis() : undefined;
 *   }
 *   constructor() {
 *     super({ kind: "toy", exe: "toy-bundle", reads: [], writes: [] });
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
