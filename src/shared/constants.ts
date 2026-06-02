export const WIKI_DIR = '.wiki';
export const AGENT_DIR = '.scx-wiki-agent';
export const DB_NAME = 'index.db';
export const CACHE_DIR = 'cache';

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
