import type { CompilerIdentity } from "../types.js";
import { ClangID, ClangVisibility } from "../../../option/clang.js";
import {
  buildClangClDriverModel,
  buildClangGnuDriverModel,
  CLANG_CL_OUTPUT_EXTENSIONS,
  CLANG_CL_VISIBILITY,
  CLANG_OUTPUT_EXTENSIONS,
  clangDriverParsedArgCount,
  clangDriverOptionValue,
  collectClangDriverOptions,
  type ClangDriverParsedOption,
} from "./clang-driver.js";
import type { CompilerParseResult } from "../types.js";

function usesClDriverMode(parsed: readonly ClangDriverParsedOption[]): boolean {
  return parsed.some(
    (parsedItem) =>
      parsedItem.item.id === ClangID.ID_driver_mode &&
      clangDriverOptionValue(parsedItem).toLowerCase() === "cl",
  );
}

function stripParsedDriverModeArgs(
  args: readonly string[],
  parsed: readonly ClangDriverParsedOption[],
): string[] {
  const strippedIndexes = new Set<number>();

  for (const parsedItem of parsed) {
    if (parsedItem.item.id !== ClangID.ID_driver_mode) {
      continue;
    }

    const argCount = clangDriverParsedArgCount(
      args,
      parsedItem.raw,
      parsedItem.rawInfo,
    );
    for (let offset = 0; offset < argCount; ++offset) {
      strippedIndexes.add(parsedItem.raw.index + offset);
    }
  }

  return args.filter((_, index) => !strippedIndexes.has(index));
}

/** Parses a clang command, including explicit clang-cl driver mode. */
export function parseClangCommand(
  cmd: readonly string[],
  identity: CompilerIdentity,
): CompilerParseResult {
  const args = cmd.slice(1);
  const parsed = collectClangDriverOptions(args, ClangVisibility.DefaultVis);

  if (usesClDriverMode(parsed)) {
    const clArgs = stripParsedDriverModeArgs(args, parsed);
    const clParsed = collectClangDriverOptions(clArgs, CLANG_CL_VISIBILITY);
    return buildClangClDriverModel(
      clArgs,
      clParsed,
      identity.dialect,
    ).model.finalize(CLANG_CL_OUTPUT_EXTENSIONS);
  }

  return buildClangGnuDriverModel(
    args,
    parsed,
    identity.dialect,
  ).model.finalize(CLANG_OUTPUT_EXTENSIONS);
}
