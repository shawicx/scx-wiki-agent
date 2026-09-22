/**
 * 章节树（outline）：仓库自适应文档结构的锁定数据契约与确定性校验器。
 *
 * 与 topics.json 的分工（共存，不迁移）：
 * - topics 是无 LLM 的确定性保底（跨模块协作面），--no-llm 下仍可用；
 * - outline 是 LLM 提议 / 手工编辑的增强层（章 > 页 两级树，深度由类型系统强制）。
 *
 * 校验哲学：坏 outline 降级不失败——无效页剔除 → 空章剔除 → 全空则整体不生效，
 * 固定 PageRegistry 页面照常构建。所有剔除与告警进 OutlineReport 供构建报告呈现。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isTestPath } from '../shared/utils.js';

export interface OutlinePage {
  id: string;
  title: string;
  /** 写作简报：本页覆盖要点、真实符号名、建议小节结构 */
  brief: string;
  /** 依赖文件（硬锚点：校验后须全部真实存在且非测试路径） */
  files: string[];
  /** 相关模块名（软引导：未知模块剔除并告警） */
  modules?: string[];
  /** 相关符号名（软引导：查无实据剔除并告警） */
  symbols?: string[];
}

export interface OutlineChapter {
  id: string;
  title: string;
  /** 一句话章节职责 */
  summary: string;
  pages: OutlinePage[];
}

export interface OutlineFileData {
  version: 1;
  /** outline-planner | manual（手工编辑后建议改 manual，防 --refresh 覆盖时误判） */
  generator: string;
  generatedAt: string;
  chapters: OutlineChapter[];
}

/** 校验参考集（调用方从 scanResult + getArchitecture 组装，校验器零 IO） */
export interface OutlineKnown {
  files: Set<string>;
  modules: Set<string>;
  symbols: Set<string>;
}

export interface OutlineDrop {
  /** 章 id；page 为空表示整章剔除 */
  chapter: string;
  page?: string;
  title: string;
  reasons: string[];
}

export type OutlineWarningCode = 'W1' | 'W2' | 'W3' | 'W4' | 'W5';

export interface OutlineWarning {
  code: OutlineWarningCode;
  /** chapter 或 chapter/page 标识 */
  target: string;
  message: string;
}

export interface OutlineReport {
  /** 校验后的净树；chapters=[] 时 outline 不生效（固定页照常构建） */
  chapters: OutlineChapter[];
  drops: OutlineDrop[];
  warnings: OutlineWarning[];
  /** 结构层面不可解析（非坏 JSON——那是 loadOutline 返回 null） */
  unparsable: boolean;
}

const OUTLINE_FILE = 'outline.json';

export const MAX_CHAPTERS = 8;
export const MAX_PAGES_PER_CHAPTER = 6;
export const MAX_OUTLINE_PAGES = 16;
/** 与主题页 MIN_TOPIC_FILES 对齐：防章节页天然薄证据 */
export const MIN_PAGE_FILES = 3;
export const MAX_PAGE_FILES = 12;

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const MAX_TITLE_LEN = 80;
const MAX_SUMMARY_LEN = 200;
const MAX_BRIEF_LEN = 2000;

/** 页跨模块数超过该值视为杂烩页（W2） */
const MAX_SPAN_MODULES = 3;
/** 页间文件 Jaccard 重叠超过该值视为内容重复（W4） */
const OVERLAP_RATIO = 0.5;

/** 读取 outline.json；文件不存在或 JSON 不可解析返回 null */
export function loadOutline(agentDir: string): unknown | null {
  const file = join(agentDir, OUTLINE_FILE);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveOutline(agentDir: string, data: OutlineFileData): void {
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, OUTLINE_FILE), JSON.stringify(data, null, 2), 'utf-8');
}

function clampText(text: unknown, max: number): string {
  if (typeof text !== 'string') return '';
  return text.trim().slice(0, max);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * 确定性校验：宽松解析结构 → 逐页规则裁决 → 净树 + 剔除/告警清单。
 *
 * Error 级（E1-E4）剔除对象（页 → 章 → 整体），Warn 级保留进报告：
 * - E1 id 格式与唯一性；E2 文件锚点真实性/数量；E3 数量上限；E4 文本完整性
 * - W1 章 <2 页；W2 页跨模块过多；W3 查无实据项剔除；W4 页间文件重叠；W5 标题重复
 */
export function validateOutline(raw: unknown, known: OutlineKnown): OutlineReport {
  const report: OutlineReport = { chapters: [], drops: [], warnings: [], unparsable: false };

  if (!isOutlineShape(raw)) {
    report.unparsable = true;
    return report;
  }
  const data = raw as OutlineFileData;

  const seenChapterIds = new Set<string>();
  const seenTitles = new Set<string>();
  let chapterBudget = MAX_CHAPTERS;
  let pageBudget = MAX_OUTLINE_PAGES;

  for (const rawChapter of data.chapters) {
    const chDrop = (reasons: string[]) =>
      report.drops.push({ chapter: String(rawChapter?.id ?? '(无 id)'), title: String(rawChapter?.title ?? ''), reasons });

    if (chapterBudget <= 0) {
      chDrop([`章数超过上限 ${MAX_CHAPTERS}`]);
      continue;
    }

    const id = typeof rawChapter?.id === 'string' ? rawChapter.id : '';
    const title = clampText(rawChapter?.title, MAX_TITLE_LEN);
    const chapterReasons: string[] = [];
    if (!ID_RE.test(id)) chapterReasons.push(`章 id "${id}" 不符合 kebab-case 格式`);
    if (seenChapterIds.has(id)) chapterReasons.push(`章 id "${id}" 重复`);
    if (!title) chapterReasons.push('章 title 为空');
    if (chapterReasons.length > 0) {
      chDrop(chapterReasons);
      continue;
    }

    const keptPages: OutlinePage[] = [];
    for (const rawPage of rawChapter.pages) {
      const overTotal = pageBudget - keptPages.length <= 0;
      if (overTotal || keptPages.length >= MAX_PAGES_PER_CHAPTER) {
        report.drops.push({
          chapter: id, page: String(rawPage?.id ?? '(无 id)'), title: String(rawPage?.title ?? ''),
          reasons: [overTotal ? `章节页总量超过上限 ${MAX_OUTLINE_PAGES}` : `章内页数超过上限 ${MAX_PAGES_PER_CHAPTER}`],
        });
        continue;
      }

      const reasons: string[] = [];
      const pageId = typeof rawPage?.id === 'string' ? rawPage.id : '';
      const pageTitle = clampText(rawPage?.title, MAX_TITLE_LEN);
      const brief = clampText(rawPage?.brief, MAX_BRIEF_LEN);
      if (!ID_RE.test(pageId)) reasons.push(`页 id "${pageId}" 不符合 kebab-case 格式`);
      if (keptPages.some(p => p.id === pageId)) reasons.push(`页 id "${pageId}" 章内重复`);
      if (!pageTitle) reasons.push('页 title 为空');
      if (!brief) reasons.push('页 brief 为空');

      const rawFiles = stringArray(rawPage?.files);
      const validFiles = [...new Set(rawFiles.filter(f => known.files.has(f) && !isTestPath(f)))];
      const removedFiles = rawFiles.filter(f => !known.files.has(f) || isTestPath(f));
      if (removedFiles.length > 0) {
        report.warnings.push({
          code: 'W3', target: `${id}/${pageId}`,
          message: `剔除查无实据的文件锚点：${removedFiles.slice(0, 3).join('、')}${removedFiles.length > 3 ? ` 等 ${removedFiles.length} 个` : ''}`,
        });
      }
      if (validFiles.length < MIN_PAGE_FILES) {
        reasons.push(`有效锚点文件 ${validFiles.length} 个，不足 ${MIN_PAGE_FILES}`);
      }
      const files = validFiles.slice(0, MAX_PAGE_FILES);
      if (validFiles.length > MAX_PAGE_FILES) {
        report.warnings.push({
          code: 'W3', target: `${id}/${pageId}`,
          message: `文件锚点超过 ${MAX_PAGE_FILES} 个，截断保留前 ${MAX_PAGE_FILES} 个`,
        });
      }

      if (reasons.length > 0) {
        report.drops.push({ chapter: id, page: pageId, title: pageTitle, reasons });
        continue;
      }

      const modules = stringArray(rawPage?.modules).filter(m => known.modules.has(m));
      const unknownModules = stringArray(rawPage?.modules).filter(m => !known.modules.has(m));
      if (unknownModules.length > 0) {
        report.warnings.push({
          code: 'W3', target: `${id}/${pageId}`,
          message: `剔除未知模块引用：${unknownModules.join('、')}`,
        });
      }
      const symbols = stringArray(rawPage?.symbols).filter(s => known.symbols.has(s));
      const unknownSymbols = stringArray(rawPage?.symbols).filter(s => !known.symbols.has(s));
      if (unknownSymbols.length > 0) {
        report.warnings.push({
          code: 'W3', target: `${id}/${pageId}`,
          message: `剔除查无实据的符号：${unknownSymbols.join('、')}`,
        });
      }

      keptPages.push({
        id: pageId, title: pageTitle, brief,
        files,
        ...(modules.length > 0 ? { modules } : {}),
        ...(symbols.length > 0 ? { symbols } : {}),
      });
    }

    if (keptPages.length === 0) {
      chDrop(['无有效页']);
      continue;
    }

    report.chapters.push({
      id, title,
      summary: clampText(rawChapter?.summary, MAX_SUMMARY_LEN),
      pages: keptPages,
    });
    seenChapterIds.add(id);
    seenTitles.add(title);
    chapterBudget--;
    pageBudget -= keptPages.length;

    if (keptPages.length < 2) {
      report.warnings.push({ code: 'W1', target: id, message: `章仅 1 页，建议合并到相邻章或提升为独立页` });
    }
    for (const p of keptPages) {
      if (seenTitles.has(p.title)) {
        report.warnings.push({ code: 'W5', target: `${id}/${p.id}`, message: `页标题「${p.title}」与其他章/页重复` });
      }
      seenTitles.add(p.title);
      const span = spannedModules(p.files, known.modules);
      if (span > MAX_SPAN_MODULES) {
        report.warnings.push({ code: 'W2', target: `${id}/${p.id}`, message: `文件跨 ${span} 个模块，杂烩页风险` });
      }
    }
  }

  warnOverlaps(report);
  return report;
}

function isOutlineShape(raw: unknown): raw is OutlineFileData {
  if (!raw || typeof raw !== 'object') return false;
  const data = raw as Record<string, unknown>;
  if (data.version !== 1 || !Array.isArray(data.chapters)) return false;
  return (data.chapters as unknown[]).every(c => {
    if (!c || typeof c !== 'object') return false;
    const ch = c as Record<string, unknown>;
    if (typeof ch.id !== 'string' || !Array.isArray(ch.pages)) return false;
    return (ch.pages as unknown[]).every(p => {
      if (!p || typeof p !== 'object') return false;
      const pg = p as Record<string, unknown>;
      return typeof pg.id === 'string' && typeof pg.brief === 'string' && Array.isArray(pg.files);
    });
  });
}

/** 文件路径覆盖到的已知模块数（`/<mod>/` 包含匹配，与 topic-discovery 同法） */
function spannedModules(files: string[], modules: Set<string>): number {
  const span = new Set<string>();
  for (const file of files) {
    for (const mod of modules) {
      if (file.includes(`/${mod}/`)) {
        span.add(mod);
        break;
      }
    }
  }
  return span.size;
}

/** 页间文件 Jaccard 重叠（章内两两比较，覆盖全部净页） */
function warnOverlaps(report: OutlineReport): void {
  const pages = report.chapters.flatMap(c => c.pages.map(p => ({ target: `${c.id}/${p.id}`, files: new Set(p.files) })));
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const a = pages[i].files;
      const b = pages[j].files;
      let inter = 0;
      for (const f of a) if (b.has(f)) inter++;
      const union = a.size + b.size - inter;
      if (union > 0 && inter / union > OVERLAP_RATIO) {
        report.warnings.push({
          code: 'W4', target: `${pages[i].target} ↔ ${pages[j].target}`,
          message: `文件重叠率 ${(inter / union * 100).toFixed(0)}%，内容重复风险`,
        });
      }
    }
  }
}
