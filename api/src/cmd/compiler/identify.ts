import { identify_compiler } from "catter-c";

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
      return "gnu";
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
  argv: readonly string[],
): boolean {
  if (matcher instanceof RegExp) {
    matcher.lastIndex = 0;
    return matcher.test(argv[0]);
  }

  return matcher(argv);
}

function ruleMatches(rule: CompilerRule, argv: readonly string[]): boolean {
  const matchers = Array.isArray(rule.match) ? rule.match : [rule.match];
  return matchers.some((matcher) => matcherMatches(matcher, argv));
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
  argv: readonly string[],
): CompilerIdentity | undefined {
  for (const rule of customRules) {
    if (!ruleMatches(rule, argv)) {
      continue;
    }

    return {
      key: rule.key,
      dialect: rule.dialect,
    };
  }

  const compiler = identify_compiler(argv[0]);
  const dialect = builtinDialectForCompiler(compiler);
  if (dialect === undefined) {
    return undefined;
  }

  return {
    key: `builtin:${compiler}`,
    dialect,
  };
}
