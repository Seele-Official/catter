import * as fs from "../../../fs.js";
import type { Edge } from "../../model.js";
import { CompilerModelError } from "../errors.js";
import {
  CompilerArtifact,
  CompilerPhase,
  type CompilerDialect,
  type CompilerInput,
  type CompilerMode,
  type CompilerParseResult,
} from "../types.js";

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

type ArtifactMetadata = {
  readonly defaultExtension?:
    | { readonly kind: "driver"; readonly key: keyof DriverOutputExtensions }
    | { readonly kind: "fixed"; readonly extension: string };
  readonly perInputDefaultOutput?: boolean;
  readonly expandDirectoryOutput?: boolean;
};

type OutputContext = {
  readonly edgeInputs: readonly CompilerInput[];
  readonly outputNameInputs: readonly CompilerInput[];
  readonly perInputDefaultOutput: boolean;
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
  compilerMode: CompilerMode = {
    phase: CompilerPhase.Link,
    artifact: CompilerArtifact.Executable,
  };

  private explicitLanguage: string | undefined;
  private readonly inputFacts: CompilerInput[] = [];
  private readonly outputFacts: OutputFact[] = [];

  constructor(readonly dialect: CompilerDialect) {}

  setPreprocess(): void {
    this.compilerMode = {
      phase: CompilerPhase.Preprocess,
      artifact: CompilerArtifact.PreprocessedSource,
    };
  }

  setSyntaxOnly(): void {
    if (this.compilerMode.phase === CompilerPhase.Preprocess) {
      return;
    }

    this.compilerMode = {
      phase: CompilerPhase.SyntaxOnly,
      artifact: CompilerArtifact.None,
    };
  }

  setCompileObject(): void {
    if (
      this.compilerMode.phase === CompilerPhase.Preprocess ||
      this.compilerMode.phase === CompilerPhase.SyntaxOnly ||
      (this.compilerMode.phase === CompilerPhase.Compile &&
        this.compilerMode.artifact !== CompilerArtifact.Unknown)
    ) {
      return;
    }

    this.setCompileArtifact(CompilerArtifact.Object);
  }

  setCompileAssemblyLike(): void {
    if (this.hasTerminalNonObjectAction()) {
      return;
    }

    this.setCompileArtifact(
      this.compilerMode.artifact === CompilerArtifact.LlvmBitcode
        ? CompilerArtifact.LlvmIR
        : CompilerArtifact.Assembly,
    );
  }

  setCompileLlvmLike(): void {
    if (this.hasTerminalNonObjectAction()) {
      return;
    }

    this.setCompileArtifact(
      this.compilerMode.artifact === CompilerArtifact.Assembly
        ? CompilerArtifact.LlvmIR
        : CompilerArtifact.LlvmBitcode,
    );
  }

  setCompilePch(): void {
    if (this.hasTerminalNonObjectAction()) {
      return;
    }

    this.setCompileArtifact(CompilerArtifact.Pch);
  }

  setCompilePcm(): void {
    if (this.hasTerminalNonObjectAction()) {
      return;
    }

    this.setCompileArtifact(CompilerArtifact.Pcm);
  }

  setUnknownCompileAction(): void {
    if (
      this.compilerMode.phase === CompilerPhase.Link &&
      this.compilerMode.artifact === CompilerArtifact.Executable
    ) {
      this.setCompileArtifact(CompilerArtifact.Unknown);
    }
  }

  setLinkSharedLibrary(): void {
    if (this.compilerMode.phase !== CompilerPhase.Link) {
      return;
    }

    this.compilerMode = {
      phase: CompilerPhase.Link,
      artifact: CompilerArtifact.SharedLibrary,
    };
  }

  setArchive(): void {
    if (this.compilerMode.phase !== CompilerPhase.Link) {
      return;
    }

    this.compilerMode = {
      phase: CompilerPhase.Archive,
      artifact: CompilerArtifact.StaticLibrary,
    };
  }

  setRelocatableLink(): void {
    if (this.compilerMode.phase !== CompilerPhase.Link) {
      return;
    }

    this.compilerMode = {
      phase: CompilerPhase.RelocatableLink,
      artifact: CompilerArtifact.Object,
    };
  }

  setExplicitLanguage(language: string): void {
    this.explicitLanguage = language;
  }

  recordInput(path: string, kind: "source" | "link", index: number): void {
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
      compilerMode: { ...this.compilerMode },
      inputs,
      reads: inputs.map((input) => input.path),
      writes: outputResolution.writes,
      edges: outputResolution.edges,
    };
  }

  private resolveOutputs(extensions: DriverOutputExtensions): OutputResolution {
    if (this.compilerMode.artifact === CompilerArtifact.None) {
      return { writes: [], edges: [] };
    }

    const context = this.selectOutputContext();
    const explicitOutput = this.selectExplicitOutput();

    if (explicitOutput !== undefined) {
      const writes = this.materializeExplicitOutputPath(
        explicitOutput.path,
        context.outputNameInputs,
        extensions,
      );
      return {
        writes,
        edges: this.outputEdges(writes, context.edgeInputs),
      };
    }

    if (this.hasSingleDefaultOutput()) {
      const writes = this.defaultSingleOutputPaths(
        context.outputNameInputs,
        extensions,
      );
      return {
        writes,
        edges: this.outputEdges(writes, context.edgeInputs),
      };
    }

    if (!context.perInputDefaultOutput) {
      return { writes: [], edges: [] };
    }

    const writes = this.defaultOutputPaths(
      context.outputNameInputs,
      extensions,
    );
    return {
      writes,
      edges: this.outputEdges(writes, context.edgeInputs),
    };
  }

  private selectOutputContext(): OutputContext {
    const perInputDefaultOutput = this.hasPerInputDefaultOutput();
    const sourceInputs = this.inputFacts.filter(
      (input) => input.kind === "source",
    );

    return {
      edgeInputs: perInputDefaultOutput ? sourceInputs : this.inputFacts,
      outputNameInputs: perInputDefaultOutput
        ? sourceInputs
        : this.inputFacts.slice(0, 1),
      perInputDefaultOutput,
    };
  }

  private selectExplicitOutput(): OutputFact | undefined {
    const channels = PHASE_OUTPUT_CHANNELS[this.compilerMode.phase];
    const explicitOutputs = this.outputFacts.filter((output) =>
      channels.includes(output.channel),
    );
    return explicitOutputs[explicitOutputs.length - 1];
  }

  private materializeExplicitOutputPath(
    outputPath: string,
    outputInputs: readonly CompilerInput[],
    extensions: DriverOutputExtensions,
  ): string[] {
    if (!this.shouldExpandDirectoryOutput(outputPath, outputInputs)) {
      return [outputPath];
    }

    return this.materializeDirectoryOutputs(
      outputPath,
      outputInputs,
      extensions,
    );
  }

  private shouldExpandDirectoryOutput(
    outputPath: string,
    outputInputs: readonly CompilerInput[],
  ): boolean {
    return (
      isDirectoryOutputPath(outputPath) &&
      outputInputs.length > 0 &&
      this.artifactMetadata().expandDirectoryOutput === true &&
      this.hasDefaultOutputExtension()
    );
  }

  private materializeDirectoryOutputs(
    outputPath: string,
    outputInputs: readonly CompilerInput[],
    extensions: DriverOutputExtensions,
  ): string[] {
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

  private defaultOutputPaths(
    inputs: readonly CompilerInput[],
    extensions: DriverOutputExtensions,
  ): string[] {
    const extension = this.defaultOutputExtension(extensions);
    return inputs.map(
      (input) => defaultOutputStemOfInput(input.path) + extension,
    );
  }

  private defaultSingleOutputPaths(
    inputs: readonly CompilerInput[],
    extensions: DriverOutputExtensions,
  ): string[] {
    if (inputs.length === 0) {
      return [];
    }

    if (extensions.executable.length === 0) {
      return ["a.out"];
    }

    const extension = this.defaultSingleOutputExtension(extensions);
    return [defaultOutputStemOfInput(inputs[0]!.path) + extension];
  }

  private defaultSingleOutputExtension(
    extensions: DriverOutputExtensions,
  ): string {
    switch (this.compilerMode.artifact) {
      case CompilerArtifact.SharedLibrary:
        return extensions.sharedLibrary;
      case CompilerArtifact.StaticLibrary:
        return extensions.staticLibrary;
      default:
        return extensions.executable;
    }
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

  private setCompileArtifact(
    artifact: Extract<
      CompilerMode,
      { phase: typeof CompilerPhase.Compile }
    >["artifact"],
  ): void {
    this.compilerMode = {
      phase: CompilerPhase.Compile,
      artifact,
    };
  }

  private hasTerminalNonObjectAction(): boolean {
    return (
      this.compilerMode.phase === CompilerPhase.Preprocess ||
      this.compilerMode.phase === CompilerPhase.SyntaxOnly
    );
  }

  private artifactMetadata(): ArtifactMetadata {
    return COMPILER_ARTIFACT_METADATA[this.compilerMode.artifact];
  }

  private hasPerInputDefaultOutput(): boolean {
    return (
      this.compilerMode.phase === CompilerPhase.Compile &&
      this.artifactMetadata().perInputDefaultOutput === true
    );
  }

  private hasSingleDefaultOutput(): boolean {
    switch (this.compilerMode.phase) {
      case CompilerPhase.Link:
      case CompilerPhase.Archive:
      case CompilerPhase.RelocatableLink:
      case CompilerPhase.DeviceLink:
        return true;
      default:
        return false;
    }
  }

  private hasDefaultOutputExtension(): boolean {
    return this.artifactMetadata().defaultExtension !== undefined;
  }

  private defaultOutputExtension(extensions: DriverOutputExtensions): string {
    const extension = this.artifactMetadata().defaultExtension;
    if (extension?.kind === "driver") {
      return extensions[extension.key];
    }

    if (extension?.kind === "fixed") {
      return extension.extension;
    }

    throw new CompilerModelError(
      `no default output extension for ${this.compilerMode.artifact}`,
    );
  }
}
