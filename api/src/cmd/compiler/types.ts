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

export type CompilerDialect =
  (typeof CompilerDialect)[keyof typeof CompilerDialect];

/** Driver option syntax style observed during parsing. */
export type CompilerStyle = "gnu" | "cl";

/** One parsed compiler input, including its inferred role. */
export interface CompilerInput {
  path: string;
  kind: "source" | "link";
  index: number;
}

export type OutputChannel = "primary" | "object" | "executable" | "linker";

export type OutputOption = {
  value: string;
  index: number;
  channel: OutputChannel;
};

export type CommandModel = {
  compiler: CompilerExe;
  dialect: CompilerDialect;
  style: CompilerStyle;
  phase: CompilerPhase;
  artifact: CompilerArtifact;
  explicitLanguage?: string;
  inputs: CompilerInput[];
  outputs: Partial<Record<OutputChannel, OutputOption>>;
};

export interface CompilerIdentifyContext {
  argv: readonly string[];
  executable: string;
  basename: string;
  stem: string;
}

export type CompilerMatcher =
  | RegExp
  | ((context: CompilerIdentifyContext) => boolean);

export interface CompilerRule {
  key: string;
  dialect: CompilerDialect;
  match: CompilerMatcher | readonly CompilerMatcher[];
  compiler?: CompilerExe;
}

export interface CompilerIdentity {
  key: string;
  dialect: CompilerDialect;
  compiler?: CompilerExe;
  executable: string;
  basename: string;
  stem: string;
  builtin: boolean;
}

export interface UnwrappedCompilerCommand {
  argv: readonly string[];
  originalArgv: readonly string[];
}
