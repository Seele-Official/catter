import type { CompilerIdentity } from "../types.js";
import * as fs from "../../../fs.js";
import { ClangID } from "../../../option/clang.js";
import {
  CLANG_CL_OUTPUT_EXTENSIONS,
  collectClangDriverConsumedArgIndexes,
  parseClangClDriverModel,
} from "./clang-driver.js";
import { LINK_INPUT_SUFFIXES } from "./driver-model.js";
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
