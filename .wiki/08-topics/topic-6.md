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
| `cleanupLegacyFlatFiles` | method | `(wikiDir: string, pages: string[])` | /**\n   * 清理旧版扁平输出（wiki 根下的 ${page}.md）。\n   * 只删除本工具拥有的页面文件；编号目录接管后这些扁平文件成为陈旧残留。\n   * readme 特例：旧 'readme.md' 让位于 'README.md'。\n   * 用目录条目精确比对文件名：大小写不敏感文件系统上 existsSync('readme.md')\n   * 会误命中 'README.md'，导致每次构建都误删并重写 README。\n   */ | src/services/wiki-service.ts:179 |
| `cleanupRetiredPages` | method | `(wikiDir: string)` | /** 清理已退休页面路径的残留文件（改名/下线登记于 RETIRED_WIKI_PATHS） */ | src/services/wiki-service.ts:200 |
| `cleanupStaleTopicPages` | method | `(wikiDir: string, pages: string[])` | /** 清理 08-topics 下未列入本次计划的主题文件（目录为工具所有） */ | src/services/wiki-service.ts:213 |
| `generateByName` | method | `(page: string, ctx: any, onChunk: (text: string) => void)` | /** 按页面名派发 LLM 生成（供 PageRegistry 调用） */ | src/knowledge/wiki-page-generator.ts:51 |
| `printBuildReport` | method | `(\n    written: Array<{ page: string; relPath: string; source: string; status: PageStatus }>,\n    skipped: Array<{ page: string; reason: string }>,\n    reports: PageQualityReport[],\n    legacyRemoved: string[],\n  )` | /**\n   * 构建报告（对应 project-wiki「完成后清单」）：\n   * 已写页面（新增/更新分计 + 生成路径统计）、update 模式变更摘要、\n   * 跳过页面及原因、锚点核验统计、告警汇总。\n   */ | src/services/wiki-service.ts:258 |
| `resolvePages` | method | `(requested: string[] | undefined, topicPages: string[])` | /**\n   * 解析 --pages 参数，校验页名合法性。\n   *\n   * 默认页面集 = 全部非 surface 页面（Tier0 结构层 + Tier1 运行规约层）\n   *   + 按 projectType 激活的 surface 层（Tier2）。\n   * surface 页面（cli/routes/components/...）只在对应项目类型下默认生成。\n   */ | src/services/wiki-service.ts:150 |
| `stripCodeFences` | function | `(text: string)` | /**\n * 去除整个内容被 ```markdown ... ``` 包裹的情况。\n * 仅当首行是 ``` 开头且末行是 ``` 时处理。\n */ | src/knowledge/wiki-output-sanitizer.ts:38 |
| `stripPreamble` | function | `(text: string)` | /**\n * 移除首行寒暄前导语。\n * 从首行开始扫描，跳过所有\"非标题/非表格/非列表\"的开场白行，\n * 直到遇到第一个 Markdown 结构行（# 标题、| 表格、- 列表、> 引用、``` 代码块）。\n */ | src/knowledge/wiki-output-sanitizer.ts:49 |

## 协作边表（文件间调用）

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| buildWiki | resolvePages | src/services/wiki-service.ts:150 |
| buildWiki | WikiPageGenerator | src/knowledge/wiki-page-generator.ts:25 |
| buildWiki | cleanupLegacyFlatFiles | src/services/wiki-service.ts:179 |
| buildWiki | cleanupRetiredPages | src/services/wiki-service.ts:200 |
| buildWiki | cleanupStaleTopicPages | src/services/wiki-service.ts:213 |
| buildWiki | generatePage | src/services/wiki-service.ts:226 |
| buildWiki | printBuildReport | src/services/wiki-service.ts:258 |
| generateApi | generate | src/knowledge/wiki-page-generator.ts:466 |
| generateArchitecture | generate | src/knowledge/wiki-page-generator.ts:466 |
| generateByName | generateTopic | src/knowledge/wiki-page-generator.ts:352 |
| generateByName | generateOverview | src/knowledge/wiki-page-generator.ts:69 |
| generateByName | generateArchitecture | src/knowledge/wiki-page-generator.ts:107 |
| generateByName | generateDataFlow | src/knowledge/wiki-page-generator.ts:151 |
| generateByName | generateModules | src/knowledge/wiki-page-generator.ts:185 |
| generateByName | generateApi | src/knowledge/wiki-page-generator.ts:231 |
| generateByName | generateOnboarding | src/knowledge/wiki-page-generator.ts:271 |
| generateByName | generateTroubleshooting | src/knowledge/wiki-page-generator.ts:299 |
| generateByName | generateGlossary | src/knowledge/wiki-page-generator.ts:322 |
| generateByName | generateDecisions | src/knowledge/wiki-page-generator.ts:390 |
| generateByName | generateTesting | src/knowledge/wiki-page-generator.ts:411 |
| generateByName | generateConstraints | src/knowledge/wiki-page-generator.ts:427 |
| generateConstraints | generate | src/knowledge/wiki-page-generator.ts:466 |
| generateDataFlow | generate | src/knowledge/wiki-page-generator.ts:466 |
| generateDecisions | generate | src/knowledge/wiki-page-generator.ts:466 |
| generateGlossary | generate | src/knowledge/wiki-page-generator.ts:466 |
| generateModules | generate | src/knowledge/wiki-page-generator.ts:466 |
| generateOnboarding | generate | src/knowledge/wiki-page-generator.ts:466 |
| generateOverview | generate | src/knowledge/wiki-page-generator.ts:466 |
| generatePage | hasModel | src/knowledge/wiki-page-generator.ts:46 |
| generatePage | generateByName | src/knowledge/wiki-page-generator.ts:51 |

## 跨模块边界

| From | To | 调用次数 |
| --- | --- | --- |
| services | knowledge | 22 |
| knowledge | shared | 12 |
| cli | services | 2 |
| services | core | 1 |
| services | cli | 1 |
## Related

- 同目录：[topic-9.md](topic-9.md)
- 总入口：[README](../README.md)
