import type { CommandModel, CompilerIdentity } from "../types.js";

/** Placeholder nvcc parser; returns `undefined` until nvcc analysis exists. */
export function parseNvccCommand(
  _cmd: readonly string[],
  _identity: CompilerIdentity,
): CommandModel | undefined {
  return undefined;
}
