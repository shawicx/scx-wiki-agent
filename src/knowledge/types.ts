// src/knowledge/types.ts

import type { SymbolType, RelationType } from '../core/types.js';

/** Context for overview page */
export interface OverviewContext {
  projectType: string;
  hasTypeScript: boolean;
  fileCount: number;
  techStack: string[];
  sourceDirs: string[];
  entryFiles: Array<{ name: string; path: string }>;
  topSymbols: Array<{ name: string; type: SymbolType }>;
}

/** Module summary for architecture and modules pages */
export interface ModuleSummary {
  name: string;
  files: string[];
  symbols: Array<{ name: string; type: SymbolType }>;
  fileSymbols: Array<{ file: string; symbols: Array<{ name: string; type: SymbolType }> }>;
  outgoingRelations: Array<{ target: string; type: RelationType }>;
  incomingRelations: Array<{ source: string; type: RelationType }>;
  codeSnippets: Array<{ symbolName: string; content: string; startLine: number }>;
}

/** Context for architecture page */
export interface ArchitectureContext {
  modules: ModuleSummary[];
  interModuleRelations: Array<{
    source: string;
    target: string;
    type: RelationType;
  }>;
}

/** A participant in a sequence diagram (function/class/module) */
export interface SequenceParticipant {
  name: string;
  type: SymbolType;
  filePath: string;
}

/** A message between participants in a sequence diagram */
export interface SequenceMessage {
  from: string;
  to: string;
  label: string;
  callLine: number;
  filePath: string;
}

/** A traced execution sequence from entry to terminal calls */
export interface ExecutionSequence {
  name: string;
  entrySymbol: string;
  participants: SequenceParticipant[];
  messages: SequenceMessage[];
}

/** Context for data-flow page */
export interface DataFlowContext {
  sequences: ExecutionSequence[];
}

/**
 * @deprecated Use ExecutionSequence instead
 */
export interface PipelineStep {
  symbol: string;
  type: SymbolType;
  filePath: string;
  startLine: number;
  codeSnippet: string;
}

/**
 * @deprecated Use ExecutionSequence instead
 */
export interface ExecutionPipeline {
  name: string;
  entrySymbol: string;
  steps: PipelineStep[];
}

/** Context for modules page */
export interface ModulesContext {
  modules: ModuleSummary[];
}

/** Context for api page */
export interface ApiContext {
  commands: Array<{
    name: string;
    filePath: string;
    startLine: number;
    description: string;
  }>;
  exportedFunctions: Array<{
    name: string;
    filePath: string;
    startLine: number;
  }>;
  frameworkNodes: Array<{
    name: string;
    type: string;
    filePath: string;
    startLine: number;
    metadata: Record<string, unknown>;
  }>;
}

/** Context for business page */
export interface BusinessContext {
  services: Array<{
    name: string;
    filePath: string;
    methods: Array<{ name: string; visibility: string | null }>;
    dependencies: Array<{ target: string; type: RelationType }>;
    codeSnippet: string;
  }>;
}

/** Detected design pattern */
export interface DesignPattern {
  pattern: string;
  evidence: string[];
  files: string[];
}

/** Context for design-decisions page */
export interface DesignDecisionsContext {
  patterns: DesignPattern[];
  techChoices: Array<{
    technology: string;
    category: string;
    evidence: string[];
  }>;
}

/** Context for glossary page */
export interface GlossaryContext {
  symbols: Array<{
    name: string;
    type: SymbolType;
    filePath: string;
    scope: string | null;
  }>;
}

/** Context for onboarding page */
export interface OnboardingContext {
  projectType: string;
  techStack: string[];
  entryFiles: Array<{ name: string; path: string }>;
  sourceDirs: string[];
  hasTypeScript: boolean;
  packageManager: string;
  nodeVersion: string;
  cliCommands: Array<{ name: string; description: string }>;
}

/** Context for troubleshooting page */
export interface TroubleshootingContext {
  projectType: string;
  techStack: string[];
  modules: Array<{ name: string }>;
}

/** Union type for all page contexts */
export type WikiPageContext =
  | OverviewContext
  | ArchitectureContext
  | DataFlowContext
  | ModulesContext
  | ApiContext
  | BusinessContext
  | DesignDecisionsContext
  | GlossaryContext;

/** Build options for wiki generation */
export interface WikiBuildOptions {
  model?: string;
  baseURL?: string;
  apiKey?: string;
  noLlm?: boolean;
  pages?: string[];
  onChunk?: (filename: string, text: string) => void;
}