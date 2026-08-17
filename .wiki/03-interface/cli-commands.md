# CLI 命令参考

> 可执行入口：`node dist/bin.js <command>`（全局安装后为 `scx-wiki-agent <command>`）。命令定义于 `src/cli/index.ts` 的 `createProgram`。

## 命令总览

| 命令 | 说明 | 实现文件 |
| --- | --- | --- |
| `init` | Initialize wiki-agent in the project | `src/cli/commands/init.ts` |
| `scan` | Scan project structure and identify tech stack | `src/cli/commands/scan.ts` |
| `build` | Generate wiki documentation from codebase knowledge graph | `src/cli/commands/build.ts` |

## `scx-wiki-agent init`

创建项目内的工作目录（幂等，已存在则跳过创建）：

- `.scx-wiki-agent/cache/`
- `.wiki/`

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `--project-root <path>` | `process.cwd()` | 项目根目录 |

## `scx-wiki-agent scan`

执行 `ScanService.scan()` 并打印：项目类型、是否 TypeScript、技术栈（至多 20 项）、源目录、文件数与语言分布。

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `--project-root <path>` | `process.cwd()` | 项目根目录 |
| `-v, --verbose` | 关闭 | Show detailed output（当前 action 未使用此标志，见 limitations） |

## `scx-wiki-agent build`

完整生成管线（见 [data-flow](../02-architecture/data-flow.md)）：扫描 → 索引图谱 → 逐页生成（LLM 流式输出到 stdout）→ 写盘 `.wiki/`。

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `--project-root <path>` | `process.cwd()` | 项目根目录 |
| `--mcp-binary <path>` | 自动探测 | codebase-memory-mcp 二进制路径（等价于环境变量 `CODEBASE_MEMORY_MCP_BINARY`） |
| `--model <model>` | `gpt-4o-mini` | LLM 模型名（如 `gpt-4o`、`qwen2.5`） |
| `--base-url <url>` | — | OpenAI 兼容 API 地址；Ollama 例：`http://localhost:11434/v1`（此时 apiKey 默认填 `ollama`） |
| `--api-key <key>` | — | API 密钥；缺省时走 `OPENAI_API_KEY` |
| `--no-llm` | 关闭 | 纯规则生成，不调用 LLM |
| `--pages <pages>` | `all` | 逗号分隔页名列表；未知页名告警并跳过（全部非法时回退全量） |

### 可用页名（`PAGE_REGISTRY`，18 个）

- **structure（结构层）**：`readme`、`overview`、`architecture`、`modules`、`api`、`data-flow`、`glossary`、`calls`、`classes`、`decisions`
- **operations（运行规约层）**：`environment`、`testing`、`conventions`、`constraints`、`tech-stack`、`onboarding`、`troubleshooting`
- **surface（表层，按项目类型激活）**：`cli`（projectType 为 `cli` 或 `agent` 时默认生成）

> `api` 与 `business`、`design-decisions` 仍在注册表/构建器中保留，但已不在 structure 层默认集内（`tier !== 'surface'` 全集包含它们——以 `src/knowledge/page-registry.ts` 的 `PAGE_REGISTRY` 为准，见 [page-registry](../04-design/page-registry.md)）。

### 典型用法

```bash
# 纯规则生成（无需 LLM 与 API key）
node dist/bin.js build --no-llm

# 用 Ollama 本地模型
node dist/bin.js build --model qwen2.5 --base-url http://localhost:11434/v1

# 只生成两个页面
node dist/bin.js build --pages calls,classes --no-llm

# 指定 MCP 二进制
node dist/bin.js build --mcp-binary /usr/local/bin/codebase-memory-mcp --no-llm
```

## 退出码

| 码 | 触发场景 | 位置 |
| --- | --- | --- |
| 0 | 正常完成 | — |
| 1 | build 失败（如 MCP 未安装、索引失败等抛错） | `src/cli/commands/build.ts:53`（`process.exit(1)`） |

## 已删除的命令（勿参考旧文档）

`index` / `ask` / `update` 已随 MCP 重构删除（README.md 的命令表已过时）。见 [decisions#ADR-001](../04-design/decisions.md)。

## Related

- Code: `src/cli/index.ts` · `src/cli/commands/build.ts`
- Docs: [data-flow](../02-architecture/data-flow.md) · [environment](../01-overview/environment.md) · [troubleshooting](../05-guides/troubleshooting.md)
