/** 断言核验基础设施：图谱符号索引、源码行缓存、指纹条目、词法探测、outline 参考集。 */

import { readFileSync } from 'fs';
import { isAbsolute, join, relative } from 'path';
import type { CodebaseMemoryClient } from '../../mcp/codebase-memory-client.js';
import type { ScanResult } from '../../core/scanner.js';
import { isCommentLine } from '../../knowledge/claim-verifier.js';
import type { ProbeEvidenceKind } from '../../knowledge/claim-verifier.js';
import type { ConfirmedEntry } from '../../knowledge/confirmation.js';
import { extractDefinedSymbolNames } from '../../knowledge/source-fallback.js';
import type { OutlineKnown } from '../../knowledge/outline.js';

/** 图谱符号索引（getSymbolIndex 产物）：简名全集 + qualified 全串 + 简名→文件集 */
export interface SymbolIndex {
  names: Set<string>;
  qualified: Set<string>;
  files: Map<string, Set<string>>;
}

export class VerificationHub {
  private symbolIndexes = new Map<'all' | 'production', SymbolIndex>();
  private sourceLineCache = new Map<string, string[] | null>();
  /** outlineKnown 源码回落专用缓存（绝对路径 → 内容） */
  private outlineSourceCache = new Map<string, string | null>();

  constructor(
    private client: CodebaseMemoryClient,
    private scanResult: ScanResult,
  ) {}

  /** 图谱符号索引（断言校验一级核验；按页面作用域缓存）。
   *  names/qualified/files 一次查询同源构建：qualified 供点链声明后缀匹配
   *  （消灭 qualified 假阴性），files 供同名歧义统计。
   *  production 作用域只采纳能定位到生产扫描文件的图谱符号，
   *  防止 is_test 标记失准的测试符号背书。 */
  getSymbolIndex(scope: 'all' | 'production' = 'all'): SymbolIndex {
    let index = this.symbolIndexes.get(scope);
    if (index === undefined) {
      const q = this.client.queryGraph(
        'MATCH (n) WHERE n.is_test = false RETURN n.name AS name, n.file_path AS file, n.qualified_name AS qn LIMIT 5000',
        5000,
      );
      const productionPaths = new Set(this.scanResult.productionFiles.map(f => f.relativePath));
      const names = new Set<string>();
      const qualified = new Set<string>();
      const files = new Map<string, Set<string>>();
      for (const row of q.rows) {
        const rawFile = String(row[1] ?? '');
        const file = isAbsolute(rawFile)
          ? relative(this.scanResult.rootDir, rawFile).replace(/\\/g, '/')
          : rawFile;
        if (scope === 'production' && !productionPaths.has(file)) continue;
        const name = String(row[0] ?? '');
        if (!name) continue;
        names.add(name);
        if (file) {
          let set = files.get(name);
          if (set === undefined) files.set(name, (set = new Set()));
          set.add(file);
        }
        const qn = row[2];
        if (typeof qn === 'string' && qn) qualified.add(qn);
      }
      index = { names, qualified, files };
      this.symbolIndexes.set(scope, index);
    }
    return index;
  }

  /**
   * claim 原文 → v2 指纹条目：末段名在符号索引（production 优先，all 兜底）
   * 唯一命中时存文件 + 内容哈希（文件不变则跨提交长期有效）；歧义名
   * （0/多文件：依赖名、跨文件同名、纯词法命中）无稳定指纹，files 置空
   * 退化为 HEAD-scoped——任何提交后过期重新裁决。
   */
  fingerprintEntry(
    raw: string,
    head: string,
    confirmedAt: string,
    hashOf: (file: string) => string | null,
  ): ConfirmedEntry {
    const name = raw.replace(/\(\s*\)$/, '').split('.').pop() ?? raw;
    let files: string[] = [];
    for (const scope of ['production', 'all'] as const) {
      const set = this.getSymbolIndex(scope).files.get(name);
      if (set && set.size === 1) {
        files = [...set];
        break;
      }
    }
    return { raw, files, hashes: files.map(f => hashOf(f) ?? ''), head, confirmedAt };
  }

  /**
   * 断言核验三级通道（词法证据分类）：search_code compact 命中 (file, line)
   * 后读取命中行原文——纯注释/配置行不算功能实据（mention），其余（代码/
   * import/调用/定义行）算实据（usage）。作用域过滤排除 .wiki 自引用。
   * 无作用域内命中返回 null；binary 不支持 compact 模式时抛错由核验方
   * fail-open 回退（按有实据处理，宁漏勿误）。
   */
  probeClaimEvidence(name: string, scopeFiles: ReadonlySet<string>): ProbeEvidenceKind | null {
    const matches = this.client.searchCodeMatches(name, 20);
    const scoped = matches.filter(m => scopeFiles.has(m.file) && !m.file.startsWith('.wiki/'));
    if (scoped.length === 0) return null;
    for (const m of scoped) {
      const line = this.readSourceLine(m.file, m.line);
      if (line === null) return 'usage'; // 源不可读：fail-open 按实据
      if (isCommentLine(line, m.file)) continue;
      return 'usage';
    }
    return 'mention'; // 作用域内命中全在注释/提及行
  }

  /** 源码行缓存（断言核验的命中行分类用；读失败缓存 null → fail-open） */
  readSourceLine(file: string, lineNo: number): string | null {
    let lines = this.sourceLineCache.get(file);
    if (lines === undefined) {
      try {
        lines = readFileSync(join(this.scanResult.rootDir, file), 'utf-8').split('\n');
      } catch {
        lines = null;
      }
      this.sourceLineCache.set(file, lines);
    }
    if (lines === null || lineNo < 1 || lineNo > lines.length) return null;
    return lines[lineNo - 1];
  }

  /** 整文件读取（文档锚点 heading 解析用；复用行缓存） */
  readSourceFile(file: string): string | null {
    const lines = this.sourceLineCache.get(file) ?? null;
    if (lines !== null) return lines.join('\n');
    if (this.readSourceLine(file, 1) === null) return null;
    const cached = this.sourceLineCache.get(file);
    return cached ? cached.join('\n') : null;
  }

  /** 组装章节树校验参考集：模块来自架构包，符号来自 outline 引用文件
   *  （图谱有界查询 + 源码正则回落——图谱漏采的 brief 符号免于 W3「查无实据」误剔） */
  outlineKnown(knownFiles: Set<string>, outlineRaw: unknown): OutlineKnown {
    const arch = this.client.getArchitecture();
    const rawChapters = (outlineRaw as { chapters?: unknown })?.chapters;
    const refFiles = [...new Set(
      (Array.isArray(rawChapters) ? rawChapters : [])
        .flatMap((c: { pages?: unknown }) => (Array.isArray(c?.pages) ? c.pages : []))
        .flatMap((p: { files?: unknown }) => (Array.isArray(p?.files) ? p.files : []) as string[]),
    )].filter(f => knownFiles.has(f));

    const symbols = new Set<string>();
    if (refFiles.length > 0) {
      const fileList = refFiles.map(f => `"${f.replace(/"/g, '\\"')}"`).join(',');
      const q = this.client.queryGraph(
        `MATCH (n) WHERE n.file_path IN [${fileList}] AND n.is_test = false
         RETURN DISTINCT n.name AS name LIMIT 2000`,
      );
      for (const row of q.rows) symbols.add(row[0] as string);
      for (const name of extractDefinedSymbolNames(refFiles, this.scanResult, this.outlineSourceCache)) {
        symbols.add(name);
      }
    }
    return { files: knownFiles, modules: new Set(arch.packages.map(p => p.name)), symbols };
  }
}
