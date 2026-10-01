# 测试

<details>
<summary>Relevant source files</summary>

- tests/knowledge/config-detector.test.ts
- tests/knowledge/intent-evidence.test.ts
- tests/knowledge/source-fallback.test.ts
- tests/knowledge/config-detector/env-purpose.test.ts
- tests/knowledge/dataflow/io-and-stages.test.ts
- tests/shared/config.test.ts
- vitest.config.ts
</details>

| 项 | 值 |
| --- | --- |
| 框架 | vitest |
| 配置文件 | vitest.config.ts |
| 运行命令 | `vitest run` |
| 测试目录 | tests, tests/cli, tests/core, tests/integration, tests/knowledge, tests/knowledge/config-detector, tests/knowledge/context, tests/knowledge/crosspage, tests/knowledge/dataflow, tests/knowledge/generator, tests/knowledge/intent, tests/knowledge/quality, tests/mcp, tests/services, tests/services/wiki, tests/shared |
| 夹具目录 | tests/fixtures |
| 文件规模 | 生产文件 126 / 测试文件 67 |

## 测试专用环境变量

仅测试 / fixture 源码引用，不属于生产运行时配置

| 变量名 | 敏感 | 测试引用 |
| --- | --- | --- |
| API_URL | 否 | tests/knowledge/config-detector/env-purpose.test.ts |
| REGION | 否 | tests/knowledge/config-detector/env-purpose.test.ts |
| RETRIES | 否 | tests/knowledge/config-detector/env-purpose.test.ts |
| UNKNOWN | 否 | tests/knowledge/config-detector/env-purpose.test.ts |
| SVC_TOKEN | ⚠️ 是 | tests/knowledge/config-detector/env-purpose.test.ts |
| API_KEY | ⚠️ 是 | tests/knowledge/config-detector.test.ts |
| BASE_URL | 否 | tests/knowledge/config-detector.test.ts |
| TEST_WIKI_KEY | ⚠️ 是 | tests/knowledge/config-detector.test.ts<br>tests/shared/config.test.ts |
| WIKI_KEY | ⚠️ 是 | tests/knowledge/dataflow/io-and-stages.test.ts |

## 测试专用限制常量

仅测试 / fixture 源码定义

| 常量 | 值 | 源文件:行号 |
| --- | --- | --- |
| `TIMEOUT_MS` | `60000` | tests/knowledge/config-detector.test.ts:164 |
| `MAX_USERS` | `100` | tests/knowledge/config-detector.test.ts:190 |
| `TEST_MAX_ROWS` | `20` | tests/knowledge/config-detector.test.ts:195 |
| `MAX_FILE_SIZE` | `100 * 1024 * 1024` | tests/knowledge/intent-evidence.test.ts:70 |
| `MAX_QPS` | `1000` | tests/knowledge/intent-evidence.test.ts:126 |
| `MAX_RETRY` | `3` | tests/knowledge/source-fallback.test.ts:50 |

## 本页确定知道的事实

- 测试文件 67 个（生产文件 126 个，测试/生产比 0.53）
- 测试框架：vitest（配置 vitest.config.ts）
- 运行命令：`vitest run`
- 测试专用依赖 0 个、专用环境变量 9 个、专用常量 6 个
## Related

- 同目录：[onboarding.md](onboarding.md) · [troubleshooting.md](troubleshooting.md)
- 共享 1 个源文件：[tech-stack.md](../01-overview/tech-stack.md)
- 共享 1 个符号：[environment.md](../01-overview/environment.md)
- 共享 1 个符号：[constraints.md](../06-constraints/constraints.md)
- 总入口：[README](../README.md)
