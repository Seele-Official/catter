import type { Compiler } from "catter-c";

/** High-level compiler pipeline phase. */
export const CompilerPhase = {
  Preprocess: "preprocess",
  SyntaxOnly: "syntax-only",
  Compile: "compile",
  Link: "link",
  Archive: "archive",
  RelocatableLink: "relocatable-link",
  DeviceLink: "device-link",
} as const;

/** Union of high-level compiler pipeline phase values. */
export type CompilerPhase = (typeof CompilerPhase)[keyof typeof CompilerPhase];

/** Main artifact kind produced by a compiler command. */
export const CompilerArtifact = {
  None: "none",
  Stdout: "stdout",
  Object: "object",
  Executable: "exe",
  SharedLibrary: "shared",
  StaticLibrary: "static-lib",
  Assembly: "asm",
  LlvmIR: "llvm-ir",
  LlvmBitcode: "llvm-bc",
  Pch: "pch",
  Pcm: "pcm",
  Ptx: "ptx",
  Cubin: "cubin",
  Fatbin: "fatbin",
  Unknown: "unknown",
} as const;

/** Union of main artifact kind values produced by compiler commands. */
export type CompilerArtifact =
  (typeof CompilerArtifact)[keyof typeof CompilerArtifact];

/** Built-in parser dialect selected after command identification. */
export const CompilerDialect = {
  Clang: "clang",
  Gnu: "gnu",
  Msvc: "msvc",
  Nvcc: "nvcc",
} as const;

/** Union of builtin parser dialect values. */
export type CompilerDialect =
  (typeof CompilerDialect)[keyof typeof CompilerDialect];

/** One parsed compiler input, including its inferred role. */
export interface CompilerInput {
  /** Path token as it appeared in the compiler command. */
  path: string;
  /** Whether the input is parsed as a translation-unit source or link input. */
  kind: "source" | "link";
  /** Original argv index for the input token. */
  index: number;
}

/**
 * Matcher used by a custom compiler rule.
 *
 * Regular expressions are tested against `CompilerIdentifyContext.stem`.
 * Function matchers receive the full context and can inspect argv.
 */
export type CompilerMatcher = RegExp | ((argv: readonly string[]) => boolean);

/** Custom rule that maps an executable pattern to one builtin parser dialect. */
export interface CompilerRule {
  /** Stable rule key used for replacement and removal. */
  key: string;
  /** Builtin parser dialect to use after this rule matches. */
  dialect: CompilerDialect;
  /** One matcher or a list of alternative matchers. */
  match: CompilerMatcher | CompilerMatcher[];
}

/** Result of identifying a command before builtin parser dispatch. */
export interface CompilerIdentity {
  /** Builtin identity key or custom rule key. */
  key: string;
  /** Builtin parser dialect selected for the command. */
  dialect: CompilerDialect;
}

/** Result of the unwrap stage before compiler identification. */
export interface UnwrappedCompilerCommand {
  /** Command argv after wrapper removal. Currently this is unchanged. */
  argv: readonly string[];
  /** Original command argv before wrapper removal. */
  originalArgv: readonly string[];
}
