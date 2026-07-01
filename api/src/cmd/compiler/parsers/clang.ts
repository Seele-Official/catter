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

function getClangDriverModeIndex(
  parsed: readonly ClangDriverParsedOption[],
): number {
  return parsed.findIndex(
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
  const clangDriverModeIndex = getClangDriverModeIndex(parsed);

  if (clangDriverModeIndex !== -1) {
    return buildClangClDriverModel(
      collectClangDriverOptions(args, CLANG_CL_VISIBILITY),
      CompilerDialect.Msvc,
    );
  }

  return buildClangGnuDriverModel(parsed, identity.dialect);
}
