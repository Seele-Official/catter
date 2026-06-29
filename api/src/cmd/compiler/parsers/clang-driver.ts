import * as option from "../../../option/index.js";
import { ClangID, ClangVisibility } from "../../../option/clang.js";
import {
  OptionKindClass,
  type OptionInfo,
  type OptionItem,
  type OptionTable,
} from "../../../option/types.js";
import { CompilerArtifact, CompilerPhase } from "../types.js";
import type { CompilerDialect } from "../types.js";
import {
  CompilerCommandModel,
  type DriverOutputExtensions,
} from "./driver-model.js";
import type { CompilerParseResult } from "./types.js";

export type ClangDriverParsedOption = {
  raw: OptionItem;
  rawInfo: OptionInfo;
  item: OptionItem;
  info: OptionInfo;
};

export type ParsedClangDriverModel = {
  args: readonly string[];
  parsed: ClangDriverParsedOption[];
  model: CompilerCommandModel;
};

export const CLANG_OUTPUT_EXTENSIONS: DriverOutputExtensions = {
  object: ".o",
  executable: "",
  sharedLibrary: "",
  staticLibrary: ".a",
};

export const CLANG_CL_OUTPUT_EXTENSIONS: DriverOutputExtensions = {
  object: ".obj",
  executable: ".exe",
  sharedLibrary: ".dll",
  staticLibrary: ".lib",
};

export const CLANG_CL_VISIBILITY =
  ClangVisibility.DefaultVis | ClangVisibility.CLOption;

function cloneOptionItem(item: OptionItem): OptionItem {
  return {
    ...item,
    values: [...item.values],
  };
}

function normalizeOptionItem(table: OptionTable, item: OptionItem): OptionItem {
  return option.convertToUnalias(table, cloneOptionItem(item));
}

export function collectClangDriverOptions(
  args: readonly string[],
  visibility: number = ClangVisibility.DefaultVis,
): ClangDriverParsedOption[] {
  const collected = option.collect("clang", [...args], visibility);
  if (!Array.isArray(collected)) {
    throw new Error(`fatal error in parsing: ${collected}`);
  }

  return collected.map((raw) => {
    const item = normalizeOptionItem("clang", raw);
    return {
      raw,
      rawInfo: option.info("clang", raw),
      item,
      info: option.info("clang", item),
    };
  });
}

export function clangDriverOptionValue(
  parsedItem: ClangDriverParsedOption,
  valueIndex = 0,
): string {
  const value = parsedItem.item.values[valueIndex];
  if (value === undefined) {
    throw new Error(
      `clang option ${parsedItem.raw.key} is missing value ${valueIndex}`,
    );
  }
  return value;
}

export function clangDriverParsedArgCount(
  args: readonly string[],
  item: OptionItem,
  info: OptionInfo,
): number {
  switch (info.kind) {
    case OptionKindClass.GroupClass:
    case OptionKindClass.InputClass:
    case OptionKindClass.UnknownClass:
    case OptionKindClass.FlagClass:
    case OptionKindClass.JoinedClass:
    case OptionKindClass.RemainingArgsJoinedClass:
    case OptionKindClass.CommaJoinedClass:
      return 1;
    case OptionKindClass.ValuesClass:
    case OptionKindClass.SeparateClass:
    case OptionKindClass.RemainingArgsClass:
    case OptionKindClass.MultiArgClass:
      return 1 + item.values.length;
    case OptionKindClass.JoinedOrSeparateClass:
      return args[item.index] === item.key ? 1 + item.values.length : 1;
    case OptionKindClass.JoinedAndSeparateClass:
      return item.values.length === 0 ? 1 : item.values.length;
    default:
      return 1;
  }
}

export function collectClangDriverConsumedArgIndexes(
  args: readonly string[],
  parsed: readonly ClangDriverParsedOption[],
): Set<number> {
  const indexes = new Set<number>();

  for (const parsedItem of parsed) {
    const count = clangDriverParsedArgCount(
      args,
      parsedItem.raw,
      parsedItem.rawInfo,
    );
    for (let offset = 0; offset < count; ++offset) {
      indexes.add(parsedItem.raw.index + offset);
    }
  }

  return indexes;
}

function applyParsedGnuClangDriverOption(
  model: CompilerCommandModel,
  parsedItem: ClangDriverParsedOption,
): void {
  switch (parsedItem.item.id as ClangID) {
    case ClangID.ID_c:
    case ClangID.ID_emit_obj:
      model.setCompile(CompilerArtifact.Object);
      break;
    case ClangID.ID_S:
      model.setCompile(
        model.artifact === CompilerArtifact.LlvmBitcode
          ? CompilerArtifact.LlvmIR
          : CompilerArtifact.Assembly,
      );
      break;
    case ClangID.ID_E:
      model.setPreprocess();
      break;
    case ClangID.ID_fsyntax_only:
      model.setSyntaxOnly();
      break;
    case ClangID.ID_emit_llvm:
    case ClangID.ID_emit_llvm_bc:
      model.setCompile(
        model.artifact === CompilerArtifact.Assembly
          ? CompilerArtifact.LlvmIR
          : CompilerArtifact.LlvmBitcode,
      );
      break;
    case ClangID.ID_emit_pch:
      model.setCompile(CompilerArtifact.Pch);
      break;
    case ClangID.ID_emit_module:
    case ClangID.ID_emit_module_interface:
    case ClangID.ID_emit_reduced_module_interface:
      model.setCompile(CompilerArtifact.Pcm);
      break;
    case ClangID.ID_emit_static_lib:
      model.setArchive();
      break;
    case ClangID.ID_shared:
      model.setLink(CompilerArtifact.SharedLibrary);
      break;
    case ClangID.ID_r:
      model.setRelocatableLink();
      break;
    case ClangID.ID_o:
      model.recordOutput(
        "primary",
        clangDriverOptionValue(parsedItem),
        parsedItem.item.index,
      );
      break;
    case ClangID.ID_x:
      model.setExplicitLanguage(clangDriverOptionValue(parsedItem));
      break;
    case ClangID.ID_INPUT:
      model.recordClassifiedInput(parsedItem.item.key, parsedItem.item.index);
      break;
    default:
      if (
        parsedItem.info.group === ClangID.ID_Action_Group &&
        model.phase === CompilerPhase.Link &&
        model.artifact === CompilerArtifact.Executable
      ) {
        model.setCompile(CompilerArtifact.Unknown);
      }
      break;
  }
}

function applyParsedClangClDriverOption(
  model: CompilerCommandModel,
  parsedItem: ClangDriverParsedOption,
): void {
  switch (parsedItem.item.id as ClangID) {
    case ClangID.ID__SLASH_LD:
    case ClangID.ID__SLASH_LDd:
      model.setLink(CompilerArtifact.SharedLibrary);
      break;
    case ClangID.ID__SLASH_o:
      model.recordOutput(
        "primary",
        clangDriverOptionValue(parsedItem),
        parsedItem.item.index,
      );
      break;
    case ClangID.ID__SLASH_Fo:
      model.recordOutput(
        "object",
        clangDriverOptionValue(parsedItem),
        parsedItem.item.index,
      );
      break;
    case ClangID.ID__SLASH_Fe:
      model.recordOutput(
        "executable",
        clangDriverOptionValue(parsedItem),
        parsedItem.item.index,
      );
      break;
    case ClangID.ID__SLASH_TC:
      model.setExplicitLanguage("c");
      break;
    case ClangID.ID__SLASH_TP:
      model.setExplicitLanguage("c++");
      break;
    case ClangID.ID__SLASH_Tc:
    case ClangID.ID__SLASH_Tp:
      model.recordInput(
        clangDriverOptionValue(parsedItem),
        "source",
        parsedItem.item.index,
      );
      break;
    default:
      applyParsedGnuClangDriverOption(model, parsedItem);
      break;
  }
}

export function buildClangGnuDriverModel(
  args: readonly string[],
  parsed: ClangDriverParsedOption[],
  dialect: CompilerDialect,
): ParsedClangDriverModel {
  const model = new CompilerCommandModel(dialect);

  for (const parsedItem of parsed) {
    applyParsedGnuClangDriverOption(model, parsedItem);
  }

  return { args, parsed, model };
}

export function parseClangGnuDriverModel(
  cmd: readonly string[],
  dialect: CompilerDialect,
): ParsedClangDriverModel {
  const args = cmd.slice(1);
  return buildClangGnuDriverModel(
    args,
    collectClangDriverOptions(args, ClangVisibility.DefaultVis),
    dialect,
  );
}

export function parseClangGnuDriverCommand(
  cmd: readonly string[],
  dialect: CompilerDialect,
): CompilerParseResult {
  return parseClangGnuDriverModel(cmd, dialect).model.finalize(
    CLANG_OUTPUT_EXTENSIONS,
  );
}

export function buildClangClDriverModel(
  args: readonly string[],
  parsed: ClangDriverParsedOption[],
  dialect: CompilerDialect,
): ParsedClangDriverModel {
  const model = new CompilerCommandModel(dialect);

  for (const parsedItem of parsed) {
    applyParsedClangClDriverOption(model, parsedItem);
  }

  return { args, parsed, model };
}

export function parseClangClDriverModel(
  cmd: readonly string[],
  dialect: CompilerDialect,
): ParsedClangDriverModel {
  const args = cmd.slice(1);
  return buildClangClDriverModel(
    args,
    collectClangDriverOptions(args, CLANG_CL_VISIBILITY),
    dialect,
  );
}

export function parseClangClDriverCommand(
  cmd: readonly string[],
  dialect: CompilerDialect,
): CompilerParseResult {
  return parseClangClDriverModel(cmd, dialect).model.finalize(
    CLANG_CL_OUTPUT_EXTENSIONS,
  );
}
