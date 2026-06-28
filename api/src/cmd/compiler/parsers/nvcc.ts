import type { CommandModel, CompilerIdentity } from "../types.js";

export function parseNvccCommand(
  _cmd: readonly string[],
  _identity: CompilerIdentity,
): CommandModel | undefined {
  return undefined;
}
