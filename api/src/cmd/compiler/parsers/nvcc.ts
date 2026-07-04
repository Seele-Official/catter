import type { CompilerIdentity } from "../types.js";
import type { CompilerParseResult } from "../types.js";
import { CompilerUnsupportedError } from "../errors.js";

/** Placeholder nvcc parser; throws until nvcc analysis exists. */
export function parseNvccCommand(
  _cmd: readonly string[],
  identity: CompilerIdentity,
): CompilerParseResult {
  throw new CompilerUnsupportedError(
    `compiler dialect is not supported yet: ${identity.dialect}`,
  );
}
