import type { CompilerIdentity } from "../types.js";
import * as fs from "../../../fs.js";
import { ClangID } from "../../../option/clang.js";
import { CompilerArtifact } from "../types.js";
import {
  CLANG_CL_OUTPUT_EXTENSIONS,
  collectClangDriverConsumedArgIndexes,
  parseClangClDriverModel,
} from "./clang-driver.js";
import { LINK_INPUT_SUFFIXES } from "./driver-model.js";
import type { CompilerParseResult } from "./types.js";

/**
 * Parses an MSVC-family command using the clang-cl compatible option table.
 *
 * MSVC-specific behavior lives here; clang-driver only provides the shared LLVM
 * option table adapter and clang driver semantics.
 */
export function parseMsvcCommand(
  cmd: readonly string[],
  identity: CompilerIdentity,
): CompilerParseResult {
  const parsedModel = parseClangClDriverModel(cmd, identity.dialect);
  applyMsvcFallbacks(parsedModel.model, parsedModel.args, parsedModel.parsed);
  return parsedModel.model.finalize(CLANG_CL_OUTPUT_EXTENSIONS);
}

type ParsedForFallback = ReturnType<typeof parseClangClDriverModel>["parsed"];

function applyMsvcFallbacks(
  model: ReturnType<typeof parseClangClDriverModel>["model"],
  args: readonly string[],
  parsed: ParsedForFallback,
): void {
  const consumedIndexes = collectClangDriverConsumedArgIndexes(args, parsed);

  for (const parsedItem of parsed) {
    if (parsedItem.item.id === ClangID.ID__SLASH_link) {
      scanFallbackLinkerRemainder(
        model,
        parsedItem.item.values,
        parsedItem.item.index,
      );
      for (let offset = 1; offset <= parsedItem.item.values.length; ++offset) {
        consumedIndexes.add(parsedItem.raw.index + offset);
      }
    }
  }

  for (let index = 0; index < args.length; ++index) {
    if (consumedIndexes.has(index)) {
      continue;
    }

    const token = args[index];
    const lower = token.toLowerCase();

    if (lower === "/c" || lower === "-c") {
      model.setCompile(CompilerArtifact.Object);
      continue;
    }

    if (lower === "/ld" || lower === "/ldd") {
      model.setLink(CompilerArtifact.SharedLibrary);
      continue;
    }

    const objectOutput = clJoinedOrSeparateValue(
      args,
      consumedIndexes,
      index,
      "/fo",
      "-fo",
    );
    if (objectOutput !== undefined) {
      model.recordOutput("object", objectOutput.value, index);
      consumedIndexes.add(objectOutput.valueIndex);
      continue;
    }

    const executableOutput = clJoinedOrSeparateValue(
      args,
      consumedIndexes,
      index,
      "/fe",
      "-fe",
    );
    if (executableOutput !== undefined) {
      model.recordOutput("executable", executableOutput.value, index);
      consumedIndexes.add(executableOutput.valueIndex);
      continue;
    }

    if (lower === "/link" || lower === "-link") {
      scanFallbackLinkerRemainder(model, args.slice(index + 1), index);
      break;
    }

    if (isLinkerRemainderInput(token)) {
      model.recordClassifiedInput(token, index);
    }
  }
}

function isLinkerRemainderInput(token: string): boolean {
  if (token.length === 0 || token.startsWith("@")) {
    return false;
  }
  if (!token.startsWith("-") && !token.startsWith("/")) {
    return true;
  }
  return LINK_INPUT_SUFFIXES.has(fs.path.extension(token).toLowerCase());
}

function clJoinedOrSeparateValue(
  args: readonly string[],
  consumedIndexes: Set<number>,
  index: number,
  slashPrefix: string,
  dashPrefix: string,
): { value: string; valueIndex: number } | undefined {
  const token = args[index];
  const lower = token.toLowerCase();
  const prefix = lower.startsWith(slashPrefix) ? slashPrefix : dashPrefix;
  if (!lower.startsWith(prefix)) {
    return undefined;
  }

  if (lower === prefix) {
    if (index + 1 >= args.length || consumedIndexes.has(index + 1)) {
      return undefined;
    }
    return {
      value: args[index + 1],
      valueIndex: index + 1,
    };
  }

  const rawValue = token.slice(prefix.length);
  return {
    value: rawValue.startsWith(":") ? rawValue.slice(1) : rawValue,
    valueIndex: index,
  };
}

function scanFallbackLinkerRemainder(
  model: ReturnType<typeof parseClangClDriverModel>["model"],
  values: readonly string[],
  linkIndex: number,
): void {
  for (let index = 0; index < values.length; ++index) {
    const token = values[index];
    const lower = token.toLowerCase();

    if (lower === "/dll") {
      model.setLink(CompilerArtifact.SharedLibrary);
      continue;
    }

    if (lower.startsWith("/out:")) {
      model.recordOutput("linker", token.slice(5), linkIndex);
      continue;
    }

    if (lower === "/out" && index + 1 < values.length) {
      model.recordOutput("linker", values[index + 1], linkIndex);
      ++index;
      continue;
    }

    if (isLinkerRemainderInput(token)) {
      model.recordInput(token, "link", linkIndex);
    }
  }
}
