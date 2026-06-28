import type { UnwrappedCompilerCommand } from "./types.js";

/**
 * Unwraps compiler wrapper commands before identification.
 *
 * This is currently a placeholder stage that returns the argv unchanged while
 * preserving the original argv for future wrapper support.
 */
export function unwrapCompilerCommand(
  argv: readonly string[],
): UnwrappedCompilerCommand {
  return {
    argv: [...argv],
    originalArgv: [...argv],
  };
}
