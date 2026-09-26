export type Language = 'typescript' | 'javascript' | 'tsx' | 'jsx' | 'vue' | 'rust' | 'css' | 'markdown' | 'json' | 'yaml' | 'unknown';

export type SymbolType = 'function' | 'class' | 'interface' | 'method' | 'variable' | 'import' | 'export';

export type RelationType =
  | 'calls' | 'imports' | 'exports' | 'injects' | 'extends'
  | 'implements' | 'uses' | 'references' | 'contains' | 'depends_on';
