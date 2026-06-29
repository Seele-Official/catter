import { identify_compiler } from "catter-c";

import type { AnalyzedData } from "../model.js";
import type {
  CompilerDialect,
  CompilerIdentity,
  CompilerMatcher,
  CompilerRule,
} from "./types.js";

const customRules: CompilerRule[] = [];

function builtinDialectForCompiler(
  compiler: string,
): CompilerDialect | undefined {
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
      return undefined;
  }
}

function matcherMatches(
  matcher: CompilerMatcher,
  command: AnalyzedData,
): boolean {
  if (matcher instanceof RegExp) {
    matcher.lastIndex = 0;
    return matcher.test(command.exe);
  }

  return matcher(command);
}

function ruleMatches(rule: CompilerRule, command: AnalyzedData): boolean {
  const matchers = Array.isArray(rule.match) ? rule.match : [rule.match];
  return matchers.some((matcher) => matcherMatches(matcher, command));
}

/**
 * Registers or replaces a custom compiler identification rule.
 *
 * Custom rules are evaluated before builtin compiler detection. Use this for
 * cross compilers or project-specific driver names that should be parsed as one
 * of the builtin dialects.
 */
export function registerCompilerRule(rule: CompilerRule): void {
  unregisterCompilerRule(rule.key);
  customRules.push({
    ...rule,
    match: Array.isArray(rule.match) ? [...rule.match] : rule.match,
  });
}

/** Removes a previously registered custom compiler rule by key. */
export function unregisterCompilerRule(key: string): void {
  const index = customRules.findIndex((rule) => rule.key === key);
  if (index !== -1) {
    customRules.splice(index, 1);
  }
}

/** Returns the currently registered custom compiler rules in match order. */
export function compilerRules(): readonly CompilerRule[] {
  return customRules.map((rule) => ({
    ...rule,
    match: Array.isArray(rule.match) ? [...rule.match] : rule.match,
  }));
}

/**
 * Identifies the compiler command and selects a builtin parser dialect.
 *
 * The result may identify `nvcc`, but analysis still returns `undefined` until
 * the nvcc parser is implemented.
 */
export function identifyCompilerCommand(
  command: AnalyzedData,
): CompilerIdentity | undefined {
  for (const rule of customRules) {
    if (!ruleMatches(rule, command)) {
      continue;
    }

    return {
      key: rule.key,
      dialect: rule.dialect,
    };
  }

  const compiler = identify_compiler(command.exe);
  const dialect = builtinDialectForCompiler(compiler);
  if (dialect === undefined) {
    return undefined;
  }

  return {
    key: `builtin:${compiler}`,
    dialect,
  };
}
