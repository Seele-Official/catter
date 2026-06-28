import type { Edge } from "../../model.js";
import type {
  CompilerArtifact,
  CompilerDialect,
  CompilerInput,
  CompilerPhase,
} from "../types.js";

/** Internal parser result ready to be wrapped as `CompilerAnalysis`. */
export type CompilerParseResult = {
  dialect: CompilerDialect;
  phase: CompilerPhase;
  artifact: CompilerArtifact;
  inputs: CompilerInput[];
  reads: string[];
  writes: string[];
  edges: Edge[];
};
