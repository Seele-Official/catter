import type { CompilerIdentity } from "../types.js";
import {
  GNU_DEFAULT_EXTENSIONS,
  gnuDriverVisibility,
  parseClangCompatibleCommand,
} from "./clang.js";
import type { CompilerParseResult } from "./types.js";

/** Parses a GNU-family command with the clang-compatible GNU option table. */
export function parseGnuCommand(
  cmd: readonly string[],
  identity: CompilerIdentity,
): CompilerParseResult {
  return parseClangCompatibleCommand(
    cmd,
    gnuDriverVisibility(),
    "gnu",
    false,
    identity.dialect,
    GNU_DEFAULT_EXTENSIONS,
  );
}
