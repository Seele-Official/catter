import type { CompilerIdentity } from "../types.js";
import { CompilerArtifact } from "../types.js";
import {
  CLANG_OUTPUT_EXTENSIONS,
  collectClangDriverConsumedArgIndexes,
  parseClangGnuDriverModel,
} from "./clang-driver.js";
import type { CompilerParseResult } from "./types.js";

/**
 * Parses a GCC command with the clang driver option table as a temporary model.
 *
 * TODO: Replace the temporary clang/MSVC-compatible fallback reuse when GCC has
 * its own option table and parser semantics.
 */
export function parseGccCommand(
  cmd: readonly string[],
  identity: CompilerIdentity,
): CompilerParseResult {
  const parsedModel = parseClangGnuDriverModel(cmd, identity.dialect);
  applyGccFallbacks(parsedModel.model, parsedModel.args, parsedModel.parsed);
  return parsedModel.model.finalize(CLANG_OUTPUT_EXTENSIONS);
}

type GccModel = ReturnType<typeof parseClangGnuDriverModel>["model"];
type ParsedForFallback = ReturnType<typeof parseClangGnuDriverModel>["parsed"];

function applyGccFallbacks(
  model: GccModel,
  args: readonly string[],
  parsed: ParsedForFallback,
): void {
  const consumedIndexes = collectClangDriverConsumedArgIndexes(args, parsed);
  let positionalOnly = false;

  for (let index = 0; index < args.length; ++index) {
    if (consumedIndexes.has(index)) {
      continue;
    }

    positionalOnly = applyGccFallbackToken(
      model,
      args,
      consumedIndexes,
      index,
      positionalOnly,
    );

    if (
      (args[index] === "-x" || args[index] === "-o") &&
      consumedIndexes.has(index + 1)
    ) {
      ++index;
    }
  }
}

function applyGccFallbackToken(
  model: GccModel,
  args: readonly string[],
  consumedIndexes: Set<number>,
  index: number,
  positionalOnly: boolean,
): boolean {
  const token = args[index];

  if (positionalOnly) {
    recordGccFallbackInput(model, token, index);
    return true;
  }

  switch (token) {
    case "--":
      return true;
    case "-c":
      model.setCompile(CompilerArtifact.Object);
      return false;
    case "-S":
      model.setCompile(
        model.artifact === CompilerArtifact.LlvmBitcode
          ? CompilerArtifact.LlvmIR
          : CompilerArtifact.Assembly,
      );
      return false;
    case "-E":
      model.setPreprocess();
      return false;
    case "-fsyntax-only":
      model.setSyntaxOnly();
      return false;
    case "-emit-llvm":
    case "-emit-llvm-bc":
      model.setCompile(
        model.artifact === CompilerArtifact.Assembly
          ? CompilerArtifact.LlvmIR
          : CompilerArtifact.LlvmBitcode,
      );
      return false;
    case "-emit-pch":
      model.setCompile(CompilerArtifact.Pch);
      return false;
    case "-emit-module":
    case "-emit-module-interface":
    case "-emit-reduced-module-interface":
      model.setCompile(CompilerArtifact.Pcm);
      return false;
    case "--emit-static-lib":
      model.setArchive();
      return false;
    case "-shared":
      model.setLink(CompilerArtifact.SharedLibrary);
      return false;
    case "-r":
      model.setRelocatableLink();
      return false;
    case "-x":
      if (index + 1 < args.length && !consumedIndexes.has(index + 1)) {
        model.setExplicitLanguage(args[index + 1]);
        consumedIndexes.add(index + 1);
      }
      return false;
    case "-o":
      if (index + 1 < args.length && !consumedIndexes.has(index + 1)) {
        model.recordOutput("primary", args[index + 1], index);
        consumedIndexes.add(index + 1);
      }
      return false;
  }

  if (token.startsWith("-x") && token.length > 2) {
    model.setExplicitLanguage(token.slice(2));
    return false;
  }

  if (token.startsWith("-o") && token.length > 2) {
    model.recordOutput("primary", token.slice(2), index);
    return false;
  }

  recordGccFallbackInput(model, token, index);
  return false;
}

function recordGccFallbackInput(
  model: GccModel,
  token: string,
  index: number,
): void {
  if (!isGccFallbackInputToken(token)) {
    return;
  }
  model.recordClassifiedInput(token, index);
}

function isGccFallbackInputToken(token: string): boolean {
  if (token === "-") {
    return true;
  }
  if (token.length === 0 || token.startsWith("@")) {
    return false;
  }
  return !token.startsWith("-");
}
