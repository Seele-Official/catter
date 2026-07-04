import { identify_compiler } from "catter-c";

import type { AnalyzedData } from "../model.js";
import type {
  CompilerDialect,
  CompilerIdentity,
  CompilerMatcher,
  CompilerRule,
} from "./types.js";

export class CompilerIdentifier {
  private readonly customRules = new Map<string, CompilerRule>();

  /**
   * Registers or replaces a custom compiler identification rule.
   *
   * Custom rules are evaluated before builtin compiler detection. Use this for
   * cross compilers or project-specific driver names that should be parsed as one
   * of the builtin dialects.
   */
  registerCompilerRule(key: string, rule: CompilerRule): void {
    this.customRules.delete(key);
    this.customRules.set(key, rule);
  }

  /** Removes a previously registered custom compiler rule by key. */
  unregisterCompilerRule(key: string): void {
    this.customRules.delete(key);
  }

  /** Returns the currently registered custom compiler rules in match order. */
  compilerRules(): readonly CompilerRule[] {
    return [...this.customRules.values()];
  }

  /**
   * Identifies the compiler command and selects a builtin parser dialect, fall back to the `unknown` dialect
   */
  identifyCompilerCommand(command: AnalyzedData): CompilerIdentity {
    for (const [key, rule] of this.customRules) {
      if (!this.ruleMatches(rule, command)) {
        continue;
      }

      return {
        key,
        dialect: rule.dialect,
      };
    }

    const compiler = identify_compiler(command.exe);
    const dialect = this.builtinDialectForCompiler(compiler);
    return {
      key: `builtin:${compiler}`,
      dialect,
    };
  }

  private builtinDialectForCompiler(compiler: string): CompilerDialect {
    switch (compiler) {
      case "clang":
        return "clang";
      case "gcc":
        return "gcc";
      case "clang-cl":
      case "msvc":
        return "msvc";
      case "nvcc":
        return "nvcc";
      default:
        return "unknown";
    }
  }

  private matcherMatches(
    matcher: CompilerMatcher,
    command: AnalyzedData,
  ): boolean {
    if (matcher instanceof RegExp) {
      matcher.lastIndex = 0;
      return matcher.test(command.exe);
    }

    return matcher(command);
  }

  private ruleMatches(rule: CompilerRule, command: AnalyzedData): boolean {
    const matchers = Array.isArray(rule.match) ? rule.match : [rule.match];
    return matchers.some((matcher) => this.matcherMatches(matcher, command));
  }
}
