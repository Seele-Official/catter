import {
  CompilerArtifact,
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

function applyCompilerAction(
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
  }
}

export function resolveCompilerMode(
  actions: readonly CompilerAction[],
): CompilerMode {
  return actions.reduce(applyCompilerAction, initialMode());
}
