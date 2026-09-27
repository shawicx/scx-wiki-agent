# Project Overview

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/knowledge/wiki-page-generator.ts
- src/shared/config.ts
- tsup.config.ts
- vitest.config.ts
</details>

从代码知识图谱生成结构化中文 Markdown Wiki 的 CLI 工具（LLM 增强叙述 + 纯规则回退）

A cli project with 75 files.

## Tech Stack

- @ai-sdk/openai
- ai
- commander
- ignore
- yaml
- tsup
- vitest

## Entry Files

- `src/cli/index.ts`

## Source Directories

- src

## Hotspots (high fan-in)

| Symbol | Type | Complexity |
| --- | --- | --- |
| isTestPath | function | 21 |
| generate | function | 13 |
| isChapterPage | function | 9 |
| isTopicPage | function | 8 |
| matchPackageForFile | function | 8 |
| languageDomainOf | function | 8 |
| exec | function | 6 |
| parseChapterPage | function | 6 |
| labelToSymbolType | function | 6 |
| pageRelPath | function | 5 |
## Related

- 同目录：[tech-stack.md](tech-stack.md) · [environment.md](environment.md)
- 总入口：[README](../README.md)
