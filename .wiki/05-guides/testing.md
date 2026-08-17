# 测试体系

## 框架与配置

- **vitest 4**，配置 `vitest.config.ts`（仅开 `globals: true`；无 coverage 配置、无 coverageThreshold——ConfigDetector 探测结果亦为 null）。
- 测试根目录 `tests/`（ConfigDetector 探测命中），夹具目录 `tests/fixtures/`。

## 测试文件分类（14 个）

| 分类 | 文件 | 测什么 | 依赖 |
| --- | --- | --- | --- |
| CLI | `tests/cli/commands.test.ts` | createProgram 命令注册 | 无外部依赖 |
| core | `tests/core/scanner.test.ts` | FileScanner 扫描/过滤/类型检测 | 本地 fixture |
| services | `tests/services/scan-service.test.ts` | ScanService 薄封装 | — |
| services | `tests/services/wiki-service.test.ts` | buildWiki 编排、resolvePages 页面集、LLM 降级 | mock client |
| knowledge | `tests/knowledge/wiki-context-builder.test.ts` | 各 build*Context 的图谱查询逻辑 | mock client |
| knowledge | `tests/knowledge/wiki-builder.test.ts` | WikiBuilder fluent Markdown 组装 | — |
| knowledge | `tests/knowledge/wiki-output-sanitizer.test.ts` | 前导语/围栏清理、R2 告警 | — |
| knowledge | `tests/knowledge/wiki-page-generator.test.ts` | LLM 生成器（model null/流式） | mock ai SDK |
| knowledge | `tests/knowledge/config-detector.test.ts` | 探测器（临时目录构造 package.json 等） | 临时目录 |
| mcp | `tests/mcp/codebase-memory-client.test.ts` | 子进程调用与 JSON 解析（mock execFileSync） | mock 子进程 |
| 集成 | `tests/integration/mcp-build-pipeline.test.ts` | 真实 MCP 全管线 scan→build | **真实 codebase-memory-mcp 二进制** |

## 测试基础设施

| 设施 | 位置 | 说明 |
| --- | --- | --- |
| `createMockClient` | `tests/helpers/mock-mcp-client.ts` | CodebaseMemoryClient 可配置 mock（DEFAULT_ARCHITECTURE 覆盖 packages/entry_points/hotspots/boundaries/layers/clusters），单测不依赖二进制 |
| fixture：sample-project | `tests/fixtures/sample-project/` | TS 示例项目（含 index.ts、user.service.ts） |
| fixture：nestjs-project | `tests/fixtures/nestjs-project/` | NestJS 三件套（module/service/controller） |
| 临时目录模式 | config-detector 等测试 | `mkdtempSync(tmpdir())` + `afterEach rmSync`（测试内自管理） |

## 运行命令

```bash
pnpm test                    # 全量（vitest run）
pnpm test:watch              # 监听
npx vitest run tests/services/wiki-service.test.ts   # 单文件
npx vitest run -t "resolvePages"                      # 按名称过滤
```

## 已知事实

- 无 coverage 阈值、无 CI 配置文件（待确认：CI 环境如何跑集成测试）。
- 集成测试依赖真实二进制——本地无 codebase-memory-mcp 时该文件失败属预期。
- `tests/fixtures/sample-project/.scx-wiki-agent/index.db` 是旧索引管线的遗留产物（当前架构不使用 SQLite，见 [decisions#ADR-001](../04-design/decisions.md)）。

## Related

- Code: `tests/helpers/mock-mcp-client.ts` · `vitest.config.ts`
- Docs: [onboarding](onboarding.md) · [troubleshooting](troubleshooting.md) · [limitations](../06-constraints/limitations.md)
