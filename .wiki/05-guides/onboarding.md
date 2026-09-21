# wiki-agent 上手指南

<details>
<summary>Relevant source files</summary>

- src/cli/index.ts
</details>

> 本页面面向首次接触本项目的开发者，说明环境准备、安装、初始化、核心命令与项目结构。文中所有事实均标注了来源锚点；数据未覆盖的部分以「信息不足」注明。

---

## 1. 项目简介

`wiki-agent` 是一个 **CLI 工具**（`projectType: cli`），使用 TypeScript 编写（`hasTypeScript: true`），入口文件为 `src/cli/index.ts`。其核心职责是：

- `scan`：扫描项目结构并识别技术栈。
- `build`：基于代码库知识图谱（knowledge graph）生成 wiki 文档，支持 LLM 与纯规则两种模式。
- `init`：在项目中初始化 wiki-agent。

以上命令与描述来自 `cliCommands` 数据。

---

## 2. 技术栈

| 依赖 | 类型（推断依据） | 作用（基于调用点/配置，无调用点则标注） |
| --- | --- | --- |
| `ai` | 运行时依赖（techStack） | LLM 调用能力（信息不足：无具体调用点锚点） |
| `@ai-sdk/openai` | 运行时依赖（techStack） | OpenAI 兼容 LLM provider 接入（信息不足：无具体调用点锚点） |
| `commander` | 运行时依赖（techStack） | CLI 命令与参数解析（对应 `cliCommands` 中的 options） |
| `ignore` | 运行时依赖（techStack） | 基于 `.gitignore` 规则过滤文件（信息不足：无具体调用点锚点） |
| `tsup` | 构建工具（techStack） | TypeScript 打包（信息不足：无具体配置锚点） |
| `vitest` | 测试框架（techStack） | 单元测试（信息不足：无具体配置锚点） |

> 说明：上表「作用」列中，凡无源码调用点佐证的一律标注为「信息不足」，未进行推测性描述（遵循 R3）。

---

## 3. 环境准备

| 项目 | 要求 | 说明 |
| --- | --- | --- |
| 包管理器 | `pnpm` | 来自 `packageManager: "pnpm"` |
| Node.js | **信息不足** | 数据中 `nodeVersion` 为空字符串，未给出具体最低/推荐版本 |
| 系统 | **信息不足** | 数据未声明操作系统要求 |
| TypeScript | 需具备（`hasTypeScript: true`） | 项目以 TS 编写，入口 `src/cli/index.ts` |

各依赖作用简述：

- `commander`：解析 `build` / `init` / `scan` 三个子命令及其参数（对应 `cliCommands`）。
- `ai` + `@ai-sdk/openai`：支撑 `build` 命令的 LLM 模式（`--model`、`--base-url`、`--api-key` 参数），也支持 `--no-llm` 纯规则模式。
- `ignore`：用于 `scan` 扫描时的文件过滤。
- `tsup`：提供构建能力。
- `vitest`：提供测试能力。

> Node.js 版本、系统要求因数据缺失，标注为「信息不足」，不作猜测（遵循 R5）。

---

## 4. 安装步骤

以下流程基于 `packageManager: "pnpm"` 与该 CLI 的入口 `src/cli/index.ts` 推导，数据未提供具体安装脚本，故仅描述通用 pnpm 流程：

```bash
# 1. 安装依赖（预期：pnpm 生成/更新 lockfile 并安装 techStack 中列出的依赖）
pnpm install

# 2. 验证安装（预期：安装无错误、node_modules 存在）
ls node_modules

# 3. 构建产物（预期：产出 CLI 可执行文件；具体输出目录信息不足）
pnpm run build

# 4. 运行 CLI 入口（预期：显示可用子命令，如 scan / build / init）
node src/cli/index.ts --help
```

> 各步骤的**具体预期输出文本**数据未提供，标注为「信息不足」（遵循 R5）。请以实际运行结果为准。

---

## 5. 项目初始化

初始化命令由 `cliCommands` 提供：

### `init` — 在项目中初始化 wiki-agent

```bash
wiki-agent init --project-root <path>
```

| 选项 | 说明 |
| --- | --- |
| `--project-root <path>` | 项目根目录 |

> 使用场景：首次将 wiki-agent 接入目标项目，需要先在目标项目根目录完成初始化。

---

## 6. 基本使用

### 6.1 `scan` — 扫描项目结构并识别技术栈

```bash
wiki-agent scan --project-root <path>
```

| 选项 | 说明 |
| --- | --- |
| `--project-root <path>` | 项目根目录 |
| `-v, --verbose` | 显示详细输出 |

### 6.2 `build` — 从代码库知识图谱生成 wiki 文档

```bash
wiki-agent build \
  --project-root <path> \
  --model <model> \
  --base-url <url> \
  --api-key <key> \
  --mode full \
  --pages <pages>
```

| 选项 | 说明 |
| --- | --- |
| `--project-root <path>` | 项目根目录 |
| `--mcp-binary <path>` | codebase-memory-mcp 可执行文件路径 |
| `--model <model>` | LLM 模型名（如 `gpt-4o`、`qwen2.5`） |
| `--base-url <url>` | OpenAI 兼容的 API base URL |
| `--api-key <key>` | LLM provider 的 API key |
| `--no-llm` | 不使用 LLM 生成 wiki（纯规则模式） |
| `--pages <pages>` | 以逗号分隔的待生成页面名称列表 |
| `--mode <mode>` | 构建模式：`full`（全部重写）或 `update`（跳过未变化页面） |
| `--refresh-topics` | 重新检测自适应主题页面并覆盖 `topics.json` |

### 6.3 典型工作流：scan → build

```bash
# 1) 先扫描项目，识别结构和技术栈
wiki-agent scan --project-root . --verbose

# 2) 再生成 wiki 文档（LLM 模式）
wiki-agent build --project-root . --model gpt-4o --base-url <url> --api-key <key> --mode full

# 或纯规则模式（无需 LLM）
wiki-agent build --project-root . --no-llm

# 增量更新（跳过未变化页面）
wiki-agent build --project-root . --mode update
```

> 关于 `scan` 是否会影响 `build` 的输入、`topics.json` 的具体位置与结构，数据未提供，标注为「信息不足」。

---

## 7. 环境变量

数据中未提供 `envVars`，故不设该章节。

> 注意：`build` 命令通过 CLI 参数接收 `--api-key`，而非以环境变量方式描述。API key 的存储/读取方式数据未提供（信息不足）。

---

## 8. 项目结构概览

| 目录 | 说明 |
| --- | --- |
| `src` | 源码目录（`sourceDirs`）。入口文件为 `src/cli/index.ts`（`entryFiles`） |

> 数据仅提供 `src` 一个源码目录，未给出更细的子目录划分（如 `commands/`、`llm/` 等），因此不展开描述。更细的分层结构「信息不足」。

---

## 9. 开发指南

### 9.1 构建

项目使用 `tsup` 作为构建工具（techStack）。构建方式：

```bash
pnpm run build
```

> 具体构建输出目录、命令别名、`tsup` 配置项数据未提供（信息不足）。

### 9.2 测试

项目使用 `vitest`（techStack）。运行方式：

```bash
pnpm test
```

> 具体测试脚本名、测试目录约定数据未提供（信息不足）。注意：`tests/` 目录内容不纳入本页面功能描述。

### 9.3 开发调试

- CLI 入口为 `src/cli/index.ts`（`entryFiles`），可直接运行该文件进行调试。
- `scan` 命令支持 `-v, --verbose` 选项，便于开发时观察详细输出。
- 无 LLM 调试时，可使用 `build --no-llm`（纯规则模式）以避免外部 API 依赖。

> 调试配置（如 VSCode launch.json、tsx/ts-node 用法）数据未提供（信息不足）。

---

## 10. 速查表

| 目的 | 命令 |
| --- | --- |
| 初始化 | `wiki-agent init --project-root <path>` |
| 扫描结构 | `wiki-agent scan --project-root <path> [-v]` |
| 生成文档（LLM） | `wiki-agent build --project-root <path> --model <m> --base-url <u> --api-key <k>` |
| 生成文档（纯规则） | `wiki-agent build --project-root <path> --no-llm` |
| 增量更新 | `wiki-agent build --project-root <path> --mode update` |
| 刷新主题页 | `wiki-agent build --project-root <path> --refresh-topics` |

---

### 待确认（信息不足项汇总）

| 项 | 缺失证据 |
| --- | --- |
| Node.js 最低版本 | `nodeVersion` 为空 |
| 系统要求 | 数据未声明 |
| 构建产物路径 / tsup 配置 | 数据未提供 |
| 测试脚本与目录约定 | 数据未提供 |
| `topics.json` 位置与结构 | 数据未提供 |
| API key 是否支持环境变量读取 | 数据未提供 |
| `scan` 与 `build` 的数据依赖关系 | 数据未提供 |

以上均标注为「信息不足」，未作推测。
## Related

- 同目录：[testing.md](testing.md) · [troubleshooting.md](troubleshooting.md)
- 总入口：[README](../README.md)
