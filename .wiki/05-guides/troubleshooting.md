# 故障排除

<details>
<summary>Relevant source files</summary>

- src/cli/index.ts
- src/knowledge/topic-discovery.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-evidence.ts
- tests/knowledge/config-detector.test.ts
</details>

本页基于项目实际配置（scripts、envVars、constants、entryFiles）整理 CLI 项目常见故障的排查路径。所有条目均以提供的 JSON 数据为唯一依据，未覆盖的方面明确标注「待确认」。

> 入口起点：`src/cli/index.ts`（entryFiles）。任何运行时问题建议先从此文件入手定位命令注册与依赖初始化流程（R5：其内部具体调用链不在数据中，需查源码）。

---

## 1. 环境问题

### 1.1 包管理器不一致

- **问题描述**：使用 `npm` 或 `yarn` 安装依赖后，`pnpm` 脚本行为异常，或 `node_modules` 结构不完整。
- **原因分析**：项目声明包管理器为 `pnpm`（`packageManager`）。
- **解决方案**：
  ```bash
  # 清理并重新用 pnpm 安装
  rm -rf node_modules pnpm-lock.yaml
  pnpm install
  ```

### 1.2 Node 版本不确定

- **问题描述**：构建或运行时报语法/API 不支持错误。
- **原因分析**：数据中 `nodeVersion` 字段为空字符串，未声明所需 Node 版本。
- **解决方案**：项目未在数据中约束 Node 版本（**待确认**：需查看 `package.json` 的 `engines` 字段或 `.nvmrc`）。可先使用当前 LTS 版本运行，若出现 `ERR_UNKNOWN_FILE_EXTENSION` 或 ESM 相关报错，优先尝试升级 Node。

### 1.3 环境变量缺失或错误

项目涉及以下环境变量（`envVars`）：

| 变量名 | 敏感 | 说明与排障要点 |
|---|---|---|
| `API_KEY` | 是 | 敏感凭据，缺失时 AI SDK（`@ai-sdk/openai` / `ai`）调用会失败。不要提交到版本库。 |
| `BASE_URL` | 否 | 接口基地址，配置错误会导致请求指向错误服务。需与 `API_KEY` 配套。 |
| `CODEBASE_MEMORY_MCP_BINARY` | 否 | MCP 二进制路径，未设置或路径错误会导致 `mcp` 模块无法启动外部进程。 |

- **问题描述**：命令执行到 AI 调用或 MCP 交互阶段报错。
- **原因分析**：`API_KEY` / `BASE_URL` 缺失或 `CODEBASE_MEMORY_MCP_BINARY` 未指向有效可执行文件。
- **解决方案**：
  ```bash
  # 显式导出后再运行（POSIX shell）
  export API_KEY="your-key"
  export BASE_URL="https://your-endpoint"
  export CODEBASE_MEMORY_MCP_BINARY="/absolute/path/to/codebase-memory-mcp"
  ```

### 1.4 依赖安装问题

- **问题描述**：`pnpm install` 后部分包缺失。
- **原因分析**：数据未提供完整依赖清单与 peer 依赖关系。
- **解决方案**：使用 `pnpm install --frozen-lockfile` 复现干净安装；若报 peer 依赖警告，结合具体包名排查（**待确认**：具体依赖树需查 `package.json`）。

---

## 2. 构建问题

构建命令（`scripts.build`）：`tsup`；监听开发（`scripts.dev`）：`tsup --watch`。

### 2.1 TypeScript 编译错误

- **问题描述**：`pnpm run build`（`tsup`）或 `pnpm run lint`（`tsc --noEmit`）报类型错误。
- **原因分析**：类型不匹配、未导出类型、`tsconfig` 配置与源码不一致。
- **解决方案**：
  ```bash
  pnpm run lint    # 仅做类型检查，快速暴露错误位置
  pnpm run build   # 完整打包
  ```
  先修 `lint` 报告的类型错误，再跑 `build`。

### 2.2 打包输出异常 / ESM 与 CJS 兼容

- **问题描述**：构建产物在运行时报 `require is not defined`、`Cannot use import statement outside a module` 或 `ERR_REQUIRE_ESM`。
- **原因分析**：CLI 项目（`projectType: cli`）通常涉及 ESM/CJS 双格式，`tsup` 的输出格式与 `package.json` 的 `type` 字段或下游依赖的模块系统不一致。
- **解决方案**：
  - 使用 `pnpm run dev`（`tsup --watch`）持续观察构建输出，确认产物格式。
  - 检查 `tsup.config` 中的 `format` 与 `package.json` 的 `type`/`main`/`bin` 字段是否一致（**待确认**：`tsup` 具体配置未在数据中，需查项目配置文件）。
  - 若目标依赖为 ESM，确保产物导出 ESM；混合项目常见做法是同时产出两种格式并在 `exports` 中区分。

### 2.3 构建脚本静默失败

- **问题描述**：`pnpm run build` 退出码非 0 但未打印明显错误。
- **原因分析**：`tsup` 默认成功时较静默，失败信息需结合 `exit code` 判断。
- **解决方案**：
  ```bash
  pnpm run build 2>&1 | tee build.log
  grep -iE "error|failed" build.log
  ```

---

## 3. 运行时问题

### 3.1 入口命令启动失败

- **问题描述**：CLI 子命令无响应或报「command not found」。
- **原因分析**：入口文件 `src/cli/index.ts` 的 `commander` 命令注册未生效，或构建产物未生成。
- **解决方案**：
  ```bash
  pnpm run build        # 确保产物存在
  node dist/index.js    # 运行构建后的入口（具体输出路径需查 tsup 配置，待确认）
  ```
  开发期可直接用 `pnpm run dev` 边构建边运行。

### 3.2 外部依赖 `codebase-memory-mcp` 缺失

- **问题描述**：涉及 `mcp` 模块的操作失败，报进程启动失败或找不到可执行文件。
- **原因分析**：`CODEBASE_MEMORY_MCP_BINARY` 指向的二进制不存在或不可执行。
- **解决方案**：
  ```bash
  # 1. 确认变量已设置
  echo "$CODEBASE_MEMORY_MCP_BINARY"
  # 2. 确认文件存在且可执行
  ls -l "$CODEBASE_MEMORY_MCP_BINARY"
  chmod +x "$CODEBASE_MEMORY_MCP_BINARY"
  ```
  使用绝对路径可避免相对路径解析问题。

### 3.3 AI 调用失败（`@ai-sdk/openai` / `ai`）

- **问题描述**：执行依赖 AI 模型的功能时报 401/403/404 或超时。
- **原因分析**：`API_KEY` 失效、`BASE_URL` 不匹配对应密钥的提供方。
- **解决方案**：核对 `API_KEY` 与 `BASE_URL` 属于同一服务方；用 `curl` 直接测试 `BASE_URL` 可达性。

### 3.4 常量边界触发导致的异常输出

以下限制常量是排障关键边界，**触界时行为通常表现为「结果被截断」或「聚类结果为空」**，需逐个理解：

| 常量 | 值 | 文件 | 触界典型症状 |
|---|---|---|---|
| `MAX_TOPICS` | 4 | `src/knowledge/topic-discovery.ts` | 主题数量被上限截断，超过部分不出现 |
| `MIN_CLUSTER_MEMBERS` | 5 | `src/knowledge/topic-discovery.ts` | 小代码簇被丢弃，可能没有主题被发现 |
| `MIN_TOPIC_FILES` | 3 | `src/knowledge/topic-discovery.ts` | 文件数不足的主题被剔除，结果为空 |
| `MAX_TOPIC_FILES` | 12 | `src/knowledge/topic-discovery.ts` | 单主题文件数被裁剪，部分文件缺失 |
| `MODULE_DETAIL_LIMIT` | 12 | `src/knowledge/wiki-context-builder.ts` | 模块详情只保留前 12 条 |
| `MAX_DEPTH` | 3 | `src/knowledge/wiki-context-builder.ts` | 依赖遍历超过 3 层被截断，深层模块缺失 |
| `MAX_NODES` | 25 | `src/knowledge/wiki-context-builder.ts` | 图中节点超 25 个被裁剪，关系不完整 |
| `EVIDENCE_MAX_FILES` | 15 | `src/knowledge/wiki-evidence.ts` | 证据文件被截断至 15 个 |
| `EVIDENCE_MIN_FILES` | 3 | `src/knowledge/wiki-evidence.ts` | 文件数不足 3 时证据不生成 |
| `MAX_DEPTH` | 3 | `tests/knowledge/config-detector.test.ts` | 测试中深度遍历超过 3 层时的边界用例 |
| `TIMEOUT_MS` | 60000 | `tests/knowledge/config-detector.test.ts` | 测试超时阈值 60 秒，超时即失败 |

- **问题描述**：运行知识发现/上下文构建类命令时，结果比预期少，或直接为空。
- **原因分析**：输入代码库规模较小或结构扁平，未达到 `MIN_CLUSTER_MEMBERS`（5）、`MIN_TOPIC_FILES`（3）等下限；或规模过大触发 `MAX_*` 上限而被裁剪。
- **解决方案**：
  - 结果为空：检查代码库文件/模块数量是否满足下限阈值；对小型项目可考虑放宽这些常量（需修改源码，注意 `constants` 当前为硬编码值）。
  - 结果被截断：确认是否为 `MAX_TOPICS`/`MAX_TOPIC_FILES`/`MAX_NODES` 上限所致，在观察完整结果时需提高相应上限。

### 3.5 测试超时

- **问题描述**：`pnpm run test`（`vitest run`）用例超时失败。
- **原因分析**：`tests/knowledge/config-detector.test.ts` 中 `TIMEOUT_MS` 为 60000（60 秒），耗时操作（如 MCP 或 AI 调用）超过阈值。
- **解决方案**：
  ```bash
  # 单文件运行以隔离慢用例
  pnpm run test tests/knowledge/config-detector.test.ts
  ```
  若确实是外部依赖慢，需评估是否调整超时阈值。

### 3.6 路径/忽略规则问题（`ignore` 依赖）

- **问题描述**：扫描代码库时遗漏文件或多扫描了非源码文件。
- **原因分析**：项目使用 `ignore` 包处理 `.gitignore` 类规则，规则配置不当会影响扫描范围。
- **解决方案**：核对根目录忽略文件与目标扫描路径（**待确认**：具体忽略文件读取逻辑需查源码）。

---

## 4. 调试技巧

### 4.1 从入口开始排查

入口文件为 `src/cli/index.ts`。任何「命令不生效」「参数无响应」类问题，建议先在此文件确认命令注册（`commander`）与初始化流程。

### 4.2 监听构建

```bash
pnpm run dev   # tsup --watch，改动源码自动重构建
```

适合边改边跑，快速定位构建/类型错误。

### 4.3 单文件测试与监听

```bash
pnpm run test                # vitest run，一次性
pnpm run test:watch          # vitest，监听模式
pnpm run test <file>         # 运行指定测试文件
```

### 4.4 类型检查作为快速反馈

```bash
pnpm run lint   # tsc --noEmit，无产物，纯类型检查
```

在完整构建前先跑 `lint`，能更快暴露类型问题。

### 4.5 查看构建/运行日志

构建与运行输出建议重定向到文件后分析：

```bash
pnpm run build 2>&1 | tee build.log
node <built-entry> 2>&1 | tee run.log
```

### 4.6 借 MCP 二进制辅助调试

设置 `CODEBASE_MEMORY_MCP_BINARY` 指向有效二进制后，可借助外部 MCP 工具检查项目自身结构（**待确认**：MCP 工具暴露的具体能力需查 `mcp` 模块源码）。

---

## 5. 待确认清单

以下方面数据未覆盖，需查阅源码或配置文件后方可给出确切结论：

- Node 版本约束（`nodeVersion` 为空）。
- `tsup` 具体配置（输出格式 ESM/CJS、输出目录、`exports` 映射）。
- `mcp` 模块与 `CODEBASE_MEMORY_MCP_BINARY` 的交互协议与调用点。
- `API_KEY` / `BASE_URL` 被读取的具体代码位置。
- `ignore` 依赖实际读取的忽略文件及其与扫描逻辑的衔接。
- `services`、`core`、`shared`、`helpers`、`fixtures` 各模块的职责与相互调用关系。
## Related

- 同目录：[onboarding.md](onboarding.md) · [testing.md](testing.md)
- 总入口：[README](../README.md)
