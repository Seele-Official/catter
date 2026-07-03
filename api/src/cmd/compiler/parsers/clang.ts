import { ClangID, ClangVisibility } from "../../../option/clang.js";
import {
  buildClangClDriverModel,
  buildClangGnuDriverModel,
  CLANG_CL_VISIBILITY,
  clangDriverOptionValue,
  collectClangDriverOptions,
  type ClangDriverParsedOption,
} from "./clang-driver.js";
import {
  CompilerDialect,
  type CompilerIdentity,
  type CompilerParseResult,
} from "../types.js";
import { clDriverTarget, targetFromExecutable } from "../target.js";

function findClangDriverMode(
  parsed: readonly ClangDriverParsedOption[],
): boolean {
  return parsed.some(
    (parsedItem) =>
      parsedItem.item.id === ClangID.ID_driver_mode &&
      clangDriverOptionValue(parsedItem).toLowerCase() === "cl",
  );
}

/** Parses a clang command, including explicit clang-cl driver mode. */
export function parseClangCommand(
  cmd: readonly string[],
  identity: CompilerIdentity,
): CompilerParseResult {
  const args = cmd.slice(1);
  const parsed = collectClangDriverOptions(args, ClangVisibility.DefaultVis);

  if (findClangDriverMode(parsed)) {
    return buildClangClDriverModel(
      collectClangDriverOptions(args, CLANG_CL_VISIBILITY),
      CompilerDialect.Msvc,
      targetFromExecutable(cmd[0]!) ?? clDriverTarget(),
    );
  }

  return buildClangGnuDriverModel(
    parsed,
    identity.dialect,
    targetFromExecutable(cmd[0]!),
  );
}
