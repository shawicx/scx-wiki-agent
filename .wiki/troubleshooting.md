# 故障排除指南

## 常见问题

### 1. 问题：TypeScript 编译失败，类型错误
**原因分析**：项目使用 TypeScript 进行类型检查，且依赖多个库的复杂类型定义（如 `@ai-sdk/openai`、`better-sqlite3`、`tree-sitter-typescript`）。类型不匹配或缺失声明文件会导致编译失败。

**解决方案**：
- 确保所有依赖包已正确安装：`npm install`
- 检查 `tsconfig.json` 中的 `strict` 模式配置，必要时临时关闭严格模式进行调试
- 为 `better-sqlite3` 等 C++ 原生模块添加类型声明：`npm install --save-dev @types/better-sqlite3`
- 运行 `npx tsc --noEmit` 查看具体错误信息

### 2. 问题：模块导入路径错误
**原因分析**：项目使用 `tree-sitter-typescript` 和 `web-tree-sitter`，它们的导入方式可能不同（Node.js 环境 vs Web 环境）。路径解析错误或模块格式不匹配会导致运行时错误。

**解决方案**：
- 确认当前运行环境（Node.js 或浏览器），使用条件导入语法：
  ```typescript
  import TreeSitter from 'web-tree-sitter'; // 浏览器环境
  import TreeSitter from 'tree-sitter-typescript'; // Node.js 环境
  ```
- 检查 `tsup` 构建输出，确保 `tree-sitter` 相关模块已正确打包

## 构建问题

### 1. 问题：`tsup` 构建失败，找不到某些模块
**原因分析**：项目使用 `tsup` 进行打包，但 `better-sqlite3` 是原生模块（C++ 插件），`tree-sitter-typescript` 也依赖本地编译，原生模块无法被简单打包。

**解决方案**：
- 在 `tsup.config.ts` 中将原生模块标记为外部依赖：
  ```typescript
  export default defineConfig({
    external: ['better-sqlite3', 'tree-sitter-typescript'],
  })
  ```
- 运行时确保目标环境已安装这些原生模块：`npm install better-sqlite3 tree-sitter-typescript`
- 使用 `--platform node` 参数确保构建为 Node.js 兼容格式

### 2. 问题：TypeScript 编译时提示 `Cannot find module 'ai'`
**原因分析**：项目使用 `ai` 和 `@ai-sdk/openai` 包，但它们可能未正确安装或版本不兼容。

**解决方案**：
- 检查 `package.json` 中 `dependencies` 列表，确认 `ai` 和 `@ai-sdk/openai` 存在
- 运行 `npm install ai@latest @ai-sdk/openai@latest` 安装最新兼容版本
- 查看 `node_modules` 目录中是否存在 `ai` 包，若不存在则重新安装

## 运行时问题

### 1. 问题：SQLite 数据库操作失败，`better-sqlite3` 报错
**原因分析**：`better-sqlite3` 是原生模块，依赖于系统的 SQLite 库。操作系统不兼容或缺少底层库会导致运行时错误。

**解决方案**：
- 确认 Node.js 版本符合要求（建议 Node.js 18+）
- 重新编译原生模块：`npm rebuild better-sqlite3`
- 检查数据库路径权限，确保应用有读写权限
- 在源代码中添加错误处理：
  ```typescript
  try {
    const db = new Database('./data.db');
  } catch (error) {
    console.error('数据库初始化失败:', error.message);
  }
  ```

### 2. 问题：AI 模型调用失败，OpenAI API 返回错误
**原因分析**：项目使用 `@ai-sdk/openai` 调用 OpenAI API，常见问题包括 API 密钥无效、网络连接问题或配额限制。

**解决方案**：
- 检查环境变量 `OPENAI_API_KEY` 是否已设置且有效
- 在代码中添加重试逻辑：
  ```typescript
  import { retry } from 'ai';
  const response = await retry(() => ai.generateText({...}), { maxAttempts: 3 });
  ```
- 确认 API 端点 URL 正确（如果使用代理，配置 `openai.baseURL`）
- 检查 OpenAI 账户余额和 API 使用配额

### 3. 问题：`commander` 命令行参数解析失败
**原因分析**：项目使用 `commander` 处理 CLI 参数，参数格式错误或必填参数缺失会导致解析失败。

**解决方案**：
- 使用 `--help` 查看可用命令和参数说明
- 检查参数定义是否正确，例如：
  ```typescript
  program
    .command('search <query>')
    .option('-l, --limit <number>', '结果数量限制')
    .action((query, options) => {...});
  ```
- 对于必填参数，确保在命令后提供值，如 `my-cli search "keyword"`
- 添加参数验证逻辑，捕获 `commander` 的 `--help` 输出异常