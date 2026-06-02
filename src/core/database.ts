import BetterSqlite3 from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

export type DatabaseConnection = BetterSqlite3.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT NOT NULL,
  hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  chunk_type TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS symbols (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  scope TEXT,
  visibility TEXT
);

CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  type TEXT NOT NULL,
  file_path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  paths TEXT NOT NULL DEFAULT '[]',
  symbols TEXT NOT NULL DEFAULT '[]',
  dependencies TEXT NOT NULL DEFAULT '[]',
  description TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(content, chunk_id UNINDEXED);

CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path);
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_file_path ON chunks(file_path);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_file_path ON symbols(file_path);
CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source);
CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target);
CREATE INDEX IF NOT EXISTS idx_modules_name ON modules(name);
`;

export function createDatabase(dbPath: string): DatabaseConnection {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  runMigrations(db);

  return db;
}

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: [
      'ALTER TABLE relations ADD COLUMN call_line INTEGER',
      'CREATE INDEX IF NOT EXISTS idx_relations_call_line ON relations(call_line)',
    ].join(';'),
  },
];

function runMigrations(db: DatabaseConnection): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');
  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null } | undefined;
  const current = row?.v ?? 0;

  for (const m of MIGRATIONS) {
    if (m.version > current) {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(m.version);
    }
  }
}

export function closeDatabase(db: DatabaseConnection): void {
  db.close();
}
