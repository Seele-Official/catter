import type { CompilerIdentity } from "../types.js";
import {
  CL_DEFAULT_EXTENSIONS,
  clStyleDriverVisibility,
  parseClangCompatibleCommand,
} from "./clang.js";
import type { CompilerParseResult } from "./types.js";

/** Parses an MSVC-family command using the clang-cl compatible option table. */
export function parseMsvcCommand(
  cmd: readonly string[],
  identity: CompilerIdentity,
): CompilerParseResult {
  return parseClangCompatibleCommand(
    cmd,
    clStyleDriverVisibility(),
    "cl",
    true,
    identity.dialect,
    CL_DEFAULT_EXTENSIONS,
  );
}
