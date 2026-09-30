import { WikiBuilder } from '../wiki-builder.js';
import { UNCONFIRMED_CELL } from '../wiki-markers.js';
import type { TopicContext, ChapterPageContext } from '../types.js';
import { hasIntent, intentTable } from './shared.js';

/**
 * 主题页：仓库专属跨模块协作面（图谱推导）。
 * 规则模板：文件清单 + 符号表 + CALLS 边表 + 跨包边界。
 */
export function buildTopic(ctx: TopicContext): string {
  const builder = new WikiBuilder()
    .addTitle(ctx.title)
    .addParagraph('仓库专属主题（知识图谱聚类推导，横跨多个模块的协作面）。');

  builder.addSection('覆盖文件', '');
  builder.addBulletList(ctx.files.map(f => `\`${f}\``));

  if (ctx.symbols.length > 0) {
    builder.addSection('关键符号', '');
    builder.addTable(
      ['符号', '类型', '签名', '说明', '源文件:行号'],
      ctx.symbols.map(s => [
        `\`${s.name}\``,
        s.type,
        s.signature ? `\`${s.signature}\`` : '-',
        s.docstring ?? UNCONFIRMED_CELL,
        s.startLine && s.startLine > 0 ? `${s.file}:${s.startLine}` : s.file,
      ]),
    );
  }

  if (ctx.edges.length > 0) {
    builder.addSection('协作边表（文件间调用）', '');
    builder.addTable(
      ['调用方', '被调用方', '源文件:行号'],
      ctx.edges.map(e => [e.caller, e.callee, e.line > 0 ? `${e.file}:${e.line}` : e.file]),
    );
  }

  if (ctx.boundaries.length > 0) {
    builder.addSection('跨模块边界', '');
    builder.addTable(
      ['From', 'To', '调用次数'],
      ctx.boundaries.map(b => [b.from, b.to, String(b.callCount)]),
    );
  }

  if (hasIntent(ctx.intent)) {
    builder.addSection('设计动机（意图证据）', '');
    builder.addTable(['证据', '类型', '目标', '锚点'], intentTable(ctx.intent));
  }

  return builder.build();
}

/** 章节页规则模板：简报 + 覆盖文件 + 关键符号 + 协作边表 + 跨模块边界 */
export function buildChapterPage(ctx: ChapterPageContext): string {
  const builder = new WikiBuilder()
    .addTitle(ctx.title)
    .addParagraph(`章节「${ctx.chapterTitle}」下的仓库专属页面（outline.json 锁定）。${ctx.brief}`);

  builder.addSection('覆盖文件', '');
  builder.addBulletList(ctx.files.map(f => `\`${f}\``));

  if (ctx.symbols.length > 0) {
    builder.addSection('关键符号', '');
    builder.addTable(
      ['符号', '类型', '签名', '说明', '源文件:行号'],
      ctx.symbols.map(s => [
        `\`${s.name}\``,
        s.type,
        s.signature ? `\`${s.signature}\`` : '-',
        s.docstring ?? UNCONFIRMED_CELL,
        s.startLine && s.startLine > 0 ? `${s.file}:${s.startLine}` : s.file,
      ]),
    );
  }

  if (ctx.edges.length > 0) {
    builder.addSection('协作边表（文件间调用）', '');
    builder.addTable(
      ['调用方', '被调用方', '源文件:行号'],
      ctx.edges.map(e => [e.caller, e.callee, e.line > 0 ? `${e.file}:${e.line}` : e.file]),
    );
  }

  if (ctx.boundaries.length > 0) {
    builder.addSection('跨模块边界', '');
    builder.addTable(
      ['From', 'To', '调用次数'],
      ctx.boundaries.map(b => [b.from, b.to, String(b.callCount)]),
    );
  }

  if (hasIntent(ctx.intent)) {
    builder.addSection('设计动机（意图证据）', '');
    builder.addTable(['证据', '类型', '目标', '锚点'], intentTable(ctx.intent));
  }

  return builder.build();
}
