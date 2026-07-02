import type { Compiler } from "catter-c";
import type { AnalyzedData, Edge } from "../model.js";
import type { CompilerIdentifier } from "./identify.js";

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
  PreprocessedSource: "preprocessed-source",
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

/** Compiler phase and produced artifact content kind inferred from driver options. */
export type CompilerMode =
  | {
      phase: typeof CompilerPhase.Preprocess;
      artifact: typeof CompilerArtifact.PreprocessedSource;
    }
  | {
      phase: typeof CompilerPhase.SyntaxOnly;
      artifact: typeof CompilerArtifact.None;
    }
  | {
      phase: typeof CompilerPhase.Compile;
      artifact:
        | typeof CompilerArtifact.Object
        | typeof CompilerArtifact.Assembly
        | typeof CompilerArtifact.LlvmIR
        | typeof CompilerArtifact.LlvmBitcode
        | typeof CompilerArtifact.Pch
        | typeof CompilerArtifact.Pcm
        | typeof CompilerArtifact.Ptx
        | typeof CompilerArtifact.Cubin
        | typeof CompilerArtifact.Fatbin
        | typeof CompilerArtifact.Unknown;
    }
  | {
      phase: typeof CompilerPhase.Link;
      artifact:
        | typeof CompilerArtifact.Executable
        | typeof CompilerArtifact.SharedLibrary;
    }
  | {
      phase: typeof CompilerPhase.Archive;
      artifact: typeof CompilerArtifact.StaticLibrary;
    }
  | {
      phase:
        | typeof CompilerPhase.RelocatableLink
        | typeof CompilerPhase.DeviceLink;
      artifact: typeof CompilerArtifact.Object;
    };

/** Built-in parser dialect selected after command identification. */
export const CompilerDialect = {
  Clang: "clang",
  Gcc: "gcc",
  Msvc: "msvc",
  Nvcc: "nvcc",
  Unknown: "unknown",
} as const;

/** Union of parser dialect values selected during compiler identification. */
export type CompilerDialect =
  (typeof CompilerDialect)[keyof typeof CompilerDialect];

export type CompilerFactSource =
  | {
      kind: "argument";
    }
  | {
      kind: "option";
      option: string;
      optionIndex: number;
    }
  | {
      kind: "remainder-argument";
      boundary: string;
      boundaryIndex: number;
    }
  | {
      kind: "remainder-option";
      boundary: string;
      boundaryIndex: number;
      option: string;
      optionIndex: number;
    };

export type CompilerActionKind =
  | "preprocess"
  | "syntax-only"
  | "compile-object"
  | "compile-assembly-like"
  | "compile-llvm-like"
  | "compile-pch"
  | "compile-pcm"
  | "unknown-compile-action"
  | "link-shared-library"
  | "archive"
  | "relocatable-link";

/** One parsed compiler action before mode resolution. */
export type CompilerAction = {
  /** Driver action represented by the parsed option. */
  kind: CompilerActionKind;
  /** Original argv index for the action option token. */
  index: number;
};

export type CompilerInput = {
  /** Path token as it appeared in the compiler command. */
  path: string;
  /** Original argv index for the input token. */
  index: number;
  /** Parser evidence for this input fact. */
  source: CompilerFactSource;
  /** Explicit source language in effect when this input was parsed. */
  language?: string;
};

export type CompilerOutputKind =
  | "primary-artifact"
  | "object-file"
  | "linked-artifact";

export type CompilerOutput = {
  /** Path token as it appeared in the compiler command. */
  path: string;
  /** Driver-level output purpose selected by the option spelling. */
  kind: CompilerOutputKind;
  /** Original argv index for the output option token. */
  index: number;
  /** Parser evidence for this output fact. */
  source: CompilerFactSource;
};

export type CompilerParseResult = {
  dialect: CompilerDialect;
  compilerMode: CompilerMode;
  compilerActions: CompilerAction[];
  inputCandidates: CompilerInput[];
  outputCandidates: CompilerOutput[];
  inputs: CompilerInput[];
  outputs: CompilerOutput[];
};

export type CompilerResolveResult = {
  inputs: CompilerInput[];
  sourceFiles: string[];
  reads: string[];
  writes: string[];
  edges: Edge[];
};

export type CompilerResolver = (
  parsed: CompilerParseResult,
) => CompilerResolveResult;

export type CompilerAnalyzerOptions = {
  identifier?: CompilerIdentifier;
  resolver?: CompilerResolver;
};

/**
 * Matcher used by a custom compiler rule.
 *
 * Regular expressions are tested against the captured executable path or name.
 * Function matchers receive the command invocation and can inspect `exe` and
 * `argv`.
 */
export type CompilerMatcher = RegExp | ((command: AnalyzedData) => boolean);

/** Custom rule that maps an executable pattern to one builtin parser dialect. */
export interface CompilerRule {
  /** Builtin parser dialect to use after this rule matches. */
  dialect: CompilerDialect;
  /** One matcher or a list of alternative matchers. */
  match: CompilerMatcher | CompilerMatcher[];
}

/** Result of identifying a command before builtin parser dispatch. */
export interface CompilerIdentity {
  /** Builtin identity key or custom rule key. */
  key: string;
  /** Parser dialect selected for the command, or `unknown` when unsupported. */
  dialect: CompilerDialect;
}

/** Result of the unwrap stage before compiler identification. */
export interface UnwrappedCompilerCommand {
  /** Executable path or name after wrapper removal. Currently this is unchanged. */
  exe: string;
  /** Command argv after wrapper removal. Currently this is unchanged. */
  argv: readonly string[];
}
