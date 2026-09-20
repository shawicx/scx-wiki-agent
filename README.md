# scx-wiki-agent

基于 codebase-memory-mcp 知识图谱的项目 Wiki 生成 CLI。读取图谱中的符号、调用关系与复杂度数据，为任意代码项目生成结构化中文 Markdown 文档；以图谱的精确结构数据为唯一事实来源，LLM 只负责叙述，反幻觉铁律 + 写盘前质量闸门双重兜底。

## 功能特性

- **知识图谱数据源** — 通过子进程调用 `codebase-memory-mcp` 获取 LSP 级符号数据（docstring/signature/complexity/fan-in）与 CALLS 调用边
- **18 页固定注册表（PageRegistry）** — 三层页面模型（structure 结构层 / operations 运行规约层 / surface 表层，按项目类型激活），编号目录输出
- **双路径生成** — 每页优先 LLM（Vercel AI SDK 流式）；无模型、`--no-llm` 或生成失败时逐页回退纯规则模板
- **反幻觉铁律（R1-R6）** — 锚点强制、边表优于时序图、拒绝编造用途、结构化优先、待确认标记、图表真实性，注入每次 LLM 调用
- **写盘前质量闸门** — 空壳页/密钥泄漏拦截（error 级），死链/残缺锚点/薄证据/幽灵图表节点告警（warn 级），附构建报告
- **页首证据锚定块** — 每页确定性注入 `<details>` 源文件清单（只列扫描清单内真实文件），LLM 无法伪造
- **增量模式** — `build --mode update` 跳过内容未变化的页面

## 前置依赖

- Node.js ≥ 18，pnpm
- **codebase-memory-mcp 必须预装**（build 命令数据源）。查找顺序：`CODEBASE_MEMORY_MCP_BINARY` 环境变量 → PATH 中的 `codebase-memory-mcp`
- LLM API 可选（OpenAI 兼容接口，含 Ollama）；不配置则全部页面走纯规则路径

## 快速开始

```bash
pnpm install
pnpm build

# 在项目中初始化（创建 .wiki/ 与 .scx-wiki-agent/cache/）
node dist/bin.js init

# 扫描项目结构与技术栈
node dist/bin.js scan

# 生成 Wiki（纯规则，无需 LLM 与 API key）
node dist/bin.js build --no-llm

# 使用 LLM 增强叙述生成
node dist/bin.js build

# 使用本地 Ollama
node dist/bin.js build --model qwen2.5 --base-url http://localhost:11434/v1

# 代码变更后增量重建（内容未变的页面跳过重写）
node dist/bin.js build --mode update
```

## 命令

| 命令 | 说明 |
|------|------|
| `init` | 在项目中初始化 wiki-agent（幂等） |
| `scan` | 扫描项目结构，识别技术栈与项目类型 |
| `build` | 索引知识图谱并生成 Wiki 页面（LLM 流式 / 纯规则） |

### Build 选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--model <名称>` | `gpt-4o-mini` | LLM 模型名 |
| `--base-url <url>` | — | OpenAI 兼容 API 地址（Ollama：`http://localhost:11434/v1`） |
| `--api-key <key>` | `OPENAI_API_KEY` | API 密钥 |
| `--no-llm` | 关闭 | 纯规则生成，不调用 LLM |
| `--pages <列表>` | `all` | 逗号分隔页名；默认 = 全部非 surface 页 + 按项目类型激活的表层页 + 已锁定主题页 |
| `--mode <mode>` | `full` | `full` 全量重写 / `update` 内容一致时跳过 |
| `--refresh-topics` | 关闭 | 重新探测自适应主题页并覆盖 topics.json |
| `--mcp-binary <path>` | 自动探测 | codebase-memory-mcp 二进制路径 |

### 生成的 Wiki 页面

`build` 在 `.wiki/` 下按编号目录生成 18 个固定页面（以 `PAGE_REGISTRY` 为准）：overview / tech-stack / environment / architecture / data-flow / modules / api / cli（按项目类型激活）/ decisions / onboarding / testing / troubleshooting / conventions / constraints / calls / classes / glossary + README 索引。

在此之外，还会从图谱聚类**确定性推导最多 4 个仓库专属主题页**（`08-topics/`，跨 ≥2 模块的协作面，如"MCP 子进程客户端"）：主题定义锁定在 `.scx-wiki-agent/topics.json`（可手工编辑删改，`--refresh-topics` 重新探测）；探测不出就一个不生成。每页页首含源文件锚定块，页底含 Related 导航。

## 架构

```
src/
├── bin.ts               # 可执行入口
├── cli/                 # Commander 命令注册（init/scan/build，薄封装）
├── services/            # 编排层：ScanService、WikiService（质量闸门/构建报告/增量模式）
├── knowledge/           # Wiki 生成核心
│   ├── page-registry.ts          # 页面描述符注册表（三层模型）
│   ├── wiki-context-builder.ts   # 图谱 → 页面上下文（含薄证据补强）
│   ├── wiki-page-generator.ts    # LLM 生成（反幻觉铁律注入）
│   ├── wiki-fallback-builder.ts  # 纯规则模板
│   ├── wiki-evidence.ts          # 页首证据锚定块
│   ├── wiki-quality-validator.ts # 写盘前质量闸门
│   └── wiki-output-sanitizer.ts  # LLM 输出清理
├── mcp/                 # codebase-memory-mcp 子进程客户端（唯一数据源）
├── core/                # FileScanner（扫描/技术栈检测）+ 领域类型
└── shared/              # 常量与工具函数
```

详细架构与数据流见生成的 `.wiki/02-architecture/`。

## 开发

```bash
pnpm build         # tsup 构建
pnpm test          # vitest 全量测试（集成测试需本机安装 codebase-memory-mcp，无则自动跳过）
pnpm lint          # tsc --noEmit 类型检查
```

## 许可证

ISC
