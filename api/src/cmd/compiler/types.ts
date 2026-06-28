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

/** Supported normalized compiler executable identifiers. */
export type CompilerExe = Extract<
  Compiler,
  "clang" | "clang-cl" | "gcc" | "msvc"
>;

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

/** Driver option syntax style observed during parsing. */
export type CompilerStyle = "gnu" | "cl";

/** One parsed compiler input, including its inferred role. */
export interface CompilerInput {
  /** Path token as it appeared in the compiler command. */
  path: string;
  /** Whether the input is parsed as a translation-unit source or link input. */
  kind: "source" | "link";
  /** Original argv index for the input token. */
  index: number;
}

/** Internal output slot used while normalizing compiler output options. */
export type OutputChannel = "primary" | "object" | "executable" | "linker";

/** Internal output option captured from the parsed compiler command. */
export type OutputOption = {
  /** Output path or `-` for stdout when accepted by the driver. */
  value: string;
  /** Original argv index for the option that introduced the output. */
  index: number;
  /** Output slot affected by the option. */
  channel: OutputChannel;
};

/** Internal normalized compiler command model produced by a builtin parser. */
export type CommandModel = {
  /** Normalized compiler executable identity exposed as `CompilerAnalysis.exe`. */
  compiler: CompilerExe;
  /** Parser dialect selected by command identification. */
  dialect: CompilerDialect;
  /** Option syntax style observed by the parser. */
  style: CompilerStyle;
  /** High-level driver phase inferred from parsed options. */
  phase: CompilerPhase;
  /** Main artifact kind inferred from parsed options. */
  artifact: CompilerArtifact;
  /** Active language from `-x` or equivalent when specified. */
  explicitLanguage?: string;
  /** Parsed input files with their command-line roles. */
  inputs: CompilerInput[];
  /** Parsed output options keyed by output channel. */
  outputs: Partial<Record<OutputChannel, OutputOption>>;
};

/** Data passed to custom compiler identification matchers. */
export interface CompilerIdentifyContext {
  /** Full command argv being identified. */
  argv: readonly string[];
  /** Raw executable token from `argv[0]`. */
  executable: string;
  /** Executable basename without directory components. */
  basename: string;
  /** Lowercase basename with a trailing `.exe` removed. */
  stem: string;
}

/**
 * Matcher used by a custom compiler rule.
 *
 * Regular expressions are tested against `CompilerIdentifyContext.stem`.
 * Function matchers receive the full context and can inspect argv.
 */
export type CompilerMatcher =
  | RegExp
  | ((context: CompilerIdentifyContext) => boolean);

/** Custom rule that maps an executable pattern to one builtin parser dialect. */
export interface CompilerRule {
  /** Stable rule key used for replacement and removal. */
  key: string;
  /** Builtin parser dialect to use after this rule matches. */
  dialect: CompilerDialect;
  /** One matcher or a list of alternative matchers. */
  match: CompilerMatcher | readonly CompilerMatcher[];
  /** Optional normalized compiler identity; defaults from `dialect`. */
  compiler?: CompilerExe;
}

/** Result of identifying a command before builtin parser dispatch. */
export interface CompilerIdentity {
  /** Builtin identity key or custom rule key. */
  key: string;
  /** Builtin parser dialect selected for the command. */
  dialect: CompilerDialect;
  /** Normalized compiler identity when the dialect has one. */
  compiler?: CompilerExe;
  /** Raw executable token from `argv[0]`. */
  executable: string;
  /** Executable basename without directory components. */
  basename: string;
  /** Lowercase basename with a trailing `.exe` removed. */
  stem: string;
  /** Whether the identity came from builtin compiler detection. */
  builtin: boolean;
}

/** Result of the unwrap stage before compiler identification. */
export interface UnwrappedCompilerCommand {
  /** Command argv after wrapper removal. Currently this is unchanged. */
  argv: readonly string[];
  /** Original command argv before wrapper removal. */
  originalArgv: readonly string[];
}
