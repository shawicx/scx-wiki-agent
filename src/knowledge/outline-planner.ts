/**
 * 章节树 LLM planner（outline-planner）：从图谱/扫描/README 数据提议仓库专属章节树。
 *
 * 哲学：LLM 提议、确定性机器裁决——产物必须过 validateOutline 才锁定生效。
 * 固定页清单与现有 topics 作为规划输入，防复述固定页职责与重复立题；
 * 文件锚点只能从 candidateFiles（扫描清单）中选取，校验器兜底剔除查无实据项。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CodebaseMemoryClient } from '../mcp/codebase-memory-client.js';
import type { ScanResult } from '../core/scanner.js';
import type { WikiPageGenerator } from './wiki-page-generator.js';
import type { TopicDefinition } from './topic-discovery.js';
import type { OutlineFileData } from './outline.js';
import { PAGE_REGISTRY } from './page-registry.js';
import { isTestPath } from '../shared/utils.js';

const SYSTEM_PROMPT = [
  '你是资深软件架构师，为代码仓库规划「仓库专属章节树」——wiki 固定页面之外的深度补充结构。',
  '',
  '规划规则：',
  '- 章必须有足够纵深的仓库特有主题（如某子系统的实现机制、某横切协作面）；',
  '  单一模块的职责说明不要立章（modules 页已覆盖），固定页面已覆盖的职责（见 fixedPages）禁止复述',
  '- 禁止与现有主题页（topics 数据）重复立题：要么吸收为章节的一页，要么避开',
  '- 每章 2-6 页，每页聚焦一个可独立成文的协作面或机制',
  '- 建议总量 3-6 章、6-12 页（上限 8 章 16 页，宁缺毋滥；证据不足以立章的主题直接放弃）',
  '- 页的 files 锚点只能从 candidateFiles 中选取，每页 3-12 个，必须逐字真实存在',
  '- brief 必须点名数据中的真实符号名与文件，说明该页要写什么、覆盖哪些要点（2-6 句）',
  '- 章节与页的标题用中文；id 用 kebab-case（如 terminal-rendering）',
  '',
  '输出格式（严格遵守，只输出 JSON 本体，无围栏、无任何说明文字）：',
  '{"chapters":[{"id":"","title":"","summary":"","pages":[{"id":"","title":"","brief":"","files":[],"modules":[],"symbols":[]}]}]}',
].join('\n');

/** 每模块候选文件上限（锚点候选池规模控制） */
const MAX_FILES_PER_MODULE = 15;
/** 全局候选文件上限 */
const MAX_CANDIDATE_FILES = 90;

export class OutlinePlanner {
  constructor(
    private client: CodebaseMemoryClient,
    private scanResult: ScanResult,
  ) {}

  /**
   * 提议章节树。feedback 非空时为带剔除原因的反馈重试。
   * LLM 输出不可解析返回 null（不抛异常）。
   */
  async plan(
    generator: WikiPageGenerator,
    topics: TopicDefinition[],
    feedback?: string,
  ): Promise<OutlineFileData | null> {
    const raw = await generator.plan(SYSTEM_PROMPT, JSON.stringify(this.buildInputs(topics, feedback), null, 2));
    const parsed = parseOutlineJson(raw);
    if (parsed === null) return null;
    return {
      version: 1,
      generator: 'outline-planner',
      generatedAt: new Date().toISOString(),
      // 结构合法性由 validateOutline 裁决（宽松透传）
      chapters: parsed.chapters as unknown as OutlineFileData['chapters'],
    };
  }

  /** 确定性组装规划输入（全部真实数据，无臆造字段） */
  private buildInputs(topics: TopicDefinition[], feedback?: string): Record<string, unknown> {
    const arch = this.client.getArchitecture();
    const productionFiles = this.scanResult.files
      .map(f => f.relativePath)
      .filter(p => !isTestPath(p));

    // 每模块文件分组（候选锚点池）
    const filesByModule = new Map<string, string[]>();
    const ungrouped: string[] = [];
    for (const file of productionFiles) {
      const mod = arch.packages.find(pkg => file.includes(`/${pkg.name}/`));
      if (mod) {
        const list = filesByModule.get(mod.name) ?? [];
        list.push(file);
        filesByModule.set(mod.name, list);
      } else {
        ungrouped.push(file);
      }
    }
    const candidateFiles = [...filesByModule.entries()]
      .flatMap(([mod, files]) => files.slice(0, MAX_FILES_PER_MODULE).map(f => ({ module: mod, file: f })))
      .slice(0, MAX_CANDIDATE_FILES);
    if (ungrouped.length > 0 && candidateFiles.length < MAX_CANDIDATE_FILES) {
      candidateFiles.push(...ungrouped.slice(0, MAX_CANDIDATE_FILES - candidateFiles.length).map(f => ({ module: '', file: f })));
    }

    // 高复杂度符号（按模块分组，供 brief 点名真实符号）
    const symQ = this.client.queryGraph(
      `MATCH (n) WHERE n.is_test = false AND n.docstring IS NOT NULL AND n.label IN ['Class', 'Method', 'Function']
       RETURN n.name AS name, n.file_path AS file, n.docstring AS doc, n.complexity AS cx
       ORDER BY n.complexity DESC LIMIT 60`,
    );
    const symbolsByModule = new Map<string, Array<{ name: string; doc: string }>>();
    for (const row of symQ.rows) {
      const file = (row[1] as string) ?? '';
      if (!file || isTestPath(file)) continue;
      const mod = arch.packages.find(pkg => file.includes(`/${pkg.name}/`))?.name ?? '';
      const list = symbolsByModule.get(mod) ?? [];
      list.push({ name: row[0] as string, doc: String(row[2] ?? '').slice(0, 80) });
      symbolsByModule.set(mod, list);
    }

    return {
      packageDescription: this.readPackageDescription(),
      readmeExcerpt: this.readReadmeExcerpt(),
      modules: [...filesByModule.entries()].map(([name, files]) => ({
        name,
        fileCount: files.length,
        symbols: (symbolsByModule.get(name) ?? []).slice(0, 8),
      })),
      clusters: arch.clusters.map(c => ({
        label: c.label, members: c.members, topNodes: c.top_nodes.slice(0, 5),
      })),
      fixedPages: PAGE_REGISTRY
        .filter(p => p.name !== 'readme')
        .map(p => ({ name: p.name, answer: p.answer })),
      topics: topics.map(t => ({ title: t.title, files: t.files })),
      candidateFiles,
      ...(feedback ? { 校验剔除反馈: feedback } : {}),
    };
  }

  private readPackageDescription(): string {
    try {
      const pkgPath = join(this.scanResult.rootDir, 'package.json');
      if (!existsSync(pkgPath)) return '';
      return String(JSON.parse(readFileSync(pkgPath, 'utf-8')).description ?? '');
    } catch {
      return '';
    }
  }

  private readReadmeExcerpt(): string {
    try {
      const readmePath = join(this.scanResult.rootDir, 'README.md');
      if (!existsSync(readmePath)) return '';
      return readFileSync(readmePath, 'utf-8').slice(0, 1500);
    } catch {
      return '';
    }
  }
}

interface ParsedOutline {
  chapters: Array<Record<string, unknown>>;
}

/** 剥离围栏与说明残骸后解析 JSON；不可解析返回 null */
function parseOutlineJson(raw: string): ParsedOutline | null {
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fence) text = fence[1].trim();
  // 容错：截掉 JSON 本体前的说明行（以首个 { 起始）
  const brace = text.indexOf('{');
  if (brace > 0) text = text.slice(brace);
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as ParsedOutline).chapters)) return null;
    return parsed as ParsedOutline;
  } catch {
    return null;
  }
}
