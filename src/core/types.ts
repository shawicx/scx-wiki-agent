export type Language = 'typescript' | 'javascript' | 'tsx' | 'jsx' | 'vue' | 'rust' | 'python' | 'go' | 'java' | 'kotlin' | 'css' | 'markdown' | 'json' | 'yaml' | 'unknown';

/** 文件证据作用域：production 供主叙事使用，test 供测试页与测试证据使用 */
export type SourceScope = 'production' | 'test';

/** 生产源码中的环境变量引用证据 */
export interface EnvVarEvidence {
  name: string;
  sensitive: boolean;
  filePaths: string[];
  /** 确定性用途证据（引用点相邻注释 / 缺省值字面量 / .env.example 注释）；无证据时缺省 */
  purpose?: string;
}

/** 源码中的限制常量证据 */
export interface ConstantEvidence {
  name: string;
  value: string;
  filePath: string;
  line?: number;
}

export type SymbolType = 'function' | 'class' | 'interface' | 'method' | 'variable' | 'import' | 'export';

export type RelationType =
  | 'calls' | 'imports' | 'exports' | 'injects' | 'extends'
  | 'implements' | 'uses' | 'references' | 'contains' | 'depends_on';
