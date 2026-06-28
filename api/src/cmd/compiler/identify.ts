import { identify_compiler } from "catter-c";

import type {
  CompilerDialect,
  CompilerExe,
  CompilerIdentifyContext,
  CompilerIdentity,
  CompilerMatcher,
  CompilerRule,
} from "./types.js";

const customRules: CompilerRule[] = [];

function basenameOf(value: string): string {
  const slash = value.lastIndexOf("/");
  const backslash = value.lastIndexOf("\\");
  const index = Math.max(slash, backslash);
  return index === -1 ? value : value.slice(index + 1);
}

function stemOf(value: string): string {
  const basename = basenameOf(value);
  return basename.toLowerCase().endsWith(".exe")
    ? basename.slice(0, -4)
    : basename;
}

function defaultCompilerForDialect(
  dialect: CompilerDialect,
): CompilerExe | undefined {
  switch (dialect) {
    case "clang":
      return "clang";
    case "gnu":
      return "gcc";
    case "msvc":
      return "msvc";
    case "nvcc":
      return undefined;
  }
}

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

function contextOf(
  argv: readonly string[],
): CompilerIdentifyContext | undefined {
  const executable = argv[0];
  if (executable === undefined) {
    return undefined;
  }

  const basename = basenameOf(executable);
  return {
    argv,
    executable,
    basename,
    stem: stemOf(basename),
  };
}

function matcherMatches(
  matcher: CompilerMatcher,
  context: CompilerIdentifyContext,
): boolean {
  if (matcher instanceof RegExp) {
    matcher.lastIndex = 0;
    return matcher.test(context.stem);
  }

  return matcher(context);
}

function ruleMatches(
  rule: CompilerRule,
  context: CompilerIdentifyContext,
): boolean {
  const matchers = Array.isArray(rule.match) ? rule.match : [rule.match];
  return matchers.some((matcher) => matcherMatches(matcher, context));
}

function identityFromRule(
  rule: CompilerRule,
  context: CompilerIdentifyContext,
): CompilerIdentity {
  const compiler = rule.compiler ?? defaultCompilerForDialect(rule.dialect);

  return {
    key: rule.key,
    dialect: rule.dialect,
    compiler,
    executable: context.executable,
    basename: context.basename,
    stem: context.stem,
    builtin: false,
  };
}

export function registerCompilerRule(rule: CompilerRule): void {
  unregisterCompilerRule(rule.key);
  customRules.push({
    ...rule,
    match: Array.isArray(rule.match) ? [...rule.match] : rule.match,
  });
}

export function unregisterCompilerRule(key: string): void {
  const index = customRules.findIndex((rule) => rule.key === key);
  if (index !== -1) {
    customRules.splice(index, 1);
  }
}

export function compilerRules(): readonly CompilerRule[] {
  return customRules;
}

export function identifyCompilerCommand(
  argv: readonly string[],
): CompilerIdentity | undefined {
  const context = contextOf(argv);
  if (context === undefined) {
    return undefined;
  }

  for (const rule of customRules) {
    if (!ruleMatches(rule, context)) {
      continue;
    }

    return identityFromRule(rule, context);
  }

  const compiler = identify_compiler(context.executable);
  const dialect = builtinDialectForCompiler(compiler);
  if (dialect === undefined) {
    return undefined;
  }

  const normalizedCompiler =
    compiler === "clang" ||
    compiler === "gcc" ||
    compiler === "clang-cl" ||
    compiler === "msvc"
      ? compiler
      : defaultCompilerForDialect(dialect);
  return {
    key: `builtin:${compiler}`,
    dialect,
    compiler: normalizedCompiler,
    executable: context.executable,
    basename: context.basename,
    stem: context.stem,
    builtin: true,
  };
}
