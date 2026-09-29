# Modules

<details>
<summary>Relevant source files</summary>

- README.md
- src/cli/confirm-interaction.ts
- src/core/scanner.ts
- src/knowledge/claim-verifier.ts
- src/knowledge/confirmation.ts
- src/knowledge/intent-evidence.ts
- src/knowledge/outline-planner.ts
- src/knowledge/outline.ts
- src/knowledge/page-registry.ts
- src/knowledge/topic-discovery.ts
- src/knowledge/wiki-builder.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-continuation.ts
- src/knowledge/wiki-evidence.ts
- src/knowledge/wiki-fallback-builder.ts
</details>

## knowledge

Key exports: `Claim`, `ConfirmationStore`, `add`, `applyConfirmations`, `GenerationOutcome`

Depends on: `shared`, `cli`, `helpers`

Used by: `services`

Fan-in/out: 0 / 0

### 设计依据（意图证据）

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| 意图证据层（Intent Evidence）：为「为什么」类叙述提供确定性证据源。 图谱数据只回答「是什么」（谁调谁、复杂度、扇入），动机/设计依据/演进脉络 必须来自仓库中真实存在的意图载体。本模块以正则级提取（ADR-001 先例： 无 AST、无持久索引）采集四类证据，全部携带锚点，LLM 只负责综合引用： - 注释：文件头（模块自述）、符号定义行上方紧邻注释、TODO/FIXME/HACK/WHY 标记、限制常量的同行/上邻注释 - git 提交：单文件首末提交（诞生 | 文件头自述 | src/knowledge/intent-evidence.ts | src/knowledge/intent-evidence.ts:1 |
| 章节树（outline）：仓库自适应文档结构的锁定数据契约与确定性校验器。 与 topics.json 的分工（共存，不迁移）： - topics 是无 LLM 的确定性保底（跨模块协作面），--no-llm 下仍可用； - outline 是 LLM 提议 / 手工编辑的增强层（章 > 页 两级树，深度由类型系统强制）。 校验哲学：坏 outline 降级不失败——无效页剔除 → 空章剔除 → 全空则整体不生效， 固定 PageRegistry 页面照常构建。所有剔除与告警 | 文件头自述 | src/knowledge/outline.ts | src/knowledge/outline.ts:1 |
| 写盘前质量闸门（project-wiki 方法论「质量闸门」的代码化）。 规则与严重级： - empty-shell (error)：无正文空壳页。诚实标注"无数据"的页面（标题 + 一句说明）不算空壳，只有完全没有非标题正文时才拦截。 - secret (error)：疑似密钥/凭证值泄漏，拒绝写盘（LLM 路径降级规则生成）。 - dead-link (warn) ：markdown 相对导航链接指向本次不产出的页面。 - broken-anchor (warn) ：fi | 文件头自述 | src/knowledge/wiki-quality-validator.ts | src/knowledge/wiki-quality-validator.ts:1 |
| 页面所属层级。 - structure：结构层——描述"代码是什么"（架构、模块、API、调用关系等），可机器生成 - operations：运行规约层——描述"怎么跑/必须遵守什么"（环境、规约、测试、约束），需人工提炼 - surface：表层——描述"对外入口是什么"，按项目类型替换（CLI/后端/前端各不同） / | 文件头自述 | src/knowledge/page-registry.ts | src/knowledge/page-registry.ts:1 |
| 自适应主题页：确定性主题发现（DeepWiki 动态大纲的 CLI 化）。 发现规则全确定性（无 LLM 参与）： - clusters 主路径：成员 ≥5 且 top_nodes 文件跨 ≥2 个 packages（跨模块协作面）， 按 members×cohesion 排序取前 4；单一 package 的职责由 modules 页覆盖，不立题。 - boundaries 兜底：无合格 cluster 时，取 call_count 最高的跨包边界对为题。 - 探测不出就一 | 文件头自述 | src/knowledge/topic-discovery.ts | src/knowledge/topic-discovery.ts:1 |
| 待确认项交互裁决层：全部页面生成完成后、写盘前的批量人工确认（R5 闭环）。 待确认项四种形态（全 wiki 可 grep「待确认」定位）： - claim：断言校验标注的 `` `标识符`（待确认） `` ——确认=移除标记，可持久化免标 - cell：fallback 表格单元 ⚠️ 待确认——确认=填入用户输入的确认内容 - note：块级降级说明（unconfirmedNote）——确认=移除提示行（或替换为补充说明） - prose：LLM R5 自由文本待确认—— | 文件头自述 | src/knowledge/confirmation.ts | src/knowledge/confirmation.ts:1 |

### File Structure

| File | Key Symbols |
| --- | --- |
| `src/knowledge/claim-verifier.ts` | `Claim` |
| `src/knowledge/confirmation.ts` | `ConfirmationStore`, `add`, `applyConfirmations` |
| `src/knowledge/wiki-page-generator.ts` | `GenerationOutcome`, `StreamOutcome`, `buildArchitectureSections`, `buildGlossarySections`, `buildModulesSections` |
| `src/knowledge/wiki-builder.ts` | `addBulletList`, `addCodeBlock`, `addNewline`, `addParagraph`, `addSection` |
| `src/knowledge/wiki-context-builder.ts` | `appendSourceFallback`, `buildApiContext`, `buildArchitectureContext`, `buildByName`, `buildCallChainFromEdges` |
| `src/knowledge/wiki-continuation.ts` | `assembleSections` |
| `src/knowledge/wiki-fallback-builder.ts` | `buildApi`, `buildArchitecture`, `buildByName`, `buildCalls`, `buildChapterPage` |
| `src/knowledge/wiki-evidence.ts` | `buildEvidenceBlock` |
| `src/knowledge/outline-planner.ts` | `buildInputs` |

## services

Key exports: `ConfirmSummary`, `PageProduced`, `PageStatus`, `ProducedEntry`

Depends on: `knowledge`, `core`

Used by: `cli`

Fan-in/out: 0 / 0

### 设计依据（意图证据）

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| 首次提交：feat: 功能基本可用 | 提交记录 | services | commit:76565d14 (2026-06-02) |
| 行为承诺（tests/services/scan-service.test.ts）：ScanService；should return a complete scan result | 行为承诺 | src/services/scan-service.ts | tests/services/scan-service.test.ts:7 |
| 行为承诺（tests/services/wiki-service.test.ts）：WikiService；should generate common pages；should write files to disk in numbered directories；should include scan result data in overview page；should append Related section linking planned sibling pages；should clean up legacy flat output when rebuilding；should wipe .wiki wholesale in full mode (tool-exclusive directory, no warnings)；update mode should silently remove foreign numbered dirs and unplanned files in owned dirs；should call ensureIndexed on the client；should generate all pages in noLlm mode | 行为承诺 | src/services/wiki-service.ts | tests/services/wiki-service.test.ts:45 |

### File Structure

| File | Key Symbols |
| --- | --- |
| `src/services/wiki-service.ts` | `ConfirmSummary`, `PageProduced`, `PageStatus`, `ProducedEntry` |

## mcp

Key exports: `adaptArchitecture`, `adaptSide`, `adaptTrace`, `asObjects`

Used by: `cli`

Fan-in/out: 0 / 0

### 设计依据（意图证据）

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| codebase-memory-mcp index_repository 返回 | 文件头自述 | src/mcp/types.ts | src/mcp/types.ts:1 |
| 首次提交：refactor: 重构为基于 codebase-memory-mcp 知识图谱生成 wiki | 提交记录 | mcp | commit:9ef4fd6f (2026-06-24) |
| 高频提交主题：引入证据锚定、薄证据补强与图表闸门等 wiki 质量机制并清理旧管线死代码（×2）、重构为基于 codebase-memory-mcp 知识图谱生成 wiki（×2） | 高频主题 | mcp | commit:a430c66b (2026-09-23) |
| 行为承诺（tests/mcp/codebase-memory-client.test.ts）：CodebaseMemoryClient；项目名转义：路径 → MCP 标识符；getArchitecture 解析 JSON 输出；跳过 stderr 日志行解析 JSON；二进制不存在时抛友好错误；queryGraph 透传 Cypher | 行为承诺 | src/mcp/codebase-memory-client.ts | tests/mcp/codebase-memory-client.test.ts:9 |

### File Structure

| File | Key Symbols |
| --- | --- |
| `src/mcp/codebase-memory-client.ts` | `adaptArchitecture`, `adaptSide`, `adaptTrace`, `asObjects` |

## core

Depends on: `shared`

Used by: `services`, `cli`

Fan-in/out: 0 / 0

### 设计依据（意图证据）

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| 首次提交：feat: 功能基本可用 | 提交记录 | core | commit:76565d14 (2026-06-02) |
| 行为承诺（tests/core/scanner.test.ts）：FileScanner；should scan all source files；should not include node_modules files；should detect correct language for each file；should detect tech stack from package.json；should detect project type；仅含 allowBuilds 的 pnpm-workspace.yaml 不判为 monorepo（审批配置 ≠ workspace）；扫描 .vue/.rs/.css 文件；import 提取覆盖 Vue SFC 与 CSS @import（不再误报死依赖）；动态 import()、副作用导入（后跟 from 行）、node_modules 相对引用均可提取包名 | 行为承诺 | src/core/scanner.ts | tests/core/scanner.test.ts:9 |

## cli

Depends on: `shared`, `services`, `core`, `mcp`

Used by: `knowledge`

Fan-in/out: 0 / 0

### 设计依据（意图证据）

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| 待确认项交互会话（@clack/prompts）。 注入 WikiBuildOptions.confirmSession，在全部页面生成后、写盘前调用一次： 逐项展示「疑问 + 上下文 + 选项」，用户裁决确认或保持。 安全性：非 TTY（CI/管道/测试）直接返回空（全部保持待确认）； Ctrl-C 中断时保留已裁决项，其余按保持处理。 / | 文件头自述 | src/cli/confirm-interaction.ts | src/cli/confirm-interaction.ts:1 |
| 首次提交：feat: 功能基本可用 | 提交记录 | cli | commit:76565d14 (2026-06-02) |
| 高频提交主题：功能基本可用（×4）、修复 vue/tauri/bun 场景下的探测误报与图谱虚构边，补齐 llm 页面生成路径（×2）、支持全局配置（×2） | 高频主题 | cli | commit:b06d40e4 (2026-09-27) |
| 行为承诺（tests/cli/confirm-interaction.test.ts）：runConfirmationSession；非 TTY 环境直接返回空（CI/管道安全），不启动会话；TTY：claim 项裁决 resolve → 返回决定；keep → 不产出决定；TTY：cell 项 resolve 后追问确认内容（必填校验走 clack validate）；取消中断：保留已裁决项并停止（其余按保持处理） | 行为承诺 | src/cli/confirm-interaction.ts | tests/cli/confirm-interaction.test.ts:40 |

## fixtures

Fan-in/out: 0 / 0

## shared

Used by: `knowledge`, `cli`, `core`

Fan-in/out: 0 / 0

### 设计依据（意图证据）

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| 全局配置：~/.scx/wiki-agent/config.yaml（YAML）。 优先级：CLI 参数 > 全局配置文件 > 内置默认。 api_key 支持 ${ENV_VAR} 环境变量引用（展开失败置空并告警，不把字面量发往 API）。 配置缺失/解析失败一律降级为「无配置」并告警，绝不阻断构建。 / | 文件头自述 | src/shared/config.ts | src/shared/config.ts:1 |
| 首次提交：feat: 功能基本可用 | 提交记录 | shared | commit:76565d14 (2026-06-02) |
| 行为承诺（tests/shared/config.test.ts）：parseGlobalConfig；解析 provider 与 build 字段，provider 缺省 base_url 按名称映射；build.confirm 解析：true 时携带，缺省不携带（CLI --confirm 的一次性开关互不影响）；显式 base_url 优先于 provider 缺省映射；api_key 支持 ${ENV_VAR} 引用；未定义变量置空并告警；provider 缺 name/model、坏 YAML、非对象内容均返回 null（不抛异常）；非法 build 字段值被忽略（类型/枚举校验）；loadGlobalConfig；文件不存在返回 null；存在则解析；模板本身可被解析；读取失败（目录路径）告警并返回 null | 行为承诺 | src/shared/config.ts | tests/shared/config.test.ts:7 |
| 行为承诺（tests/shared/utils.test.ts）：utils；getFileLanguage detects TypeScript；relativePath returns relative path from root；isTestPath 识别测试目录/文件，不误伤生产路径；languageDomainOf 划分语言域：代码文件归 ts/rust，非代码文件为 null；matchPackageForFile 路径段精确归属，多段包名取最长（修复 src-tauri/src 与 src 撞名） | 行为承诺 | src/shared/utils.ts | tests/shared/utils.test.ts:4 |

## helpers

Used by: `knowledge`

Fan-in/out: 0 / 0
## Related

- 同目录：[architecture.md](architecture.md) · [data-flow.md](data-flow.md)
- 总入口：[README](../README.md)
