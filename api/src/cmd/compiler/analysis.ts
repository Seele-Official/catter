import { Analysis } from "../model.js";
import type { Analysis as AnyAnalysis, Analyzer, Edge } from "../model.js";
import { identifyCompilerCommand } from "./identify.js";
import { parseCompilerCommand } from "./parsers/index.js";
import {
  resolveCompilerEdges,
  resolveLegacyCmdType,
  resolveOutputs,
} from "./parsers/clang.js";
import type {
  CompilerArtifact,
  CompilerDialect,
  CompilerExe,
  CompilerInput,
  CompilerPhase,
  CompilerStyle,
  CompilerType,
  CommandModel,
} from "./types.js";
import { unwrapCompilerCommand } from "./unwrap.js";

function analyzeCompilerModel(
  cmd: readonly string[],
): CommandModel | undefined {
  const unwrapped = unwrapCompilerCommand(cmd);
  const identity = identifyCompilerCommand(unwrapped.argv);
  if (identity === undefined) {
    return undefined;
  }

  return parseCompilerCommand(unwrapped.argv, identity);
}

export class CompilerAnalysis extends Analysis<CompilerExe> {
  static readonly key = "compiler";

  static supports(cmd: readonly string[]): boolean {
    return analyzeCompilerModel(cmd) !== undefined;
  }

  static analyze(cmd: readonly string[]): CompilerAnalysis | undefined {
    return CompilerAnalysis.supports(cmd)
      ? new CompilerAnalysis(cmd)
      : undefined;
  }

  static from(analysis: AnyAnalysis | undefined): CompilerAnalysis | undefined {
    return analysis instanceof CompilerAnalysis ? analysis : undefined;
  }

  readonly compiler: CompilerExe;
  readonly dialect: CompilerDialect;
  readonly phase: CompilerPhase;
  readonly artifact: CompilerArtifact;
  readonly type: CompilerType | undefined;
  readonly style: CompilerStyle;
  readonly inputItems: CompilerInput[];

  private readonly edgeList: Edge[];

  constructor(cmd: readonly string[]) {
    const model = analyzeCompilerModel(cmd);
    if (model === undefined) {
      throw new Error("compiler command analysis required");
    }

    const produce = resolveOutputs(model);
    super(
      model.compiler,
      model.inputs.map((input) => input.path),
      produce,
    );

    this.compiler = model.compiler;
    this.dialect = model.dialect;
    this.phase = model.phase;
    this.artifact = model.artifact;
    this.type = resolveLegacyCmdType(model);
    this.style = model.style;
    this.inputItems = model.inputs.map((input) => ({ ...input }));
    this.edgeList = resolveCompilerEdges(model, produce).map((entry) => ({
      output: entry.output,
      inputs: [...entry.inputs],
    }));
  }

  inputEntries(): CompilerInput[] {
    return this.inputItems.map((input) => ({ ...input }));
  }

  inputs(): string[] {
    return [...this.consume];
  }

  sourceInputs(): string[] {
    return this.inputItems
      .filter((input) => input.kind === "source")
      .map((input) => input.path);
  }

  outputs(): string[] {
    return [...this.produce];
  }

  override edges(): Edge[] {
    return this.edgeList.map((entry) => ({
      output: entry.output,
      inputs: [...entry.inputs],
    }));
  }
}

const _compilerAnalyzerCheck: Analyzer<CompilerAnalysis> = CompilerAnalysis;
