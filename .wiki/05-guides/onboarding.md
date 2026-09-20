# 上手指南

<details>
<summary>Relevant source files</summary>

- src/cli/index.ts
- tests/fixtures/sample-project/src/index.ts
</details>

本项目是一个基于 TypeScript 构建的 CLI 工具，使用 `commander` 组织命令、`ai` + `@ai-sdk/openai` 接入 AI 能力，通过 `tsup` 构建、`vitest` 测试，包管理器为 `pnpm`。

> 数据来源：`package.json`（techStack、packageManager）、`src/cli/index.ts`（入口）、`src/cli/commands/*.ts`（命令）。

---

## 1. 环境准备

| 依赖项 | 角色 | 依据 |
| --- | --- | --- |
| Node.js | 运行 TypeScript 编译产物与 CLI | 信息不足：未提供具体版本要求（`nodeVersion` 字段为空），请以实际 `package.json` 的 `engines` 字段为准，本数据中无法确认 |
| pnpm | 包管理器 | `package.json` 中 `packageManager: "pnpm"` |
| TypeScript | 语言与类型系统 | `hasTypeScript: true` |
| tsup | 构建打包 | 技术栈列表 |
| vitest | 测试框架 | 技术栈列表 |
| commander | CLI 命令解析 | 技术栈列表 |
| ai / @ai-sdk/openai | AI 能力（模型调用） | 技术栈列表 |
| ignore | 忽略规则匹配（如 .gitignore 风格） | 技术栈列表 |

> 说明：以上第三方库的“用途”依据其技术栈身份给出；若需精确到调用点，见 R3 要求的溯源，本数据未提供各库的调用点，故仅标注为技术栈成员。

Node.js 具体版本要求：**待确认**。缺失证据：`nodeVersion` 字段为空，未提供 `package.json` 的 `engines` 内容。

---

## 2. 安装步骤

使用 pnpm 安装依赖：

```bash
pnpm install
```

- 预期输出：pnpm 解析 `package.json` 与锁文件后输出依赖安装结果（新增/复用包数量）。
- 验证方法：安装完成后 `node_modules/` 目录存在，无安装错误。

> 本数据未提供具体依赖清单版本与安装脚本（如 `prepare`/`postinstall`），故不展开。

---

## 3. 项目初始化

CLI 提供 `init` 命令，用于项目初始化。

```bash
# 命令入口：src/cli/commands/init.ts
pnpm <入口> init
```

| 命令 | 所在文件 | 作用 |
| --- | --- | --- |
| `init` | `src/cli/commands/init.ts` | 初始化命令 |

参数与具体行为：**信息不足**。数据仅提供命令名与所在文件，未提供参数、选项或初始化产物的说明，无法在不编造的前提下补充。

---

## 4. 基本使用

### 4.1 命令一览

| 命令 | 源文件 | 说明 |
| --- | --- | --- |
| `scan` | `src/cli/commands/scan.ts` | 扫描命令 |
| `build` | `src/cli/commands/build.ts` | 构建命令 |
| `init` | `src/cli/commands/init.ts` | 初始化命令 |

CLI 入口为 `src/cli/index.ts`（`entryFiles`）。

### 4.2 典型工作流

根据命令命名可推断的调用顺序为 `init → scan → build`（初始化 → 扫描 → 构建）：

```bash
# 1. 初始化
<cli> init

# 2. 扫描
<cli> scan

# 3. 构建
<cli> build
```

> 说明：以上顺序基于命令名与源文件的分工组织呈现。每个命令的具体参数、输出、副作用：**信息不足**，数据未提供各命令选项定义，故不编造参数示例。

### 4.3 命令文件与入口

| 角色 | 路径 |
| --- | --- |
| CLI 主入口 | `src/cli/index.ts` |
| build 子命令 | `src/cli/commands/build.ts` |
| init 子命令 | `src/cli/commands/init.ts` |
| scan 子命令 | `src/cli/commands/scan.ts` |

---

## 5. 项目结构概览

| 目录/文件 | 含义 |
| --- | --- |
| `src/` | 源代码目录（`sourceDirs`） |
| `src/cli/` | CLI 相关代码，含 `index.ts` 入口与 `commands/` 子命令 |
| `src/cli/index.ts` | CLI 主入口（`entryFiles`） |
| `src/cli/commands/build.ts` | `build` 命令实现 |
| `src/cli/commands/init.ts` | `init` 命令实现 |
| `src/cli/commands/scan.ts` | `scan` 命令实现 |

> 关于 `src/` 下其他子目录的含义：**信息不足**。数据仅提供 `sourceDirs: ["src"]` 与 CLI 相关路径，未提供更多目录信息。

`tests/fixtures/sample-project/src/index.ts` 为测试夹具（属于 `tests/`，按规则不作为项目功能描述）。

---

## 6. 开发指南

### 6.1 构建

构建工具为 `tsup`（技术栈）。

```bash
pnpm build
```

> 具体构建脚本名与输出目录：**信息不足**。数据未提供 `package.json` 的 `scripts` 内容，无法确认脚本名与产物路径。

### 6.2 运行测试

测试框架为 `vitest`。

```bash
pnpm test
```

> 具体测试脚本名：**信息不足**。数据未提供 `scripts` 内容，无法确认脚本名。

### 6.3 开发调试

- 入口：`src/cli/index.ts`。
- 依赖：`@ai-sdk/openai` 与 `ai` 用于 AI 能力；`ignore` 用于忽略规则匹配。
- 各命令实现分散于 `src/cli/commands/` 下，可按命令为单位定位功能。

具体的调试命令、AI 模型配置（如 API Key 环境变量名）：**信息不足**。数据未提供配置项说明、环境变量定义或运行时读取逻辑。

---

## 7. 事实锚点汇总

| 声明 | 锚点 |
| --- | --- |
| CLI 入口 | `src/cli/index.ts` |
| build 命令 | `src/cli/commands/build.ts` |
| init 命令 | `src/cli/commands/init.ts` |
| scan 命令 | `src/cli/commands/scan.ts` |
| 源目录 | `sourceDirs: ["src"]` |
| 包管理器 | `packageManager: "pnpm"` |
| TypeScript | `hasTypeScript: true` |
| 技术栈 | `techStack`（`@ai-sdk/openai`, `ai`, `commander`, `ignore`, `tsup`, `vitest`） |

---

## 8. 待确认项清单

| 方面 | 缺失证据 |
| --- | --- |
| Node.js 版本要求 | `nodeVersion` 为空，未提供 `engines` |
| 各命令参数/选项 | 未提供 `src/cli/commands/*.ts` 中命令定义内容 |
| 构建/测试脚本名 | 未提供 `package.json` 的 `scripts` |
| AI 模型与配置 | 未提供环境变量或运行时配置读取证据 |
| `src/` 其他子目录 | 仅提供 `src` 与 CLI 路径 |
| 命令执行顺序 | 未提供调用关系或编排代码 |
## Related

- 同目录：[testing.md](testing.md) · [troubleshooting.md](troubleshooting.md)
- 总入口：[README](../README.md)
