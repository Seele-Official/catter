import * as fs from "../../../fs.js";
import type { Edge } from "../../model.js";
import {
  CompilerArtifact,
  CompilerPhase,
  type CompilerDialect,
  type CompilerInput,
} from "../types.js";
import type { CompilerParseResult } from "../types.js";

export type DriverOutputChannel =
  | "primary"
  | "object"
  | "executable"
  | "linker";

export type DriverOutputExtensions = {
  object: string;
  executable: string;
  sharedLibrary: string;
  staticLibrary: string;
};

type OutputFact = {
  path: string;
  index: number;
  channel: DriverOutputChannel;
};

type OutputResolution = {
  writes: string[];
  edges: Edge[];
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

export const LINK_INPUT_SUFFIXES = new Set([
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

const ARTIFACT_EXTENSION_KEYS: ReadonlyMap<
  CompilerArtifact,
  keyof DriverOutputExtensions
> = new Map([
  [CompilerArtifact.Object, "object"],
  [CompilerArtifact.Executable, "executable"],
  [CompilerArtifact.SharedLibrary, "sharedLibrary"],
  [CompilerArtifact.StaticLibrary, "staticLibrary"],
]);

const FIXED_ARTIFACT_EXTENSIONS: ReadonlyMap<CompilerArtifact, string> =
  new Map([
    [CompilerArtifact.Assembly, ".s"],
    [CompilerArtifact.LlvmIR, ".ll"],
    [CompilerArtifact.LlvmBitcode, ".bc"],
    [CompilerArtifact.Pch, ".pch"],
    [CompilerArtifact.Pcm, ".pcm"],
    [CompilerArtifact.Ptx, ".ptx"],
    [CompilerArtifact.Cubin, ".cubin"],
    [CompilerArtifact.Fatbin, ".fatbin"],
  ]);

const PER_INPUT_COMPILE_ARTIFACTS: readonly CompilerArtifact[] = [
  CompilerArtifact.Object,
  CompilerArtifact.Assembly,
  CompilerArtifact.LlvmIR,
  CompilerArtifact.LlvmBitcode,
  CompilerArtifact.Pch,
  CompilerArtifact.Pcm,
  CompilerArtifact.Ptx,
  CompilerArtifact.Cubin,
  CompilerArtifact.Fatbin,
];

const PHASE_OUTPUT_CHANNELS: Record<CompilerPhase, DriverOutputChannel[]> = {
  [CompilerPhase.Preprocess]: ["primary"],
  [CompilerPhase.SyntaxOnly]: [],
  [CompilerPhase.Compile]: ["primary", "object"],
  [CompilerPhase.Link]: ["primary", "executable", "linker"],
  [CompilerPhase.Archive]: ["primary", "object", "linker"],
  [CompilerPhase.RelocatableLink]: ["primary", "object", "linker"],
  [CompilerPhase.DeviceLink]: ["primary", "object", "linker"],
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

function inferInputKindFromPathSuffix(inputPath: string): "source" | "link" {
  if (inputPath === "-") {
    return "source";
  }

  const ext = fs.path.extension(inputPath);
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

function inferInputKind(
  inputPath: string,
  explicitLanguage: string | undefined,
): "source" | "link" {
  if (explicitLanguage === undefined || explicitLanguage.length === 0) {
    return inferInputKindFromPathSuffix(inputPath);
  }

  switch (explicitLanguage.toLowerCase()) {
    case "none":
      return inferInputKindFromPathSuffix(inputPath);
    case "object":
      return "link";
    default:
      return "source";
  }
}

export class CompilerCommandModel {
  phase: CompilerPhase = CompilerPhase.Link;
  artifact: CompilerArtifact = CompilerArtifact.Executable;
  private explicitLanguage: string | undefined;
  private readonly inputFacts: CompilerInput[] = [];
  private readonly outputFacts: OutputFact[] = [];

  constructor(readonly dialect: CompilerDialect) {}

  setPreprocess(): void {
    this.phase = CompilerPhase.Preprocess;
    this.artifact = CompilerArtifact.Stdout;
  }

  setSyntaxOnly(): void {
    this.phase = CompilerPhase.SyntaxOnly;
    this.artifact = CompilerArtifact.None;
  }

  setCompile(artifact: CompilerArtifact): void {
    this.phase = CompilerPhase.Compile;
    this.artifact = artifact;
  }

  setLink(
    artifact:
      | typeof CompilerArtifact.Executable
      | typeof CompilerArtifact.SharedLibrary,
  ): void {
    this.phase = CompilerPhase.Link;
    this.artifact = artifact;
  }

  setArchive(): void {
    this.phase = CompilerPhase.Archive;
    this.artifact = CompilerArtifact.StaticLibrary;
  }

  setRelocatableLink(): void {
    this.phase = CompilerPhase.RelocatableLink;
    this.artifact = CompilerArtifact.Object;
  }

  setExplicitLanguage(language: string): void {
    this.explicitLanguage = language;
  }

  recordInput(path: string, kind: "source" | "link", index: number): void {
    if (
      this.inputFacts.some(
        (input) =>
          input.index === index && input.path === path && input.kind === kind,
      )
    ) {
      return;
    }

    this.inputFacts.push({
      path,
      kind,
      index,
    });
  }

  recordClassifiedInput(path: string, index: number): void {
    this.recordInput(path, inferInputKind(path, this.explicitLanguage), index);
  }

  recordOutput(
    channel: DriverOutputChannel,
    path: string,
    index: number,
  ): void {
    this.outputFacts.push({
      path,
      index,
      channel,
    });
  }

  finalize(extensions: DriverOutputExtensions): CompilerParseResult {
    const inputs = this.inputFacts.map((input) => ({ ...input }));
    const outputResolution = this.resolveOutputs(extensions);

    return {
      dialect: this.dialect,
      phase: this.phase,
      artifact: this.artifact,
      inputs,
      reads: inputs.map((input) => input.path),
      writes: outputResolution.writes,
      edges: outputResolution.edges,
    };
  }

  private resolveOutputs(extensions: DriverOutputExtensions): OutputResolution {
    if (this.artifact === CompilerArtifact.None) {
      return { writes: [], edges: [] };
    }

    const perInput =
      this.phase === CompilerPhase.Compile &&
      PER_INPUT_COMPILE_ARTIFACTS.includes(this.artifact);
    const sourceInputs = this.inputFacts.filter(
      (input) => input.kind === "source",
    );
    const edgeInputs = perInput ? sourceInputs : this.inputFacts;
    const outputNameInputs = perInput
      ? sourceInputs
      : this.inputFacts.slice(0, 1);
    const explicitOutputs = this.outputFacts.filter((output) =>
      PHASE_OUTPUT_CHANNELS[this.phase].includes(output.channel),
    );

    if (explicitOutputs.length > 0) {
      const output = explicitOutputs[explicitOutputs.length - 1]!;
      const writes = this.materializeExplicitOutput(
        output.path,
        outputNameInputs,
        extensions,
      );
      return {
        writes,
        edges: this.outputEdges(writes, edgeInputs),
      };
    }

    if (!perInput) {
      return { writes: [], edges: [] };
    }

    const extension = this.defaultOutputExtension(extensions);
    const writes = sourceInputs.map(
      (input) => defaultOutputStemOfInput(input.path) + extension,
    );
    return {
      writes,
      edges: this.outputEdges(writes, sourceInputs),
    };
  }

  private materializeExplicitOutput(
    outputPath: string,
    outputInputs: readonly CompilerInput[],
    extensions: DriverOutputExtensions,
  ): string[] {
    if (
      !isDirectoryOutputPath(outputPath) ||
      outputInputs.length === 0 ||
      !this.hasDefaultOutputExtension()
    ) {
      return [outputPath];
    }

    const extension = this.defaultOutputExtension(extensions);
    return outputInputs.map((input) =>
      fs.path.lexicalNormal(
        fs.path.joinAll(
          outputPath,
          defaultOutputStemOfInput(input.path) + extension,
        ),
      ),
    );
  }

  private outputEdges(
    writes: readonly string[],
    inputs: readonly CompilerInput[],
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

  private hasDefaultOutputExtension(): boolean {
    return (
      ARTIFACT_EXTENSION_KEYS.has(this.artifact) ||
      FIXED_ARTIFACT_EXTENSIONS.has(this.artifact)
    );
  }

  private defaultOutputExtension(extensions: DriverOutputExtensions): string {
    const extensionKey = ARTIFACT_EXTENSION_KEYS.get(this.artifact);
    if (extensionKey !== undefined) {
      return extensions[extensionKey];
    }

    if (FIXED_ARTIFACT_EXTENSIONS.has(this.artifact)) {
      return FIXED_ARTIFACT_EXTENSIONS.get(this.artifact)!;
    }

    throw new Error(`no default output extension for ${this.artifact}`);
  }
}
