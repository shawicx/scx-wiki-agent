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

## 关键符号

| 符号 | 类型 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| `buildArchitectureSections` | method | `(ctx: ArchitectureContext)` | /** 架构页确定性节表：整体思路+架构图 → 核心模块详解（≤6 个/批）→ 依赖分析+横切关注点 */ | src/knowledge/wiki-page-generator.ts:202 |
| `buildGlossarySections` | method | `(ctx: GlossaryContext)` | /**\n   * 关键概念页确定性节表：符号按所属模块分组（整组进同一节，避免同模块符号跨节碎片化），\n   * 贪心分桶为 1-3 节（每节约 20 个符号）；补强符号按模块归入对应节。\n   */ | src/knowledge/wiki-page-generator.ts:536 |
| `buildModulesSections` | method | `(ctx: ModulesContext)` | /** 模块页确定性节表：组织方式概述 → 模块详解（≤4 个/批）→ 其他模块汇总 */ | src/knowledge/wiki-page-generator.ts:323 |
| `chunk` | function | `(items: T[], size: number)` | /** 均匀分块（保序） */ | src/knowledge/wiki-page-generator.ts:62 |
| `cleanupLegacyFlatFiles` | method | `(wikiDir: string, pages: string[])` | /**\n   * 清理旧版扁平输出（wiki 根下的 ${page}.md）。\n   * 只删除本工具拥有的页面文件；编号目录接管后这些扁平文件成为陈旧残留。\n   * readme 特例：旧 'readme.md' 让位于 'README.md'。\n   * 用目录条目精确比对文件名：大小写不敏感文件系统上 existsSync('readme.md')\n   * 会误命中 'README.md'，导致每次构建都误删并重写 README。\n   */ | src/services/wiki-service.ts:362 |
| `cleanupRetiredPages` | method | `(wikiDir: string)` | /** 清理已退休页面路径的残留文件（改名/下线登记于 RETIRED_WIKI_PATHS）；清空的宿主目录一并移除 */ | src/services/wiki-service.ts:383 |
| `cleanupStaleChapterPages` | method | `(wikiDir: string, pages: string[])` | /** 清理 09-chapters 下未列入本次计划的章节页残留；清空的章目录与章节根目录一并移除（目录为工具所有） */ | src/services/wiki-service.ts:416 |
| `cleanupStaleNumberedDirFiles` | method | `(wikiDir: string, pages: string[])` | /**\n   * 编号目录治理（update 模式路径；.wiki 为工具独占目录，full 模式已整目录重建）：\n   * - 工具所有的编号目录（PAGE_REGISTRY 声明 + 08/09，后两者由专属清理负责，此处跳过）：\n   *   目录内文件名落在注册页名空间（ALL_PAGE_NAMES）但未列入本次计划的 .md 视为\n   *   旧版产物残留（如旧版章节页 01-overview/architecture.md），清理；\n   *   页名空间之外的文件一并清理（目录为工具 | src/services/wiki-service.ts:474 |
| `cleanupStaleTopicPages` | method | `(wikiDir: string, pages: string[])` | /** 清理 08-topics 下未列入本次计划的主题文件（目录为工具所有） */ | src/services/wiki-service.ts:402 |
| `generateByName` | method | `(page: string, ctx: any, onChunk: (text: string) => void)` | /** 按页面名派发 LLM 生成（供 PageRegistry 调用） */ | src/knowledge/wiki-page-generator.ts:132 |
| `generateSectioned` | method | `(onChunk: (text: string) => void, sections: PageConfig[])` | /**\n   * 分节生成：按确定性节表逐节生成（串行），每节独立获得输出预算与数据切片，\n   * 并自动继承断流续写能力。任一节为空则整页判失败（返回 ''，交由降级路径）。\n   */ | src/knowledge/wiki-page-generator.ts:830 |
| `generateWithContinuation` | method | `(\n    onChunk: (text: string) => void,\n    config: PageConfig,\n  )` | /** 单次生成 + 断流续写循环；返回内容与续写统计 */ | src/knowledge/wiki-page-generator.ts:851 |
| `moduleKeyOf` | function | `(filePath: string)` | /** 从相对路径推导模块归属键（src/<module>/… → <module>，否则取首段目录） */ | src/knowledge/wiki-page-generator.ts:69 |
| `outlineKnown` | method | `(knownFiles: Set<string>, outlineRaw: unknown)` | /** 组装章节树校验参考集：模块来自架构包，符号来自 outline 引用文件\n   *  （图谱有界查询 + 源码正则回落——图谱漏采的 brief 符号免于 W3「查无实据」误剔） */ | src/services/wiki-service.ts:329 |
| `plan` | method | `(systemPrompt: string, userPrompt: string)` | /** 规划类调用的原始文本（章节树 planner 复用模型与续写能力；不做 sanitize） */ | src/knowledge/wiki-page-generator.ts:125 |
| `planOutline` | method | `(\n    generator: WikiPageGenerator,\n    topics: TopicDefinition[],\n    knownFiles: Set<string>,\n  )` | /**\n   * 章节树规划：LLM 提议 → 校验器裁决；净树为空且存在剔除时，\n   * 携剔除原因反馈重试一次（仍空则返回首轮产物，交由正常校验路径降级）。\n   * 输出不可解析返回 null。\n   */ | src/services/wiki-service.ts:301 |
| `printBuildReport` | method | `(\n    written: Array<{ page: string; relPath: string; source: string; status: PageStatus }>,\n    skipped: Array<{ page: string; reason: string }>,\n    reports: PageQualityReport[],\n    legacyRemoved: string[],\n    continuations: Array<{ page: string; rounds: number; truncated: boolean }>,\n    sectionedPages: Array<{ page: string; sections: number; continuedSections: number; truncated: boolean }>,\n    llmDropped: Array<{ page: string; reason: string }>,\n    outline: OutlineReport | null,\n    claimS` | /**\n   * 构建报告（对应 project-wiki「完成后清单」）：\n   * 已写页面（新增/更新分计 + 生成路径统计）、update 模式变更摘要、\n   * 跳过页面及原因、锚点核验统计、告警汇总。\n   */ | src/services/wiki-service.ts:543 |
| `removeEmptyOwnedDirs` | method | `(wikiDir: string)` | /** 清理后扫描：清空的工具编号目录一并移除（update 模式下页面全部停写/剔除后的残留空目录） */ | src/services/wiki-service.ts:450 |
| `resolvePages` | method | `(requested: string[] | undefined, topicPages: string[], chapterPages: string[])` | /**\n   * 解析 --pages 参数，校验页名合法性。\n   *\n   * 默认页面集 = 全部非 surface 页面（Tier0 结构层 + Tier1 运行规约层）\n   *   + 按 projectType 激活的 surface 层（Tier2）。\n   * surface 页面（cli/routes/components/...）只在对应项目类型下默认生成。\n   */ | src/services/wiki-service.ts:254 |
| `sectionScope` | function | `(pageTitle: string, sectionTitle: string, siblings: string[])` | /** 分节作用域约束：告知本页节清单与本节职责，防止跨节越界或重复 */ | src/knowledge/wiki-page-generator.ts:77 |
| `streamOnce` | method | `(\n    onChunk: (text: string) => void,\n    config: PageConfig,\n    prefix?: string,\n  )` | /**\n   * 单轮流式生成。携带 prefix 时以 messages 形式发起续写：\n   * 原始页面数据 + 已生成的安全前缀 + 续写指令。\n   */ | src/knowledge/wiki-page-generator.ts:890 |
| `stripCodeFences` | function | `(text: string)` | /**\n * 去除整个内容被 ```markdown ... ``` 包裹的情况。\n * 仅当首行是 ``` 开头且末行是 ``` 时处理。\n */ | src/knowledge/wiki-output-sanitizer.ts:38 |
| `stripPreamble` | function | `(text: string)` | /**\n * 移除首行寒暄前导语。\n * 从首行开始扫描，跳过所有\"非标题/非表格/非列表\"的开场白行，\n * 直到遇到第一个 Markdown 结构行（# 标题、| 表格、- 列表、> 引用、``` 代码块）。\n */ | src/knowledge/wiki-output-sanitizer.ts:49 |

## 协作边表（文件间调用）

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| buildArchitectureSections | chunk | src/knowledge/wiki-page-generator.ts:62 |
| buildArchitectureSections | sectionScope | src/knowledge/wiki-page-generator.ts:77 |
| buildGlossarySections | moduleKeyOf | src/knowledge/wiki-page-generator.ts:69 |
| buildGlossarySections | buildGlossarySections | src/knowledge/wiki-page-generator.ts:536 |
| buildGlossarySections | sectionScope | src/knowledge/wiki-page-generator.ts:77 |
| buildModulesSections | chunk | src/knowledge/wiki-page-generator.ts:62 |
| buildModulesSections | sectionScope | src/knowledge/wiki-page-generator.ts:77 |
| buildWiki | WikiPageGenerator | src/knowledge/wiki-page-generator.ts:93 |
| buildWiki | planOutline | src/services/wiki-service.ts:301 |
| buildWiki | outlineKnown | src/services/wiki-service.ts:329 |
| buildWiki | resolvePages | src/services/wiki-service.ts:254 |
| buildWiki | cleanupStaleNumberedDirFiles | src/services/wiki-service.ts:474 |
| buildWiki | cleanupLegacyFlatFiles | src/services/wiki-service.ts:362 |
| buildWiki | cleanupRetiredPages | src/services/wiki-service.ts:383 |
| buildWiki | cleanupStaleTopicPages | src/services/wiki-service.ts:402 |
| buildWiki | cleanupStaleChapterPages | src/services/wiki-service.ts:416 |
| buildWiki | removeEmptyOwnedDirs | src/services/wiki-service.ts:450 |
| buildWiki | buildWiki | src/services/wiki-service.ts:45 |
| buildWiki | generatePage | src/services/wiki-service.ts:507 |
| buildWiki | getSymbolUniverse | src/services/wiki-service.ts:283 |
| buildWiki | printBuildReport | src/services/wiki-service.ts:543 |
| generate | generateWithContinuation | src/knowledge/wiki-page-generator.ts:851 |
| generateApi | generate | src/knowledge/wiki-page-generator.ts:817 |
| generateArchitecture | generateSectioned | src/knowledge/wiki-page-generator.ts:830 |
| generateArchitecture | buildArchitectureSections | src/knowledge/wiki-page-generator.ts:202 |
| generateByName | generateChapterPage | src/knowledge/wiki-page-generator.ts:640 |
| generateByName | generateTopic | src/knowledge/wiki-page-generator.ts:602 |
| generateByName | generateOverview | src/knowledge/wiki-page-generator.ts:154 |
| generateByName | generateArchitecture | src/knowledge/wiki-page-generator.ts:197 |
| generateByName | generateDataFlow | src/knowledge/wiki-page-generator.ts:285 |

## 跨模块边界

| From | To | 调用次数 |
| --- | --- | --- |
| knowledge | shared | 33 |
| services | knowledge | 33 |
| knowledge | cli | 3 |
| cli | services | 2 |
| services | cli | 1 |
## Related

- 同目录：[topic-9.md](topic-9.md)
- 总入口：[README](../README.md)
