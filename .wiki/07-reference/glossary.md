# Key Concepts

<details>
<summary>Relevant source files</summary>

- src/knowledge/wiki-builder.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-fallback-builder.ts
- src/mcp/codebase-memory-client.ts
- src/services/wiki-service.ts
</details>

| Name | Type | Signature | Docstring | File |
| --- | --- | --- | --- | --- |
| PageProduced | interface |  | /** 单页产出结果：最终内容 + 走的生成路径 */ | src/services/wiki-service.ts:22 |
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
| asObjects | function | (raw: Record<string, unknown>, key: string) | /** 兼容两种形态：旧版对象数组 / 新版列式表 */ | src/mcp/codebase-memory-client.ts:35 |
| build | method | () | /** Join all sections with newlines and return the final document. */ | src/knowledge/wiki-builder.ts:62 |
| buildByName | method | (page: string, plannedPages?: string[]) | /** 按页面名派发上下文构建（供 PageRegistry 调用）。plannedPages 用于 readme 索引只列本次产出的页面 */ | src/knowledge/wiki-context-builder.ts:68 |
| buildCallChainFromEdges | method | (entryName: string, entryFile: string) | /**\n   * 基于 CALLS 边 BFS 构建真实调用链（修复伪线性化问题）。\n   * trace_path 返回扁平的 callee 列表（只有 hop 层级，无 caller→callee 边），\n   * 直接线性化会把并行分支误画成串行序列。\n   * 这里改用 Cypher 查精确的 CALLS 边，按 BFS 层级还原真实的 caller→callee 关系。\n   */ | src/knowledge/wiki-context-builder.ts:261 |
| buildCalls | method | (ctx: CallsContext) | /**\n   * calls.md：调用边表（R2 边表优于时序图）。\n   * 纯规则生成，不使用 sequenceDiagram。\n   */ | src/knowledge/wiki-fallback-builder.ts:337 |
| buildCallsContext | method | () | /**\n   * calls.md 数据源：调用边表（R2 边表优于时序图）。\n   * 用 Cypher 查 (a:Method|Function)-[:CALLS]->(b)，按入口分组。\n   * trace_path 不可靠（对 Method 返回空、无 file/line），改用 Cypher CALLS 边。\n   */ | src/knowledge/wiki-context-builder.ts:551 |
| buildClasses | method | (ctx: ClassesContext) | /**\n   * classes.md：类层次与多态（降级适配）。\n   * MCP 无 INHERITS 边，只做\"类清单 + 每类方法表\"，诚实标注数据局限。\n   */ | src/knowledge/wiki-fallback-builder.ts:376 |
| buildClassesContext | method | () | /**\n   * classes.md 数据源：类清单 + 每类方法表（降级适配）。\n   * MCP 无 INHERITS 边、Class 无 parent_class/is_abstract，故只做扁平类表。\n   * 方向是 (c:Class)-[:DEFINES_METHOD]->(m:Method)。\n   */ | src/knowledge/wiki-context-builder.ts:630 |
| buildCli | method | (ctx: CliContext) | /**\n   * cli.md：CLI 命令参考。\n   * 命令表（含 file:line）+ 每命令参数表（commander .option 解析）+ 退出码表。\n   */ | src/knowledge/wiki-fallback-builder.ts:607 |
| buildCliContext | method | () | /**\n   * cli.md 数据源：命令注册（MCP entry_points + getCodeSnippet 解析 commander options）\n   * + 退出码（源码扫 process.exit(N)）。\n   *\n   * entry_points 即 CLI 命令入口；getCodeSnippet 读 register*Command 源码，\n   * 从 .option() 调用提取参数定义。\n   */ | src/knowledge/wiki-context-builder.ts:833 |
| buildConstraints | method | (ctx: ConstraintsContext) | /**\n   * constraints.md：项目边界与代价。\n   * 限制常量（源码 MAX/LIMIT/TIMEOUT）+ 高复杂度函数表（complexity > 3）。\n   */ | src/knowledge/wiki-fallback-builder.ts:575 |
| buildConstraintsContext | method | () | /**\n   * constraints.md 数据源：限制常量（ConfigDetector 源码扫描）+ 高复杂度函数（MCP）。\n   *\n   * 关键：MCP 的 complexity 仅在 Method/Function 节点可靠（Class/Interface 恒 0），\n   * 故 Cypher 显式限定 label IN ['Method', 'Function']，避免拉入噪声。\n   */ | src/knowledge/wiki-context-builder.ts:807 |
| buildConventions | method | (ctx: ConventionsContext) | /**\n   * conventions.md：规约文档（AI 头号参考）。\n   * 诚实标注工具链检测结果：有 lint 则列规则，无则明确提示需人工补充。\n   * 从 AGENTS.md 提取关键规约段落。\n   */ | src/knowledge/wiki-fallback-builder.ts:532 |
| buildConventionsContext | method | () | /**\n   * conventions.md 数据源：规约信息（来自 ConfigDetector）。\n   * Linter/EditorConfig/AGENTS.md 探测结果，诚实标注缺失项。\n   */ | src/knowledge/wiki-context-builder.ts:797 |
| buildDecisions | method | (ctx: DecisionsContext) | /**\n   * decisions.md：ADR 架构决策记录。\n   * 每条 ADR：编号+状态+背景+决策+后果+相关文件（R1 锚点、R4 结构化）。\n   */ | src/knowledge/wiki-fallback-builder.ts:752 |
| buildDecisionsContext | method | () | /**\n   * decisions.md 数据源：ADR 架构决策记录。\n   * MCP manage_adr 当前无持久化 ADR，降级为从图谱真实证据（分层/边界/技术栈）自动推导。\n   */ | src/knowledge/wiki-context-builder.ts:995 |
| buildEnvironment | method | (ctx: EnvironmentContext) | /**\n   * environment.md：运行态信息（包名/版本/运行时/脚本/env 变量）。\n   * 纯规则生成，数据来自 ConfigDetector 探测的实际配置文件。\n   */ | src/knowledge/wiki-fallback-builder.ts:472 |
| buildEnvironmentContext | method | () | /**\n   * environment.md 数据源：运行态信息（来自 ConfigDetector）。\n   * 包名/版本/运行时/Node 版本/包管理器/脚本命令/env 变量。\n   */ | src/knowledge/wiki-context-builder.ts:777 |
| buildReadme | method | (ctx: ReadmeContext) | /**\n   * README.md：导航索引（wiki 总入口）。\n   * 按编号目录分组索引（project-wiki「总入口：使用方式/阅读路径/核心导航」），\n   * 索引表只列本次产出的文档，链接相对 wiki 根。\n   */ | src/knowledge/wiki-fallback-builder.ts:422 |
## Related

- 同目录：[calls.md](calls.md) · [classes.md](classes.md)
- 总入口：[README](../README.md)
