import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { IntentEvidence } from '../intent-evidence.js';
import { sanitizeWikiOutput } from '../wiki-output-sanitizer.js';
import { assembleSections, findSafeCut, isAbnormalFinish } from '../wiki-continuation.js';
import { WIKI_MAX_CONTINUATIONS } from '../../shared/constants.js';

export interface PageConfig {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
}

/** 单轮流式生成的产出与终止原因 */
interface StreamOutcome {
  text: string;
  reasoning: string;
  finish: string;
}

/** 带续写统计的一节/一页生成结果 */
interface GenerationOutcome {
  content: string;
  rounds: number;
  truncated: boolean;
}

/** 单页生成结束后的续写/分节/thinking-only 结果通知（供构建报告统计） */
export type PageGenNotice =
  | { kind: 'continuation'; rounds: number; truncated: boolean }
  | { kind: 'sections'; sections: number; continuedSections: number; truncated: boolean }
  /** 正文通道为空、思考通道非空（provider thinking-only response）：recovered=重试后拿回正文 */
  | { kind: 'thinking-only'; recovered: boolean };

/** R1-R7 反幻觉规则（注入每个 LLM system prompt） */
export const ANTI_HALLUCINATION = [
  '绝对规则：只能基于提供的JSON数据描述项目，严禁编造不存在的模块、服务、功能或业务场景。',
  '如果数据不足以描述某个方面，直接省略或注明"信息不足"，不要猜测或补充。',
  '不要将测试代码（tests/目录下的文件）当作项目功能来描述。',
  '',
  '铁律（违反即不可用）：',
  'R1 锚点强制：每条事实声明必须带 file:line 或 qualified_name；锚点路径必须用数据中的完整相对路径（如 src-tauri/src/main.rs，含目录前缀），严禁只写文件名；无锚点的声明不得写入。',
  'R2 边表优于时序图：调用关系用表格（调用方→被调用方→file:line），严禁用 sequenceDiagram 表达静态可达性。',
  'R3 拒绝编造用途：任何依赖/函数的"用途"必须有源码调用点佐证；数据中给出的使用证据（depUsage/importFiles/调用边）即为佐证，usageKind ≠ none 或有 import 点/调用边时严禁标"声明未用"。',
  'R4 结构化优先：用表格/列表而非散文；签名用代码块。',
  'R5 待确认标记：数据不足以描述的关键方面，写「待确认」并简述缺什么证据，禁止猜测或编造合理化解释；单页「待确认」总数控制在 5 处以内，只保留影响读者决策的关键缺口，次要缺口直接省略不提。',
  'R6 图表真实性：Mermaid 图中的节点/标签必须来自数据中的真实模块名、符号名或文件路径；无继承数据时严禁编造 classDiagram 继承边。',
  'R7 动机锚定：动机/设计依据/演进类叙述必须锚定证据——注释引用（file:line）、提交信息（commit 短哈希+日期）、文档小节（路径#标题）、测试用例名（测试文件:行号）；数据中的 intent 数组即证据源，引用时保留锚点；无锚点的动机段必须显式标注「推断」并写明推断依据（命名/签名/结构特征），单页「推断」段不超过 2 处。',
  '',
  '图表选型指引：模块依赖→graph TD；调用关系→表格（R2）；数据流→阶段表；类层次→仅当数据含继承关系时用 classDiagram；状态变迁→仅当数据含状态枚举与转换证据时用 stateDiagram。',
  '',
  '页面质量要求（project-wiki 方法论）：',
  '- 单页最低内容：开头一句话说明本页职责，随后是基于数据的事实要点（表格/列表优先），不产出空章节。',
  '- AI 友好必达：内容应能快速回答（按页面主题取相关项）——项目是什么、技术栈、模块职责、如何启动、数据在哪、配置从哪来、外部依赖是什么。',
].join('\n');

const CONTINUE_INSTRUCTION = [
  '你的上一轮输出因达到长度上限而中断。你上面那条回复是已生成的安全前缀，末尾不完整的代码块、段落或表格行已被移除。',
  '请从中断处直接继续，严格遵守：',
  '- 禁止重复或改写已输出的内容，禁止重新开始',
  '- 禁止任何开场白、说明或寒暄，直接续写 Markdown 正文',
  '- 保持既有章节编号、表格与图表规范，反幻觉规则 R1-R7 继续生效',
  '- 一次性写完剩余全部章节',
].join('\n');

const THINKING_ONLY_INSTRUCTION = [
  '【重要】你的上一轮输出全部进入了思考通道（reasoning 字段），正文通道为空。',
  '本次严禁输出任何思考过程、内部分析或草稿：从第一个字符起就是最终 Markdown 正文，',
  '直接以页面首个标题开头，并严格遵守前述全部生成要求与 R1-R7 反幻觉规则。',
].join('\n');

/** 均匀分块（保序） */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** 从相对路径推导模块归属键（src/<module>/… → <module>，否则取首段目录） */
export function moduleKeyOf(filePath: string): string {
  const parts = filePath.split('/');
  const srcIdx = parts.indexOf('src');
  if (srcIdx >= 0 && srcIdx + 1 < parts.length) return parts[srcIdx + 1];
  return parts.length > 1 ? parts[0] : filePath;
}

/** 意图证据 → 紧凑 prompt 形态（kind/text/anchor/target 摘要，预算内原样引用） */
export function intentToPrompt(items: IntentEvidence[] | undefined): Array<{ kind: string; text: string; anchor: string; target: string }> {
  return (items ?? []).map(e => ({
    kind: e.kind,
    text: e.text,
    anchor: e.anchor,
    target: e.target.symbol ?? e.target.module ?? e.target.file ?? '',
  }));
}

/** 分节作用域约束：告知本页节清单与本节职责，防止跨节越界或重复 */
export function sectionScope(pageTitle: string, sectionTitle: string, siblings: string[]): string {
  return [
    `本页面（${pageTitle}）分多节生成，完整节清单：${siblings.join('、')}。`,
    `你只负责生成「${sectionTitle}」这一节。`,
    '禁止输出页面开头导语、其他节的内容或全页总结；正文直接以本节的二级标题（##）开头。',
  ].join('\n');
}

/** 生成器级设置（来自全局配置：请求超时与输出预算） */
export interface GeneratorSettings {
  /** 请求超时毫秒数（每次流式请求独立计时） */
  timeoutMs?: number;
  /** 单轮流式输出的默认 token 预算（页面配置未显式指定时生效） */
  maxOutputTokens?: number;
}

/** LLM model 实例类型（provider.chat 产物） */
export type GeneratorModel = ReturnType<ReturnType<typeof createOpenAI>>;

/** 页面生成函数的公共依赖（模型 + 设置 + 通知回调） */
export interface GeneratorDeps {
  model: GeneratorModel | null;
  settings?: GeneratorSettings;
  onNotice?: (notice: PageGenNotice) => void;
}

// --- Core generation ---

export async function generate(deps: GeneratorDeps, onChunk: (text: string) => void, config: PageConfig): Promise<string> {
  if (!deps.model) return '';
  const r = await generateWithContinuation(deps, onChunk, config);
  if (r.rounds > 0) {
    deps.onNotice?.({ kind: 'continuation', rounds: r.rounds, truncated: r.truncated });
  }
  return r.content;
}

/**
 * 分节生成：按确定性节表逐节生成（串行），每节独立获得输出预算与数据切片，
 * 并自动继承断流续写能力。任一节为空则整页判失败（返回 ''，交由降级路径）。
 */
export async function generateSectioned(deps: GeneratorDeps, onChunk: (text: string) => void, sections: PageConfig[]): Promise<string> {
  if (!deps.model || sections.length === 0) return '';

  const parts: string[] = [];
  let continuedSections = 0;
  let truncated = false;
  for (let i = 0; i < sections.length; i++) {
    if (i > 0) onChunk('\n\n');
    const r = await generateWithContinuation(deps, onChunk, sections[i]);
    if (r.content.trim().length === 0) return '';
    parts.push(r.content);
    if (r.rounds > 0) continuedSections++;
    if (r.truncated) truncated = true;
  }
  if (sections.length > 1) {
    deps.onNotice?.({ kind: 'sections', sections: sections.length, continuedSections, truncated });
  }
  return assembleSections(parts);
}

/** 单次生成 + 断流续写循环；返回内容与续写统计 */
export async function generateWithContinuation(
  deps: GeneratorDeps,
  onChunk: (text: string) => void,
  config: PageConfig,
): Promise<GenerationOutcome> {
  let outcome = await streamOnce(deps, onChunk, config);

  // thinking-only 防线：正文通道为空而思考通道非空（思考模型关闭思考失败的典型表现）。
  // reasoning 是思维链草稿而非用户文档——绝不直接当正文写入；重试一次显式要求只输出
  // 最终 Markdown，重试仍失败则返回空串，交由上层降级规则路径（wiki-service）。
  if (outcome.text.trim().length === 0 && outcome.reasoning.trim().length > 0) {
    onChunk('\n\n[wiki] 检测到 thinking-only 响应（正文为空、思考非空），重试要求直接输出正文…\n\n');
    const retry = await streamOnce(deps, onChunk, config, undefined, THINKING_ONLY_INSTRUCTION);
    const recovered = retry.text.trim().length > 0;
    deps.onNotice?.({ kind: 'thinking-only', recovered });
    if (!recovered) {
      return { content: '', rounds: 0, truncated: false };
    }
    outcome = retry;
  }

  let text = outcome.text;
  let finish = outcome.finish;
  let rounds = 0;
  while (isAbnormalFinish(finish) && text.trim().length > 0 && rounds < WIKI_MAX_CONTINUATIONS) {
    const cut = findSafeCut(text);
    if (cut === null) break;

    onChunk('\n\n[wiki] 输出中断，自动续写…\n\n');
    let more: StreamOutcome;
    try {
      more = await streamOnce(deps, onChunk, config, cut.kept);
    } catch {
      break; // 续写调用失败：保留已生成的安全前缀，交由闸门裁决
    }
    finish = more.finish;
    const segment = sanitizeWikiOutput(more.text);
    if (segment.length === 0) break;
    text = cut.kept.trimEnd() + '\n\n' + segment;
    rounds++;
  }

  // 尾部愈合：末轮仍截断时，最后一轮拼接的 segment 是未经截齐的原始尾巴
  // （可能悬在表格行/代码块中间）——复用安全切点丢弃残缺尾巴，只返回完整自洽的前缀。
  // truncated 标记保留，供闸门升级 incomplete-page 检查与构建报告提示。
  if (isAbnormalFinish(finish)) {
    const healed = findSafeCut(text);
    if (healed) text = healed.kept;
  }

  return { content: text, rounds, truncated: isAbnormalFinish(finish) };
}

/**
 * 单轮流式生成。携带 prefix 时以 messages 形式发起续写：
 * 原始页面数据 + 已生成的安全前缀 + 续写指令。
 * extraSystem 附加在 system 末尾（thinking-only 重试时注入显式正文输出要求）。
 */
async function streamOnce(
  deps: GeneratorDeps,
  onChunk: (text: string) => void,
  config: PageConfig,
  prefix?: string,
  extraSystem?: string,
): Promise<StreamOutcome> {
  if (!deps.model) return { text: '', reasoning: '', finish: 'error' };

  const system = ANTI_HALLUCINATION + '\n\n' + config.systemPrompt
    + (extraSystem ? '\n\n' + extraSystem : '');
  // 思考模型（如 Qwen3/DeepSeek-v4）默认把内容输出到 reasoning 字段，content 为空。
  // 尝试关闭思考；若 provider 不支持则透传忽略。
  const providerOptions = {
    openai: { thinking: { type: 'disabled' } },
    ollama: { think: false },
  };
  const maxOutputTokens = config.maxOutputTokens ?? deps.settings?.maxOutputTokens;
  // 超时独立计时（AbortSignal.timeout 不可复用，每次请求新建）
  const abortSignal = deps.settings?.timeoutMs
    ? AbortSignal.timeout(deps.settings.timeoutMs)
    : undefined;

  const result = prefix
    ? streamText({
        model: deps.model,
        system,
        messages: [
          { role: 'user', content: config.userPrompt },
          { role: 'assistant', content: prefix },
          { role: 'user', content: CONTINUE_INSTRUCTION },
        ],
        maxOutputTokens,
        abortSignal,
        providerOptions,
      })
    : streamText({
        model: deps.model,
        system,
        prompt: config.userPrompt,
        maxOutputTokens,
        abortSignal,
        providerOptions,
      });

  // 用 fullStream 收集 text 与 reasoning 两类 delta。
  // 思考模型在关闭思考失败时，实际内容会出现在 reasoning 里。
  let text = '';
  let reasoning = '';
  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      text += part.text;
      onChunk(part.text);
    } else if (part.type === 'reasoning-delta') {
      reasoning += part.text;
    }
  }

  return { text, reasoning, finish: await result.finishReason };
}
