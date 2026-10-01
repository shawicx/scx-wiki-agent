# CLI 参考

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
</details>

## 命令

| 命令 | 说明 | 源文件:行号 |
| --- | --- | --- |
| `build` | - | src/cli/commands/build.ts:11 |
| `init` | - | src/cli/commands/init.ts:8 |
| `scan` | - | src/cli/commands/scan.ts:4 |

## `build` 参数

| 参数 | 说明 |
| --- | --- |
| `--project-root <path>` | Project root directory |
| `--mcp-binary <path>` | Path to codebase-memory-mcp binary |
| `--model <model>` | LLM model name (e.g. gpt-4o, qwen2.5) |
| `--base-url <url>` | OpenAI-compatible API base URL |
| `--api-key <key>` | API key for the LLM provider |
| `--no-llm` | Generate wiki without LLM (pure rules) |
| `--pages <pages>` | Comma-separated page names to generate |
| `--mode <mode>` | Build mode: full (wipe and rewrite .wiki) or update (skip unchanged pages); default full, config-overridable |
| `--refresh-topics` | Re-detect adaptive topic pages and overwrite topics.json |
| `--refresh-outline` | Re-plan outline chapters via LLM and overwrite outline.json |
| `--confirm` | Interactive confirmation pass for 待确认 items (after generation, before writing; TTY only) |

## `init` 参数

| 参数 | 说明 |
| --- | --- |
| `--project-root <path>` | Project root directory |

## `scan` 参数

| 参数 | 说明 |
| --- | --- |
| `--project-root <path>` | Project root directory |
| `-v, --verbose` | Show detailed output |

## 退出码

| 码 | 上下文 | 源文件 |
| --- | --- | --- |
| 1 | `process.exit(1);` | src/cli/commands/build.ts |

## 本页确定知道的事实

- CLI 命令 3 个（commander 注册提取，均带 file:line 锚点）
- 命令参数共 14 个
- 退出码 1 个（process.exit 调用点提取）

## 未知项

- 3 个命令无描述文本（docstring 与 .command('name', 'desc') 均未提供）
## Related

- 同目录：[api.md](api.md)
- 共享 3 个源文件：[tech-stack.md](../01-overview/tech-stack.md)
- 共享 3 个源文件：[architecture.md](../02-architecture/architecture.md)
- 共享 3 个源文件：[modules.md](../02-architecture/modules.md)
- 总入口：[README](../README.md)
