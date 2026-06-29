import type {
  Analysis,
  Analyzer,
  CommandAnalysis,
  AnalyzedData,
} from "./model.js";
import { ArchiverAnalyzer } from "./archiver-cmd.js";
import { CompilerAnalyzer } from "./compiler-cmd.js";
import { Registry } from "./registry.js";

/** Default compiler analyzer instance used by `defaultRegistry`. */
export const compilerAnalyzer = new CompilerAnalyzer();

/** Default archiver analyzer instance used by `defaultRegistry`. */
export const archiverAnalyzer = new ArchiverAnalyzer();

/**
 * Shared registry populated with the built-in analyzers.
 *
 * At the moment this includes compiler-like drivers and archivers.
 *
 * @example
 * ```ts
 * const analysis = cmd.defaultRegistry.analyze({ exe: "clang", argv: ["clang", "-c", "main.c"] });
 * ```
 */
export const defaultRegistry = new Registry()
  .register(compilerAnalyzer)
  .register(archiverAnalyzer);

/**
 * Analyzes a command with the built-in registry.
 *
 * @example
 * ```ts
 * const analysis = cmd.analyze({ exe: "llvm-ar", argv: ["llvm-ar", "rcs", "liba.a", "a.o"] });
 * ```
 */
export function analyze(command: AnalyzedData): Analysis | undefined {
  return defaultRegistry.analyze(command);
}

/**
 * Checks whether the built-in registry recognizes a command.
 *
 * @example
 * ```ts
 * const ok = cmd.canHandle({ exe: "clang", argv: ["clang", "-c", "main.c"] });
 * ```
 */
export function canHandle(command: AnalyzedData): boolean {
  return defaultRegistry.canHandle(command);
}

/**
 * Registers an analyzer into the shared built-in registry.
 *
 * @example
 * ```ts
 * cmd.register(new cmd.CompilerAnalyzer());
 * ```
 */
export function register(analyzer: Analyzer): Registry {
  return defaultRegistry.register(analyzer);
}

/**
 * Unregisters an analyzer from the shared built-in registry.
 *
 * @example
 * ```ts
 * cmd.unregister(cmd.compilerAnalyzer);
 * ```
 */
export function unregister(analyzer: Analyzer): Registry {
  return defaultRegistry.unregister(analyzer);
}
