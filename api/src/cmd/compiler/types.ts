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

/** One parsed compiler action before mode resolution. */
export type CompilerAction =
  | {
      /** Driver action represented by the parsed option. */
      kind:
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
      /** Original argv index for the action option token. */
      index: number;
    }
  | {
      /** Side assembly/listing output requested by a CL-style option. */
      kind: "emit-assembly-listing";
      /** Original argv index for the action option token. */
      index: number;
      /** Optional /Fa path token; omitted when the driver uses per-input defaults. */
      path?: string;
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

/** Strategy used by the resolver when deciding whether parser input candidates are real file reads. */
export type CompilerInputCandidateInference = "none" | "suffix" | "all";

/** Configures how compiler parser facts are resolved into visible file reads, writes, and edges. */
export type CompilerResolverOptions = {
  /** Controls whether and how `inputCandidates` are promoted to inferred reads. */
  inputCandidateInference?: CompilerInputCandidateInference;
  /** Whether to infer driver default outputs when no matching explicit output fact exists. */
  inferDefaultOutputs?: boolean;
  /** Whether directory-like explicit output paths are expanded into per-input file paths. */
  expandDirectoryOutputs?: boolean;
  /** Whether CL-style assembly listing actions should add side-effect writes. */
  inferAssemblyListings?: boolean;
  /** Whether to attach detailed resolver decisions and diagnostics to the result. */
  debug?: boolean;
};

/** Machine-readable resolver diagnostic used for debugging parser or resolver coverage gaps. */
export type CompilerResolveDiagnostic = {
  /** Stable diagnostic identifier. */
  code: string;
  /** Human-readable diagnostic details. */
  message: string;
  /** Related path token, when the diagnostic is tied to a specific file-like value. */
  path?: string;
  /** Related argv index, when available from the parser fact. */
  index?: number;
  /** Parser evidence associated with the diagnostic, when available. */
  source?: CompilerFactSource;
};

/** Input candidate rejected by the resolver, with the policy reason that rejected it. */
export type CompilerRejectedInputCandidate = {
  /** Candidate fact supplied by the parser. */
  input: CompilerInput;
  /** Short policy reason for rejection. */
  reason: string;
};

/** Optional detailed trace of resolver decisions. */
export type CompilerResolveDebug = {
  /** Fully resolved options used for this resolution pass. */
  options: Required<CompilerResolverOptions>;
  /** Input candidates promoted to inferred reads. */
  acceptedInputCandidates: CompilerInput[];
  /** Input candidates rejected by the configured policy. */
  rejectedInputCandidates: CompilerRejectedInputCandidate[];
  /** Reads inferred from parser candidates rather than explicit input facts. */
  inferredReads: CompilerInput[];
  /** Writes inferred from compiler defaults or side-output conventions. */
  inferredWrites: string[];
  /** Diagnostics emitted while resolving parser facts. */
  diagnostics: CompilerResolveDiagnostic[];
};

export type CompilerResolveResult = {
  reads: string[];
  writes: string[];
  edges: Edge[];
  sourceFiles: string[];
  debug?: CompilerResolveDebug;
};

export interface CompilerResolver {
  resolve(parsed: CompilerParseResult): CompilerResolveResult;
}

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
