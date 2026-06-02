export type Language = 'typescript' | 'javascript' | 'tsx' | 'jsx' | 'markdown' | 'json' | 'yaml' | 'unknown';

export type SymbolType = 'function' | 'class' | 'interface' | 'method' | 'variable' | 'import' | 'export';

export type ChunkType = 'code_symbol' | 'markdown_heading' | 'full_config';

export type RelationType =
  | 'calls' | 'imports' | 'exports' | 'injects' | 'extends'
  | 'implements' | 'uses' | 'references' | 'contains' | 'depends_on';

export interface Document {
  id: string;
  path: string;
  content: string;
  language: Language;
  hash: string;
  updatedAt: number;
}

export interface Chunk {
  id: string;
  documentId: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  chunkType: ChunkType;
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  language: Language;
  symbols: string[];
  symbolType: SymbolType | 'unknown';
  imports: string[];
  exports: string[];
  module: string;
  summary?: string;
}

export interface Symbol {
  id: string;
  name: string;
  type: SymbolType;
  filePath: string;
  startLine: number;
  endLine: number;
  scope: string | null;
  visibility: 'public' | 'private' | 'protected' | null;
}

export interface Relation {
  id: string;
  source: string;
  target: string;
  type: RelationType;
  filePath: string;
}

export interface ModuleInfo {
  id: string;
  name: string;
  paths: string[];
  symbols: string[];
  dependencies: string[];
  description?: string;
}

export type ProjectNodeType =
  | 'module' | 'service' | 'component' | 'page' | 'command'
  | 'agent' | 'tool' | 'workflow' | 'store' | 'api';

export interface ProjectNode {
  id: string;
  name: string;
  type: ProjectNodeType;
  filePath: string;
  startLine: number;
  endLine: number;
  metadata: Record<string, unknown>;
}
