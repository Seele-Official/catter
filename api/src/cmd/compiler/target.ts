import * as os from "../../os.js";
import {
  CompilerObjectFormat,
  CompilerTargetEnv,
  CompilerTargetOS,
  type CompilerOutputConvention,
  type CompilerTarget,
} from "./types.js";

export const ELF_GNU_OUTPUT_CONVENTION: CompilerOutputConvention = {
  object: ".o",
  executable: "",
  defaultExecutable: "a.out",
  sharedLibrary: ".so",
  staticLibrary: ".a",
};

export const MACHO_OUTPUT_CONVENTION: CompilerOutputConvention = {
  object: ".o",
  executable: "",
  defaultExecutable: "a.out",
  sharedLibrary: ".dylib",
  staticLibrary: ".a",
};

export const COFF_GNU_OUTPUT_CONVENTION: CompilerOutputConvention = {
  object: ".o",
  executable: ".exe",
  defaultExecutable: "a.exe",
  sharedLibrary: ".dll",
  staticLibrary: ".a",
};

export const COFF_MSVC_OUTPUT_CONVENTION: CompilerOutputConvention = {
  object: ".obj",
  executable: ".exe",
  sharedLibrary: ".dll",
  staticLibrary: ".lib",
};

function hasAny(tokens: readonly string[], values: readonly string[]): boolean {
  return values.some((value) => tokens.includes(value));
}

export function targetFromTriple(triple: string): CompilerTarget {
  const lower = triple.toLowerCase();
  const tokens = lower.split(/[-_]/).filter((token) => token.length > 0);
  const target: CompilerTarget = { triple };

  if (
    hasAny(tokens, ["windows", "win32", "mingw32", "mingw64", "cygwin", "msys"])
  ) {
    target.os = CompilerTargetOS.Windows;
    target.objectFormat = CompilerObjectFormat.Coff;
  } else if (
    hasAny(tokens, ["darwin", "macos", "ios"]) ||
    tokens.includes("apple")
  ) {
    target.os = CompilerTargetOS.Darwin;
    target.objectFormat = CompilerObjectFormat.MachO;
  } else if (tokens.includes("linux")) {
    target.os = CompilerTargetOS.Linux;
    target.objectFormat = CompilerObjectFormat.Elf;
  }

  if (tokens.includes("msvc")) {
    target.env = CompilerTargetEnv.Msvc;
  } else if (tokens.some((token) => token.includes("mingw"))) {
    target.env = CompilerTargetEnv.Mingw;
  } else if (
    tokens.some(
      (token) =>
        token === "gnu" ||
        token.startsWith("gnu") ||
        token === "musl" ||
        token === "eabi" ||
        token === "eabihf",
    )
  ) {
    target.env = CompilerTargetEnv.Gnu;
  }

  return target;
}

export function clDriverTarget(): CompilerTarget {
  return {
    triple: "unknown-pc-windows-msvc",
    os: CompilerTargetOS.Windows,
    env: CompilerTargetEnv.Msvc,
    objectFormat: CompilerObjectFormat.Coff,
  };
}

export function hostTarget(): CompilerTarget {
  switch (os.platform()) {
    case "windows":
      return {
        os: CompilerTargetOS.Windows,
        objectFormat: CompilerObjectFormat.Coff,
      };
    case "macos":
      return {
        os: CompilerTargetOS.Darwin,
        objectFormat: CompilerObjectFormat.MachO,
      };
    case "linux":
      return {
        os: CompilerTargetOS.Linux,
        objectFormat: CompilerObjectFormat.Elf,
      };
  }
}

export function outputConventionFromTarget(
  target: CompilerTarget,
): CompilerOutputConvention | undefined {
  if (target.os === CompilerTargetOS.Windows) {
    return target.env === CompilerTargetEnv.Msvc
      ? COFF_MSVC_OUTPUT_CONVENTION
      : COFF_GNU_OUTPUT_CONVENTION;
  }

  if (target.objectFormat === CompilerObjectFormat.Coff) {
    return target.env === CompilerTargetEnv.Msvc
      ? COFF_MSVC_OUTPUT_CONVENTION
      : COFF_GNU_OUTPUT_CONVENTION;
  }

  if (
    target.os === CompilerTargetOS.Darwin ||
    target.objectFormat === CompilerObjectFormat.MachO
  ) {
    return MACHO_OUTPUT_CONVENTION;
  }

  if (
    target.os === CompilerTargetOS.Linux ||
    target.objectFormat === CompilerObjectFormat.Elf
  ) {
    return ELF_GNU_OUTPUT_CONVENTION;
  }

  return undefined;
}
