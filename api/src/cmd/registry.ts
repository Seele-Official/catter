import { err, ok, type Result } from "../neverthrow/index.js";
import {
  AnalysisError,
  type Analysis,
  type AnalyzedData,
  type IAnalyzer,
} from "./model.js";

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
export class Registry<
  T extends Analysis = Analysis,
  R extends AnalysisError = AnalysisError,
> {
  private readonly analyzerList: IAnalyzer<T, R>[] = [];

  /**
   * Registers an analyzer instance.
   *
   * @example
   * ```ts
   * const registry = new cmd.Registry();
   * registry.register(new cmd.CompilerAnalyzer());
   * ```
   */
  register(analyzer: IAnalyzer<T, R>): this {
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
  unregister(analyzer: IAnalyzer<T, R>): this {
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
  analyzers(): readonly IAnalyzer<T, R>[] {
    return this.analyzerList;
  }

  /** Runs analyzers in order and returns the first successful analysis. */
  analyze(command: AnalyzedData): Result<T, R[]> {
    const errors: R[] = [];

    for (const analyzer of this.analyzerList) {
      const result = analyzer.analyze(command);
      if (result.isOk()) {
        return ok(result.value);
      }
      errors.push(result.error);
    }

    return err(errors);
  }
}
