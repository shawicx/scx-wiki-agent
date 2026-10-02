# 环境与运行手册 — @scxfe/wiki-agent

<details>
<summary>Relevant source files</summary>

- package.json
- scripts/check-file-lines.mjs
- src/mcp/codebase-memory-client.ts
</details>

本页说明该包的环境前提、脚本命令与环境变量，用于在本机或 CI 中正确准备环境并运行全部命令；所有事实均来自 `package.json` 与 `src/mcp/codebase-memory-client.ts` 的探测数据。

## 项目信息

| 项 | 值 | 来源 |
| --- | --- | --- |
| 包名 | `@scxfe/wiki-agent` | `package.json` |
| 版本 | `0.2.0` | `package.json` |
| 模块运行时 | ESM | `package.json` |
| Node 版本要求 | 数据未提供（`nodeVersion` 为空） | — |
| 包管理器 | pnpm | `package.json` |

**运行时与包管理器的实际影响**

- **ESM**：本包以 ESM 形式发布与运行，因此源码中的模块导入需使用 `import` / `export` 语法而非 `require`/`module.exports`；相对导入在 ESM 下需要带扩展名（如 `./x.js`），且顶层不能使用 `__dirname`（待确认）、`__filename`（待确认） 等 CJS 专有变量，需以 `import.meta.url` 等 ESM 等价物替代（锚点：`package.json` 的运行时声明）。
- **pnpm**：所有脚本通过 pnpm 执行，命令前缀为 `pnpm run <script>` 或直接 `pnpm <script>`（如 `pnpm build`、`pnpm test`）；依赖安装为 `pnpm install`。pnpm 使用内容寻址的存储与严格的 `node_modules` 结构，未在 `package.json` 中声明的依赖不会被提升到可解析位置，因此不要依赖"幽灵依赖"。

## 脚本命令

以下脚本均定义于 `package.json`。

| 命令 | 脚本内容 | 行为与预期产出 |
| --- | --- | --- |
| `pnpm build` | `tsup` | 调用 tsup 执行一次打包构建，产出构建产物（具体输出目录与格式由 tsup 配置决定，数据未提供该配置内容） |
| `pnpm dev` | `tsup --watch` | 以监听模式运行 tsup，在源文件变化时增量重建，适合本地开发期间持续产出最新构建 |
| `pnpm test` | `vitest run` | 以一次性（非监听）模式运行 Vitest 测试套件，进程结束后返回退出码，适合 CI |
| `pnpm test:watch` | `vitest` | 以监听模式启动 Vitest，文件变更时自动重跑相关测试，适合本地迭代 |
| `pnpm lint` | `tsc --noEmit && node scripts/check-file-lines.mjs` | 串联两步：先执行 TypeScript 类型检查且不输出任何文件（`--noEmit`），再运行 `scripts/check-file-lines.mjs` 做文件行数检查（该脚本由文件名可知其职责为 check-file-lines，具体阈值与规则见脚本自身） |

使用要点：

- `lint` 使用 `&&` 串联，**前一步 `tsc --noEmit` 失败时不会执行** `node scripts/check-file-lines.mjs`；排查失败原因时需先确认类型检查是否通过。
- `build` 与 `dev` 的差别仅在是否监听；两者都以 tsup 为入口。
- `test` 与 `test:watch` 的差别仅在是否常驻；CI 中应使用 `pnpm test`。

## 环境变量

| 变量名 | 敏感 | 生产引用 | 用途说明 |
| --- | --- | --- | --- |
| `CODEBASE_MEMORY_MCP_BINARY` | 否 | `src/mcp/codebase-memory-client.ts` | 见生产引用：该变量在 `src/mcp/codebase-memory-client.ts` 中被读取 |

**推断**：由变量命名 `CODEBASE_MEMORY_MCP_BINARY` 与引用位置（MCP 客户端文件 `src/mcp/codebase-memory-client.ts`）推断，该变量用于指定 codebase-memory 相关 MCP 服务的可执行文件路径；推断依据仅为变量名与引用文件路径，解析与回退逻辑需以 `src/mcp/codebase-memory-client.ts` 的实际代码为准。

该变量未标记为敏感（`sensitive: false`），但仍应按部署环境显式设置后运行依赖 MCP 客户端的流程；未设置时的行为需以 `src/mcp/codebase-memory-client.ts` 中的判空/默认值逻辑为准。

## 快速开始

```bash
# 1. 安装依赖（包管理器为 pnpm）
pnpm install

# 2. 类型检查 + 文件行数检查
pnpm lint

# 3. 运行测试
pnpm test

# 4. 构建
pnpm build

# 5. 本地开发（监听重建）
pnpm dev
```

## 待确认

- Node 版本要求：数据中 `nodeVersion` 为空，且未提供 `engines` 或版本管理文件信息，无法确定最低/推荐 Node 版本，这是决定环境能否直接跑通的关键前提。
## Related

- 同目录：[overview.md](overview.md) · [tech-stack.md](tech-stack.md)
- 共享 2 个源文件、共享 19 个符号：[onboarding.md](../05-guides/onboarding.md)
- 共享 2 个源文件、共享 19 个符号：[troubleshooting.md](../05-guides/troubleshooting.md)
- 共享 1 个源文件、共享 11 个符号：[conventions.md](../06-constraints/conventions.md)
- 总入口：[README](../README.md)
