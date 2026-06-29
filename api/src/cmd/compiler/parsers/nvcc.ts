import type { CompilerIdentity } from "../types.js";
import type { CompilerParseResult } from "../types.js";

/** Placeholder nvcc parser; returns `undefined` until nvcc analysis exists. */
export function parseNvccCommand(
  _cmd: readonly string[],
  _identity: CompilerIdentity,
): CompilerParseResult | undefined {
  return undefined;
}
