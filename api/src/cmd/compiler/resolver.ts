import * as fs from "../../fs.js";
import { err, ok, type Result } from "../../neverthrow/index.js";
import type { Edge } from "../model.js";
import {
  CompilerArtifact,
  CompilerDialect,
  CompilerPhase,
  type CompilerAction,
  type CompilerInput,
  type CompilerOutput,
  type CompilerOutputKind,
  type CompilerParseResult,
  type CompilerResolveDebug,
  type CompilerResolveDiagnostic,
  type CompilerResolveResult,
  type CompilerResolverOptions,
} from "./types.js";

type ReadRole = "source" | "link";
type ReadOrigin = "explicit" | "inferred";
type WriteOrigin = "explicit" | "inferred";
type ResolvedRead = {
  readonly input: CompilerInput;
  readonly role: ReadRole;
  readonly origin: ReadOrigin;
};

type ResolvedWrite = {
  readonly path: string;
  readonly origin: WriteOrigin;
  readonly reads: readonly ResolvedRead[];
};

type DriverExtensions = {
  readonly object: string;
  readonly executable: string;
  readonly sharedLibrary: string;
  readonly staticLibrary: string;
};

type ResolverState = {
  acceptedInputCandidates: CompilerInput[];
  rejectedInputCandidates: CompilerResolveDebug["rejectedInputCandidates"];
  inferredReads: CompilerInput[];
  inferredWrites: string[];
  diagnostics: CompilerResolveDiagnostic[];
};

const DEFAULT_OPTIONS: Required<CompilerResolverOptions> = {
  inputCandidateInference: "suffix",
  unknownInputCandidate: "ignore",
  inferDefaultOutputs: true,
  expandDirectoryOutputs: true,
  inferAssemblyListings: true,
  debug: false,
};

const SOURCE_EXTENSIONS = new Set([
  ".asm",
  ".bc",
  ".c",
  ".c++",
  ".cc",
  ".cp",
  ".cpp",
  ".cu",
  ".cxx",
  ".f",
  ".f03",
  ".f08",
  ".f77",
  ".f90",
  ".f95",
  ".for",
  ".ftn",
  ".gch",
  ".hip",
  ".i",
  ".ii",
  ".ll",
  ".m",
  ".mi",
  ".mii",
  ".mm",
  ".pch",
  ".pcm",
  ".s",
  ".sx",
]);

const LINK_EXTENSIONS = new Set([
  ".a",
  ".dll",
  ".dylib",
  ".exp",
  ".lib",
  ".lo",
  ".o",
  ".obj",
  ".res",
  ".so",
]);

const GNU_EXTENSIONS: DriverExtensions = {
  object: ".o",
  executable: "",
  sharedLibrary: "",
  staticLibrary: ".a",
};

const MSVC_EXTENSIONS: DriverExtensions = {
  object: ".obj",
  executable: ".exe",
  sharedLibrary: ".dll",
  staticLibrary: ".lib",
};

function extensionRole(path: string): Result<ReadRole, void> {
  if (path === "-") {
    return ok("source");
  }

  const ext = fs.path.extension(path).toLowerCase();
  if (SOURCE_EXTENSIONS.has(ext)) {
    return ok("source");
  }
  if (LINK_EXTENSIONS.has(ext)) {
    return ok("link");
  }
  return err();
}

function readRole(input: CompilerInput): ReadRole {
  if (
    input.source.kind === "remainder-argument" ||
    input.source.kind === "remainder-option"
  ) {
    return "link";
  }

  const language = input.language?.toLowerCase();
  if (language === undefined || language.length === 0 || language === "none") {
    return extensionRole(input.path).unwrapOr("link");
  }
  if (language === "object") {
    return "link";
  }
  return "source";
}

function pathStem(path: string): string {
  if (path === "-") {
    return "stdin";
  }
  const name = fs.path.filename(path);
  const ext = fs.path.extension(name);

  return name.slice(0, name.length - ext.length);
}

function isDirectoryLike(path: string): boolean {
  return path.endsWith("/") || path.endsWith("\\");
}

function dialectExtensions(dialect: CompilerDialect): DriverExtensions {
  return dialect === CompilerDialect.Msvc ? MSVC_EXTENSIONS : GNU_EXTENSIONS;
}

function artifactExtension(
  artifact: CompilerArtifact,
  extensions: DriverExtensions,
): Result<string, void> {
  switch (artifact) {
    case CompilerArtifact.Object:
      return ok(extensions.object);
    case CompilerArtifact.Executable:
      return ok(extensions.executable);
    case CompilerArtifact.SharedLibrary:
      return ok(extensions.sharedLibrary);
    case CompilerArtifact.StaticLibrary:
      return ok(extensions.staticLibrary);
    case CompilerArtifact.Assembly:
      return ok(".s");
    case CompilerArtifact.LlvmIR:
      return ok(".ll");
    case CompilerArtifact.LlvmBitcode:
      return ok(".bc");
    case CompilerArtifact.Pch:
      return ok(".pch");
    case CompilerArtifact.Pcm:
      return ok(".pcm");
    case CompilerArtifact.Ptx:
      return ok(".ptx");
    case CompilerArtifact.Cubin:
      return ok(".cubin");
    case CompilerArtifact.Fatbin:
      return ok(".fatbin");
    case CompilerArtifact.None:
    case CompilerArtifact.PreprocessedSource:
    case CompilerArtifact.Unknown:
      return err();
  }
}

function phaseOutputKinds(phase: CompilerPhase): readonly CompilerOutputKind[] {
  switch (phase) {
    case CompilerPhase.Preprocess:
      return ["primary-artifact"];
    case CompilerPhase.SyntaxOnly:
      return [];
    case CompilerPhase.Compile:
      return ["primary-artifact", "object-file"];
    case CompilerPhase.Link:
      return ["primary-artifact", "linked-artifact"];
    case CompilerPhase.Archive:
    case CompilerPhase.RelocatableLink:
    case CompilerPhase.DeviceLink:
      return ["primary-artifact", "object-file", "linked-artifact"];
  }
}

function sortByIndex<T extends { readonly index: number }>(
  values: readonly T[],
) {
  return [...values].sort((left, right) => left.index - right.index);
}

function firstValue<T>(values: readonly T[]): Result<T, void> {
  return values.length === 0 ? err() : ok(values[0]!);
}

/**
 * Resolves parsed compiler facts into visible file reads, writes, and dependency edges.
 *
 * The resolver treats parser `inputs` and `outputs` as facts, applies configurable
 * inference to `inputCandidates`, and records optional debug diagnostics for
 * decisions that depend on resolver policy.
 */
export class CompilerCommandResolver {
  private readonly options: Required<CompilerResolverOptions>;
  private state: ResolverState;

  constructor(options: CompilerResolverOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.state = this.createState();
  }

  resolve(parsed: CompilerParseResult): CompilerResolveResult {
    this.state = this.createState();

    const reads = this.collectReads(parsed);
    const writes = [
      ...this.resolvePrimaryWrites(parsed, reads),
      ...this.resolveSideWrites(parsed, reads),
    ];

    const result: CompilerResolveResult = {
      reads: reads.map((read) => read.input.path),
      writes: writes.map((write) => write.path),
      edges: writes.map((write) => ({
        output: write.path,
        inputs: write.reads.map((read) => read.input.path),
      })),
      sourceFiles: reads
        .filter((read) => read.role === "source")
        .map((read) => read.input.path),
    };

    if (this.options.debug) {
      result.debug = {
        options: this.options,
        acceptedInputCandidates: [...this.state.acceptedInputCandidates],
        rejectedInputCandidates: [...this.state.rejectedInputCandidates],
        inferredReads: [...this.state.inferredReads],
        inferredWrites: [...this.state.inferredWrites],
        diagnostics: [...this.state.diagnostics],
      };
    }

    return result;
  }

  private createState(): ResolverState {
    return {
      acceptedInputCandidates: [],
      rejectedInputCandidates: [],
      inferredReads: [],
      inferredWrites: [],
      diagnostics: [],
    };
  }

  private collectReads(parsed: CompilerParseResult): ResolvedRead[] {
    const explicitReads = parsed.inputs.map((input): ResolvedRead => {
      return {
        input,
        role: readRole(input),
        origin: "explicit",
      };
    });

    const candidateReads = parsed.inputCandidates.flatMap((candidate) =>
      this.resolveInputCandidate(candidate),
    );

    return [...explicitReads, ...candidateReads].sort(
      (left, right) => left.input.index - right.input.index,
    );
  }

  private resolveInputCandidate(candidate: CompilerInput): ResolvedRead[] {
    switch (this.options.inputCandidateInference) {
      case "none":
        this.rejectInputCandidate(
          candidate,
          "input candidate inference disabled",
        );
        return [];
      case "all":
        return [this.acceptInputCandidate(candidate)];
      case "suffix":
        return this.resolveInputCandidateBySuffix(candidate);
    }
  }

  private resolveInputCandidateBySuffix(
    candidate: CompilerInput,
  ): ResolvedRead[] {
    const role = extensionRole(candidate.path);
    if (role.isOk()) {
      return [this.acceptInputCandidate(candidate, role.value)];
    }

    if (this.options.unknownInputCandidate === "read-as-link") {
      return [this.acceptInputCandidate(candidate, "link")];
    }

    this.rejectInputCandidate(candidate, "unknown input candidate suffix");
    return [];
  }

  private acceptInputCandidate(
    candidate: CompilerInput,
    role = readRole(candidate),
  ): ResolvedRead {
    this.state.acceptedInputCandidates.push(candidate);
    this.state.inferredReads.push(candidate);
    return {
      input: candidate,
      role,
      origin: "inferred",
    };
  }

  private rejectInputCandidate(candidate: CompilerInput, reason: string): void {
    this.state.rejectedInputCandidates.push({
      input: candidate,
      reason,
    });
    this.addDiagnostic({
      code: "input-candidate-rejected",
      message: reason,
      path: candidate.path,
      index: candidate.index,
      source: candidate.source,
    });
  }

  private resolvePrimaryWrites(
    parsed: CompilerParseResult,
    reads: readonly ResolvedRead[],
  ): ResolvedWrite[] {
    if (parsed.outputCandidates.length > 0) {
      for (const output of parsed.outputCandidates) {
        this.addDiagnostic({
          code: "output-candidate-ignored",
          message: "output candidates are not resolved in this resolver stage",
          path: output.path,
          index: output.index,
          source: output.source,
        });
      }
    }

    if (parsed.compilerMode.artifact === CompilerArtifact.None) {
      return [];
    }

    const explicitOutput = this.selectExplicitOutput(parsed);
    if (explicitOutput.isOk()) {
      return this.resolveExplicitPrimaryOutput(
        parsed,
        explicitOutput.value,
        reads,
      );
    }

    if (!this.options.inferDefaultOutputs) {
      return [];
    }

    return this.resolveDefaultPrimaryOutput(parsed, reads);
  }

  private selectExplicitOutput(
    parsed: CompilerParseResult,
  ): Result<CompilerOutput, void> {
    const acceptedKinds = phaseOutputKinds(parsed.compilerMode.phase);
    let selected: Result<CompilerOutput, void> = err();

    for (const output of sortByIndex(parsed.outputs)) {
      if (acceptedKinds.includes(output.kind)) {
        selected = ok(output);
        continue;
      }

      this.addDiagnostic({
        code: "output-kind-ignored",
        message: `output kind ${output.kind} is not used for ${parsed.compilerMode.phase}`,
        path: output.path,
        index: output.index,
        source: output.source,
      });
    }

    return selected;
  }

  private resolveExplicitPrimaryOutput(
    parsed: CompilerParseResult,
    output: CompilerOutput,
    reads: readonly ResolvedRead[],
  ): ResolvedWrite[] {
    const relevantReads = this.primaryOutputReads(parsed, reads);
    const nameReads = this.primaryOutputNameReads(parsed, relevantReads);
    const paths = this.materializeOutputPath(parsed, output.path, nameReads);
    return this.writesForPaths(paths, "explicit", relevantReads);
  }

  private resolveDefaultPrimaryOutput(
    parsed: CompilerParseResult,
    reads: readonly ResolvedRead[],
  ): ResolvedWrite[] {
    switch (parsed.compilerMode.phase) {
      case CompilerPhase.Preprocess:
      case CompilerPhase.SyntaxOnly:
        return [];
      case CompilerPhase.Compile:
        return this.resolveDefaultCompileOutput(parsed, reads);
      case CompilerPhase.Link:
      case CompilerPhase.Archive:
      case CompilerPhase.RelocatableLink:
      case CompilerPhase.DeviceLink:
        return this.resolveDefaultSingleOutput(parsed, reads);
    }
  }

  private resolveDefaultCompileOutput(
    parsed: CompilerParseResult,
    reads: readonly ResolvedRead[],
  ): ResolvedWrite[] {
    const relevantReads = this.primaryOutputReads(parsed, reads);
    if (relevantReads.length === 0) {
      this.addDiagnostic({
        code: "default-output-missing-input",
        message: "compile output has no source input to name",
      });
      return [];
    }

    const extension = artifactExtension(
      parsed.compilerMode.artifact,
      dialectExtensions(parsed.dialect),
    );
    if (extension.isErr()) {
      this.addDiagnostic({
        code: "default-output-unsupported-artifact",
        message: `cannot infer default output for ${parsed.compilerMode.artifact}`,
      });
      return [];
    }

    return relevantReads.map((read) =>
      this.writeForPath(
        pathStem(read.input.path) + extension.value,
        "inferred",
        [read],
      ),
    );
  }

  private resolveDefaultSingleOutput(
    parsed: CompilerParseResult,
    reads: readonly ResolvedRead[],
  ): ResolvedWrite[] {
    const relevantReads = this.primaryOutputReads(parsed, reads);
    const firstRead = firstValue(relevantReads);
    if (firstRead.isErr()) {
      this.addDiagnostic({
        code: "default-output-missing-input",
        message: "single output has no input to name",
      });
      return [];
    }

    const path =
      parsed.dialect === CompilerDialect.Msvc
        ? pathStem(firstRead.value.input.path) +
          this.msvcSingleOutputExtension(parsed.compilerMode.artifact)
        : "a.out";

    return [this.writeForPath(path, "inferred", relevantReads)];
  }

  private msvcSingleOutputExtension(artifact: CompilerArtifact): string {
    const extensions = dialectExtensions(CompilerDialect.Msvc);
    switch (artifact) {
      case CompilerArtifact.SharedLibrary:
        return extensions.sharedLibrary;
      case CompilerArtifact.StaticLibrary:
        return extensions.staticLibrary;
      default:
        return extensions.executable;
    }
  }

  private primaryOutputReads(
    parsed: CompilerParseResult,
    reads: readonly ResolvedRead[],
  ): readonly ResolvedRead[] {
    switch (parsed.compilerMode.phase) {
      case CompilerPhase.Compile:
      case CompilerPhase.Preprocess:
        return reads.filter((read) => read.role === "source");
      case CompilerPhase.SyntaxOnly:
        return [];
      case CompilerPhase.Link:
      case CompilerPhase.Archive:
      case CompilerPhase.RelocatableLink:
      case CompilerPhase.DeviceLink:
        return reads;
    }
  }

  private primaryOutputNameReads(
    parsed: CompilerParseResult,
    reads: readonly ResolvedRead[],
  ): readonly ResolvedRead[] {
    if (parsed.compilerMode.phase === CompilerPhase.Compile) {
      return reads;
    }
    return firstValue(reads).match(
      (read) => [read],
      () => [],
    );
  }

  private materializeOutputPath(
    parsed: CompilerParseResult,
    outputPath: string,
    nameReads: readonly ResolvedRead[],
  ): string[] {
    if (
      !this.options.expandDirectoryOutputs ||
      !isDirectoryLike(outputPath) ||
      nameReads.length === 0
    ) {
      return [outputPath];
    }

    const extension = artifactExtension(
      parsed.compilerMode.artifact,
      dialectExtensions(parsed.dialect),
    );
    if (extension.isErr()) {
      this.addDiagnostic({
        code: "directory-output-unsupported-artifact",
        message: `cannot expand directory output for ${parsed.compilerMode.artifact}`,
        path: outputPath,
      });
      return [outputPath];
    }

    return nameReads.map((read) =>
      fs.path.lexicalNormal(
        fs.path.joinAll(
          outputPath,
          pathStem(read.input.path) + extension.value,
        ),
      ),
    );
  }

  private resolveSideWrites(
    parsed: CompilerParseResult,
    reads: readonly ResolvedRead[],
  ): ResolvedWrite[] {
    if (!this.options.inferAssemblyListings) {
      return [];
    }

    const listingPaths = parsed.compilerActions
      .filter((action) => action.kind === "emit-assembly-listing")
      .map((action) => action.path);

    if (listingPaths.length === 0) {
      return [];
    }

    const sourceReads = reads.filter((read) => read.role === "source");

    switch (parsed.compilerMode.phase) {
      case CompilerPhase.Preprocess:
      case CompilerPhase.SyntaxOnly:
        return [];
      case CompilerPhase.Compile:
      case CompilerPhase.Link:
      case CompilerPhase.Archive:
      case CompilerPhase.RelocatableLink:
      case CompilerPhase.DeviceLink:
        for (const path of listingPaths.reverse()) {
          if (path !== undefined) {
            return this.resolveAssemblyListingWritesByPath(sourceReads, path);
          }
        }
    }

    return sourceReads.map((read) =>
      this.writeForPath(pathStem(read.input.path) + ".asm", "inferred", [read]),
    );
  }

  private resolveAssemblyListingWritesByPath(
    sourceReads: readonly ResolvedRead[],
    explicitPath: string,
  ): ResolvedWrite[] {
    if (isDirectoryLike(explicitPath)) {
      return sourceReads.map((read) =>
        this.writeForPath(
          fs.path.lexicalNormal(
            fs.path.joinAll(explicitPath, pathStem(read.input.path) + ".asm"),
          ),
          "inferred",
          [read],
        ),
      );
    }

    if (sourceReads.length === 1) {
      return [this.writeForPath(explicitPath, "explicit", sourceReads)];
    }

    this.addDiagnostic({
      code: "assembly-listing-ambiguous-output",
      message:
        "single assembly listing path cannot name multiple source inputs",
      path: explicitPath,
    });

    return [];
  }

  private writesForPaths(
    paths: readonly string[],
    origin: WriteOrigin,
    reads: readonly ResolvedRead[],
  ): ResolvedWrite[] {
    if (paths.length === reads.length) {
      return paths.map((path, index) =>
        this.writeForPath(path, origin, [reads[index]!]),
      );
    }
    return paths.map((path) => this.writeForPath(path, origin, reads));
  }

  private writeForPath(
    path: string,
    origin: WriteOrigin,
    reads: readonly ResolvedRead[],
  ): ResolvedWrite {
    if (origin === "inferred") {
      this.state.inferredWrites.push(path);
    }
    return {
      path,
      origin,
      reads,
    };
  }

  private addDiagnostic(diagnostic: CompilerResolveDiagnostic): void {
    this.state.diagnostics.push(diagnostic);
  }
}
