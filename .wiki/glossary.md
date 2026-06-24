# Key Concepts

| Name | Type | Signature | Docstring | File |
| --- | --- | --- | --- | --- |
| addBulletList | method | (items: string[]) | /** Add a bullet list. */ | src/knowledge/wiki-builder.ts |
| addCodeBlock | method | (language: string, code: string) | /** Add a fenced code block with an optional language hint. */ | src/knowledge/wiki-builder.ts |
| addNewline | method | () | /** Add an empty line. */ | src/knowledge/wiki-builder.ts |
| addParagraph | method | (text: string) | /** Add a plain paragraph. */ | src/knowledge/wiki-builder.ts |
| addSection | method | (title: string, content: string) | /** Add a second-level section: `## title\\n\\ncontent` */ | src/knowledge/wiki-builder.ts |
| addSubSection | method | (title: string, content: string) | /** Add a third-level sub-section: `### title\\n\\ncontent` */ | src/knowledge/wiki-builder.ts |
| addTable | method | (headers: string[], rows: string[][]) | /** Add a markdown table from headers and rows. */ | src/knowledge/wiki-builder.ts |
| addTitle | method | (title: string) | /** Add a top-level title: `# title` */ | src/knowledge/wiki-builder.ts |
| build | method | () | /** Join all sections with newlines and return the final document. */ | src/knowledge/wiki-builder.ts |
| detectChanges | method | () | /** 增量变更检测 */ | src/mcp/codebase-memory-client.ts |
| ensureIndexed | method | (mode: 'fast' | 'moderate' | 'full' = 'moderate') | /** 确保图谱已索引（幂等） */ | src/mcp/codebase-memory-client.ts |
| exec | method | (tool: string, args: Record<string, unknown>) | // --- 内部方法 --- | src/mcp/codebase-memory-client.ts |
| getArchitecture | method | () | /** 架构概览 */ | src/mcp/codebase-memory-client.ts |
| getCodeSnippet | method | (qualifiedName: string) | /** 代码片段+元数据 */ | src/mcp/codebase-memory-client.ts |
| labelToSymbolType | method | (label: string) | /** MCP 节点标签 → SymbolType */ | src/knowledge/wiki-context-builder.ts |
| parseJsonOutput | method | (raw: string) | /**\n   * 解析子进程 stdout。\n   * MCP 的 info 日志（`level=info msg=...`）可能泄漏到 stdout，\n   * 因此从末尾向前找最后一个完整的 JSON 对象。\n   */ | src/mcp/codebase-memory-client.ts |
| queryGraph | method | (cypher: string, maxRows = 100) | /** Cypher 查询 */ | src/mcp/codebase-memory-client.ts |
| searchGraph | method | (params: SearchGraphParams) | /** BM25 全文检索 */ | src/mcp/codebase-memory-client.ts |
| toProjectName | method | (repoPath: string) | /** 仓库绝对路径 → MCP 项目标识符（`/` 和 `:` → `-`） */ | src/mcp/codebase-memory-client.ts |
| tracePath | method | (\n    functionName: string,\n    direction: 'inbound' | 'outbound' | 'both' = 'both',\n    depth = 6,\n  ) | /** 双向调用链追踪 */ | src/mcp/codebase-memory-client.ts |