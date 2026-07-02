import {
  CompilerArtifact,
  CompilerDialect,
  CompilerPhase,
  type CompilerAction,
  type CompilerMode,
} from "../types.js";

function applyGnuCompilerAction(
  mode: CompilerMode,
  action: CompilerAction,
): CompilerMode {
  switch (action.kind) {
    case "preprocess":
      return {
        phase: CompilerPhase.Preprocess,
        artifact: CompilerArtifact.PreprocessedSource,
      };
    case "syntax-only":
      if (mode.phase === CompilerPhase.Preprocess) {
        return mode;
      }
      return {
        phase: CompilerPhase.SyntaxOnly,
        artifact: CompilerArtifact.None,
      };
    case "compile-object":
      if (
        mode.phase === CompilerPhase.Preprocess ||
        mode.phase === CompilerPhase.SyntaxOnly ||
        (mode.phase === CompilerPhase.Compile &&
          mode.artifact !== CompilerArtifact.Unknown)
      ) {
        return mode;
      }
      return {
        phase: CompilerPhase.Compile,
        artifact: CompilerArtifact.Object,
      };
    case "compile-assembly-like":
      if (
        mode.phase === CompilerPhase.Preprocess ||
        mode.phase === CompilerPhase.SyntaxOnly
      ) {
        return mode;
      }
      if (mode.artifact === CompilerArtifact.LlvmBitcode) {
        return {
          phase: CompilerPhase.Compile,
          artifact: CompilerArtifact.LlvmIR,
        };
      }
      return {
        phase: CompilerPhase.Compile,
        artifact: CompilerArtifact.Assembly,
      };
    case "compile-llvm-like":
      if (
        mode.phase === CompilerPhase.Preprocess ||
        mode.phase === CompilerPhase.SyntaxOnly
      ) {
        return mode;
      }
      if (mode.artifact === CompilerArtifact.Assembly) {
        return {
          phase: CompilerPhase.Compile,
          artifact: CompilerArtifact.LlvmIR,
        };
      }
      return {
        phase: CompilerPhase.Compile,
        artifact: CompilerArtifact.LlvmBitcode,
      };
    case "compile-pch":
      if (
        mode.phase === CompilerPhase.Preprocess ||
        mode.phase === CompilerPhase.SyntaxOnly
      ) {
        return mode;
      }
      return {
        phase: CompilerPhase.Compile,
        artifact: CompilerArtifact.Pch,
      };
    case "compile-pcm":
      if (
        mode.phase === CompilerPhase.Preprocess ||
        mode.phase === CompilerPhase.SyntaxOnly
      ) {
        return mode;
      }
      return {
        phase: CompilerPhase.Compile,
        artifact: CompilerArtifact.Pcm,
      };
    case "unknown-compile-action":
      if (
        mode.phase === CompilerPhase.Link &&
        mode.artifact === CompilerArtifact.Executable
      ) {
        return {
          phase: CompilerPhase.Compile,
          artifact: CompilerArtifact.Unknown,
        };
      }
      return mode;
    case "link-shared-library":
      if (mode.phase !== CompilerPhase.Link) {
        return mode;
      }
      return {
        phase: CompilerPhase.Link,
        artifact: CompilerArtifact.SharedLibrary,
      };
    case "archive":
      if (mode.phase !== CompilerPhase.Link) {
        return mode;
      }
      return {
        phase: CompilerPhase.Archive,
        artifact: CompilerArtifact.StaticLibrary,
      };
    case "relocatable-link":
      if (mode.phase !== CompilerPhase.Link) {
        return mode;
      }
      return {
        phase: CompilerPhase.RelocatableLink,
        artifact: CompilerArtifact.Object,
      };
    case "emit-assembly-listing":
      return mode;
  }
}

function applyClangClCompilerAction(
  mode: CompilerMode,
  action: CompilerAction,
): CompilerMode {
  switch (action.kind) {
    case "preprocess":
      return {
        phase: CompilerPhase.Preprocess,
        artifact: CompilerArtifact.PreprocessedSource,
      };
    case "syntax-only":
      if (mode.phase === CompilerPhase.Preprocess) {
        return mode;
      }
      return {
        phase: CompilerPhase.SyntaxOnly,
        artifact: CompilerArtifact.None,
      };
    case "compile-object":
      if (
        mode.phase === CompilerPhase.Preprocess ||
        mode.phase === CompilerPhase.SyntaxOnly
      ) {
        return mode;
      }
      return {
        phase: CompilerPhase.Compile,
        artifact: CompilerArtifact.Object,
      };
    case "compile-assembly-like":
    case "compile-llvm-like":
    case "compile-pch":
    case "compile-pcm":
      return mode;
    case "unknown-compile-action":
      if (
        mode.phase === CompilerPhase.Link &&
        mode.artifact === CompilerArtifact.Executable
      ) {
        return {
          phase: CompilerPhase.Compile,
          artifact: CompilerArtifact.Unknown,
        };
      }
      return mode;
    case "link-shared-library":
      if (mode.phase !== CompilerPhase.Link) {
        return mode;
      }
      return {
        phase: CompilerPhase.Link,
        artifact: CompilerArtifact.SharedLibrary,
      };
    case "archive":
      if (mode.phase !== CompilerPhase.Link) {
        return mode;
      }
      return {
        phase: CompilerPhase.Archive,
        artifact: CompilerArtifact.StaticLibrary,
      };
    case "relocatable-link":
      if (mode.phase !== CompilerPhase.Link) {
        return mode;
      }
      return {
        phase: CompilerPhase.RelocatableLink,
        artifact: CompilerArtifact.Object,
      };
    case "emit-assembly-listing":
      return mode;
  }
}

export function resolveCompilerMode(
  dialect: CompilerDialect,
  actions: readonly CompilerAction[],
): CompilerMode {
  switch (dialect) {
    case CompilerDialect.Msvc:
      return actions.reduce(applyClangClCompilerAction, {
        phase: CompilerPhase.Link,
        artifact: CompilerArtifact.Executable,
      });
    case CompilerDialect.Clang:
    case CompilerDialect.Gcc:
    case CompilerDialect.Nvcc:
    case CompilerDialect.Unknown:
      return actions.reduce(applyGnuCompilerAction, {
        phase: CompilerPhase.Link,
        artifact: CompilerArtifact.Executable,
      });
  }
}
