import type { CompilerIdentity } from "../types.js";
import {
  CLANG_CL_OUTPUT_EXTENSIONS,
  parseClangClDriverModel,
} from "./clang-driver.js";
import type { CompilerParseResult } from "../types.js";

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
  return parseClangClDriverModel(cmd, identity.dialect).model.finalize(
    CLANG_CL_OUTPUT_EXTENSIONS,
  );
}
