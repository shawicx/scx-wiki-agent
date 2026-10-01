/**
 * db-schema 页 context（backend）：Prisma/TypeORM/Drizzle/SQL 数据模型正则解析。
 * 只认真实 schema 构造；解析不出的 ORM（未知方言）只列文件锚点不猜字段；
 * 0 个模型 → null（页面跳过）。
 */

import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import type { DbSchemaContext } from '../types.js';
import type { ContextDeps } from './shared.js';
import { readSourceCached } from './shared.js';

type Model = DbSchemaContext['models'][number];
const FIELD_CAP = 15;
const MODEL_CAP = 60;

/** 直接遍历仓库找 .prisma/.sql（不在 FileScanner 扫描清单内），深度 ≤3 */
function findSchemaFiles(rootDir: string, exts: string[]): string[] {
  const out: string[] = [];
  const skip = new Set(['node_modules', '.git', 'dist', '.wiki', '.scx-wiki-agent']);
  const walk = (dir: string, depth: number) => {
    if (depth > 3 || out.length >= 40) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch { return; }
    for (const e of entries) {
      if (skip.has(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (exts.some(x => e.name.endsWith(x))) out.push(relative(rootDir, full).replace(/\\/g, '/'));
    }
  };
  walk(rootDir, 0);
  return out;
}

function readRel(deps: ContextDeps, rel: string): string | null {
  const cached = readSourceCached(deps, rel);
  if (cached !== null) return cached;
  try {
    return readFileSync(join(deps.scanResult.rootDir, rel), 'utf-8');
  } catch {
    return null;
  }
}

/** Prisma schema.prisma：model X { field Type @attr ... } */
function scanPrisma(rel: string, source: string, out: Model[]): void {
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^model\s+(\w+)\s*\{/);
    if (!m) continue;
    const fields: Model['fields'] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*\}/.test(lines[j])) { i = j; break; }
      if (fields.length >= FIELD_CAP) continue;
      const f = lines[j].match(/^\s{2,}(\w+)\s+([\w\[\]?]+)(.*)$/);
      if (f && !f[1].startsWith('@')) {
        fields.push({ name: f[1], type: f[2], attrs: f[3].trim().slice(0, 60) });
      }
    }
    if (out.length < MODEL_CAP) out.push({ name: m[1], kind: 'prisma', file: rel, line: i + 1, fields });
  }
}

/** TypeORM：@Entity class + @Column 字段装饰器 */
function scanTypeorm(rel: string, source: string, out: Model[]): void {
  const entity = source.match(/@Entity\s*(?:\(\s*['"`]?([\w-]*)['"`]?\s*\))?\s*\n?\s*export\s+(?:abstract\s+)?class\s+(\w+)/);
  if (!entity) return;
  const lines = source.split('\n');
  const fields: Model['fields'] = [];
  for (let i = 0; i < lines.length && fields.length < FIELD_CAP; i++) {
    const col = lines[i].match(/@(Column|PrimaryColumn|PrimaryGeneratedColumn|CreateDateColumn|UpdateDateColumn)\s*(?:\(\s*(\{[^)]*)\)?)/);
    if (col) {
      const next = lines.slice(i + 1, i + 3).join('\n').match(/^\s*(\w+)\s*[?!]\s*:\s*([\w\[\]<>?|.]+)/m);
      if (next) fields.push({ name: next[1], type: next[2], attrs: col[1] });
    }
  }
  out.push({
    name: entity[2], kind: 'typeorm', file: rel, line: 1, fields,
  });
}

/** Drizzle：pgTable('name', { field: type(...) }) */
function scanDrizzle(rel: string, source: string, out: Model[], line: number): void {
  const name = source.match(/['"`](\w+)['"`]\s*,\s*\{/);
  if (!name) return;
  const body = source.slice(source.indexOf('{'));
  const fields: Model['fields'] = [];
  for (const f of body.matchAll(/^\s{2,}(\w+)\s*:\s*([\w]+)\(([^)]*)\)/gm)) {
    if (fields.length >= FIELD_CAP) break;
    fields.push({ name: f[1], type: f[2], attrs: f[3].trim().slice(0, 60) });
  }
  if (out.length < MODEL_CAP) out.push({ name: name[1], kind: 'drizzle', file: rel, line, fields });
}

/** SQL：CREATE TABLE x ( col TYPE ...) */
function scanSql(rel: string, source: string, out: Model[]): void {
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[]?([\w.]+)[`"\]]?\s*\(/i);
    if (!m) continue;
    const fields: Model['fields'] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const close = lines[j].match(/^\s*\)/);
      if (close) break;
      if (fields.length >= FIELD_CAP) continue;
      const f = lines[j].match(/^\s*[`"[]?(\w+)[`"\]]?\s+([A-Za-z]+[\w()]*)\s*(.*)$/);
      if (f && !/^(?:PRIMARY|FOREIGN|UNIQUE|CONSTRAINT|INDEX|KEY|CHECK|CREATE)/i.test(f[1])) {
        fields.push({ name: f[1], type: f[2], attrs: f[3].trim().replace(/,$/, '').slice(0, 60) });
      }
    }
    if (out.length < MODEL_CAP) out.push({ name: m[1].split('.').pop()!, kind: 'sql', file: rel, line: i + 1, fields });
  }
}

export function buildDbSchemaContext(deps: ContextDeps): DbSchemaContext | null {
  const models: Model[] = [];
  const kinds = new Set<string>();

  // .prisma / .sql：不在 FileScanner 扫描清单内，直接遍历仓库
  for (const rel of findSchemaFiles(deps.scanResult.rootDir, ['.prisma', '.sql'])) {
    const src = readRel(deps, rel);
    if (src === null) continue;
    const before = models.length;
    if (rel.endsWith('.prisma')) scanPrisma(rel, src, models);
    else scanSql(rel, src, models);
    if (models.length > before) kinds.add(rel.endsWith('.prisma') ? 'prisma' : 'sql');
  }

  for (const f of deps.scanResult.files) {
    const rel = f.relativePath;
    if (!/\.(?:ts|js)$/.test(rel) || /\.test\.|\.spec\./.test(rel)) continue;
    const src = readSourceCached(deps, rel);
    if (src === null) continue;
    if (/@Entity\s*\(/.test(src)) {
      const before = models.length;
      scanTypeorm(rel, src, models);
      if (models.length > before) kinds.add('typeorm');
    }
    if (/(?:pgTable|mysqlTable|sqliteTable)\s*\(/.test(src)) {
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/(?:pgTable|mysqlTable|sqliteTable)\s*\(/.test(lines[i])) {
          const before = models.length;
          scanDrizzle(rel, lines.slice(i, i + 80).join('\n'), models, i + 1);
          if (models.length > before) kinds.add('drizzle');
        }
      }
    }
  }

  if (models.length === 0) return null;
  return { detectedKinds: [...kinds], models };
}
