# CLI

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
</details>

## 命令



| 命令 | 说明 | 源文件:行号 |
| --- | --- | --- |
| `build` | - | src/cli/commands/build.ts:9 |
| `init` | - | src/cli/commands/init.ts:6 |
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
| `--mode <mode>` | Build mode: full (rewrite all) or update (skip unchanged pages) |

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
## Related

- 同目录：[api.md](api.md)
- 总入口：[README](../README.md)
