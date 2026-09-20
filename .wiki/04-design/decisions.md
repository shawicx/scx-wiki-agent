# Architecture Decision Records

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
</details>

> ⚠️ **待确认**：MCP 未提供持久化 ADR，以下决策记录基于代码结构自动推导生成（状态均为 proposed），建议人工审阅后用 manage_adr(mode=update) 持久化（证据不足，禁止猜测；请人工补充后移除本标记）

## ADR-001: 分层结构：=api、cli=internal、core=internal、helpers=internal、knowledge=core

| 项 | 内容 |
| --- | --- |
| 状态 | proposed |
| 背景 | 知识图谱分层分析： → api（has HTTP route definitions）；cli → internal（fan-in=2, fan-out=4）；core → internal（fan-in=2, fan-out=2）；helpers → internal（fan-in=0, fan-out=0）；knowledge → core（high fan-in (22 in, 13 out)）。 |
| 决策 | 采用上述分层，依赖方向从外层指向内层，核心层不反向依赖调用方。 |
| 后果 | 新增代码应归入对应层；反向跨层依赖会在模块边界统计中暴露。 |
| 相关文件 | `src/cli/commands/build.ts`, `src/cli/commands/init.ts`, `src/cli/commands/scan.ts` |

## ADR-002: 模块调用边界（调用次数 top 5）

| 项 | 内容 |
| --- | --- |
| 状态 | proposed |
| 背景 | 跨包调用统计：services→knowledge（22 次）、knowledge→shared（12 次）、core→shared（2 次）、cli→services（2 次）、services→core（1 次）。 |
| 决策 | 维持现有模块依赖方向，高频边界两端保持稳定接口。 |
| 后果 | 边界两端模块形成耦合点，修改被调用方需评估所有调用方。 |
| 相关文件 | - |

## ADR-003: 核心技术选型：@ai-sdk/openai、ai、commander、ignore、tsup、vitest

| 项 | 内容 |
| --- | --- |
| 状态 | proposed |
| 背景 | 以下依赖在源码中被实际 import（声明未用依赖已被过滤）：@ai-sdk/openai、ai、commander、ignore、tsup、vitest。 |
| 决策 | 以 @ai-sdk/openai、ai、commander、ignore、tsup、vitest 构成核心技术栈。 |
| 后果 | 升级或替换这些依赖属于架构级变更，需回归核心调用链。 |
| 相关文件 | - |
## Related

- 总入口：[README](../README.md)
