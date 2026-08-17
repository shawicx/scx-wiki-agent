# 数据流

> 遵守 R2（边表优于时序图）：本文用**阶段表**描述数据变换；符号级调用边见 [calls](../07-reference/calls.md)。

## 命令 1：`scan` 的数据流

| 阶段 | 输入 | 输出 | 关键函数 | 位置 |
| --- | --- | --- | --- | --- |
| 目录遍历 | 项目根目录 | `ScannedFile[]`（过滤 gitignore/隐藏目录/node_modules，仅保留 SUPPORTED_EXTENSIONS） | `FileScanner.walkDirectory` | `src/core/scanner.ts` |
| 依赖收集 | `ScannedFile[]` 源码内容 | 被实际 import 的包名集合 | `FileScanner.collectImportedPackages` | `src/core/scanner.ts` |
| 技术栈过滤 | package.json 依赖 ∪ import 集合 | `techStack`（死依赖被剔除；import 集为空则回退全量） | `FileScanner.detectTechStack` | `src/core/scanner.ts` |
| 项目类型打分 | techStack + workspace 特征文件 | `ProjectType`（indicator 命中计分最高者） | `FileScanner.detectProjectType` | `src/core/scanner.ts` |
| 输出 | `ScanResult` | 终端表格 | `scan.ts` action | `src/cli/commands/scan.ts` |

## 命令 2：`build` 的数据流（核心管线）

| 阶段 | 输入 | 输出 | 关键函数 | 位置 |
| --- | --- | --- | --- | --- |
| ① 扫描 | 项目根 | `ScanResult` | `FileScanner.scan` | `src/cli/commands/build.ts:46` |
| ② 索引图谱 | 仓库绝对路径 | MCP `IndexResult`（幂等，mode=moderate） | `CodebaseMemoryClient.ensureIndexed` | `src/services/wiki-service.ts:24` |
| ③ 页面集解析 | `--pages` 参数 + `scanResult.projectType` | 页名列表（默认=非 surface 页 + 按类型激活的 Tier2 页；非法页名告警跳过） | `WikiService.resolvePages` | `src/services/wiki-service.ts:29-60` |
| ④ 配置探测 | 项目根 + 源文件列表 | environment/conventions/testing/constraints 信息 | `ConfigDetector.detect*` | `src/knowledge/config-detector.ts` |
| ⑤ 上下文构建 | MCP 图谱（getArchitecture/queryGraph/getCodeSnippet）+ ScanResult + ConfigDetector | 每页一个 Context 对象（如 `CallsContext`） | `WikiContextBuilder.buildByName` | `src/knowledge/wiki-context-builder.ts:44-71` |
| ⑥a LLM 生成（主路径） | Context JSON + 中文 system prompt（含四条铁律） | 流式 Markdown 文本 | `WikiPageGenerator.generateByName` → `generate`（`streamText`） | `src/knowledge/wiki-page-generator.ts` |
| ⑥b 规则回退（降级路径） | 同一 Context | 确定性 Markdown（WikiBuilder 模板） | `WikiFallbackBuilder.buildByName` | `src/knowledge/wiki-fallback-builder.ts:31-53` |
| ⑦ 输出清理 | LLM 原始输出 | 净化文本（去寒暄前导语/围栏） | `sanitizeWikiOutput` | `src/knowledge/wiki-output-sanitizer.ts` |
| ⑧ 写盘 | 页名 + 净化文本 | `.wiki/<page>.md` | `writeFileSync` | `src/services/wiki-service.ts:48` |

### ⑥ 的降级逻辑（错误路径）

```text
generatePage(page):
  context = ctx.buildByName(page)          → null 则跳过该页（返回 ''，不写盘内容为空）
  if noLlm 或 未配置模型 → fallback
  try LLM:
    content 非空 → sanitizeWikiOutput → 返回
    content 为空 → 落到 fallback
  catch（网络/超时/任何异常）→ 落到 fallback
```

## 子流程：⑤ 中的图谱查询模式

`WikiContextBuilder` 各 build*Context 使用三类数据获取方式（均为对 `CodebaseMemoryClient` 的调用）：

| 模式 | 用途 | 典型调用 |
| --- | --- | --- |
| 一次性架构概览 | packages/entry_points/hotspots/layers/clusters | `getArchitecture()` |
| Cypher 边查询 | CALLS 边、DEFINES_METHOD 边、复杂度筛选 | `queryGraph(...)`（如 calls 页 BFS 两层） |
| 单符号片段 | 源码/docstring/签名（容错，失败返回 null） | `safeGetSnippet(qn)` → `getCodeSnippet` |

## 子流程：MCP 子进程调用（每次查询）

| 阶段 | 输入 | 输出 | 位置 |
| --- | --- | --- | --- |
| 序列化 | tool 名 + args 对象 | `codebase-memory-mcp cli <tool> '<json>'` argv | `CodebaseMemoryClient.exec` |
| 执行 | argv | stdout（可能混入 `level=info` 日志行） | `execFileSync`（timeout 120s，maxBuffer 100MB） |
| 解析 | stdout | 从末尾向前第一个可解析的 JSON 行 | `parseJsonOutput` |

## 命令 3：`init` 的数据流

仅两次幂等 `mkdirSync`（`.scx-wiki-agent/cache/`、`.wiki/`），无数据变换（`src/cli/commands/init.ts`）。

## Related

- Code: `src/services/wiki-service.ts` · `src/knowledge/wiki-context-builder.ts` · `src/mcp/codebase-memory-client.ts`
- Docs: [architecture](architecture.md) · [calls](../07-reference/calls.md) · [cli-commands](../03-interface/cli-commands.md)
