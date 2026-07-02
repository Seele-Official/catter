import * as fs from "../../fs.js";
import type { Edge } from "../model.js";
import { CompilerModelError } from "./errors.js";
import {
  CompilerArtifact,
  CompilerDialect,
  CompilerPhase,
  type CompilerParseResult,
  type CompilerInput,
  type CompilerMode,
  type CompilerOutput,
  type CompilerOutputKind,
  type CompilerResolveResult,
} from "./types.js";

type OutputResolution = {
  writes: string[];
  edges: Edge[];
};

type DriverOutputExtensions = {
  object: string;
  executable: string;
  sharedLibrary: string;
  staticLibrary: string;
};

type ArtifactMetadata = {
  readonly defaultExtension?:
    | {
        readonly kind: "driver";
        readonly key: keyof DriverOutputExtensions;
      }
    | { readonly kind: "fixed"; readonly extension: string };
  readonly perInputDefaultOutput?: boolean;
  readonly expandDirectoryOutput?: boolean;
};

type OutputContext = {
  readonly edgeInputs: readonly ResolvedCompilerInput[];
  readonly outputNameInputs: readonly ResolvedCompilerInput[];
  readonly perInputDefaultOutput: boolean;
};

type ResolvedCompilerInputUsage = "source" | "link";

type ResolvedCompilerInput = CompilerInput & {
  readonly usage: ResolvedCompilerInputUsage;
};

const SOURCE_SUFFIXES = new Set([
  ".c",
  ".cc",
  ".cp",
  ".cpp",
  ".cxx",
  ".c++",
  ".cu",
  ".hip",
  ".m",
  ".mm",
  ".s",
  ".sx",
  ".asm",
  ".f",
  ".f77",
  ".f90",
  ".f95",
  ".f03",
  ".f08",
  ".for",
  ".ftn",
  ".i",
  ".ii",
  ".mi",
  ".mii",
  ".bc",
  ".ll",
  ".pcm",
  ".pch",
  ".gch",
]);

const LINK_INPUT_SUFFIXES = new Set([
  ".o",
  ".obj",
  ".a",
  ".lib",
  ".lo",
  ".so",
  ".dylib",
  ".dll",
  ".exp",
  ".res",
]);

const GNU_OUTPUT_EXTENSIONS: DriverOutputExtensions = {
  object: ".o",
  executable: "",
  sharedLibrary: "",
  staticLibrary: ".a",
};

const MSVC_OUTPUT_EXTENSIONS: DriverOutputExtensions = {
  object: ".obj",
  executable: ".exe",
  sharedLibrary: ".dll",
  staticLibrary: ".lib",
};

const COMPILER_ARTIFACT_METADATA: Record<CompilerArtifact, ArtifactMetadata> = {
  [CompilerArtifact.None]: {},
  [CompilerArtifact.PreprocessedSource]: {},
  [CompilerArtifact.Object]: {
    defaultExtension: { kind: "driver", key: "object" },
    perInputDefaultOutput: true,
    expandDirectoryOutput: true,
  },
  [CompilerArtifact.Executable]: {
    defaultExtension: { kind: "driver", key: "executable" },
    expandDirectoryOutput: true,
  },
  [CompilerArtifact.SharedLibrary]: {
    defaultExtension: { kind: "driver", key: "sharedLibrary" },
    expandDirectoryOutput: true,
  },
  [CompilerArtifact.StaticLibrary]: {
    defaultExtension: { kind: "driver", key: "staticLibrary" },
    expandDirectoryOutput: true,
  },
  [CompilerArtifact.Assembly]: {
    defaultExtension: { kind: "fixed", extension: ".s" },
    perInputDefaultOutput: true,
    expandDirectoryOutput: true,
  },
  [CompilerArtifact.LlvmIR]: {
    defaultExtension: { kind: "fixed", extension: ".ll" },
    perInputDefaultOutput: true,
    expandDirectoryOutput: true,
  },
  [CompilerArtifact.LlvmBitcode]: {
    defaultExtension: { kind: "fixed", extension: ".bc" },
    perInputDefaultOutput: true,
    expandDirectoryOutput: true,
  },
  [CompilerArtifact.Pch]: {
    defaultExtension: { kind: "fixed", extension: ".pch" },
    perInputDefaultOutput: true,
    expandDirectoryOutput: true,
  },
  [CompilerArtifact.Pcm]: {
    defaultExtension: { kind: "fixed", extension: ".pcm" },
    perInputDefaultOutput: true,
    expandDirectoryOutput: true,
  },
  [CompilerArtifact.Ptx]: {
    defaultExtension: { kind: "fixed", extension: ".ptx" },
    perInputDefaultOutput: true,
    expandDirectoryOutput: true,
  },
  [CompilerArtifact.Cubin]: {
    defaultExtension: { kind: "fixed", extension: ".cubin" },
    perInputDefaultOutput: true,
    expandDirectoryOutput: true,
  },
  [CompilerArtifact.Fatbin]: {
    defaultExtension: { kind: "fixed", extension: ".fatbin" },
    perInputDefaultOutput: true,
    expandDirectoryOutput: true,
  },
  [CompilerArtifact.Unknown]: {},
};

const PHASE_OUTPUT_KINDS: Record<CompilerPhase, CompilerOutputKind[]> = {
  [CompilerPhase.Preprocess]: ["primary-artifact"],
  [CompilerPhase.SyntaxOnly]: [],
  [CompilerPhase.Compile]: ["primary-artifact", "object-file"],
  [CompilerPhase.Link]: ["primary-artifact", "linked-artifact"],
  [CompilerPhase.Archive]: [
    "primary-artifact",
    "object-file",
    "linked-artifact",
  ],
  [CompilerPhase.RelocatableLink]: [
    "primary-artifact",
    "object-file",
    "linked-artifact",
  ],
  [CompilerPhase.DeviceLink]: [
    "primary-artifact",
    "object-file",
    "linked-artifact",
  ],
};

function defaultOutputStemOfInput(inputPath: string): string {
  if (inputPath === "-") {
    return "stdin";
  }

  const filename = fs.path.filename(inputPath);
  const ext = fs.path.extension(filename);
  if (ext.length === 0 || ext.length >= filename.length) {
    return filename;
  }
  return filename.slice(0, filename.length - ext.length);
}

function isDirectoryOutputPath(outputPath: string): boolean {
  return outputPath.endsWith("/") || outputPath.endsWith("\\");
}

function outputExtensionsForDialect(
  dialect: CompilerDialect,
): DriverOutputExtensions {
  switch (dialect) {
    case CompilerDialect.Msvc:
      return MSVC_OUTPUT_EXTENSIONS;
    case CompilerDialect.Clang:
    case CompilerDialect.Gcc:
    case CompilerDialect.Nvcc:
    case CompilerDialect.Unknown:
      return GNU_OUTPUT_EXTENSIONS;
  }
}

function classifyBySuffix(path: string): ResolvedCompilerInputUsage {
  if (path === "-") {
    return "source";
  }

  const ext = fs.path.extension(path);
  if (ext === ".C" || ext === ".M") {
    return "source";
  }

  const lowerExt = ext.toLowerCase();
  if (SOURCE_SUFFIXES.has(lowerExt)) {
    return "source";
  }
  if (LINK_INPUT_SUFFIXES.has(lowerExt)) {
    return "link";
  }
  return "link";
}

function classifyCompilerInput(
  input: CompilerInput,
  explicitLanguage: string | undefined,
): ResolvedCompilerInputUsage {
  if (
    input.source.kind === "remainder-argument" ||
    input.source.kind === "remainder-option"
  ) {
    return "link";
  }

  if (explicitLanguage === undefined || explicitLanguage.length === 0) {
    return classifyBySuffix(input.path);
  }

  switch (explicitLanguage.toLowerCase()) {
    case "none":
      return classifyBySuffix(input.path);
    case "object":
      return "link";
    default:
      return "source";
  }
}

function resolveInputCandidate(
  candidate: CompilerInput,
): ResolvedCompilerInput {
  return {
    ...candidate,
    usage: classifyCompilerInput(candidate, candidate.language),
  };
}

function resolveInput(input: CompilerInput): ResolvedCompilerInput {
  return {
    ...input,
    usage: classifyCompilerInput(input, input.language),
  };
}

function compareInputOrder(
  left: ResolvedCompilerInput,
  right: ResolvedCompilerInput,
): number {
  return left.index - right.index;
}

function resolveInputs(parsed: CompilerParseResult): ResolvedCompilerInput[] {
  return [
    ...parsed.inputs.map(resolveInput),
    ...parsed.inputCandidates.map(resolveInputCandidate),
  ].sort(compareInputOrder);
}

function publicInputs(
  inputs: readonly ResolvedCompilerInput[],
): CompilerInput[] {
  return inputs.map(({ usage, ...input }) => input);
}

function artifactMetadata(mode: CompilerMode): ArtifactMetadata {
  return COMPILER_ARTIFACT_METADATA[mode.artifact];
}

function hasPerInputDefaultOutput(mode: CompilerMode): boolean {
  return (
    mode.phase === CompilerPhase.Compile &&
    artifactMetadata(mode).perInputDefaultOutput === true
  );
}

function hasSingleDefaultOutput(mode: CompilerMode): boolean {
  switch (mode.phase) {
    case CompilerPhase.Link:
    case CompilerPhase.Archive:
    case CompilerPhase.RelocatableLink:
    case CompilerPhase.DeviceLink:
      return true;
    default:
      return false;
  }
}

function hasDefaultOutputExtension(mode: CompilerMode): boolean {
  return artifactMetadata(mode).defaultExtension !== undefined;
}

function defaultOutputExtension(
  mode: CompilerMode,
  extensions: DriverOutputExtensions,
): string {
  const extension = artifactMetadata(mode).defaultExtension;
  if (extension?.kind === "driver") {
    return extensions[extension.key];
  }

  if (extension?.kind === "fixed") {
    return extension.extension;
  }

  throw new CompilerModelError(
    `no default output extension for ${mode.artifact}`,
  );
}

function selectOutputContext(
  mode: CompilerMode,
  inputs: readonly ResolvedCompilerInput[],
): OutputContext {
  const perInputDefaultOutput = hasPerInputDefaultOutput(mode);
  const sourceInputs = inputs.filter((input) => input.usage === "source");

  return {
    edgeInputs: perInputDefaultOutput ? sourceInputs : inputs,
    outputNameInputs: perInputDefaultOutput ? sourceInputs : inputs.slice(0, 1),
    perInputDefaultOutput,
  };
}

function selectExplicitOutput(
  mode: CompilerMode,
  outputs: readonly CompilerOutput[],
): CompilerOutput | undefined {
  const kinds = PHASE_OUTPUT_KINDS[mode.phase];
  const explicitOutputs = outputs.filter((output) =>
    kinds.includes(output.kind),
  );
  return explicitOutputs[explicitOutputs.length - 1];
}

function shouldExpandDirectoryOutput(
  mode: CompilerMode,
  outputPath: string,
  outputInputs: readonly ResolvedCompilerInput[],
): boolean {
  return (
    isDirectoryOutputPath(outputPath) &&
    outputInputs.length > 0 &&
    artifactMetadata(mode).expandDirectoryOutput === true &&
    hasDefaultOutputExtension(mode)
  );
}

function materializeDirectoryOutputs(
  mode: CompilerMode,
  outputPath: string,
  outputInputs: readonly ResolvedCompilerInput[],
  extensions: DriverOutputExtensions,
): string[] {
  const extension = defaultOutputExtension(mode, extensions);
  return outputInputs.map((input) =>
    fs.path.lexicalNormal(
      fs.path.joinAll(
        outputPath,
        defaultOutputStemOfInput(input.path) + extension,
      ),
    ),
  );
}

function materializeExplicitOutputPath(
  mode: CompilerMode,
  outputPath: string,
  outputInputs: readonly ResolvedCompilerInput[],
  extensions: DriverOutputExtensions,
): string[] {
  if (!shouldExpandDirectoryOutput(mode, outputPath, outputInputs)) {
    return [outputPath];
  }

  return materializeDirectoryOutputs(
    mode,
    outputPath,
    outputInputs,
    extensions,
  );
}

function defaultOutputPaths(
  mode: CompilerMode,
  inputs: readonly ResolvedCompilerInput[],
  extensions: DriverOutputExtensions,
): string[] {
  const extension = defaultOutputExtension(mode, extensions);
  return inputs.map(
    (input) => defaultOutputStemOfInput(input.path) + extension,
  );
}

function defaultSingleOutputPaths(
  mode: CompilerMode,
  inputs: readonly ResolvedCompilerInput[],
  extensions: DriverOutputExtensions,
): string[] {
  if (inputs.length === 0) {
    return [];
  }

  if (extensions.executable.length === 0) {
    return ["a.out"];
  }

  const extension =
    mode.artifact === CompilerArtifact.SharedLibrary
      ? extensions.sharedLibrary
      : mode.artifact === CompilerArtifact.StaticLibrary
        ? extensions.staticLibrary
        : extensions.executable;
  return [defaultOutputStemOfInput(inputs[0]!.path) + extension];
}

function outputEdges(
  writes: readonly string[],
  inputs: readonly ResolvedCompilerInput[],
): Edge[] {
  if (writes.length === 0) {
    return [];
  }

  if (writes.length === inputs.length) {
    return writes.map((output, index) => ({
      output,
      inputs: [inputs[index]!.path],
    }));
  }

  const inputPaths = inputs.map((input) => input.path);
  return writes.map((output) => ({
    output,
    inputs: inputPaths,
  }));
}

function assemblyListingDefaultPath(input: ResolvedCompilerInput): string {
  return defaultOutputStemOfInput(input.path) + ".asm";
}

function assemblyListingDirectoryPaths(
  outputPath: string,
  inputs: readonly ResolvedCompilerInput[],
): string[] {
  return inputs.map((input) =>
    fs.path.lexicalNormal(
      fs.path.joinAll(outputPath, assemblyListingDefaultPath(input)),
    ),
  );
}

function assemblyListingPaths(
  outputPath: string | undefined,
  inputs: readonly ResolvedCompilerInput[],
): string[] {
  if (inputs.length === 0) {
    return [];
  }

  if (outputPath === undefined || outputPath.length === 0) {
    return inputs.map(assemblyListingDefaultPath);
  }

  if (isDirectoryOutputPath(outputPath)) {
    return assemblyListingDirectoryPaths(outputPath, inputs);
  }

  return inputs.length === 1 ? [outputPath] : [];
}

function shouldResolveAssemblyListingOutputs(mode: CompilerMode): boolean {
  switch (mode.phase) {
    case CompilerPhase.Compile:
    case CompilerPhase.Link:
    case CompilerPhase.Archive:
    case CompilerPhase.RelocatableLink:
    case CompilerPhase.DeviceLink:
      return true;
    case CompilerPhase.Preprocess:
    case CompilerPhase.SyntaxOnly:
      return false;
  }
}

function resolveAssemblyListingOutputs(
  parsed: CompilerParseResult,
  inputs: readonly ResolvedCompilerInput[],
): OutputResolution {
  if (!shouldResolveAssemblyListingOutputs(parsed.compilerMode)) {
    return { writes: [], edges: [] };
  }

  const sourceInputs = inputs.filter((input) => input.usage === "source");
  let hasAssemblyListingRequest = false;
  let outputPath: string | undefined;

  for (const action of parsed.compilerActions) {
    if (action.kind !== "emit-assembly-listing") {
      continue;
    }

    hasAssemblyListingRequest = true;
    if (action.path !== undefined) {
      outputPath = action.path;
    }
  }

  if (!hasAssemblyListingRequest) {
    return { writes: [], edges: [] };
  }

  const writes = assemblyListingPaths(outputPath, sourceInputs);
  return {
    writes,
    edges: outputEdges(writes, sourceInputs),
  };
}

function resolveOutputs(
  parsed: CompilerParseResult,
  inputs: readonly ResolvedCompilerInput[],
): OutputResolution {
  const mode = parsed.compilerMode;
  const outputExtensions = outputExtensionsForDialect(parsed.dialect);
  if (mode.artifact === CompilerArtifact.None) {
    return { writes: [], edges: [] };
  }

  const context = selectOutputContext(mode, inputs);
  const explicitOutput = selectExplicitOutput(mode, parsed.outputs);

  if (explicitOutput !== undefined) {
    const writes = materializeExplicitOutputPath(
      mode,
      explicitOutput.path,
      context.outputNameInputs,
      outputExtensions,
    );
    return {
      writes,
      edges: outputEdges(writes, context.edgeInputs),
    };
  }

  if (hasSingleDefaultOutput(mode)) {
    const writes = defaultSingleOutputPaths(
      mode,
      context.outputNameInputs,
      outputExtensions,
    );
    return {
      writes,
      edges: outputEdges(writes, context.edgeInputs),
    };
  }

  if (!context.perInputDefaultOutput) {
    return { writes: [], edges: [] };
  }

  const writes = defaultOutputPaths(
    mode,
    context.outputNameInputs,
    outputExtensions,
  );
  return {
    writes,
    edges: outputEdges(writes, context.edgeInputs),
  };
}

export function resolveCompilerCommand(
  parsed: CompilerParseResult,
): CompilerResolveResult {
  const inputs = resolveInputs(parsed);
  const outputResolution = resolveOutputs(parsed, inputs);
  const assemblyListingResolution = resolveAssemblyListingOutputs(
    parsed,
    inputs,
  );

  return {
    inputs: publicInputs(inputs),
    sourceFiles: inputs
      .filter((input) => input.usage === "source")
      .map((input) => input.path),
    reads: inputs.map((input) => input.path),
    writes: [...outputResolution.writes, ...assemblyListingResolution.writes],
    edges: [...outputResolution.edges, ...assemblyListingResolution.edges],
  };
}
