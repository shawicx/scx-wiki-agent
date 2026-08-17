# 运行环境

## 运行时

| 项 | 值 | 证据 |
| --- | --- | --- |
| Node.js | ≥ 18（构建 target node18） | `tsup.config.ts` |
| 模块体系 | ESM（`"type": "module"`） | `package.json` |
| 包管理器 | pnpm | `pnpm-lock.yaml` |
| TypeScript | ES2022 / strict | `tsconfig.json` |

## Scripts（package.json）

| 脚本 | 命令 | 说明 |
| --- | --- | --- |
| `build` | `tsup` | 构建 `dist/bin.js` |
| `dev` | `tsup --watch` | 监听模式构建 |
| `test` | `vitest run` | 全量测试 |
| `test:watch` | `vitest` | 监听模式测试 |
| `lint` | `tsc --noEmit` | 仅类型检查（无 eslint） |

## 环境变量

源码直接引用的只有一个：

| 变量 | 用途 | 敏感 |
| --- | --- | --- |
| `CODEBASE_MEMORY_MCP_BINARY` | 覆盖 codebase-memory-mcp 二进制路径（默认从 PATH 查找） | 否 |

LLM 相关变量由 Vercel AI SDK 隐式读取（源码未直接引用，经 `createOpenAI` 默认行为生效）：

| 变量 | 用途 | 敏感 |
| --- | --- | --- |
| `OPENAI_API_KEY` | LLM API 密钥（也可用 `--api-key` 参数传入） | 是 |
| `OPENAI_BASE_URL` | OpenAI 兼容 API 地址 | 否 |

> 本工具自身的 `ConfigDetector.extractEnvVars`（`src/knowledge/config-detector.ts`）会扫描**目标项目**源码中的 `process.env.*` 引用并按 `/KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i` 标记敏感位——这是对目标项目的探测，不是本工具自身的配置。

## 构建产物

- `dist/bin.js` — 唯一构建产物（shebang `#!/usr/bin/env node`），`package.json` 的 `bin` 字段将其注册为全局命令 `scx-wiki-agent`。
- 本地未 link 时可用 `node dist/bin.js <command>` 直接运行。

## 运行期产物（工具在目标项目生成）

| 路径 | 内容 |
| --- | --- |
| `.scx-wiki-agent/cache/` | `init` 创建的缓存目录 |
| `.wiki/` | `build` 生成的 Markdown 页面（扁平文件名，如 `overview.md`） |

两者均在 `src/shared/constants.ts` 定义，且已加入扫描忽略目录（`IGNORED_DIRS`），不会递归进入工具自身的扫描结果。

## Related

- Code: `package.json` · `src/shared/constants.ts` · `src/mcp/codebase-memory-client.ts`（`findBinary`）
- Docs: [tech-stack](tech-stack.md) · [onboarding](../05-guides/onboarding.md) · [troubleshooting](../05-guides/troubleshooting.md)
