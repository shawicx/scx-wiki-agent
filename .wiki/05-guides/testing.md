# 测试体系

<details>
<summary>Relevant source files</summary>

- tests/knowledge/config-detector.test.ts
- tests/knowledge/config-detector/env-purpose.test.ts
- tests/knowledge/dataflow/io-and-stages.test.ts
- tests/knowledge/intent-evidence.test.ts
- tests/knowledge/multilang.test.ts
- tests/knowledge/source-fallback.test.ts
- tests/shared/config.test.ts
- vitest.config.ts
</details>

本页描述该项目的测试框架、配置入口、测试目录组织、运行方式，以及仅在测试环境中出现的变量与常量；所有结论均来自测试配置探测结果。

## 测试体系概览

| 项目 | 事实 | 锚点 |
| --- | --- | --- |
| 测试框架 | `vitest` | `vitest.config.ts` |
| 配置文件 | `vitest.config.ts` | `vitest.config.ts` |
| 夹具目录 | `tests/fixtures` | `tests/fixtures` |
| 测试文件数 | 70 | `tests`（探测统计） |
| 生产文件数 | 135 | `src`（探测统计） |
| 覆盖率阈值 | 未检测到 | — |
| 运行命令 | `vitest run` | `vitest.config.ts` |

### 测试目录结构

探测到的测试目录共 16 个，按层级组织如下（锚点即目录路径本身）：

| 层级 | 目录 | 说明 |
| --- | --- | --- |
| 根测试目录 | `tests` | 测试总入口目录 |
| 一级分组 | `tests/cli` | CLI 相关测试 |
| 一级分组 | `tests/core` | 核心能力测试 |
| 一级分组 | `tests/integration` | 集成测试 |
| 一级分组 | `tests/mcp` | MCP 相关测试 |
| 一级分组 | `tests/services` | 服务层测试 |
| 一级分组 | `tests/shared` | 共享工具测试 |
| 知识域根 | `tests/knowledge` | 知识处理相关测试的父目录 |
| 知识域子域 | `tests/knowledge/config-detector` | 配置探测 |
| 知识域子域 | `tests/knowledge/context` | 上下文处理 |
| 知识域子域 | `tests/knowledge/crosspage` | 跨页处理 |
| 知识域子域 | `tests/knowledge/dataflow` | 数据流 |
| 知识域子域 | `tests/knowledge/generator` | 生成器 |
| 知识域子域 | `tests/knowledge/intent` | 意图识别/证据 |
| 知识域子域 | `tests/knowledge/quality` | 质量校验 |
| 服务层子域 | `tests/services/wiki` | wiki 服务测试 |

夹具统一存放于 `tests/fixtures`，与测试文件分离，避免测试用例与输入样本混杂。

## 运行方式

```bash
vitest run
```

- **命令来源**：探测到的 `runCommand` 字段，值为 `vitest run`。
- **它做了什么**：以单次执行模式启动 vitest，加载 `vitest.config.ts` 作为配置入口，收集并执行 `tests` 下的测试文件后退出（非 watch 常驻模式）；这是 vitest 的通用运行语义。
- **预期产出**：终端逐文件输出用例通过/失败结果，末尾给出汇总统计；全部通过时进程以 0 退出，存在失败用例时以非零退出码结束，可直接用于 CI 判断。探测数据中未包含 `vitest.config.ts` 的具体配置内容（如 setup 文件、运行环境、include/exclude 规则），故此处不对其行为做进一步描述。

## 测试专用证据

以下内容仅出现在测试代码中，属于**测试环境专用**，不代表生产运行时的配置或技术栈。

### 测试专用环境变量（testOnlyEnvVars）

| 变量名 | 敏感 | 出现文件（锚点） |
| --- | --- | --- |
| `API_URL` | 否 | `tests/knowledge/config-detector/env-purpose.test.ts` |
| `REGION` | 否 | `tests/knowledge/config-detector/env-purpose.test.ts` |
| `RETRIES` | 否 | `tests/knowledge/config-detector/env-purpose.test.ts` |
| `UNKNOWN` | 否 | `tests/knowledge/config-detector/env-purpose.test.ts` |
| `SVC_TOKEN` | 是 | `tests/knowledge/config-detector/env-purpose.test.ts`、`tests/knowledge/multilang.test.ts` |
| `API_KEY` | 是 | `tests/knowledge/config-detector.test.ts`、`tests/knowledge/multilang.test.ts` |
| `BASE_URL` | 否 | `tests/knowledge/config-detector.test.ts` |
| `TEST_WIKI_KEY` | 是 | `tests/knowledge/config-detector.test.ts`、`tests/shared/config.test.ts` |
| `WIKI_KEY` | 是 | `tests/knowledge/dataflow/io-and-stages.test.ts` |
| `APP_MODE` | 否 | `tests/knowledge/multilang.test.ts` |

其中 `API_KEY`、`SVC_TOKEN`、`TEST_WIKI_KEY`、`WIKI_KEY` 被标记为敏感值（sensitive=true），在测试用例中作为密钥类样本使用，不应写入生产配置或提交到日志输出。

### 测试专用常量（testOnlyConstants）

| 常量名 | 值 | 锚点 |
| --- | --- | --- |
| `TIMEOUT_MS` | `60000` | `tests/knowledge/config-detector.test.ts:164` |
| `MAX_USERS` | `100` | `tests/knowledge/config-detector.test.ts:190` |
| `TEST_MAX_ROWS` | `20` | `tests/knowledge/config-detector.test.ts:195` |
| `MAX_FILE_SIZE` | `100 * 1024 * 1024` | `tests/knowledge/intent-evidence.test.ts:70` |
| `MAX_QPS` | `1000` | `tests/knowledge/intent-evidence.test.ts:126` |
| `MAX_OPEN_FILES` | 检测值为正则匹配表达式片段（`'512'.match(NATIVE_CONST_DEF_RE.go)?.[1]).toBe('MAX_OPEN_FILES')`），非独立常量字面量 | `tests/knowledge/multilang.test.ts:60` |
| `MAX_RETRY` | `3` | `tests/knowledge/source-fallback.test.ts:50` |

这些常量集中在 `tests/knowledge/` 下的测试文件中，用于构造配置探测、意图证据提取、多语言常量识别与回退策略的输入样本与期望值。

### 测试专用依赖（testOnlyDeps）

探测结果为空数组，**未检测到**测试专用依赖；测试运行所需的依赖未在本次探测数据中单独列出。

## 测试策略解读

从目录组织看，测试按"能力域"分层铺开：`tests/core`、`tests/cli`、`tests/services`（含子域 `tests/services/wiki`）、`tests/mcp`、`tests/shared` 覆盖通用能力与对外接口，`tests/integration` 承担跨模块协作验证，而 `tests/knowledge` 再细分为 `config-detector`、`context`、`crosspage`、`dataflow`、`generator`、`intent`、`quality` 七个子域，是全仓测试目录中颗粒度最细的部分。夹具统一收敛到 `tests/fixtures`，说明测试输入样本是跨用例复用的资源，而非内联在各用例中。以 70 个测试文件对应 135 个生产文件的比例，测试覆盖面向的是按子域切分的功能面。

（推断）测试投入重点集中在"知识处理管线"上：`tests/knowledge` 的七个子域命名分别对应配置探测、上下文、跨页、数据流、生成、意图、质量这些管线环节，且测试专用环境变量与常量也集中出现在 `tests/knowledge/config-detector`、`tests/knowledge/intent-evidence.test.ts`、`tests/knowledge/multilang.test.ts`、`tests/knowledge/source-fallback.test.ts`、`tests/knowledge/dataflow/io-and-stages.test.ts` 中。推断依据为目录命名与上述锚点的文件分布，非源码注释或提交记录佐证。配置探测类行为（环境变量语义识别、敏感键判定、多语言常量提取、源码回退）在多份测试文件中被反复构造样本，是该测试体系中最密集的验证区域。

## 缺口说明

本次探测数据未包含覆盖率阈值、测试专用依赖清单，以及 `vitest.config.ts` 的内部配置（环境、setup、包含/排除规则）与用例数量级统计，因此本页不对上述内容做任何推断。
## Related

- 同目录：[onboarding.md](onboarding.md) · [troubleshooting.md](troubleshooting.md)
- 共享 1 个源文件、共享 3 个符号：[tech-stack.md](../01-overview/tech-stack.md)
- 共享 2 个符号：[environment.md](../01-overview/environment.md)
- 共享 2 个符号：[architecture.md](../02-architecture/architecture.md)
- 总入口：[README](../README.md)
