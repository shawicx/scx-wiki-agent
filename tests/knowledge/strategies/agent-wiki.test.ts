import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'better-sqlite3';
import { createDatabase, closeDatabase } from '../../../src/core/database.js';
import { AgentWikiStrategy } from '../../../src/knowledge/strategies/agent-wiki.js';
import { join } from 'path';
import { mkdirSync, rmSync } from 'fs';
import type { ScanResult } from '../../../src/core/scanner.js';

const tmpDir = join(process.cwd(), '.test-agent-wiki-tmp');

function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    rootDir: '/tmp/test-project',
    files: [],
    techStack: ['langgraph'],
    projectType: 'agent',
    hasTypeScript: true,
    sourceDirs: ['src'],
    ...overrides,
  };
}

describe('AgentWikiStrategy', () => {
  let db: Database;

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    db = createDatabase(join(tmpDir, 'test.db'));

    // Seed agent symbols
    db.prepare(
      "INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run('sym-agent', 'ResearchAgent', 'class', 'src/agents/research.ts', 1, 50, null, null);

    // Seed tool symbols
    db.prepare(
      "INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run('sym-tool', 'searchTool', 'function', 'src/tools/search.ts', 1, 20, null, null);

    // Seed reference relations
    db.prepare(
      "INSERT INTO relations (id, source, target, type, file_path) VALUES (?, ?, ?, ?, ?)",
    ).run('rel-1', 'ResearchAgent', 'searchTool', 'references', 'src/agents/research.ts');
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should generate exactly four pages', () => {
    const strategy = new AgentWikiStrategy(db, makeScanResult());
    const pages = strategy.generatePages();

    expect(pages).toHaveLength(4);
    expect(pages.map((p) => p.filename)).toEqual([
      'agents.md',
      'tools.md',
      'workflows.md',
      'memory.md',
    ]);
  });

  it('should include ResearchAgent in agents.md', () => {
    const strategy = new AgentWikiStrategy(db, makeScanResult());
    const pages = strategy.generatePages();
    const agentsPage = pages.find((p) => p.filename === 'agents.md')!;

    expect(agentsPage.content).toContain('# Agents');
    expect(agentsPage.content).toContain('ResearchAgent');
  });

  it('should include searchTool in tools.md', () => {
    const strategy = new AgentWikiStrategy(db, makeScanResult());
    const pages = strategy.generatePages();
    const toolsPage = pages.find((p) => p.filename === 'tools.md')!;

    expect(toolsPage.content).toContain('# Tools');
    expect(toolsPage.content).toContain('searchTool');
  });

  it('should show reference relations in workflows.md', () => {
    const strategy = new AgentWikiStrategy(db, makeScanResult());
    const pages = strategy.generatePages();
    const workflowsPage = pages.find((p) => p.filename === 'workflows.md')!;

    expect(workflowsPage.content).toContain('# Workflows');
    expect(workflowsPage.content).toContain('ResearchAgent');
    expect(workflowsPage.content).toContain('searchTool');
  });

  it('should generate static memory.md content', () => {
    const strategy = new AgentWikiStrategy(db, makeScanResult());
    const pages = strategy.generatePages();
    const memoryPage = pages.find((p) => p.filename === 'memory.md')!;

    expect(memoryPage.content).toContain('# Memory Management');
    expect(memoryPage.content).toContain('Short-term Memory');
    expect(memoryPage.content).toContain('Long-term Memory');
  });

  it('should handle empty database gracefully', () => {
    const freshDb = createDatabase(join(tmpDir, 'empty.db'));
    const strategy = new AgentWikiStrategy(freshDb, makeScanResult());
    const pages = strategy.generatePages();

    expect(pages).toHaveLength(4);
    expect(pages[0].content).toContain('No agent symbols found.');
    expect(pages[1].content).toContain('No tool symbols found.');
    expect(pages[2].content).toContain('No reference relations found.');
    // memory.md is always static
    expect(pages[3].content).toContain('# Memory Management');

    closeDatabase(freshDb);
  });
});
