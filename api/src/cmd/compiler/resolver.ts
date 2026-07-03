import * as fs from "../../fs.js";
import {
  CompilerArtifact,
  CompilerObjectFormat,
  CompilerPhase,
  type CompilerInput,
  type CompilerInputCandidateDecision,
  type CompilerInputCandidateOptions,
  type CompilerInputCandidateRules,
  type CompilerInputRole,
  type CompilerInputSuffixRule,
  type CompilerInferredWrite,
  type CompilerOutput,
  type CompilerOutputConvention,
  type CompilerOutputKind,
  type CompilerParseResult,
  type CompilerResolveDiagnostic,
  type CompilerResolveResult,
  type CompilerResolverEffectiveOptions,
  type CompilerResolverOptions,
  type CompilerResolverSourceLanguage,
  type CompilerResolverWriteOptions,
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
 * The intended precedence is semantic evidence first, suffix evidence last.
 * Parser facts such as linker remainder operands should directly determine the
 * read role. The resolved compiler mode can constrain how accepted reads are
 * used and which writes can exist, but a link-like mode flag such as shared
 * library output does not by itself prove that every positional token is a
 * source or link input. Suffix policy is for the remaining ambiguous positional
 * candidates after parser facts and mode semantics have been considered.
 *
 * Once reads are known, writes are inferred from the resolved compiler mode and
 * target output conventions. Target facts, not parser dialect, define platform
 * naming and link-input suffixes. Commands are assumed to be valid compiler
 * invocations; a token rejected by resolver policy means it is not visible as a
 * file dependency here, not that the original command is invalid.
 */

type CompleteInputCandidateRules = Required<CompilerInputCandidateRules>;

type ParsedRead = {
  readonly input: CompilerInput;
  readonly role: CompilerInputRole;
};

type ResolvedWrite = {
  readonly path: string;
  readonly reads: readonly ParsedRead[];
};

type ResolverTrace = {
  readonly inputCandidates: CompilerInputCandidateDecision[];
  readonly inferredWrites: CompilerInferredWrite[];
  readonly diagnostics: CompilerResolveDiagnostic[];
};

type NormalizedResolverOptions = Omit<
  CompilerResolverOptions,
  "debug" | "writes"
> & {
  readonly debug: boolean;
  readonly writes: Required<CompilerResolverWriteOptions>;
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

const DEFAULT_WRITE_OPTIONS: Required<CompilerResolverWriteOptions> = {
  inferDefaultOutputs: true,
  expandDirectoryOutputs: true,
  inferAssemblyListings: true,
};

const DEFAULT_C_CANDIDATE_RULES: CompleteInputCandidateRules = {
  suffixRules: suffixRulesFor(C_SOURCE_SUFFIXES, "source"),
  unknownSuffix: "reject",
};

const DEFAULT_CXX_CANDIDATE_RULES: CompleteInputCandidateRules = {
  suffixRules: suffixRulesFor(CXX_SOURCE_SUFFIXES, "source"),
  unknownSuffix: "reject",
};

function suffixRulesFor(
  suffixes: Iterable<string>,
  role: CompilerInputRole,
): CompilerInputSuffixRule[] {
  return Array.from(suffixes, (suffix) => ({ suffix, role }));
}

function completeInputCandidateRules(
  defaults: CompleteInputCandidateRules,
  override: CompilerInputCandidateRules | undefined,
): CompleteInputCandidateRules {
  return {
    suffixRules: override?.suffixRules ?? defaults.suffixRules,
    unknownSuffix: override?.unknownSuffix ?? defaults.unknownSuffix,
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

function buildInputCandidateOptions(
  options: CompilerInputCandidateOptions | undefined,
  target: CompilerTarget,
  convention: CompilerOutputConvention | undefined,
): CompilerResolverEffectiveOptions["inputCandidates"] {
  const byLanguage: Record<
    CompilerResolverSourceLanguage,
    CompleteInputCandidateRules
  > = {
    c: completeInputCandidateRules(
      DEFAULT_C_CANDIDATE_RULES,
      options?.byLanguage?.c,
    ),
    "c++": completeInputCandidateRules(
      DEFAULT_CXX_CANDIDATE_RULES,
      options?.byLanguage?.["c++"],
    ),
  };

  const defaultRulesWithoutLanguage: CompleteInputCandidateRules = {
    suffixRules: [
      ...byLanguage.c.suffixRules,
      ...byLanguage["c++"].suffixRules,
      ...linkSuffixRulesForTarget(target, convention),
    ],
    unknownSuffix: "reject",
  };

  return {
    byLanguage,
    withoutLanguage: completeInputCandidateRules(
      defaultRulesWithoutLanguage,
      options?.withoutLanguage,
    ),
  };
}

function buildEffectiveOptions(
  options: NormalizedResolverOptions,
  parsed: CompilerParseResult,
): CompilerResolverEffectiveOptions {
  const target = options.target ?? parsed.target ?? hostTarget();
  const outputConvention = completeOutputConvention({
    ...outputConventionFromTarget(target),
    ...options.outputConvention,
  });

  return {
    target,
    outputConvention,
    inputCandidates: buildInputCandidateOptions(
      options.inputCandidates,
      target,
      outputConvention,
    ),
    writes: options.writes,
    debug: options.debug,
  };
}

function createTrace(): ResolverTrace {
  return {
    inputCandidates: [],
    inferredWrites: [],
    diagnostics: [],
  };
}

function parserInputRole(input: CompilerInput): CompilerInputRole {
  if (
    input.source.kind === "remainder-argument" ||
    input.source.kind === "remainder-option"
  ) {
    return "link";
  }

  return "source";
}

function collectReads(
  parsed: CompilerParseResult,
  options: CompilerResolverEffectiveOptions,
  trace: ResolverTrace,
): ParsedRead[] {
  const parserReads = parsed.inputs.flatMap((input): ParsedRead[] => {
    if (isStreamPath(input.path)) {
      addDiagnostic(trace, {
        code: "stream-input-ignored",
        message: "stream input is not a filesystem dependency",
        path: input.path,
        index: input.index,
        source: input.source,
      });
      return [];
    }

    return [
      {
        input,
        role: parserInputRole(input),
      },
    ];
  });

  const candidateReads = parsed.inputCandidates.flatMap((candidate) =>
    resolveInputCandidate(candidate, options.inputCandidates, trace),
  );

  return [...parserReads, ...candidateReads].sort(
    (left, right) => left.input.index - right.input.index,
  );
}

function resolveInputCandidate(
  candidate: CompilerInput,
  options: CompilerResolverEffectiveOptions["inputCandidates"],
  trace: ResolverTrace,
): ParsedRead[] {
  if (isStreamPath(candidate.path)) {
    rejectInputCandidate(
      candidate,
      "stream input is not a filesystem dependency",
      trace,
    );
    return [];
  }

  const rules = inputCandidateRulesForLanguage(candidate, options);
  if (rules === undefined) {
    rejectInputCandidate(
      candidate,
      "input candidate has unsupported explicit language",
      trace,
    );
    return [];
  }

  const lowerPath = candidate.path.toLowerCase();
  const suffixRule = rules.suffixRules.find((rule) =>
    normalizedSuffixes(rule).some((suffix) => lowerPath.endsWith(suffix)),
  );

  if (suffixRule !== undefined) {
    return [acceptInputCandidate(candidate, suffixRule.role, trace)];
  }

  if (rules.unknownSuffix !== "reject") {
    return [acceptInputCandidate(candidate, rules.unknownSuffix, trace)];
  }

  rejectInputCandidate(
    candidate,
    "input candidate did not match suffix rules",
    trace,
  );
  return [];
}

function inputCandidateRulesForLanguage(
  candidate: CompilerInput,
  options: CompilerResolverEffectiveOptions["inputCandidates"],
): CompleteInputCandidateRules | undefined {
  const language = candidate.language?.toLowerCase();
  if (language === undefined || language.length === 0 || language === "none") {
    return options.withoutLanguage;
  }

  if (language === "c" || language === "c++") {
    return options.byLanguage[language];
  }

  return undefined;
}

function normalizedSuffixes(rule: CompilerInputSuffixRule): readonly string[] {
  const suffixes = Array.isArray(rule.suffix) ? rule.suffix : [rule.suffix];
  return suffixes.map((suffix) => suffix.toLowerCase());
}

function acceptInputCandidate(
  input: CompilerInput,
  role: CompilerInputRole,
  trace: ResolverTrace,
): ParsedRead {
  trace.inputCandidates.push({
    input,
    decision: "accepted",
    role,
  });
  return {
    input,
    role,
  };
}

function rejectInputCandidate(
  input: CompilerInput,
  reason: string,
  trace: ResolverTrace,
): void {
  trace.inputCandidates.push({
    input,
    decision: "rejected",
    reason,
  });
  addDiagnostic(trace, {
    code: "input-candidate-rejected",
    message: reason,
    path: input.path,
    index: input.index,
    source: input.source,
  });
}

function resolveWrites(
  parsed: CompilerParseResult,
  reads: readonly ParsedRead[],
  options: CompilerResolverEffectiveOptions,
  trace: ResolverTrace,
): ResolvedWrite[] {
  return [
    ...resolvePrimaryWrites(parsed, reads, options, trace),
    ...resolveAssemblyListingWrites(parsed, reads, options, trace),
  ];
}

function resolvePrimaryWrites(
  parsed: CompilerParseResult,
  reads: readonly ParsedRead[],
  options: CompilerResolverEffectiveOptions,
  trace: ResolverTrace,
): ResolvedWrite[] {
  for (const output of parsed.outputCandidates) {
    addDiagnostic(trace, {
      code: "output-candidate-ignored",
      message: "output candidates are not resolved in this resolver stage",
      path: output.path,
      index: output.index,
      source: output.source,
    });
  }

  if (parsed.compilerMode.artifact === CompilerArtifact.None) {
    return [];
  }

  const explicitOutput = selectExplicitOutput(parsed, trace);
  if (explicitOutput !== undefined) {
    return resolveExplicitPrimaryOutput(
      parsed,
      explicitOutput,
      reads,
      options,
      trace,
    );
  }

  if (!options.writes.inferDefaultOutputs) {
    return [];
  }

  return resolveDefaultPrimaryOutput(parsed, reads, options, trace);
}

function selectExplicitOutput(
  parsed: CompilerParseResult,
  trace: ResolverTrace,
): CompilerOutput | undefined {
  const acceptedKinds = phaseOutputKinds(parsed.compilerMode.phase);
  let selected: CompilerOutput | undefined;

  for (const output of [...parsed.outputs].sort(
    (left, right) => left.index - right.index,
  )) {
    if (acceptedKinds.includes(output.kind)) {
      selected = output;
      continue;
    }

    addDiagnostic(trace, {
      code: "output-kind-ignored",
      message: `output kind ${output.kind} is not used for ${parsed.compilerMode.phase}`,
      path: output.path,
      index: output.index,
      source: output.source,
    });
  }

  return selected;
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

function resolveExplicitPrimaryOutput(
  parsed: CompilerParseResult,
  output: CompilerOutput,
  reads: readonly ParsedRead[],
  options: CompilerResolverEffectiveOptions,
  trace: ResolverTrace,
): ResolvedWrite[] {
  const relevantReads = primaryOutputReads(parsed, reads);
  const nameReads = primaryOutputNameReads(parsed, relevantReads);
  const paths = materializeOutputPaths(
    parsed.compilerMode.artifact,
    output.path,
    nameReads,
    options,
    trace,
  );
  return writesForPaths(paths, relevantReads);
}

function resolveDefaultPrimaryOutput(
  parsed: CompilerParseResult,
  reads: readonly ParsedRead[],
  options: CompilerResolverEffectiveOptions,
  trace: ResolverTrace,
): ResolvedWrite[] {
  switch (parsed.compilerMode.phase) {
    case CompilerPhase.Preprocess:
    case CompilerPhase.SyntaxOnly:
      return [];
    case CompilerPhase.Compile:
      return resolveDefaultCompileOutputs(parsed, reads, options, trace);
    case CompilerPhase.Link:
    case CompilerPhase.Archive:
    case CompilerPhase.RelocatableLink:
    case CompilerPhase.DeviceLink:
      return resolveDefaultSingleOutput(parsed, reads, options, trace);
  }
}

function resolveDefaultCompileOutputs(
  parsed: CompilerParseResult,
  reads: readonly ParsedRead[],
  options: CompilerResolverEffectiveOptions,
  trace: ResolverTrace,
): ResolvedWrite[] {
  const relevantReads = primaryOutputReads(parsed, reads);
  if (relevantReads.length === 0) {
    addDiagnostic(trace, {
      code: "default-output-missing-input",
      message: "compile output has no source input to name",
    });
    return [];
  }

  const extension = defaultArtifactExtension(
    parsed.compilerMode.artifact,
    options.outputConvention,
    trace,
  );
  if (extension === undefined) {
    return [];
  }

  return relevantReads.map((read) =>
    inferredWrite(
      pathStem(read.input.path) + extension,
      "default-output",
      [read],
      trace,
    ),
  );
}

function resolveDefaultSingleOutput(
  parsed: CompilerParseResult,
  reads: readonly ParsedRead[],
  options: CompilerResolverEffectiveOptions,
  trace: ResolverTrace,
): ResolvedWrite[] {
  const relevantReads = primaryOutputReads(parsed, reads);
  const firstRead = relevantReads[0];
  if (firstRead === undefined) {
    addDiagnostic(trace, {
      code: "default-output-missing-input",
      message: "single output has no input to name",
    });
    return [];
  }

  if (options.outputConvention === undefined) {
    addDiagnostic(trace, {
      code: "default-output-missing-convention",
      message: "cannot infer default output without output convention",
    });
    return [];
  }

  const path = defaultSingleOutputPath(
    parsed.compilerMode.artifact,
    firstRead.input.path,
    options.outputConvention,
  );

  return [inferredWrite(path, "default-output", relevantReads, trace)];
}

function defaultArtifactExtension(
  artifact: CompilerArtifact,
  convention: CompilerOutputConvention | undefined,
  trace: ResolverTrace,
): string | undefined {
  if (convention === undefined) {
    addDiagnostic(trace, {
      code: "default-output-missing-convention",
      message: "cannot infer default output without output convention",
    });
    return undefined;
  }

  const extension = artifactExtension(artifact, convention);
  if (extension === undefined) {
    addDiagnostic(trace, {
      code: "default-output-unsupported-artifact",
      message: `cannot infer default output for ${artifact}`,
    });
  }

  return extension;
}

function artifactExtension(
  artifact: CompilerArtifact,
  convention: CompilerOutputConvention,
): string | undefined {
  switch (artifact) {
    case CompilerArtifact.Object:
      return convention.object;
    case CompilerArtifact.Executable:
      return convention.executable;
    case CompilerArtifact.SharedLibrary:
      return convention.sharedLibrary;
    case CompilerArtifact.StaticLibrary:
      return convention.staticLibrary;
    case CompilerArtifact.Assembly:
      return ".s";
    case CompilerArtifact.LlvmIR:
      return ".ll";
    case CompilerArtifact.LlvmBitcode:
      return ".bc";
    case CompilerArtifact.Pch:
      return ".pch";
    case CompilerArtifact.Pcm:
      return ".pcm";
    case CompilerArtifact.Ptx:
      return ".ptx";
    case CompilerArtifact.Cubin:
      return ".cubin";
    case CompilerArtifact.None:
    case CompilerArtifact.PreprocessedSource:
    case CompilerArtifact.Unknown:
      return undefined;
  }
}

function defaultSingleOutputPath(
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

function primaryOutputReads(
  parsed: CompilerParseResult,
  reads: readonly ParsedRead[],
): readonly ParsedRead[] {
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

function primaryOutputNameReads(
  parsed: CompilerParseResult,
  reads: readonly ParsedRead[],
): readonly ParsedRead[] {
  if (parsed.compilerMode.phase === CompilerPhase.Compile) {
    return reads;
  }

  const firstRead = reads[0];
  return firstRead === undefined ? [] : [firstRead];
}

function materializeOutputPaths(
  artifact: CompilerArtifact,
  outputPath: string,
  nameReads: readonly ParsedRead[],
  options: CompilerResolverEffectiveOptions,
  trace: ResolverTrace,
): string[] {
  if (
    !options.writes.expandDirectoryOutputs ||
    !isDirectoryLike(outputPath) ||
    nameReads.length === 0
  ) {
    return [outputPath];
  }

  if (options.outputConvention === undefined) {
    addDiagnostic(trace, {
      code: "directory-output-missing-convention",
      message: "cannot expand directory output without output convention",
      path: outputPath,
    });
    return [outputPath];
  }

  const extension = artifactExtension(artifact, options.outputConvention);
  if (extension === undefined) {
    addDiagnostic(trace, {
      code: "directory-output-unsupported-artifact",
      message: `cannot expand directory output for ${artifact}`,
      path: outputPath,
    });
    return [outputPath];
  }

  return nameReads.map((read) =>
    fs.path.lexicalNormal(
      fs.path.joinAll(outputPath, pathStem(read.input.path) + extension),
    ),
  );
}

function resolveAssemblyListingWrites(
  parsed: CompilerParseResult,
  reads: readonly ParsedRead[],
  options: CompilerResolverEffectiveOptions,
  trace: ResolverTrace,
): ResolvedWrite[] {
  if (!options.writes.inferAssemblyListings) {
    return [];
  }

  const listingPaths = parsed.compilerActions.flatMap((action) =>
    action.kind === "emit-assembly-listing" ? [action.path] : [],
  );

  if (listingPaths.length === 0 || !phaseCanEmitAssemblyListing(parsed)) {
    return [];
  }

  const sourceReads = reads.filter((read) => read.role === "source");
  for (const path of [...listingPaths].reverse()) {
    if (path !== undefined) {
      return resolveAssemblyListingWritesByPath(path, sourceReads, trace);
    }
  }

  return sourceReads.map((read) =>
    inferredWrite(
      pathStem(read.input.path) + ".asm",
      "assembly-listing",
      [read],
      trace,
    ),
  );
}

function phaseCanEmitAssemblyListing(parsed: CompilerParseResult): boolean {
  switch (parsed.compilerMode.phase) {
    case CompilerPhase.Preprocess:
    case CompilerPhase.SyntaxOnly:
      return false;
    case CompilerPhase.Compile:
    case CompilerPhase.Link:
    case CompilerPhase.Archive:
    case CompilerPhase.RelocatableLink:
    case CompilerPhase.DeviceLink:
      return true;
  }
}

function resolveAssemblyListingWritesByPath(
  explicitPath: string,
  sourceReads: readonly ParsedRead[],
  trace: ResolverTrace,
): ResolvedWrite[] {
  if (isDirectoryLike(explicitPath)) {
    return sourceReads.map((read) =>
      inferredWrite(
        fs.path.lexicalNormal(
          fs.path.joinAll(explicitPath, pathStem(read.input.path) + ".asm"),
        ),
        "assembly-listing",
        [read],
        trace,
      ),
    );
  }

  if (sourceReads.length === 1) {
    return [explicitWrite(explicitPath, sourceReads)];
  }

  addDiagnostic(trace, {
    code: "assembly-listing-ambiguous-output",
    message: "single assembly listing path cannot name multiple source inputs",
    path: explicitPath,
  });

  return [];
}

function writesForPaths(
  paths: readonly string[],
  reads: readonly ParsedRead[],
): ResolvedWrite[] {
  if (paths.length === reads.length) {
    return paths.map((path, index) => explicitWrite(path, [reads[index]!]));
  }
  return paths.map((path) => explicitWrite(path, reads));
}

function inferredWrite(
  path: string,
  reason: CompilerInferredWrite["reason"],
  reads: readonly ParsedRead[],
  trace: ResolverTrace,
): ResolvedWrite {
  trace.inferredWrites.push({ path, reason });
  return {
    path,
    reads,
  };
}

function explicitWrite(
  path: string,
  reads: readonly ParsedRead[],
): ResolvedWrite {
  return {
    path,
    reads,
  };
}

function pathStem(path: string): string {
  const name = fs.path.filename(path);
  const ext = fs.path.extension(name);

  return name.slice(0, name.length - ext.length);
}

function isStreamPath(path: string): boolean {
  return path === "-";
}

function isDirectoryLike(path: string): boolean {
  return path.endsWith("/") || path.endsWith("\\");
}

function addDiagnostic(
  trace: ResolverTrace,
  diagnostic: CompilerResolveDiagnostic,
): void {
  trace.diagnostics.push(diagnostic);
}

/**
 * Resolves parsed compiler facts into visible file reads, writes, and dependency edges.
 */
export class CompilerCommandResolver {
  private readonly options: NormalizedResolverOptions;

  constructor(options: CompilerResolverOptions = {}) {
    this.options = {
      target: options.target,
      outputConvention: options.outputConvention,
      inputCandidates: options.inputCandidates,
      writes: {
        ...DEFAULT_WRITE_OPTIONS,
        ...options.writes,
      },
      debug: options.debug ?? false,
    };
  }

  resolve(parsed: CompilerParseResult): CompilerResolveResult {
    const effectiveOptions = buildEffectiveOptions(this.options, parsed);
    const trace = createTrace();
    const reads = collectReads(parsed, effectiveOptions, trace);
    const writes = resolveWrites(parsed, reads, effectiveOptions, trace);

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
        effectiveOptions,
        inputCandidates: trace.inputCandidates,
        inferredWrites: trace.inferredWrites,
        diagnostics: trace.diagnostics,
      };
    }

    return result;
  }
}
