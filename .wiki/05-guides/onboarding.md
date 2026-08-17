# 上手指南

## 前置条件

1. **Node.js ≥ 18**（构建 target node18；`node -v` 确认）。
2. **pnpm**（`pnpm-lock.yaml` 锁定；其他包管理器未测试）。
3. **codebase-memory-mcp 二进制（build 命令必需）** — 知识图谱服务，须预装并在 PATH 中；或用 `CODEBASE_MEMORY_MCP_BINARY` / `--mcp-binary` 指定路径。参考安装：<https://github.com/Julexar/codebase-memory-mcp>
4. **LLM API（可选）** — OpenAI 兼容接口（`OPENAI_API_KEY`）或本地 Ollama（`--base-url http://localhost:11434/v1`）。不配置时 build 加 `--no-llm`。

## 安装与构建

```bash
git clone <repo> && cd scx-wiki-agent
pnpm install
pnpm build          # 产出 dist/bin.js
pnpm lint           # 可选：tsc --noEmit 类型检查
```

## 运行 CLI

```bash
# 本地直接运行
node dist/bin.js --help
node dist/bin.js scan
node dist/bin.js build --no-llm

# 或全局 link（package.json bin 字段 → scx-wiki-agent）
pnpm link --global   # 之后可直接 scx-wiki-agent <command>
```

## 首次生成 Wiki（在任意目标项目目录）

```bash
cd /path/to/target-project
node /path/to/scx-wiki-agent/dist/bin.js init      # 创建 .scx-wiki-agent/cache/ 与 .wiki/
node /path/to/scx-wiki-agent/dist/bin.js scan      # 查看扫描结果：类型/技术栈/文件数
node /path/to/scx-wiki-agent/dist/bin.js build --no-llm   # 纯规则生成（无需 LLM）
ls .wiki/                                           # 18 个左右 Markdown 页面
```

LLM 增强版：

```bash
export OPENAI_API_KEY="sk-..."
node dist/bin.js build --model gpt-4o-mini          # 流式输出到 stdout
# 或本地 Ollama
node dist/bin.js build --model qwen2.5 --base-url http://localhost:11434/v1
```

## 在本项目（dogfood）开发

```bash
pnpm test                 # 全量测试（不需要 MCP 二进制，单测全部 mock）
pnpm test:watch           # 监听模式
npx vitest run tests/services/wiki-service.test.ts   # 单文件
npx vitest run -t "resolvePages"                      # 按用例名过滤
```

> `tests/integration/mcp-build-pipeline.test.ts` 需要真实 codebase-memory-mcp，CI/无二进制环境会失败——这是预期行为，见 [testing](testing.md)。

## 典型调试回路

- 改生成逻辑 → `pnpm test`（单测全 mock，秒级）→ 在 sample-project 上跑 `build --no-llm` 目检输出。
- 改 MCP 查询 → 用 `codebase-memory-mcp cli <tool> '<json>'` 手工执行同参数，核对返回结构。

## 相关文档

- 命令与选项全表：[cli-commands](../03-interface/cli-commands.md)
- 生成管线：[data-flow](../02-architecture/data-flow.md)
- 遇到报错：[troubleshooting](troubleshooting.md)

## Related

- Code: `src/cli/commands/build.ts` · `tsup.config.ts`
- Docs: [environment](../01-overview/environment.md) · [testing](testing.md) · [troubleshooting](troubleshooting.md)
