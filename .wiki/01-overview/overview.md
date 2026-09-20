# Project Overview

<details>
<summary>Relevant source files</summary>

- src/cli/index.ts
- src/core/scanner.ts
- src/knowledge/config-detector.ts
- src/knowledge/topic-discovery.ts
- src/mcp/codebase-memory-client.ts
- src/services/scan-service.ts
</details>

A cli project with 57 files.

## Tech Stack

- @ai-sdk/openai
- ai
- commander
- ignore
- tsup
- vitest

## Entry Files

- `src/cli/index.ts`

## Source Directories

- src

## Hotspots (high fan-in)

| Symbol | Type | Complexity |
| --- | --- | --- |
| isTestPath | function | 14 |
| generate | function | 12 |
| isTopicPage | function | 8 |
| labelToSymbolType | function | 6 |
| exec | function | 5 |
| pageRelPath | function | 4 |
| findPageDescriptor | function | 4 |
| validatePageContent | function | 3 |
| topicIdFromPage | function | 3 |
| collectEvidenceFiles | function | 3 |
## Related

- 同目录：[tech-stack.md](tech-stack.md) · [environment.md](environment.md)
- 总入口：[README](../README.md)
