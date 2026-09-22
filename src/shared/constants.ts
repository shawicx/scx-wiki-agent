export const WIKI_DIR = '.wiki';
export const AGENT_DIR = '.scx-wiki-agent';
export const CACHE_DIR = 'cache';

/** LLM 断流（输出达上限/流中途出错）自动续写轮数上限；每轮独立获得完整输出预算 */
export const WIKI_MAX_CONTINUATIONS = 2;

export const IGNORED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  AGENT_DIR,
  WIKI_DIR,
  '__pycache__',
  '.venv',
  'venv',
];

export const SUPPORTED_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx',
  '.mjs', '.cjs',
  '.md',
  '.json',
  '.yaml', '.yml',
  '.toml',
  '.env', '.env.example',
];

export const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
