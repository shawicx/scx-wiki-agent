# generateByName 协作面

<details>
<summary>Relevant source files</summary>

- src/knowledge/wiki-output-sanitizer.ts
- src/knowledge/wiki-page-generator.ts
- src/services/wiki-service.ts
</details>

本页描述 `generateByName` 这一跨模块协作面：它是「页面名 → LLM 生成」的派发入口，位于 `wiki-page-generator.ts`，由 `services` 层的构建流程驱动，并最终汇入 `wiki-output-sanitizer.ts` 的输出净化链路。之所以单独成页，是因为该主题横跨 `knowledge`（生成器与净化器）与 `services`（构建编排、清理、报告）两层，承担了「按页名路由到具体生成函数」这一仓储级协作契约——任何页面类型的增删、派发逻辑调整、输出格式约束，都需要同时改动这三个文件，属于固定文档未覆盖的仓库特有协作面。

## 职责与范围

本主题覆盖三个文件，分工如下：

| 文件 | 角色 | 在协作面中的职责 |
|------|------|------------------|
| `src/knowledge/wiki-page-generator.ts` | 生成器 | 提供 `generateByName` 派发入口与各页面类型的具体生成函数（overview/architecture/dataFlow/modules/api/onboarding/troubleshooting/glossary/topic/decisions/testing/constraints），均以 file:line 锚点登记于符号表 |
| `src/services/wiki-service.ts` | 构建编排 | 调用 `resolvePages` 决定页面集合，依次执行三类清理、调用生成、输出报告（`buildWiki` 为编排主函数，锚点见 edges） |
| `src/knowledge/wiki-output-sanitizer.ts` | 输出净化 | 通过 `stripCodeFences`、`stripPreamble` 等函数清洗 LLM 原始输出，由 `generatePage` 调用 |

依据边界数据，`services → knowledge` 的调用次数为 22，是本主题最主要的协作方向；`knowledge → shared` 为 13 次，`cli → services` 为 2 次。

## 关键符号

### generateByName（`src/knowledge/wiki-page-generator.ts:51`）

```ts
generateByName(page: string, ctx: any, onChunk: (text: string) => void)
```

按页面名派发 LLM 生成（供 PageRegistry 调用）。它是本协作面的核心枢纽：根据 `page` 名称，将请求路由到对应的生成函数。从 edges 可见其派发目标覆盖 11 个生成函数（overview 至 constraints 及 topic），是"页面类型—生成函数"映射的唯一集中点。该符号复杂度为 14，属于本主题内复杂度最高的方法，反映其承担的分支派发负荷。

### resolvePages（`src/services/wiki-service.ts:150`）

```ts
resolvePages(requested: string[] | undefined, topicPages: string[])
```

解析 `--pages` 参数并校验页名合法性。默认页面集 = 全部非 surface 页面（Tier0 结构层 + Tier1 运行规约层）+ 按 `projectType` 激活的 surface 层（Tier2）；surface 页面（cli/routes/components/...）仅在对应项目类型下默认生成。它是 `generateByName` 派发集合的上游决定者：`buildWiki` 先经此函数确定 `pages`，再驱动生成。

### printBuildReport（`src/services/wiki-service.ts:258`）

```ts
printBuildReport(
    written: Array<{ page: string; relPath: string; source: string; status: PageStatus }>,
    skipped: Array<{ page: string; reason: string }>,
    reports: PageQualityReport[],
    legacyRemoved: string[],
)
```

构建报告（对应 project-wiki「完成后清单」）：已写页面（新增/更新分计 + 生成路径统计）、update 模式变更摘要、跳过页面及原因、锚点核验统计、告警汇总。它汇总生成阶段的产出与三类清理的结果，是协作面收尾环节的聚合点。

### 三类清理方法（`src/services/wiki-service.ts`）

| 符号 | 位置 | 签名 | 职责 |
|------|------|------|------|
| `cleanupLegacyFlatFiles` | `src/services/wiki-service.ts:179` | `(wikiDir: string, pages: string[])` | 清理旧版扁平输出（wiki 根下的 `${page}.md`），仅删除本工具拥有的页面文件；readme 特例：旧 `readme.md` 让位于 `README.md` |
| `cleanupRetiredPages` | `src/services/wiki-service.ts:200` | `(wikiDir: string)` | 清理已退休页面路径的残留文件（改名/下线登记于 `RETIRED_WIKI_PATHS`） |
| `cleanupStaleTopicPages` | `src/services/wiki-service.ts:213` | `(wikiDir: string, pages: string[])` | 清理 `08-topics` 下未列入本次计划的主题文件（目录为工具所有） |

三者均在 `buildWiki` 生成阶段之前调用，保证输出目录只含有本次计划的页面，避免陈旧残留。

### 输出净化函数（`src/knowledge/wiki-output-sanitizer.ts`）

```ts
stripCodeFences(text: string)   // :38 去除整个内容被 ```markdown ... ``` 包裹的情况
stripPreamble(text: string)     // :49 移除首行寒暄前导语，扫描至第一个 Markdown 结构行
```

`stripCodeFences` 仅当首行是 ` ``` ` 开头且末行是 ` ``` ` 时处理；`stripPreamble` 从首行开始跳过所有"非标题/非表格/非列表"的开场白行，直到遇到第一个 Markdown 结构行（`#` 标题、`|` 表格、`-` 列表、`>` 引用、` ``` ` 代码块）。二者由 `generatePage` 经 `sanitizeWikiOutput`（`src/knowledge/wiki-output-sanitizer.ts:24`）触发，是 LLM 原始文本进入产出前的规范化关口。

## 协作方式

调用关系全部来自 edges 数据，方向如下（R2：以表格表达静态可达性）：

**services 层内部编排（buildWiki → 各步骤）**

| 调用方 | 被调用方 | 位置 |
|--------|----------|------|
| buildWiki | resolvePages | src/services/wiki-service.ts:150 |
| buildWiki | cleanupLegacyFlatFiles | src/services/wiki-service.ts:179 |
| buildWiki | cleanupRetiredPages | src/services/wiki-service.ts:200 |
| buildWiki | cleanupStaleTopicPages | src/services/wiki-service.ts:213 |
| buildWiki | generatePage | src/services/wiki-service.ts:226 |
| buildWiki | printBuildReport | src/services/wiki-service.ts:258 |
| buildWiki | WikiPageGenerator | src/knowledge/wiki-page-generator.ts:25 |

**knowledge 层派发（generateByName → 各页面生成函数）**

| 调用方 | 被调用方 | 位置 |
|--------|----------|------|
| generateByName | generateTopic | src/knowledge/wiki-page-generator.ts:359 |
| generateByName | generateOverview | src/knowledge/wiki-page-generator.ts:69 |
| generateByName | generateArchitecture | src/knowledge/wiki-page-generator.ts:107 |
| generateByName | generateDataFlow | src/knowledge/wiki-page-generator.ts:151 |
| generateByName | generateModules | src/knowledge/wiki-page-generator.ts:185 |
| generateByName | generateApi | src/knowledge/wiki-page-generator.ts:231 |
| generateByName | generateOnboarding | src/knowledge/wiki-page-generator.ts:271 |
| generateByName | generateTroubleshooting | src/knowledge/wiki-page-generator.ts:300 |
| generateByName | generateGlossary | src/knowledge/wiki-page-generator.ts:329 |
| generateByName | generateDecisions | src/knowledge/wiki-page-generator.ts:397 |
| generateByName | generateTesting | src/knowledge/wiki-page-generator.ts:418 |
| generateByName | generateConstraints | src/knowledge/wiki-page-generator.ts:434 |

**各生成函数汇聚到统一 LLM 调用（→ generate）**

| 调用方 | 被调用方 | 位置 |
|--------|----------|------|
| generateApi | generate | src/knowledge/wiki-page-generator.ts:473 |
| generateArchitecture | generate | src/knowledge/wiki-page-generator.ts:473 |
| generateConstraints | generate | src/knowledge/wiki-page-generator.ts:473 |
| generateDataFlow | generate | src/knowledge/wiki-page-generator.ts:473 |
| generateDecisions | generate | src/knowledge/wiki-page-generator.ts:473 |
| generateGlossary | generate | src/knowledge/wiki-page-generator.ts:473 |
| generateModules | generate | src/knowledge/wiki-page-generator.ts:473 |
| generateOnboarding | generate | src/knowledge/wiki-page-generator.ts:473 |
| generateOverview | generate | src/knowledge/wiki-page-generator.ts:473 |

**生成出口与净化**

| 调用方 | 被调用方 | 位置 |
|--------|----------|------|
| generatePage | sanitizeWikiOutput | src/knowledge/wiki-output-sanitizer.ts:24 |
| generatePage | hasModel | src/knowledge/wiki-page-generator.ts:46 |

数据流可归纳为四个阶段：

| 阶段 | 参与方 | 说明 |
|------|--------|------|
| 1. 页面集合解析 | `buildWiki` → `resolvePages` | 确定本次要生成的页面名集合 |
| 2. 陈旧清理 | `buildWiki` → `cleanupLegacyFlatFiles` / `cleanupRetiredPages` / `cleanupStaleTopicPages` | 三类清理由同一编排函数顺序触发 |
| 3. 生成与派发 | `buildWiki` → `generatePage` → `generateByName` → 11 个具体生成函数 → `generate` | 页名派发至具体类型函数，各类函数统一走 `generate` |
| 4. 净化与报告 | `generatePage` → `sanitizeWikiOutput`；`buildWiki` → `printBuildReport` | LLM 输出净化后落盘，最终汇总报告 |

## 跨模块边界

依据 boundaries 数据，本主题涉及的跨模块调用如下：

| from | to | callCount |
|------|-----|-----------|
| services | knowledge | 22 |
| knowledge | shared | 13 |
| cli | services | 2 |
| services | cli | 1 |
| services | core | 1 |

耦合点分析：

- **services → knowledge（22 次）**：这是本协作面绝对主力方向。`buildWiki` 需要调用 `WikiPageGenerator`（`src/knowledge/wiki-page-generator.ts:25`）及 `generatePage`，`generatePage` 又触发 `hasModel`（`src/knowledge/wiki-page-generator.ts:46`）与净化入口。修改 `knowledge` 层生成器签名或返回结构，会直接冲击 `services` 编排，代价较高。
- **knowledge → shared（13 次）**：生成器大量依赖 `shared` 层工具，但 edges 未列出具体被调符号，故具体耦合面**待确认**（缺少 knowledge→shared 的逐条调用锚点）。
- **cli → services（2 次） / services → cli（1 次）**：存在双向调用，说明构建入口与 CLI 层互相回指，修改 CLI 参数解析（如 `--pages`）会波及 `resolvePages`（`src/services/wiki-service.ts:150`）的入参契约；反向的 services→cli 单次调用具体符号**待确认**（edges 未收录）。
- **services → core（1 次）**：具体被调用符号**待确认**（edges 未收录）。

由于生成派发集中在 `generateByName` 单点，且页面名集合由 `resolvePages` 单点决定，新增一种页面类型需要同时修改：派发分支（`generateByName`，`src/knowledge/wiki-page-generator.ts:51`）、默认页面集策略（`resolvePages`，`src/services/wiki-service.ts:150`）、可能的清理登记（`RETIRED_WIKI_PATHS`，见 `cleanupRetiredPages` 于 `src/services/wiki-service.ts:200`）。这是本协作面修改代价的主要来源。

## 设计动机

基于现有符号命名与协作模式，可推断以下设计意图（标注为**推断**）：

1. **单点派发 + 多函数生成（推断）**：`generateByName`（`src/knowledge/wiki-page-generator.ts:51`）作为唯一按名路由入口，使页面类型扩展收敛为一处分支修改，同时保留各页面类型独立函数以便差异化 prompt 与上下文组装。该推断基于 edges 中 11 个生成函数全部直接由 `generateByName` 调用的证据。

2. **统一出口 `generate`（推断）**：9 个生成函数全部指向 `src/knowledge/wiki-page-generator.ts:473` 的 `generate`，说明 LLM 调用被抽象为单一出口，便于集中管理模型选择与流式回调（`onChunk`）。该推断基于 edges 中 generateApi/generateArchitecture/... 均指向同一位置。

3. **净化与生成解耦（推断）**：净化逻辑独立为 `wiki-output-sanitizer.ts`，由 `generatePage` 经 `sanitizeWikiOutput`（`src/knowledge/wiki-output-sanitizer.ts:24`）调用，与具体生成函数解耦，使所有页面类型共享同一套输出清洗规则。该推断基于 `stripCodeFences`/`stripPreamble` 的通用性 docstring 描述。

4. **清理前置以保证幂等（推断）**：三类清理在生成前由 `buildWiki` 顺序触发（`src/services/wiki-service.ts:179/200/213`），且各自只删除"本工具拥有"的文件，意图是让每次构建的输出目录等价于本次计划，避免陈旧残留污染。该推断基于三个方法的 docstring 均强调"只删除本工具拥有的文件"。

## 待确认项

| 方面 | 缺什么证据 |
|------|-----------|
| knowledge → shared 的具体耦合符号 | edges 仅给出 callCount=13，无逐条调用锚点 |
| services → cli、services → core 的被调用符号 | edges 仅给出 callCount，未收录具体符号锚点 |
| `generate`（`src/knowledge/wiki-page-generator.ts:473`）的内部实现与流式行为 | 未提供该符号的签名与 docstring 数据 |
| `sanitizeWikiOutput`（`src/knowledge/wiki-output-sanitizer.ts:24`）的内部编排 | 未提供其签名与 docstring，仅知其被 `generatePage` 调用 |
## Related

- 同目录：[topic-9.md](topic-9.md)
- 总入口：[README](../README.md)
