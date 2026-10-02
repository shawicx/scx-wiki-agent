# @scxfe/wiki-agent

<details>
<summary>Relevant source files</summary>

- AGENTS.md
- README.md
</details>

从代码知识图谱生成结构化中文 Markdown Wiki 的 CLI 工具（LLM 增强叙述 + 纯规则回退）

| 项 | 值 |
| --- | --- |
| 版本 | 0.2.0 |
| 许可证 | ISC |
| 运行时 | ESM |

## 阅读路径

- 新人上手：overview → tech-stack → onboarding
- 理解结构：architecture → modules；调用关系查 calls
- 日常开发：conventions → constraints；排障看 troubleshooting
- 查证细节：calls → classes → glossary

## 01-overview/

| 文档 | 层级 | 回答的问题 |
| --- | --- | --- |
| [01-overview/overview.md](01-overview/overview.md) | structure | 项目是什么、解决什么问题 |
| [01-overview/tech-stack.md](01-overview/tech-stack.md) | operations | 技术栈与依赖说明（含声明未用，R3） |
| [01-overview/environment.md](01-overview/environment.md) | operations | 运行时、包管理器、env 变量、脚本命令 |

## 02-architecture/

| 文档 | 层级 | 回答的问题 |
| --- | --- | --- |
| [02-architecture/architecture.md](02-architecture/architecture.md) | structure | 分层结构、模块依赖、扇入扇出 |
| [02-architecture/modules.md](02-architecture/modules.md) | structure | 每个模块的文件、符号、职责 |

## 03-interface/

| 文档 | 层级 | 回答的问题 |
| --- | --- | --- |
| [03-interface/api.md](03-interface/api.md) | structure | 导出函数与 CLI 命令（带 file:line） |
| [03-interface/cli.md](03-interface/cli.md) | surface | CLI 命令、参数、退出码 |

## 04-design/

| 文档 | 层级 | 回答的问题 |
| --- | --- | --- |
| [04-design/decisions.md](04-design/decisions.md) | structure | 设计决策与演进依据（git 提交 + 文档证据锚定） |

## 05-guides/

| 文档 | 层级 | 回答的问题 |
| --- | --- | --- |
| [05-guides/onboarding.md](05-guides/onboarding.md) | operations | 上手指南：环境准备、安装、首次运行、脚本 |
| [05-guides/testing.md](05-guides/testing.md) | operations | 框架、测试目录、覆盖率、夹具 |
| [05-guides/troubleshooting.md](05-guides/troubleshooting.md) | operations | 排障手册：错误分类、诊断步骤、常见陷阱 |

## 06-constraints/

| 文档 | 层级 | 回答的问题 |
| --- | --- | --- |
| [06-constraints/conventions.md](06-constraints/conventions.md) | operations | 命名、导入、注释规范与禁止项 |
| [06-constraints/constraints.md](06-constraints/constraints.md) | operations | 性能预算、复杂度上限、已知限制 |

## 07-reference/

| 文档 | 层级 | 回答的问题 |
| --- | --- | --- |
| [07-reference/calls.md](07-reference/calls.md) | structure | 调用关系边表（按入口分组，带 file:line） |
| [07-reference/classes.md](07-reference/classes.md) | structure | 类清单与成员方法（继承树待 MCP 支持） |
| [07-reference/glossary.md](07-reference/glossary.md) | structure | 类型/枚举字典（含成员值） |

## 08-topics/

| 文档 | 层级 | 回答的问题 |
| --- | --- | --- |
| [08-topics/topic-6.md](08-topics/topic-6.md) | structure | 仓库专属主题（图谱聚类推导） |
| [08-topics/topic-9.md](08-topics/topic-9.md) | structure | 仓库专属主题（图谱聚类推导） |

## 相关文档（仓库）

Wiki 之外的既有文档，链接为仓库相对路径

| 文档 | 标题 |
| --- | --- |
| [README.md](../README.md) | scx-wiki-agent |
| [AGENTS.md](../AGENTS.md) | Agents.md |