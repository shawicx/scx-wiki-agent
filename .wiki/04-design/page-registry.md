# 页面注册表（PageRegistry）

> 位置：`src/knowledge/page-registry.ts`。这是 wiki 生成机制的「目录 + 路由表」。

## 三层页面模型（PageTier）

| tier | 回答的问题 | 数据来源 | 生成路径 |
| --- | --- | --- | --- |
| `structure` | 代码是什么（架构/模块/调用/类） | MCP 图谱 | LLM 或规则 |
| `operations` | 怎么跑/必须遵守什么 | ConfigDetector（+图谱） | 纯规则为主 |
| `surface` | 对外入口是什么（按项目类型替换） | 图谱 entry_points + 源码解析 | 规则 |

## 注册的 18 个页面（PAGE_REGISTRY，按生成顺序）

| # | name | tier | 回答的核心问题 |
| --- | --- | --- | --- |
| 1 | `readme` | structure | wiki 总入口 + 文档索引 + 项目元数据 |
| 2 | `overview` | structure | 项目是什么、解决什么问题 |
| 3 | `architecture` | structure | 分层结构、模块依赖、扇入扇出 |
| 4 | `modules` | structure | 每个模块的文件、符号、职责 |
| 5 | `api` | structure | 导出函数与 CLI 命令（带 file:line） |
| 6 | `data-flow` | structure | 数据形态与阶段转换（阶段表，非时序图） |
| 7 | `glossary` | structure | 类型/枚举字典（含成员值） |
| 8 | `calls` | structure | 调用关系边表（按入口分组，带 file:line） |
| 9 | `classes` | structure | 类清单与成员方法（继承树待 MCP 支持） |
| 10 | `environment` | operations | 运行时、包管理器、env 变量、脚本命令 |
| 11 | `testing` | operations | 框架、测试目录、覆盖率、夹具 |
| 12 | `conventions` | operations | 命名、导入、注释规范与禁止项 |
| 13 | `constraints` | operations | 性能预算、复杂度上限、已知限制 |
| 14 | `tech-stack` | operations | 技术栈与依赖说明（含声明未用） |
| 15 | `decisions` | structure | 架构决策记录（ADR） |
| 16 | `onboarding` | operations | 上手指南 |
| 17 | `troubleshooting` | operations | 排障手册 |
| 18 | `cli` | surface | CLI 命令、参数、退出码 |

> `business` 与 `design-decisions` 两个旧页面仍保留在三个 builder 的 switch 中（可显式 `--pages` 指定），但已不在 `PAGE_REGISTRY` 默认集（structure 层现由 `decisions` 承接 ADR）。

## 表层激活（TIER2_BY_TYPE）

`tier2PagesFor(projectType)` 按扫描出的项目类型激活表层页：

| projectType | 激活页面 | 实现状态 |
| --- | --- | --- |
| `cli` / `agent` | `cli` | ✅ 完整实现 |
| `backend` | `routes`、`db-schema` | ❌ 未实现（激活后产出空内容） |
| `frontend` | `components`、`state`、`routing` | ❌ 未实现 |
| `library` | `public-api` | ❌ 未实现 |
| `monorepo` | `workspaces`、`package-boundaries` | ❌ 未实现 |

默认页面集 = 全部非 surface 页 + 按类型激活的 Tier2 页（`WikiService.resolvePages`，`src/services/wiki-service.ts:29-60`）。

## 描述符设计原则

`PageDescriptor` 只持元数据（`name`/`tier`/`answer`），**不持方法引用**。具体构建/生成/回退由三个 builder 各自按 page name 派发：

```text
WikiContextBuilder.buildByName(page)      → 上下文对象（图谱查询）
WikiPageGenerator.generateByName(page)    → LLM 流式文本
WikiFallbackBuilder.buildByName(page)     → 规则模板 Markdown
```

## 新增页面三步法

1. `PAGE_REGISTRY` 追加描述符（`src/knowledge/page-registry.ts`）；
2. 三个 builder 各加一个 case（context / LLM / fallback）；
3. `types.ts` 加对应 Context 接口（如需 LLM 路径）。

注意隐式契约：漏加任何一个 case，该页会静默产出空内容（`buildByName` 默认返回 null → `generatePage` 返回 `''`，仍会写盘空文件）。见 [limitations](../06-constraints/limitations.md)。

## LLM 路径覆盖范围

`WikiPageGenerator.generateByName` 仅实现 10 个 case（overview/architecture/data-flow/modules/api/business/design-decisions/onboarding/troubleshooting/glossary）；其余页面（calls/classes/readme/environment/testing/conventions/constraints/cli/tech-stack/decisions）**只能走规则路径**——即使配置了 LLM 也会直接 fallback（default 分支返回 `''`，`WikiService.generatePage` 对空内容回退）。

## Related

- Code: `src/knowledge/page-registry.ts` · `src/services/wiki-service.ts`（resolvePages/generatePage）
- Docs: [decisions#ADR-002](decisions.md) · [data-flow](../02-architecture/data-flow.md) · [limitations](../06-constraints/limitations.md)
