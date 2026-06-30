import type { CompilerIdentity } from "../types.js";
import { ClangID, ClangVisibility } from "../../../option/clang.js";
import {
  buildClangClDriverModel,
  buildClangGnuDriverModel,
  CLANG_CL_OUTPUT_EXTENSIONS,
  CLANG_CL_VISIBILITY,
  CLANG_OUTPUT_EXTENSIONS,
  clangDriverOptionValue,
  collectClangDriverOptions,
  type ClangDriverParsedOption,
} from "./clang-driver.js";
import type { CompilerParseResult } from "../types.js";

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
      collectClangDriverOptions(
        args.splice(clangDriverModeIndex, 1),
        CLANG_CL_VISIBILITY,
      ),
      identity.dialect,
    ).model.finalize(CLANG_CL_OUTPUT_EXTENSIONS);
  }

  return buildClangGnuDriverModel(parsed, identity.dialect).model.finalize(
    CLANG_OUTPUT_EXTENSIONS,
  );
}
