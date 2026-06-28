import type {
  CommandModel,
  CompilerDialect,
  CompilerIdentity,
} from "../types.js";
import { parseClangCommand } from "./clang.js";
import { parseGnuCommand } from "./gnu.js";
import { parseMsvcCommand } from "./msvc.js";
import { parseNvccCommand } from "./nvcc.js";

export function parseCompilerCommand(
  cmd: readonly string[],
  identity: CompilerIdentity,
): CommandModel | undefined {
  switch (identity.dialect satisfies CompilerDialect) {
    case "clang":
      return parseClangCommand(cmd, identity);
    case "gnu":
      return parseGnuCommand(cmd, identity);
    case "msvc":
      return parseMsvcCommand(cmd, identity);
    case "nvcc":
      return parseNvccCommand(cmd, identity);
  }
}
