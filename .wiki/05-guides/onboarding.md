# wiki-agent 上手指南

<details>
<summary>Relevant source files</summary>

- package.json
- scripts/check-file-lines.mjs
- src/bin.ts
- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/commands/types.ts
- src/cli/confirm-interaction.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/knowledge/config-detector/index.ts
- src/knowledge/confirmation/index.ts
- src/knowledge/context/cli.ts
- src/knowledge/context/index.ts
- src/knowledge/crosspage/index.ts
</details>

本页面向首次接触本项目的新成员，说明如何准备环境、安装依赖、初始化项目、使用 CLI 命令，以及本仓库的目录职责与开发流程。所有事实均以仓库中的文件路径为锚点。

项目类型为 CLI 工具（`projectType: cli`），源码为 TypeScript（`hasTypeScript: true`），包管理器为 pnpm（`packageManager: pnpm`）。

---

## 1. 技术栈与依赖总览

### 1.1 核心工具链

| 用途 | 工具 | 证据（引用文件） |
| --- | --- | --- |
| CLI 命令框架 | commander | `src/cli/index.ts`、`src/cli/commands/build.ts`、`src/cli/commands/init.ts`、`src/cli/commands/scan.ts` |
| 构建打包 | tsup | `tsup.config.ts` |
| 测试框架 | vitest | `vitest.config.ts` |
| 类型检查 | typescript | 通过 `lint` 脚本中的 `tsc --noEmit` 调用（见 1.3） |

### 1.2 运行时依赖（含源码引用锚点）

| 依赖 | usageKind | 引用位置（importFiles） |
| --- | --- | --- |
| `commander` | import | `src/cli/index.ts`、`src/cli/commands/build.ts`、`src/cli/commands/init.ts`、`src/cli/commands/scan.ts` |
| `@clack/prompts` | import | `src/cli/confirm-interaction.ts` |
| `@ai-sdk/openai` | import | `src/knowledge/generator/index.ts`、`src/knowledge/generator/shared.ts` |
| `ai` | import | `src/knowledge/generator/shared.ts` |
| `ignore` | import | `src/core/scanner.ts` |
| `yaml` | import | `src/shared/config.ts` |
| `tsup` | import | `tsup.config.ts` |
| `vitest` | import | `vitest.config.ts` |
| `@types/node` | none | 无 importFiles（原始数据中 importCount 为 0） |
| `typescript` | none | 无 importFiles（原始数据中 importCount 为 0） |

说明：`commander` 是命令注册与解析的入口；`@clack/prompts` 仅在确认交互模块 `src/cli/confirm-interaction.ts` 中被引用，与 `build` 命令的 `--confirm` 选项（TTY 交互确认）属于同一能力域的代码位置。`ignore` 出现在扫描器 `src/core/scanner.ts`，`yaml` 出现在配置模块 `src/shared/config.ts`，二者分别对应"扫描项目"与"读取配置"两类职责。

### 1.3 npm scripts（直接来自 `scripts` 数据）

| 脚本 | 命令 | 作用 |
| --- | --- | --- |
| `build` | `tsup` | 打包构建 CLI 产物 |
| `dev` | `tsup --watch` | 监听模式开发构建 |
| `test` | `vitest run` | 运行一次测试 |
| `test:watch` | `vitest` | 测试监听模式 |
| `lint` | `tsc --noEmit && node scripts/check-file-lines.mjs` | 类型检查（不产出文件）+ 文件行数检查脚本 |

---

## 2. 环境准备

| 项 | 要求 | 依据 |
| --- | --- | --- |
| 包管理器 | pnpm | 数据中 `packageManager: pnpm` |
| 语言 | TypeScript（源码为 `.ts`） | `hasTypeScript: true`；源码文件如 `src/bin.ts`、`src/cli/index.ts` |
| Node.js 版本 | 待确认 | 数据中 `nodeVersion` 为空字符串，未提供 `engines` 约束信息 |
| 系统要求 | 信息不足 | 数据中未提供操作系统相关声明 |

各依赖在环境准备阶段的作用：

- **pnpm**：项目指定的包管理器，依赖解析与锁文件以 pnpm 为准。
- **tsup**：由 `tsup.config.ts` 配置，负责把 `src` 下的 TypeScript 源码打包为可执行的 CLI 产物（`build` / `dev` 脚本）。
- **typescript**：通过 `tsc --noEmit` 参与 `lint` 流程，仅做类型校验、不输出文件。
- **vitest**：由 `vitest.config.ts` 配置，运行测试。
- **commander**：安装后由 `src/cli/index.ts` 加载，构建 CLI 命令树。
- **@clack/prompts**：交互式确认能力的运行时依赖（`src/cli/confirm-interaction.ts`）。
- **ai / @ai-sdk/openai**：LLM 生成能力的运行时依赖（`src/knowledge/generator/shared.ts`、`src/knowledge/generator/index.ts`）。
- **yaml / ignore**：分别为配置解析（`src/shared/config.ts`）与扫描忽略规则（`src/core/scanner.ts`）提供支持。

---

## 3. 安装步骤

1. **进入项目根目录**（后续所有命令均在项目根目录执行）。

2. **安装依赖**

   ```bash
   pnpm install
   ```

   预期结果：依赖安装完成，`node_modules` 生成或更新，锁文件被写入/更新；进程退出码为 0。

   验证方法：确保命令无报错退出，随后执行第 3 步的构建或第 4 步的类型检查。

3. **构建验证**

   ```bash
   pnpm run build
   ```

   等价于执行 `tsup`，使用 `tsup.config.ts` 中的配置。预期结果：打包成功、退出码为 0；具体产物目录由 `tsup.config.ts` 决定。

4. **类型与代码规范验证**

   ```bash
   pnpm run lint
   ```

   实际执行 `tsc --noEmit && node scripts/check-file-lines.mjs`：前者做全量类型检查（无 emit），后者运行仓库自带的文件行数检查脚本。两者都以退出码 0 为通过。

5. **测试验证**

   ```bash
   pnpm test
   ```

   等价于 `vitest run`（读取 `vitest.config.ts`），执行全部测试并退出。

---

## 4. 项目初始化（CLI 命令）

CLI 命令通过 `commander` 注册，注册入口为 `src/cli/index.ts`，各命令实现分别位于 `src/cli/commands/` 下：

| 命令 | 实现文件 | 用途 |
| --- | --- | --- |
| `build` | `src/cli/commands/build.ts` | 从代码库知识图谱生成 wiki 文档 |
| `init` | `src/cli/commands/init.ts` | 在项目中初始化 wiki-agent |
| `scan` | `src/cli/commands/scan.ts` | 扫描项目结构并识别技术栈 |

命令的公共类型定义位于 `src/cli/commands/types.ts`。

### 4.1 init：初始化

```bash
wiki-agent init --project-root <path>
```

| 选项 | 说明 |
| --- | --- |
| `--project-root <path>` | 项目根目录 |

使用场景：首次在目标项目中引入 wiki-agent 时执行。

（可执行文件名称以 `package.json` 的 `bin` 配置为准；该字段未包含在本次数据中，见第 8 节待确认。）

### 4.2 scan：扫描项目

```bash
wiki-agent scan --project-root <path>
```

| 选项 | 说明 |
| --- | --- |
| `--project-root <path>` | 项目根目录 |
| `-v, --verbose` | 显示详细输出 |

使用场景：在生成文档前先了解项目结构与技术栈识别结果；排查"为什么某个目录/文件没被识别"时使用 `--verbose`。扫描逻辑位于 `src/core/scanner.ts`，其中引用了 `ignore` 依赖用于忽略规则处理。

---

## 5. 基本使用

### 5.1 build：生成 wiki 文档

完整选项列表（直接引用命令定义数据）：

| 选项 | 说明 |
| --- | --- |
| `--project-root <path>` | 项目根目录 |
| `--mcp-binary <path>` | codebase-memory-mcp 可执行文件路径 |
| `--model <model>` | LLM 模型名（如 gpt-4o、qwen2.5） |
| `--base-url <url>` | OpenAI 兼容的 API base URL |
| `--api-key <key>` | LLM 提供方的 API key |
| `--no-llm` | 不使用 LLM 生成 wiki（纯规则） |
| `--pages <pages>` | 逗号分隔的待生成页面名称 |
| `--mode <mode>` | 构建模式：`full`（清空并重写 `.wiki`）或 `update`（跳过未变化页面）；默认 full，可被配置覆盖 |
| `--refresh-topics` | 重新检测自适应主题页并覆盖 `topics.json` |
| `--refresh-outline` | 通过 LLM 重新规划大纲章节并覆盖 `outline.json` |
| `--confirm` | 对"待确认"项执行交互式确认（生成之后、写入之前；仅 TTY 可用） |

### 5.2 典型工作流

**流程一：纯规则生成（不调用 LLM）**

```bash
# 1) 扫描项目结构，识别技术栈
wiki-agent scan --project-root . --verbose

# 2) 纯规则生成 wiki
wiki-agent build --project-root . --no-llm
```

**流程二：带 LLM 生成**

```bash
wiki-agent scan --project-root .

wiki-agent build --project-root . \
  --project-root . \
  --model <model> \
  --base-url <url> \
  --api-key <key>
```

（上例仅为选项组合演示，`--project-root` 只需给出一次。）

**流程三：增量更新已有 wiki**

```bash
wiki-agent build --project-root . --mode update
```

`--mode update` 会跳过未变化的页面；`--mode full`（默认）会清空并重写 `.wiki` 目录。

**流程四：重新规划结构后生成**

```bash
# 重新检测主题页并覆盖 topics.json
wiki-agent build --project-root . --refresh-topics

# 通过 LLM 重新规划大纲并覆盖 outline.json
wiki-agent build --project-root . --refresh-outline

# 生成后、写入前做交互式确认（需要在 TTY 终端中执行）
wiki-agent build --project-root . --confirm
```

**流程五：只生成指定页面**

```bash
wiki-agent build --project-root . --pages page-a,page-b
```

### 5.3 选项与实现代码的对应关系（边表）

| 能力 | 相关实现位置 | 依赖引用证据 |
| --- | --- | --- |
| 命令注册与解析 | `src/cli/index.ts` | `commander` → `src/cli/index.ts` |
| build 命令 | `src/cli/commands/build.ts` | `commander` → `src/cli/commands/build.ts` |
| init 命令 | `src/cli/commands/init.ts` | `commander` → `src/cli/commands/init.ts` |
| scan 命令 | `src/cli/commands/scan.ts` | `commander` → `src/cli/commands/scan.ts` |
| `--confirm` 交互确认 | `src/cli/confirm-interaction.ts` | `@clack/prompts` → `src/cli/confirm-interaction.ts` |
| LLM 生成 | `src/knowledge/generator/index.ts`、`src/knowledge/generator/shared.ts` | `ai` → `src/knowledge/generator/shared.ts`；`@ai-sdk/openai` → 上述两个文件 |
| 项目扫描 | `src/core/scanner.ts` | `ignore` → `src/core/scanner.ts` |
| 配置读取 | `src/shared/config.ts` | `yaml` → `src/shared/config.ts` |

---

## 6. 环境变量

| 变量名 | 敏感 | 生产引用位置 |
| --- | --- | --- |
| `CODEBASE_MEMORY_MCP_BINARY` | 否 | `src/mcp/codebase-memory-client.ts` |

该变量与 `build` 命令的 `--mcp-binary <path>` 选项指向同一类目标（codebase-memory-mcp 可执行文件路径），可通过环境变量提供，也可通过命令行选项显式指定。

---

## 7. 项目结构概览

源码根目录为 `src`（`sourceDirs: ["src"]`）。以下目录与文件均来自数据中给出的真实路径。

| 目录 | 职责（基于文件样本） | 文件样本锚点 |
| --- | --- | --- |
| `src/` | 源码根目录，包含进程入口与各功能子目录 | `src/bin.ts` |
| `src/cli/` | CLI 命令注册与交互层 | `src/cli/index.ts`、`src/cli/confirm-interaction.ts`、`src/cli/commands/types.ts` |
| `src/cli/commands/` | 各子命令实现，一个命令一个文件 | `src/cli/commands/build.ts`、`src/cli/commands/init.ts`、`src/cli/commands/scan.ts`、`src/cli/commands/types.ts` |
| `src/core/` | 核心扫描能力 | `src/core/scanner.ts`（引用 `ignore` 依赖） |
| `src/shared/` | 共享配置读取 | `src/shared/config.ts`（引用 `yaml` 依赖） |
| `src/mcp/` | codebase-memory-mcp 客户端 | `src/mcp/codebase-memory-client.ts`（引用环境变量 `CODEBASE_MEMORY_MCP_BINARY`） |
| `src/knowledge/` | 知识图谱 / 文档生成相关模块（目录下多个子模块各自有 `index.ts` 入口） | `src/knowledge/config-detector/index.ts`、`src/knowledge/confirmation/index.ts`、`src/knowledge/context/cli.ts`、`src/knowledge/context/index.ts`、`src/knowledge/crosspage/index.ts`、`src/knowledge/dataflow/index.ts`、`src/knowledge/fallback/index.ts`、`src/knowledge/generator/index.ts`、`src/knowledge/intent/index.ts`、`src/knowledge/quality/index.ts`、`src/knowledge/types/index.ts` |
| `src/services/` | 服务层，wiki 服务的入口在此 | `src/services/wiki/index.ts` |

要点：

- `src/bin.ts` 是命令行可执行入口文件（`entryFiles` 中列出，且位于源码根目录）。
- `src/cli/index.ts` 是 commander 的命令注册点；`src/cli/commands/` 下每个命令一个文件，公共类型抽到 `src/cli/commands/types.ts`。据此新增子命令时，通常需要在本目录新增实现文件并在 `src/cli/index.ts` 注册（结构性推断，依据是上述文件划分与 commander 的 4 个 import 点）。
- `src/knowledge/` 下每个子目录都提供 `index.ts`（`context/` 另有 `cli.ts`），说明该层由多个可独立引用的小模块组成；其中 `generator/` 同时被 `ai` 与 `@ai-sdk/openai` 引用，是 LLM 生成的落点。
- `src/services/wiki/index.ts` 是 wiki 服务层的入口文件。

---

## 8. 开发指南

### 8.1 构建

```bash
pnpm run build     # tsup，读取 tsup.config.ts
pnpm run dev       # tsup --watch，监听源码变化重新构建
```

开发期建议使用 `dev` 保持增量构建。构建产物目录等细节由 `tsup.config.ts` 决定。

### 8.2 测试

```bash
pnpm test          # vitest run（读取 vitest.config.ts）
pnpm run test:watch  # vitest，监听模式
```

### 8.3 类型检查与规范校验

```bash
pnpm run lint
```

该脚本依次执行 `tsc --noEmit` 与 `node scripts/check-file-lines.mjs`：前者阻止类型错误进入代码库，后者校验文件行数（仓库自带检查脚本，位于 `scripts/check-file-lines.mjs`）。提交前建议固定执行一次。

### 8.4 运行与调试 CLI

- 入口：`src/bin.ts`（源码根目录）。
- 命令注册：`src/cli/index.ts`。
- 推荐调试方式：以 `pnpm run dev` 保持构建，然后对任意目标项目执行 `scan`（加 `-v` 查看详细输出）与 `build`（可加 `--no-llm` 排查纯规则路径，或 `--pages` 只生成个别页面缩小范围）。
- 交互确认路径（`--confirm`）依赖 TTY 终端，且引用了 `@clack/prompts`（`src/cli/confirm-interaction.ts`），在非 TTY 环境（如 CI 管道）中无法触发，调试该路径请使用本地终端。
- 涉及 MCP 二进制时，可通过环境变量 `CODEBASE_MEMORY_MCP_BINARY`（`src/mcp/codebase-memory-client.ts`）或 `--mcp-binary` 选项指定路径。

### 8.5 扩展命令的落点

| 要改的内容 | 位置 |
| --- | --- |
| 命令注册 / 全局选项 | `src/cli/index.ts` |
| 单个命令的行为与选项 | `src/cli/commands/<命令>.ts`（`build` / `init` / `scan`） |
| 命令相关的共享类型 | `src/cli/commands/types.ts` |
| 交互式确认 | `src/cli/confirm-interaction.ts` |
| 项目扫描与忽略规则 | `src/core/scanner.ts` |
| 配置解析 | `src/shared/config.ts` |

---

## 9. 待确认

1. **Node.js 版本要求**：数据中 `nodeVersion` 为空字符串，`engines` 字段未提供，无法给出最低版本约束。
2. **CLI 可执行文件名与安装方式**：`package.json` 的 `bin` 字段未在数据中提供；本页命令示例中的 `wiki-agent` 取自 `init` 命令描述文本（"Initialize wiki-agent in the project"），实际可执行名需以 `bin` 配置为准。
3. **配置文件的名称与路径**：`src/shared/config.ts` 通过 `yaml` 解析配置，`build` 的 `--mode` 说明中提到"可被配置覆盖"，但配置文件名/位置未在本次数据中给出。
## Related

- 同目录：[testing.md](testing.md) · [troubleshooting.md](troubleshooting.md)
- 共享 6 个源文件、共享 25 个符号：[tech-stack.md](../01-overview/tech-stack.md)
- 共享 3 个源文件、共享 25 个符号：[cli.md](../03-interface/cli.md)
- 共享 7 个源文件、共享 16 个符号：[modules.md](../02-architecture/modules.md)
- 总入口：[README](../README.md)
