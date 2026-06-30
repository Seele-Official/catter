import type { CompilerIdentity } from "../types.js";
import {
  CLANG_OUTPUT_EXTENSIONS,
  parseClangGnuDriverModel,
} from "./clang-driver.js";
import type { CompilerParseResult } from "../types.js";

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
  return parseClangGnuDriverModel(cmd, identity.dialect).model.finalize(
    CLANG_OUTPUT_EXTENSIONS,
  );
}
