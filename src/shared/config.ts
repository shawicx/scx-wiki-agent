/**
 * 全局配置：~/.scx/wiki-agent/config.yaml（YAML）。
 *
 * 优先级：CLI 参数 > 全局配置文件 > 内置默认。
 * api_key 支持 ${ENV_VAR} 环境变量引用（展开失败置空并告警，不把字面量发往 API）。
 * 配置缺失/解析失败一律降级为「无配置」并告警，绝不阻断构建。
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface GlobalConfig {
  provider: {
    /** anthropic | openai | deepseek | glm | ollama（OpenAI 兼容协议走 @ai-sdk/openai） */
    name: string;
    model: string;
    apiKey?: string;
    baseURL?: string;
    /** 请求超时（秒） */
    timeoutSec?: number;
  };
  build: {
    mode?: 'full' | 'update';
    maxOutputTokens?: number;
    noLlm?: boolean;
  };
}

/** 全局配置文件路径（~/.scx/wiki-agent/config.yaml） */
export function globalConfigPath(): string {
  return join(homedir(), '.scx', 'wiki-agent', 'config.yaml');
}

/** provider 名 → OpenAI 兼容 base_url 缺省（配置显式给出 base_url 时优先） */
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
  glm: 'https://open.bigmodel.cn/api/paas/v4',
  anthropic: 'https://api.anthropic.com/v1',
  ollama: 'http://localhost:11434/v1',
};

/** ${VAR} 环境变量引用展开；未定义的变量置空并告警（避免把字面量当密钥发出去） */
function expandEnvRefs(value: string, warnings: string[]): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => {
    const resolved = process.env[name];
    if (!resolved) {
      warnings.push(`环境变量 ${name} 未定义，对应配置值已置空`);
      return '';
    }
    return resolved;
  });
}

/**
 * 解析配置文本（纯函数，供单测）。
 * 宽松容错：未知字段忽略、类型不符忽略；provider 缺 name/model 时返回 null（视为未配置）。
 */
export function parseGlobalConfig(content: string): GlobalConfig | null {
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (err) {
    console.warn(`[wiki] 全局配置 YAML 解析失败：${(err as Error).message}`);
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const warnings: string[] = [];
  const root = raw as Record<string, unknown>;
  const p = (root.provider ?? {}) as Record<string, unknown>;
  const b = (root.build ?? {}) as Record<string, unknown>;

  const name = typeof p.name === 'string' ? p.name.trim() : '';
  const model = typeof p.model === 'string' ? p.model.trim() : '';
  if (!name || !model) return null;

  let apiKey: string | undefined;
  if (typeof p.api_key === 'string' && p.api_key.trim()) {
    apiKey = expandEnvRefs(p.api_key.trim(), warnings);
    if (!apiKey) apiKey = undefined;
  }

  let baseURL: string | undefined;
  if (typeof p.base_url === 'string' && p.base_url.trim()) {
    baseURL = p.base_url.trim();
  } else if (PROVIDER_BASE_URLS[name]) {
    baseURL = PROVIDER_BASE_URLS[name];
  }

  const timeoutSec = typeof p.timeout === 'number' && p.timeout > 0 ? p.timeout : undefined;

  const mode = b.mode === 'update' ? 'update' : b.mode === 'full' ? 'full' : undefined;
  const maxOutputTokens = typeof b.max_output_tokens === 'number' && b.max_output_tokens > 0
    ? Math.floor(b.max_output_tokens)
    : undefined;
  const noLlm = b.no_llm === true;

  for (const w of warnings) console.warn(`[wiki] 全局配置：${w}`);
  return {
    provider: { name, model, apiKey, baseURL, timeoutSec },
    build: { mode, maxOutputTokens, noLlm },
  };
}

/** 加载全局配置；文件不存在返回 null（正常路径，不告警） */
export function loadGlobalConfig(configPath?: string): GlobalConfig | null {
  const path = configPath ?? globalConfigPath();
  if (!existsSync(path)) return null;
  try {
    return parseGlobalConfig(readFileSync(path, 'utf-8'));
  } catch (err) {
    console.warn(`[wiki] 全局配置读取失败（${path}）：${(err as Error).message}`);
    return null;
  }
}

/** init 时生成的示例配置（幂等创建；密钥用环境变量引用示例，不内置任何真实 key） */
export const CONFIG_TEMPLATE = `# scx-wiki-agent 全局配置
# 优先级：CLI 参数 > 本文件 > 内置默认
provider:
  # LLM 提供方：anthropic | openai | deepseek | glm | ollama
  # （均走 OpenAI 兼容协议；未配置 base_url 时按下表取缺省值）
  name: deepseek
  # 模型名
  model: deepseek-v4-flash
  # API Key（支持 ${'$'}{ENV_VAR} 环境变量引用，推荐而非明文）
  api_key: \${DEEPSEEK_API_KEY}
  # API base URL（可选；缺省映射：openai→api.openai.com/v1、deepseek→api.deepseek.com、
  #   glm→open.bigmodel.cn/api/paas/v4、anthropic→api.anthropic.com/v1、ollama→localhost:11434/v1）
  # base_url: https://api.deepseek.com
  # 请求超时（秒）
  timeout: 120

build:
  # 构建模式：full=全量覆盖 | update=内容一致时跳过
  mode: full
  # 单轮流式生成的输出 token 预算（默认 8000）
  max_output_tokens: 8000
  # 强制纯规则路径（不调用 LLM）
  no_llm: false
`;
