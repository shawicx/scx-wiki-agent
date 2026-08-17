# 排障手册

> 问题 → 原因 → 解决方案；全部来自源码中真实存在的错误路径与注释。

## 1. `codebase-memory-mcp 未安装。请先安装…`

- **触发**：build 时抛 ENOENT，`src/mcp/codebase-memory-client.ts:104-108` 的错误分支。
- **原因**：PATH 中无 `codebase-memory-mcp` 二进制且未通过环境变量/参数指定。
- **解决**：
  1. 安装该工具（参考错误信息中的 GitHub 链接 `https://github.com/Julexar/codebase-memory-mcp`）；
  2. 或指定路径：`export CODEBASE_MEMORY_MCP_BINARY=/path/to/binary`，或 `build --mcp-binary /path/to/binary`。
- **验证**：`codebase-memory-mcp cli get_architecture '{"project":"..."}'` 能输出 JSON。

## 2. `Build failed: MCP 返回无法解析 JSON: ...`

- **触发**：`parseJsonOutput`（`src/mcp/codebase-memory-client.ts:118`）在 stdout 中找不到完整 JSON 行。
- **原因**：MCP 输出异常（崩溃/权限/超时 120s / 超过 100MB maxBuffer）。
- **解决**：手工执行同参数命令看原始输出：`codebase-memory-mcp cli <tool> '<json>'`；确认版本兼容（`src/mcp/types.ts` 注明返回结构「基于实测」）。

## 3. 生成的页面是空文件（0 字节）

- **触发**：对 backend/frontend 等类型项目 build 后，出现空的 `routes.md`/`components.md`。
- **原因**：`TIER2_BY_TYPE` 激活了未实现的表层页面；`buildByName` 未匹配 case 返回 null，`generatePage` 返回 `''`，但 `writeFileSync` 仍写盘（`src/services/wiki-service.ts:47`）。
- **解决**：用 `--pages` 显式排除未实现页；根治需补齐对应 builder case（见 [limitations](../06-constraints/limitations.md)）。

## 4. LLM 页面内容是「思考过程」而非文档 / 内容为空

- **触发**：使用思考模型（Qwen3、DeepSeek-v4 等）时。
- **原因**：思考模型默认把正文写进 reasoning 字段，content 为空。
- **解决**：已内置兼容（`providerOptions` 关闭 thinking + content 空时回退读 reasoning，`src/knowledge/wiki-page-generator.ts:416-445`）；若 provider 不支持关闭且 reasoning 也为空，会自动走规则 fallback——检查模型是否配对 `--base-url`。

## 5. LLM 输出混入「好的，以下是…」等寒暄 / 被包进 ```markdown 围栏

- **触发**：部分 provider/模型。
- **解决**：已内置 `sanitizeWikiOutput` 清理（`src/knowledge/wiki-output-sanitizer.ts`）；若仍泄漏，向 `PREAMBLE_PATTERNS` 增加模式并补单测。

## 6. `[wiki] 未知页面 "xxx"，已跳过`

- **触发**：`--pages` 传了注册表之外的页名（`src/services/wiki-service.ts:52`）。
- **解决**：页名以 `ALL_PAGE_NAMES` 为准（18 个，见 [cli-commands](../03-interface/cli-commands.md)）；全部非法时会回退生成默认全集。

## 7. `data-flow` 页告警 `R2 违规：…检测到 sequenceDiagram`

- **原因**：LLM 无视铁律在 data-flow 页画了时序图（sanitizer 仅告警不改写）。
- **解决**：换模型或降低温度重试；内容本身仍可用，调用关系以 `calls.md` 边表为准。

## 8. 文档与代码打架（旧文档陷阱）

| 症状 | 实情 |
| --- | --- |
| README 教你跑 `scx-wiki-agent index / ask / update` | 命令已删除（ADR-001）；只有 init/scan/build |
| AGENTS.md/CLAUDE.md 提到 `src/strategy/`、`core/database.ts` | MCP 重构时已删除；以本 Wiki 与源码为准 |
| README 称 license MIT | package.json 为 ISC |

## 9. 类型检查报 `.js` 后缀导入错误

- **原因**：ESM 项目（`module: ES2022`）相对导入必须写 `.js`。
- **解决**：`import ... from './foo.js'`（即使源文件是 `.ts`）。

## Related

- Code: `src/mcp/codebase-memory-client.ts` · `src/knowledge/wiki-output-sanitizer.ts`
- Docs: [environment](../01-overview/environment.md) · [limitations](../06-constraints/limitations.md) · [onboarding](onboarding.md)
