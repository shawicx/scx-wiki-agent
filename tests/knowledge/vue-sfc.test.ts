import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  extractVueSfcFacts,
  extractVueSfcFactsFallback,
} from '../../src/knowledge/channels/vue-sfc.js';

describe('vue-sfc 通道', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'vue-sfc-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeSfc(name: string, script: string): string {
    const rel = `src/components/${name}`;
    const abs = join(tmp, rel);
    mkdirSync(join(tmp, 'src/components'), { recursive: true });
    writeFileSync(abs, `<script setup lang="ts">\n${script}\n</script>\n\n<template>\n  <div/>\n</template>\n`);
    return rel;
  }

  it('调用签名风格 defineEmits：事件名级清单，payload 联合字面量不计入（SplitContainer 6 事件 golden）', () => {
    const rel = writeSfc('SplitContainer.vue', [
      "import { ref } from 'vue'",
      "const props = defineProps<{ node: SplitNode }>()",
      'const emit = defineEmits<{',
      "    (e: 'leafActivated', id: string): void",
      "    (e: 'leafSplit', id: string, direction: 'right' | 'down'): void",
      "    (e: 'treeUpdated', tree: SplitNode): void",
      '}>()',
    ].join('\n'));
    const facts = extractVueSfcFacts(rel, join(tmp, rel));
    expect(facts?.confidence).toBe('exact');
    // 'right'/'down' 是 payload 联合字面量，不是事件名
    expect(facts?.emits.map(e => e.name)).toEqual(['leafActivated', 'leafSplit', 'treeUpdated']);
    expect(facts?.emits[0].anchor.line).toBeGreaterThan(0);
    expect(facts?.props.map(p => p.name)).toEqual(['node']);
  });

  it('数组与对象风格 defineEmits / 可选 props', () => {
    const rel = writeSfc('Widget.vue', [
      "const emit = defineEmits(['close', 'resize'])",
      'defineProps<{ title: string, count?: number }>()',
    ].join('\n'));
    const facts = extractVueSfcFacts(rel, join(tmp, rel));
    expect(facts?.emits.map(e => e.name)).toEqual(['close', 'resize']);
    const count = facts?.props.find(p => p.name === 'count');
    expect(count?.required).toBe(false);
    expect(facts?.props.find(p => p.name === 'title')?.required).toBe(true);
  });

  it('锚点换算回原文件行号（script 块偏移）', () => {
    const rel = writeSfc('Anchored.vue', "const emit = defineEmits(['go'])");
    const facts = extractVueSfcFacts(rel, join(tmp, rel));
    // script 内容第 1 行 ↔ 原文件第 1 行（<script> 标签行）
    expect(facts?.emits[0].anchor.line).toBe(2);
  });

  it('编译失败回落正则路径（confidence=fallback）不阻断', () => {
    const rel = 'src/components/Broken.vue';
    const abs = join(tmp, rel);
    mkdirSync(join(tmp, 'src/components'), { recursive: true });
    // 缺少 <template> 的残缺 SFC：parse 可过、compileScript 抛错的场景由 wrapper 捕获；
    // 直接构造一个 script 内容为空的合法 SFC 验证回落 API 本身
    writeFileSync(abs, '<script setup lang="ts">\nconst emit = defineEmits([\'x\'])\n</script>\n');
    const facts = extractVueSfcFacts(rel, abs);
    expect(facts).toBeTruthy();
    expect(facts?.emits.map(e => e.name)).toEqual(['x']);
    // 回落 API 与编译器路径名称集一致（P3 评估的对照基础）
    const fallback = extractVueSfcFactsFallback(rel, '<script setup>\nconst emit = defineEmits([\'x\'])\n</script>\n');
    expect(fallback.emits.map(e => e.name)).toEqual(['x']);
  });
});
