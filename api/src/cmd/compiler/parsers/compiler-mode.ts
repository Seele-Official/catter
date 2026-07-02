import {
  CompilerArtifact,
  CompilerDialect,
  CompilerPhase,
  type CompilerAction,
  type CompilerMode,
} from "../types.js";

function initialMode(): CompilerMode {
  return {
    phase: CompilerPhase.Link,
    artifact: CompilerArtifact.Executable,
  };
}

function compileArtifact(
  artifact: Extract<
    CompilerMode,
    { phase: typeof CompilerPhase.Compile }
  >["artifact"],
): CompilerMode {
  return {
    phase: CompilerPhase.Compile,
    artifact,
  };
}

function isTerminalNonObject(mode: CompilerMode): boolean {
  return (
    mode.phase === CompilerPhase.Preprocess ||
    mode.phase === CompilerPhase.SyntaxOnly
  );
}

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
      return mode.phase === CompilerPhase.Preprocess
        ? mode
        : { phase: CompilerPhase.SyntaxOnly, artifact: CompilerArtifact.None };
    case "compile-object":
      if (
        mode.phase === CompilerPhase.Preprocess ||
        mode.phase === CompilerPhase.SyntaxOnly ||
        (mode.phase === CompilerPhase.Compile &&
          mode.artifact !== CompilerArtifact.Unknown)
      ) {
        return mode;
      }
      return compileArtifact(CompilerArtifact.Object);
    case "compile-assembly-like":
      if (isTerminalNonObject(mode)) {
        return mode;
      }
      return compileArtifact(
        mode.artifact === CompilerArtifact.LlvmBitcode
          ? CompilerArtifact.LlvmIR
          : CompilerArtifact.Assembly,
      );
    case "compile-llvm-like":
      if (isTerminalNonObject(mode)) {
        return mode;
      }
      return compileArtifact(
        mode.artifact === CompilerArtifact.Assembly
          ? CompilerArtifact.LlvmIR
          : CompilerArtifact.LlvmBitcode,
      );
    case "compile-pch":
      return isTerminalNonObject(mode)
        ? mode
        : compileArtifact(CompilerArtifact.Pch);
    case "compile-pcm":
      return isTerminalNonObject(mode)
        ? mode
        : compileArtifact(CompilerArtifact.Pcm);
    case "unknown-compile-action":
      return mode.phase === CompilerPhase.Link &&
        mode.artifact === CompilerArtifact.Executable
        ? compileArtifact(CompilerArtifact.Unknown)
        : mode;
    case "link-shared-library":
      return mode.phase === CompilerPhase.Link
        ? {
            phase: CompilerPhase.Link,
            artifact: CompilerArtifact.SharedLibrary,
          }
        : mode;
    case "archive":
      return mode.phase === CompilerPhase.Link
        ? {
            phase: CompilerPhase.Archive,
            artifact: CompilerArtifact.StaticLibrary,
          }
        : mode;
    case "relocatable-link":
      return mode.phase === CompilerPhase.Link
        ? {
            phase: CompilerPhase.RelocatableLink,
            artifact: CompilerArtifact.Object,
          }
        : mode;
    case "emit-assembly-listing":
      return mode;
  }
}

function applyClangClCompilerAction(
  mode: CompilerMode,
  action: CompilerAction,
): CompilerMode {
  switch (action.kind) {
    case "emit-assembly-listing":
      return mode;
    case "preprocess":
    case "syntax-only":
    case "compile-object":
    case "compile-assembly-like":
    case "compile-llvm-like":
    case "compile-pch":
    case "compile-pcm":
    case "unknown-compile-action":
    case "link-shared-library":
    case "archive":
    case "relocatable-link":
      return applyGnuCompilerAction(mode, action);
  }
}

function resolveGnuCompilerMode(
  actions: readonly CompilerAction[],
): CompilerMode {
  return actions.reduce(applyGnuCompilerAction, initialMode());
}

function resolveClangClCompilerMode(
  actions: readonly CompilerAction[],
): CompilerMode {
  return actions.reduce(applyClangClCompilerAction, initialMode());
}

export function resolveCompilerMode(
  dialect: CompilerDialect,
  actions: readonly CompilerAction[],
): CompilerMode {
  switch (dialect) {
    case CompilerDialect.Msvc:
      return resolveClangClCompilerMode(actions);
    case CompilerDialect.Clang:
    case CompilerDialect.Gcc:
    case CompilerDialect.Nvcc:
    case CompilerDialect.Unknown:
      return resolveGnuCompilerMode(actions);
  }
}
