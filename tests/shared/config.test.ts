import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseGlobalConfig, loadGlobalConfig, CONFIG_TEMPLATE } from '../../src/shared/config.js';

describe('parseGlobalConfig', () => {
  it('解析 provider 与 build 字段，provider 缺省 base_url 按名称映射', () => {
    const cfg = parseGlobalConfig(`
provider:
  name: deepseek
  model: deepseek-v4-flash
  api_key: sk-literal
  timeout: 120
build:
  mode: update
  max_output_tokens: 12000
  no_llm: false
`);
    expect(cfg).toEqual({
      provider: {
        name: 'deepseek',
        model: 'deepseek-v4-flash',
        apiKey: 'sk-literal',
        baseURL: 'https://api.deepseek.com',
        timeoutSec: 120,
      },
      build: { mode: 'update', maxOutputTokens: 12000, noLlm: false },
    });
  });

  it('build.confirm 解析：true 时携带，缺省不携带（CLI --confirm 的一次性开关互不影响）', () => {
    const on = parseGlobalConfig('provider:\n  name: ollama\n  model: qwen\nbuild:\n  confirm: true');
    expect(on?.build.confirm).toBe(true);
    const off = parseGlobalConfig('provider:\n  name: ollama\n  model: qwen\nbuild:\n  confirm: false');
    expect(off?.build.confirm).toBeUndefined();
  });

  it('显式 base_url 优先于 provider 缺省映射', () => {
    const cfg = parseGlobalConfig(`
provider:
  name: glm
  model: glm-4.7
  base_url: https://my-proxy.example.com/v1
`);
    expect(cfg?.provider.baseURL).toBe('https://my-proxy.example.com/v1');
  });

  it('api_key 支持 ${ENV_VAR} 引用；未定义变量置空并告警', () => {
    process.env.TEST_WIKI_KEY = 'sk-from-env';
    const ok = parseGlobalConfig('provider:\n  name: openai\n  model: gpt-4o\n  api_key: ${TEST_WIKI_KEY}');
    expect(ok?.provider.apiKey).toBe('sk-from-env');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const missing = parseGlobalConfig('provider:\n  name: openai\n  model: gpt-4o\n  api_key: ${NOT_DEFINED_VAR_X}');
    expect(missing?.provider.apiKey).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NOT_DEFINED_VAR_X'));
    warn.mockRestore();
    delete process.env.TEST_WIKI_KEY;
  });

  it('provider 缺 name/model、坏 YAML、非对象内容均返回 null（不抛异常）', () => {
    expect(parseGlobalConfig('provider:\n  name: openai')).toBeNull();
    expect(parseGlobalConfig('provider:\n  model: x')).toBeNull();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseGlobalConfig('{broken:')).toBeNull();
    expect(parseGlobalConfig('- a\n- b')).toBeNull();
    warn.mockRestore();
  });

  it('非法 build 字段值被忽略（类型/枚举校验）', () => {
    const cfg = parseGlobalConfig(`
provider:
  name: ollama
  model: qwen3
build:
  mode: weird
  max_output_tokens: -5
  no_llm: true
`);
    expect(cfg?.build).toEqual({ mode: undefined, maxOutputTokens: undefined, noLlm: true });
    expect(cfg?.provider.baseURL).toBe('http://localhost:11434/v1');
  });
});

describe('loadGlobalConfig', () => {
  let tmp: string;

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it('文件不存在返回 null；存在则解析；模板本身可被解析', () => {
    tmp = mkdtempSync(join(tmpdir(), 'cfg-'));
    const path = join(tmp, 'config.yaml');

    expect(loadGlobalConfig(path)).toBeNull();

    writeFileSync(path, CONFIG_TEMPLATE, 'utf-8');
    const cfg = loadGlobalConfig(path);
    expect(cfg?.provider.name).toBe('deepseek');
    expect(cfg?.provider.model).toBe('deepseek-v4-flash');
    expect(cfg?.provider.apiKey).toBeUndefined(); // 模板密钥用 ${DEEPSEEK_API_KEY}，环境未设时置空
    expect(cfg?.provider.timeoutSec).toBe(120);
    expect(cfg?.build.mode).toBe('full');
  });

  it('读取失败（目录路径）告警并返回 null', () => {
    tmp = mkdtempSync(join(tmpdir(), 'cfg-'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mkdirSync(join(tmp, 'config.yaml')); // 目录而非文件 → 读取抛 EISDIR
    expect(loadGlobalConfig(join(tmp, 'config.yaml'))).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('全局配置读取失败'));
    warn.mockRestore();
  });
});
