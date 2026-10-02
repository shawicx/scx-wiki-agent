# CLI 命令参考

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
</details>

本页职责：描述该 CLI 的子命令、参数与退出码。可确认的命令模块集中在 `src/cli/commands/` 目录下，共 3 个子命令：`build`（`src/cli/commands/build.ts:11`）、`init`（`src/cli/commands/init.ts:8`）、`scan`（`src/cli/commands/scan.ts:4`）。

从数据可确认的组织方式是「一个子命令对应一个命令模块文件」：每个命令对象携带 `name`、`options` 与定义起始行。三个命令共同拥有的参数是 `--project-root <path>`（分别见 `src/cli/commands/build.ts:11`、`src/cli/commands/init.ts:8`、`src/cli/commands/scan.ts:4`），说明它们都以「项目根目录」作为作用对象；此外 `build` 独占一批 LLM 接入与 wiki 生成控制参数，`scan` 独有 `-v, --verbose`（`src/cli/commands/scan.ts:4`）。三个命令之间是否存在编排或先后依赖，数据未提供证据 —— **待确认**（缺命令间调用边或编排声明）。

> 说明：本页中命令的「说明」列若数据为空，一律如实标注，不做语义补写。参数清单的锚点使用其所属命令对象的定义行（数据未逐项提供选项自身的行号）。

## 命令总表

| 命令 | 说明 | 源文件:行号 |
| --- | --- | --- |
| `build` | 数据未提供 `description`；由其参数可知涉及项目构建/生成流程，并提供 LLM 相关参数（`--model`、`--base-url`、`--api-key`）、纯规则模式（`--no-llm`）、页面与模式控制（`--pages`、`--mode`）、话题与大纲刷新（`--refresh-topics`、`--refresh-outline`）以及交互确认（`--confirm`） | `src/cli/commands/build.ts:11` |
| `init` | 数据未提供 `description`（功能定位**待确认**：缺命令描述与调用点证据） | `src/cli/commands/init.ts:8` |
| `scan` | 数据未提供 `description`（功能定位**待确认**：缺命令描述与调用点证据） | `src/cli/commands/scan.ts:4` |

> CLI 入口文件与可执行文件名：数据未提供 —— **待确认**（缺 package/bin 声明或入口文件记录）。

## build

命令定义位置：`src/cli/commands/build.ts:11`。数据中 `description` 为空字符串，未提供官方功能描述，因此下方仅陈述参数事实与基于参数描述可直接确定的用法组合。

### 参数

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

参数锚点：以上清单整体来自命令定义对象 `src/cli/commands/build.ts:11`（数据未提供各选项独立行号）。

### 参数分组（按参数说明归纳）

| 分组 | 参数 | 依据 |
| --- | --- | --- |
| 路径定位 | `--project-root <path>`、`--mcp-binary <path>` | `src/cli/commands/build.ts:11` |
| LLM 接入 | `--model <model>`、`--base-url <url>`、`--api-key <key>`、`--no-llm` | `src/cli/commands/build.ts:11` |
| 生成范围与模式 | `--pages <pages>`、`--mode <mode>` | `src/cli/commands/build.ts:11` |
| 计划/话题重算 | `--refresh-topics`、`--refresh-outline` | `src/cli/commands/build.ts:11` |
| 交互确认 | `--confirm` | `src/cli/commands/build.ts:11` |

### 关键参数语义（严格按参数说明）

- `--mode <mode>`：可选值为 `full`（wipe and rewrite `.wiki`）与 `update`（skip unchanged pages）；默认 `full`，且可被配置覆盖 —— `src/cli/commands/build.ts:11`。
- `--no-llm`：以纯规则方式生成 wiki，不使用 LLM —— `src/cli/commands/build.ts:11`。
- `--pages <pages>`：逗号分隔的待生成页面名列表 —— `src/cli/commands/build.ts:11`。
- `--refresh-topics`：重新检测自适应话题页并覆写 `topics.json` —— `src/cli/commands/build.ts:11`。
- `--refresh-outline`：经 LLM 重新规划大纲章节并覆写 `outline.json` —— `src/cli/commands/build.ts:11`。
- `--confirm`：对「待确认」项进行交互式确认，时机为生成之后、写入之前，仅 TTY 可用 —— `src/cli/commands/build.ts:11`。

### 使用场景与示例

以下示例仅组合数据中给出的命令名与参数，参数取值位置沿用参数本身的占位符写法，避免引入未记录的取值。

| 场景 | 示例命令 | 依据 |
| --- | --- | --- |
| 指定项目根目录后执行一次构建 | `build --project-root <path>` | `src/cli/commands/build.ts:11` |
| 纯规则生成（不接 LLM） | `build --project-root <path> --no-llm` | `src/cli/commands/build.ts:11` |
| 指定自建参数接入 LLM | `build --project-root <path> --model <model> --base-url <url> --api-key <key>` | `src/cli/commands/build.ts:11` |
| 指定 MCP 二进制位置 | `build --project-root <path> --mcp-binary <path>` | `src/cli/commands/build.ts:11` |
| 全量重建（清空并重写 `.wiki`） | `build --project-root <path> --mode full` | `src/cli/commands/build.ts:11` |
| 增量更新（跳过未变化页面） | `build --project-root <path> --mode update` | `src/cli/commands/build.ts:11` |
| 只生成指定页面 | `build --project-root <path> --pages <pages>` | `src/cli/commands/build.ts:11` |
| 重算话题与大纲 | `build --project-root <path> --refresh-topics --refresh-outline` | `src/cli/commands/build.ts:11` |
| 写入前交互确认「待确认」项（需 TTY） | `build --project-root <path> --confirm` | `src/cli/commands/build.ts:11` |

> 注意：`--refresh-outline` 的说明中指出其通过 LLM 重新规划大纲，因此在 `--no-llm` 模式下二者能否组合使用，数据未提供约束 —— 信息不足。

## init

命令定义位置：`src/cli/commands/init.ts:8`。数据中 `description` 为空字符串，功能定位**待确认**（缺功能描述或调用点证据）。

### 参数

| 参数 | 说明 |
| --- | --- |
| `--project-root <path>` | Project root directory |

参数锚点：`src/cli/commands/init.ts:8`。

### 使用场景与示例

| 场景 | 示例命令 | 依据 |
| --- | --- | --- |
| 指定项目根目录执行初始化 | `init --project-root <path>` | `src/cli/commands/init.ts:8` |

该命令在数据中仅登记了 `--project-root <path>` 一个参数，因此除项目根目录外不接受数据所记录的其他参数；其具体产出物（生成/修改哪些文件）未在数据中给出 —— **待确认**。

## scan

命令定义位置：`src/cli/commands/scan.ts:4`。数据中 `description` 为空字符串，功能定位**待确认**（缺功能描述或调用点证据）。

### 参数

| 参数 | 说明 |
| --- | --- |
| `--project-root <path>` | Project root directory |
| `-v, --verbose` | Show detailed output |

参数锚点：`src/cli/commands/scan.ts:4`。

### 使用场景与示例

| 场景 | 示例命令 | 依据 |
| --- | --- | --- |
| 指定项目根目录执行扫描 | `scan --project-root <path>` | `src/cli/commands/scan.ts:4` |
| 输出详细过程信息 | `scan --project-root <path> --verbose` | `src/cli/commands/scan.ts:4` |

`-v, --verbose` 是三个命令中唯一登记的短选项形式，作用是展示更详细的输出 —— `src/cli/commands/scan.ts:4`。

## 退出码

数据仅提供 1 条退出码记录，且归属于 `build` 命令文件。

| 码 | 触发上下文 | 源文件 |
| --- | --- | --- |
| `1` | `process.exit(1);` | `src/cli/commands/build.ts`（数据未提供行号） |

语义说明：

- 目前唯一可确认的事实是：`build` 命令所在文件中存在一处 `process.exit(1);` 调用（`src/cli/commands/build.ts`）。该调用位于哪个分支、对应哪种失败条件，数据未提供 —— **待确认**（缺上下文分支与错误信息证据）。
- `init` 与 `scan` 在数据中没有退出码记录；这表示数据未提供相关信息，不能据此推断它们不返回非零退出码 —— 信息不足。

## 待确认汇总

| 项 | 缺失证据 |
| --- | --- |
| `init`、`scan` 的功能定位 | 命令对象 `description` 为空，且无调用点/产出物证据（`src/cli/commands/init.ts:8`、`src/cli/commands/scan.ts:4`） |
| 三个命令之间的编排与执行顺序 | 无命令间调用边或编排声明 |
| `build` 中 `process.exit(1)` 的触发条件与错误语义 | 仅有 `process.exit(1);` 调用点（`src/cli/commands/build.ts`），无所在分支与失败类型信息 |
| CLI 入口文件与可执行名（如何启动） | 数据未提供入口/`bin` 声明 |
## Related

- 同目录：[api.md](api.md)
- 共享 3 个源文件、共享 25 个符号：[onboarding.md](../05-guides/onboarding.md)
- 共享 3 个源文件、共享 5 个符号：[modules.md](../02-architecture/modules.md)
- 共享 6 个符号：[conventions.md](../06-constraints/conventions.md)
- 总入口：[README](../README.md)
