# generateByName 协作面

<details>
<summary>Relevant source files</summary>

- src/knowledge/wiki-output-sanitizer.ts
- src/knowledge/wiki-page-generator.ts
- src/services/wiki-service.ts
</details>

仓库专属主题（知识图谱聚类推导，横跨多个模块的协作面）。

## 覆盖文件

- `src/knowledge/wiki-page-generator.ts`
- `src/services/wiki-service.ts`
- `src/knowledge/wiki-output-sanitizer.ts`

## 跨模块边界

| 调用方 | 被调用方 | 调用次数 |
| --- | --- | --- |
| services | knowledge | 58 |
| knowledge | shared | 58 |
| knowledge | mcp | 3 |
| knowledge | cli | 3 |
| knowledge | core | 2 |

## 设计动机（意图证据）

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| Re-export 壳：实现已拆分到 ./generator/（shared / structure / data-pages / surface / index）。 本文件仅保持既有 import 路径兼容，勿在此新增实现。 / | 文件头自述 | src/knowledge/wiki-page-generator.ts | src/knowledge/wiki-page-generator.ts:1 |
| 兼容壳：实现已拆分至 src/services/wiki/（service/cleanup/report/verification/阶段二·三）。 | 文件头自述 | src/services/wiki-service.ts | src/services/wiki-service.ts:1 |
| LLM 生成 wiki 输出的轻量后处理。 思考模型/部分 provider 会在正文前混入对话残骸（"好的，作为…"/"根据您提供的JSON数据…"）， 或用 ```markdown 围栏包裹整个输出。本模块做确定性清理，不调用 LLM。 fallback 路径（规则生成）无需过此 sanitizer。 / | 文件头自述 | src/knowledge/wiki-output-sanitizer.ts | src/knowledge/wiki-output-sanitizer.ts:1 |
| 常见的对话残骸/寒暄前导语开头特征 | 符号注释 | PREAMBLE_PATTERNS | src/knowledge/wiki-output-sanitizer.ts:11 |
| @param pageName 页面名，用于 R2 sequenceDiagram 违规告警（仅 calls 页允许时序图） / | 符号注释 | sanitizeWikiOutput | src/knowledge/wiki-output-sanitizer.ts:24 |
| system prompt 已禁止该措辞但 LLM 偶发不遵守（实测 modules.md 28 行）。 如实声明边界应使用「未检出/无证据」措辞，不属于本替换范围。 / | 符号注释 | stripFillerCells | src/knowledge/wiki-output-sanitizer.ts:41 |
| src/knowledge/wiki-page-generator.ts 首次提交：feat: 功能基本可用 | 提交记录 | src/knowledge/wiki-page-generator.ts | commit:76565d14 (2026-06-02) |
| src/knowledge/wiki-output-sanitizer.ts 首次提交：fix: 修复 wiki 生成质量问题并新增输出清理器 | 提交记录 | src/knowledge/wiki-output-sanitizer.ts | commit:6fa4fc44 (2026-06-24) |

## 本页确定知道的事实

- 覆盖文件 3 个、关键符号 0 个（跨 0 个文件）
- 协作调用边 0 条、跨模块边界 5 条
- 设计动机证据 8 条（均带锚点）
## Related

- 同目录：[topic-9.md](topic-9.md)
- 总入口：[README](../README.md)

<!-- wiki:source: fallback -->
