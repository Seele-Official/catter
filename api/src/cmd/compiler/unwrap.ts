import type { UnwrappedCompilerCommand } from "./types.js";

export function unwrapCompilerCommand(
  argv: readonly string[],
): UnwrappedCompilerCommand {
  return {
    argv: [...argv],
    originalArgv: [...argv],
  };
}
