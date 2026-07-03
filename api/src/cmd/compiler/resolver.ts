import * as fs from "../../fs.js";
import { err, ok, type Result } from "../../neverthrow/index.js";
import type { Edge } from "../model.js";
import {
  CompilerArtifact,
  CompilerObjectFormat,
  CompilerPhase,
  type CompilerAction,
  type CompilerInput,
  type CompilerInputRole,
  type CompilerInputSuffixRules,
  type CompilerInputSuffixRule,
  type CompilerOutput,
  type CompilerOutputKind,
  type CompilerOutputConvention,
  type CompilerResolverInputOptions,
  type CompilerResolverOutputOptions,
  type CompilerParseResult,
  type CompilerResolveDebug,
  type CompilerResolveDiagnostic,
  type CompilerResolveResult,
  type CompilerResolverSourceLanguage,
  type CompilerResolvedResolverOptions,
  type CompilerResolverOptions,
  type CompilerTarget,
} from "./types.js";
import {
  completeOutputConvention,
  hostTarget,
  outputConventionFromTarget,
} from "./target.js";

/**
 * Resolver strategy:
 *
 * Parser results are treated as command-line facts, not as the final dependency
 * graph. The resolver first decides which uncertain path-like tokens are real
 * reads. Explicit language state only selects the suffix rule group for those
 * uncertain tokens; it does not by itself prove that a token is a source file.
 * Tokens already proven by parser syntax remain reads, with their role derived
 * from the kind of parser evidence rather than from suffix guessing.
 *
 * Read classification has two separate axes. Parser evidence says whether a
 * token is proven input syntax or only a candidate. Resolver role says which
 * part of the compiler pipeline consumes the accepted read. Frontend/source
 * reads participate in preprocessing and compilation, feed source-file reports,
 * and may name per-input compile outputs. Link-like reads participate in
 * linking, archiving, relocation, or device-link steps, but do not generate
 * per-source compile outputs. Suffix rules classify candidates into these
 * consumption roles; they are not a substitute for parser evidence.
 *
 * Once reads are known, writes are inferred from the resolved compiler mode and
 * target output conventions. Target facts, not parser dialect, define platform
 * naming and link-input suffixes. Commands are assumed to be valid compiler
 * invocations; a token rejected by resolver policy means it is not visible as a
 * file dependency here, not that the original command is invalid.
 */

type ReadRole = CompilerInputRole;
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

type ResolvedInputOptions = CompilerResolvedResolverOptions["inputs"];
type ResolvedOptions = CompilerResolvedResolverOptions;

type ResolverState = {
  acceptedInputCandidates: CompilerInput[];
  rejectedInputCandidates: CompilerResolveDebug["rejectedInputCandidates"];
  inferredReads: CompilerInput[];
  inferredWrites: string[];
  diagnostics: CompilerResolveDiagnostic[];
  options?: ResolvedOptions;
};

const C_SOURCE_SUFFIXES = [".c", ".i"] as const;

const CXX_SOURCE_SUFFIXES = [
  ".c++",
  ".cc",
  ".cp",
  ".cpp",
  ".cxx",
  ".ii",
] as const;

function suffixRulesFor(
  suffixes: Iterable<string>,
  role: CompilerInputRole,
): CompilerInputSuffixRule[] {
  return Array.from(suffixes, (suffix) => ({ suffix, role }));
}

const DEFAULT_C_INPUT_RULES: Required<CompilerInputSuffixRules> = {
  suffixRules: suffixRulesFor(C_SOURCE_SUFFIXES, "source"),
  unknown: "reject",
};

const DEFAULT_CXX_INPUT_RULES: Required<CompilerInputSuffixRules> = {
  suffixRules: suffixRulesFor(CXX_SOURCE_SUFFIXES, "source"),
  unknown: "reject",
};

const DEFAULT_OUTPUT_OPTIONS: Required<CompilerResolverOutputOptions> = {
  inferDefaults: true,
  expandDirectories: true,
  inferAssemblyListings: true,
};

function explicitInputRole(input: CompilerInput): ReadRole {
  if (
    input.source.kind === "remainder-argument" ||
    input.source.kind === "remainder-option"
  ) {
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

function artifactExtension(
  artifact: CompilerArtifact,
  convention: CompilerOutputConvention,
): Result<string, void> {
  switch (artifact) {
    case CompilerArtifact.Object:
      return ok(convention.object);
    case CompilerArtifact.Executable:
      return ok(convention.executable);
    case CompilerArtifact.SharedLibrary:
      return ok(convention.sharedLibrary);
    case CompilerArtifact.StaticLibrary:
      return ok(convention.staticLibrary);
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

function firstValue<T>(values: readonly T[]): Result<T, void> {
  return values.length === 0 ? err() : ok(values[0]!);
}

function normalizeSuffixes(rule: CompilerInputSuffixRule): readonly string[] {
  const suffixes = Array.isArray(rule.suffix) ? rule.suffix : [rule.suffix];
  return suffixes.map((suffix) => suffix.toLowerCase());
}

function mergeLanguageRules(
  defaults: Required<CompilerInputSuffixRules>,
  override: CompilerInputSuffixRules | undefined,
): Required<CompilerInputSuffixRules> {
  return {
    suffixRules: override?.suffixRules ?? defaults.suffixRules,
    unknown: override?.unknown ?? defaults.unknown,
  };
}

function linkSuffixRulesForTarget(
  target: CompilerTarget,
  convention: CompilerOutputConvention | undefined,
): CompilerInputSuffixRule[] {
  const suffixes = new Set<string>();

  if (convention !== undefined) {
    suffixes.add(convention.object);
    suffixes.add(convention.sharedLibrary);
    suffixes.add(convention.staticLibrary);
  }

  if (target.objectFormat === CompilerObjectFormat.Coff) {
    suffixes.add(".obj");
    suffixes.add(".lib");
    suffixes.add(".dll");
    suffixes.add(".res");
    suffixes.add(".exp");
  } else if (target.objectFormat === CompilerObjectFormat.MachO) {
    suffixes.add(".o");
    suffixes.add(".a");
    suffixes.add(".dylib");
  } else if (target.objectFormat === CompilerObjectFormat.Elf) {
    suffixes.add(".o");
    suffixes.add(".a");
    suffixes.add(".so");
  }

  suffixes.delete("");
  return suffixRulesFor(suffixes, "link");
}

function mergeInputOptions(
  options: CompilerResolverInputOptions | undefined,
  target: CompilerTarget,
  convention: CompilerOutputConvention | undefined,
): ResolvedInputOptions {
  const languages: Record<
    CompilerResolverSourceLanguage,
    Required<CompilerInputSuffixRules>
  > = {
    c: mergeLanguageRules(DEFAULT_C_INPUT_RULES, options?.languages?.c),
    "c++": mergeLanguageRules(
      DEFAULT_CXX_INPUT_RULES,
      options?.languages?.["c++"],
    ),
  };

  const defaultUnspecifiedRules: Required<CompilerInputSuffixRules> = {
    suffixRules: [
      ...languages.c.suffixRules,
      ...languages["c++"].suffixRules,
      ...linkSuffixRulesForTarget(target, convention),
    ],
    unknown: "reject",
  };

  return {
    languages,
    unspecified: mergeLanguageRules(
      defaultUnspecifiedRules,
      options?.unspecified,
    ),
  };
}

/**
 * Resolves parsed compiler facts into visible file reads, writes, and dependency edges.
 *
 * The resolver treats parser `inputs` and `outputs` as facts, applies configurable
 * inference to `inputCandidates`, and records optional debug diagnostics for
 * decisions that depend on resolver policy.
 */
export class CompilerCommandResolver {
  private readonly options: CompilerResolverOptions &
    Required<Pick<CompilerResolverOptions, "debug">> & {
      outputs: Required<CompilerResolverOutputOptions>;
    };
  private state: ResolverState;

  constructor(options: CompilerResolverOptions = {}) {
    this.options = {
      target: options.target,
      outputConvention: options.outputConvention,
      inputs: options.inputs,
      outputs: {
        ...DEFAULT_OUTPUT_OPTIONS,
        ...options.outputs,
      },
      debug: options.debug ?? false,
    };
    this.state = this.createState();
  }

  resolve(parsed: CompilerParseResult): CompilerResolveResult {
    this.state = this.createState();
    this.state.options = this.resolveOptions(parsed);

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
        options: this.state.options,
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
      options: undefined,
    };
  }

  private resolvedOptions(): ResolvedOptions {
    if (this.state.options === undefined) {
      throw new Error("resolver options are not initialized");
    }
    return this.state.options;
  }

  private resolveTarget(parsed: CompilerParseResult): CompilerTarget {
    return this.options.target ?? parsed.target ?? hostTarget();
  }

  private resolveOptions(parsed: CompilerParseResult): ResolvedOptions {
    const target = this.resolveTarget(parsed);
    const convention = this.resolveOutputConvention(parsed).unwrapOr(undefined);

    return {
      target,
      outputConvention: convention ?? this.options.outputConvention,
      inputs: mergeInputOptions(this.options.inputs, target, convention),
      outputs: this.options.outputs,
      debug: this.options.debug,
    };
  }

  private resolveOutputConvention(
    parsed: CompilerParseResult,
  ): Result<CompilerOutputConvention, void> {
    const target = this.resolveTarget(parsed);
    const targetConvention = outputConventionFromTarget(target);
    const convention = completeOutputConvention({
      ...targetConvention,
      ...this.options.outputConvention,
    });

    return convention === undefined ? err() : ok(convention);
  }

  private collectReads(parsed: CompilerParseResult): ResolvedRead[] {
    const explicitReads = parsed.inputs.map((input): ResolvedRead => {
      return {
        input,
        role: explicitInputRole(input),
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
    const rules = this.inputCandidateRules(candidate);
    if (rules.isErr()) {
      this.rejectInputCandidate(
        candidate,
        "input candidate has unsupported explicit language",
      );
      return [];
    }

    return this.resolveInputCandidateByRules(candidate, rules.value);
  }

  private inputCandidateRules(
    candidate: CompilerInput,
  ): Result<Required<CompilerInputSuffixRules>, void> {
    const language = candidate.language?.toLowerCase();
    const inputs = this.resolvedOptions().inputs;

    if (
      language === undefined ||
      language.length === 0 ||
      language === "none"
    ) {
      return ok(inputs.unspecified);
    }

    if (language === "c" || language === "c++") {
      return ok(inputs.languages[language]);
    }

    return err();
  }

  private resolveInputCandidateByRules(
    candidate: CompilerInput,
    rules: Required<CompilerInputSuffixRules>,
  ): ResolvedRead[] {
    if (candidate.path === "-") {
      return [this.acceptInputCandidate(candidate, "source")];
    }

    const lowerPath = candidate.path.toLowerCase();
    for (const rule of rules.suffixRules) {
      if (
        normalizeSuffixes(rule).some((suffix) => lowerPath.endsWith(suffix))
      ) {
        return [this.acceptInputCandidate(candidate, rule.role)];
      }
    }

    const unknown = rules.unknown;
    if (unknown !== "reject") {
      return [this.acceptInputCandidate(candidate, unknown)];
    }

    this.rejectInputCandidate(
      candidate,
      "input candidate did not match suffix rules",
    );
    return [];
  }

  private acceptInputCandidate(
    candidate: CompilerInput,
    role: ReadRole,
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

    if (!this.options.outputs.inferDefaults) {
      return [];
    }

    return this.resolveDefaultPrimaryOutput(parsed, reads);
  }

  private selectExplicitOutput(
    parsed: CompilerParseResult,
  ): Result<CompilerOutput, void> {
    const acceptedKinds = phaseOutputKinds(parsed.compilerMode.phase);
    let selected: Result<CompilerOutput, void> = err();

    for (const output of parsed.outputs.sort(
      (left, right) => left.index - right.index,
    )) {
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

    const convention = this.resolveOutputConvention(parsed);
    if (convention.isErr()) {
      this.addDiagnostic({
        code: "default-output-missing-convention",
        message: "cannot infer default output without output convention",
      });
      return [];
    }

    const extension = artifactExtension(
      parsed.compilerMode.artifact,
      convention.value,
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

    const convention = this.resolveOutputConvention(parsed);
    if (convention.isErr()) {
      this.addDiagnostic({
        code: "default-output-missing-convention",
        message: "cannot infer default output without output convention",
      });
      return [];
    }

    const path = this.defaultSingleOutputPath(
      parsed.compilerMode.artifact,
      firstRead.value.input.path,
      convention.value,
    );

    return [this.writeForPath(path, "inferred", relevantReads)];
  }

  private defaultSingleOutputPath(
    artifact: CompilerArtifact,
    inputPath: string,
    convention: CompilerOutputConvention,
  ): string {
    switch (artifact) {
      case CompilerArtifact.Executable:
        return (
          convention.defaultExecutable ??
          pathStem(inputPath) + convention.executable
        );
      case CompilerArtifact.SharedLibrary:
        return pathStem(inputPath) + convention.sharedLibrary;
      case CompilerArtifact.StaticLibrary:
        return pathStem(inputPath) + convention.staticLibrary;
      default:
        return pathStem(inputPath) + convention.object;
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
      !this.options.outputs.expandDirectories ||
      !isDirectoryLike(outputPath) ||
      nameReads.length === 0
    ) {
      return [outputPath];
    }

    const convention = this.resolveOutputConvention(parsed);
    if (convention.isErr()) {
      this.addDiagnostic({
        code: "directory-output-missing-convention",
        message: "cannot expand directory output without output convention",
        path: outputPath,
      });
      return [outputPath];
    }

    const extension = artifactExtension(
      parsed.compilerMode.artifact,
      convention.value,
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
    if (!this.options.outputs.inferAssemblyListings) {
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
