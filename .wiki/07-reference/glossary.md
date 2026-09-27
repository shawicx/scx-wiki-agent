# Key Concepts

<details>
<summary>Relevant source files</summary>

- src/knowledge/claim-verifier.ts
- src/knowledge/wiki-builder.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-fallback-builder.ts
- src/knowledge/wiki-page-generator.ts
- src/mcp/codebase-memory-client.ts
- src/services/wiki-service.ts
</details>

| Name | Type | Signature | Docstring | File |
| --- | --- | --- | --- | --- |
| Claim | interface |  | /** 单个声明：raw = 反引号内原文（用于改写定位），name = 末段标识符（用于核验） */ | src/knowledge/claim-verifier.ts:15 |
| GenerationOutcome | interface |  | /** 带续写统计的一节/一页生成结果 */ | src/knowledge/wiki-page-generator.ts:41 |
| PageProduced | interface |  | /** 单页产出结果：最终内容 + 走的生成路径 + LLM 路径放弃原因（仅降级时） */ | src/services/wiki-service.ts:30 |
| StreamOutcome | interface |  | /** 单轮流式生成的产出与终止原因 */ | src/knowledge/wiki-page-generator.ts:34 |
| adaptArchitecture | function | (raw: Record<string, any>) | /** get_architecture 列式表 → ArchitectureData 对象数组 */ | src/mcp/codebase-memory-client.ts:45 |
| adaptTrace | function | (raw: Record<string, any>) | /** trace_path 分组列式表 → 扁平 TraceNode[] */ | src/mcp/codebase-memory-client.ts:92 |
| addBulletList | method | (items: string[]) | /** Add a bullet list. */ | src/knowledge/wiki-builder.ts:50 |
| addCodeBlock | method | (language: string, code: string) | /** Add a fenced code block with an optional language hint. */ | src/knowledge/wiki-builder.ts:35 |
| addNewline | method | () | /** Add an empty line. */ | src/knowledge/wiki-builder.ts:56 |
| addParagraph | method | (text: string) | /** Add a plain paragraph. */ | src/knowledge/wiki-builder.ts:29 |
| addSection | method | (title: string, content: string) | /** Add a second-level section: `## title` +（content 非空时）`\\n\\ncontent` */ | src/knowledge/wiki-builder.ts:17 |
| addSubSection | method | (title: string, content: string) | /** Add a third-level sub-section: `### title` +（content 非空时）`\\n\\ncontent` */ | src/knowledge/wiki-builder.ts:23 |
| addTable | method | (headers: string[], rows: string[][]) | /** Add a markdown table from headers and rows. */ | src/knowledge/wiki-builder.ts:41 |
| addTitle | method | (title: string) | /** Add a top-level title: `# title` */ | src/knowledge/wiki-builder.ts:11 |
| appendSourceFallback | method | (existing: Array<{ name: string }>) | /**\n   * 源码回落：图谱补强未覆盖的热点/入口名，交正则探测补齐。\n   * 找到的名字记入 fallbackSymbolNames（供断言校验 universe 回填）。\n   */ | src/knowledge/wiki-context-builder.ts:154 |
| asObjects | function | (raw: Record<string, unknown>, key: string) | /** 兼容两种形态：旧版对象数组 / 新版列式表 */ | src/mcp/codebase-memory-client.ts:35 |
| build | method | () | /** Join all sections with newlines and return the final document. */ | src/knowledge/wiki-builder.ts:62 |
| buildArchitectureSections | method | (ctx: ArchitectureContext) | /** 架构页确定性节表：整体思路+架构图 → 核心模块详解（≤6 个/批）→ 依赖分析+横切关注点 */ | src/knowledge/wiki-page-generator.ts:202 |
| buildByName | method | (page: string, plannedPages?: string[]) | /** 按页面名派发上下文构建（供 PageRegistry 调用）。plannedPages 用于 readme 索引只列本次产出的页面 */ | src/knowledge/wiki-context-builder.ts:83 |
| buildCallChainFromEdges | method | (entryName: string, entryFile: string) | /**\n   * 基于 CALLS 边 BFS 构建真实调用链（修复伪线性化问题）。\n   * trace_path 返回扁平的 callee 列表（只有 hop 层级，无 caller→callee 边），\n   * 直接线性化会把并行分支误画成串行序列。\n   * 这里改用 Cypher 查精确的 CALLS 边，按 BFS 层级还原真实的 caller→callee 关系。\n   * frontier 用 name@file 双键，防止同名符号跨语言/跨文件互相污染。\n   */ | src/knowledge/wiki-context-builder.ts:420 |
| buildCalls | method | (ctx: CallsContext) | /**\n   * calls.md：调用边表（R2 边表优于时序图）。\n   * 纯规则生成，不使用 sequenceDiagram。\n   */ | src/knowledge/wiki-fallback-builder.ts:395 |
| buildCallsContext | method | () | /**\n   * calls.md 数据源：调用边表（R2 边表优于时序图）。\n   * 用 Cypher 查 (a:Method|Function)-[:CALLS]->(b)，按入口分组。\n   * trace_path 不可靠（对 Method 返回空、无 file/line），改用 Cypher CALLS 边。\n   * 消费端防线：入口过滤（非代码/构建脚本不立组）+ name@file 双键 BFS（防同名污染）\n   * + isTrustedCallEdge（跨语言幽灵边与无词法佐证的边丢弃）。\n   * 覆盖面兜底：入口组不足时以高扇入 | src/knowledge/wiki-context-builder.ts:757 |
| buildChapterPage | method | (ctx: ChapterPageContext) | /** 章节页规则模板：简报 + 覆盖文件 + 关键符号 + 协作边表 + 跨模块边界 */ | src/knowledge/wiki-fallback-builder.ts:834 |
| buildChapterPageContext | method | (page: string) | /**\n   * 章节页数据源：与主题页同一套图谱查询（符号/边/边界），\n   * 叠加 outline.json 锁定的章信息与写作简报（brief 驱动生成）。\n   */ | src/knowledge/wiki-context-builder.ts:939 |
| buildClasses | method | (ctx: ClassesContext) | /**\n   * classes.md：类层次与多态（降级适配）。\n   * MCP 无 INHERITS 边，只做\"类清单 + 每类方法表\"，诚实标注数据局限。\n   */ | src/knowledge/wiki-fallback-builder.ts:452 |
| buildClassesContext | method | () | /**\n   * classes.md 数据源：类清单 + 每类方法表（降级适配）。\n   * MCP 无 INHERITS 边、Class 无 parent_class/is_abstract，故只做扁平类表。\n   * 方向是 (c:Class)-[:DEFINES_METHOD]->(m:Method)。\n   */ | src/knowledge/wiki-context-builder.ts:882 |
| buildCli | method | (ctx: CliContext) | /**\n   * cli.md：CLI 命令参考。\n   * 命令表（含 file:line）+ 每命令参数表（commander .option 解析）+ 退出码表。\n   */ | src/knowledge/wiki-fallback-builder.ts:692 |
| buildCliContext | method | () | /**\n   * cli.md 数据源：命令注册（MCP entry_points + getCodeSnippet 解析 commander options）\n   * + 退出码（源码扫 process.exit(N)）。\n   *\n   * entry_points 即 CLI 命令入口；getCodeSnippet 读 register*Command 源码，\n   * 从 .option() 调用提取参数定义。\n   */ | src/knowledge/wiki-context-builder.ts:1166 |
| buildConstraints | method | (ctx: ConstraintsContext) | /**\n   * constraints.md：项目边界与代价。\n   * 限制常量（源码 MAX/LIMIT/TIMEOUT）+ 高复杂度函数表（complexity > 3）。\n   */ | src/knowledge/wiki-fallback-builder.ts:660 |
| buildConstraintsContext | method | () | /**\n   * constraints.md 数据源：限制常量（ConfigDetector 源码扫描）+ 高复杂度函数（MCP）。\n   *\n   * 关键：MCP 的 complexity 仅在 Method/Function 节点可靠（Class/Interface 恒 0），\n   * 故 Cypher 显式限定 label IN ['Method', 'Function']，避免拉入噪声。\n   */ | src/knowledge/wiki-context-builder.ts:1140 |
## Related

- 同目录：[calls.md](calls.md) · [classes.md](classes.md)
- 总入口：[README](../README.md)
