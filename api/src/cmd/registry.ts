import type { Analysis, Analyzer, AnalyzedData } from "./model.js";

/**
 * Ordered registry of command analyzers.
 *
 * The registry asks each analyzer in registration order to analyze a command,
 * then returns the first successful analysis.
 *
 * @example
 * ```ts
 * const registry = new cmd.Registry().register(new cmd.CompilerAnalyzer());
 * const analysis = registry.analyze({ exe: "clang", argv: ["clang", "-c", "main.c"] });
 * ```
 */
export class Registry {
  private readonly analyzerList: Analyzer[] = [];

  /**
   * Registers an analyzer instance.
   *
   * @example
   * ```ts
   * const registry = new cmd.Registry();
   * registry.register(new cmd.CompilerAnalyzer());
   * ```
   */
  register(analyzer: Analyzer): Registry {
    this.unregister(analyzer);
    this.analyzerList.push(analyzer);
    return this;
  }

  /**
   * Removes a previously registered analyzer instance.
   *
   * @example
   * ```ts
   * const analyzer = new cmd.CompilerAnalyzer();
   * const registry = new cmd.Registry().register(analyzer);
   * registry.unregister(analyzer);
   * ```
   */
  unregister(analyzer: Analyzer): this {
    for (let index = this.analyzerList.length - 1; index >= 0; --index) {
      if (this.analyzerList[index] === analyzer) {
        this.analyzerList.splice(index, 1);
      }
    }
    return this;
  }

  /**
   * Returns the currently registered analyzers in match order.
   *
   * @example
   * ```ts
   * const analyzers = new cmd.Registry()
   *   .register(new cmd.CompilerAnalyzer())
   *   .analyzers();
   * ```
   */
  analyzers(): readonly Analyzer[] {
    return this.analyzerList;
  }

  /**
   * Checks whether any registered analyzer claims the command.
   *
   * @example
   * ```ts
   * const ok = new cmd.Registry()
   *   .register(new cmd.CompilerAnalyzer())
   *   .canHandle({ exe: "gcc", argv: ["gcc", "-c", "main.c"] });
   * ```
   */
  canHandle(command: AnalyzedData): boolean {
    return this.analyze(command) !== undefined;
  }

  /**
   * Runs the first matching analyzer and returns its result.
   *
   * @example
   * ```ts
   * const analysis = new cmd.Registry()
   *   .register(new cmd.CompilerAnalyzer())
   *   .analyze({ exe: "clang", argv: ["clang", "-c", "main.c"] });
   * ```
   */
  analyze(command: AnalyzedData): Analysis | undefined {
    for (const analyzer of this.analyzerList) {
      const result = analyzer.analyze(command);
      if (result !== undefined) {
        return result;
      }
    }

    return undefined;
  }
}
