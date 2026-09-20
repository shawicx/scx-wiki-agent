# 故障排除指南

本页汇总该项目（Node.js CLI 工具，基于 `commander` + `@ai-sdk/openai` + `ai` 技术栈，使用 `tsup` 构建、`vitest` 测试）在实际使用中可能遇到的常见问题及排查方法。

> **说明**：本页仅描述与当前技术栈（`@ai-sdk/openai`、`ai`、`commander`、`ignore`、`tsup`、`vitest`）相关的问题场景。由于提供的 JSON 数据仅包含项目类型、技术栈和模块名清单（`knowledge`、`mcp`、`core`、`services`、`fixtures`、`cli`、`shared`、`helpers`），不包含具体源码符号、调用关系或配置细节，凡是数据无法支撑的具体行为（如某函数的内部实现、某环境变量的确切名称）均标注为「待确认」，不做编造。

---

## 一、环境问题

### 1.1 Node.js 版本不兼容

**问题描述**
运行 CLI 或执行 `tsup` / `vitest` 时报错，例如 `SyntaxError: Unexpected token '??='` 或 `ERR_UNKNOWN_FILE_EXTENSION`，提示语法或模块加载失败。

**原因分析**
- `@ai-sdk/openai`、`ai` 等现代 ESM 生态依赖较新的 Node.js 版本；`tsup` 输出的产物可能使用较新的语法特性。
- 具体的最低 Node.js 版本要求「待确认」（未提供 `package.json` 的 `engines` 字段数据）。

**解决方案**
1. 确认当前版本：
   ```bash
   node -v
   ```
2. 若版本过低，使用 `nvm` 或 `fnm` 升级到当前 LTS：
   ```bash
   nvm install --lts
   nvm use --lts
   ```
3. 依赖官方支持的精确最低版本「待确认」，请以 `package.json` 中的 `engines` 字段为准。

---

### 1.2 依赖安装失败或版本冲突

**问题描述**
`npm install` / `pnpm install` 报 `ERESOLVE unable to resolve dependency tree`，或安装后出现多个版本的 `ai` / `@ai-sdk/openai`。

**原因分析**
- `ai` 与 `@ai-sdk/openai` 通常需要版本匹配（同一大版本线），如果 lockfile 中锁定了不兼容组合会触发 peer dependency 冲突。
- 具体版本约束「待确认」（未提供 `package.json` 与 lockfile 数据）。

**解决方案**
1. 优先使用项目自带的 lockfile 与包管理器（`npm ci` 或 `pnpm install --frozen-lockfile`），而非手动升级：
   ```bash
   npm ci
   ```
2. 若必须排查冲突：
   ```bash
   npm ls ai @ai-sdk/openai
   ```
   检查是否存在重复或冲突版本。
3. 若确为 peer 冲突且确认安全，可临时：
   ```bash
   npm install --legacy-peer-deps
   ```
   （仅作应急，不建议长期使用）

---

### 1.3 缺少 API Key / 环境变量未配置

**问题描述**
运行 CLI 命令时，`@ai-sdk/openai` 抛出鉴权错误，如 `401 Unauthorized`、`Missing API key` 或 `OpenAI API key is required`。

**原因分析**
- `@ai-sdk/openai` 的 provider 需要通过环境变量（通常为 `OPENAI_API_KEY`）注入密钥。
- 项目读取环境变量的具体方式与名称「待确认」（未提供 `services` / `core` 模块中的配置加载源码）。

**解决方案**
1. 检查环境变量是否已设置：
   ```bash
   echo $OPENAI_API_KEY
   ```
2. 若未设置，在 shell 中导出或写入 `.env`：
   ```bash
   export OPENAI_API_KEY="sk-..."
   ```
3. 若项目通过 `dotenv` 之类加载 `.env`，需确认 `.env` 位于 CLI 运行的工作目录下。具体加载逻辑「待确认」。
4. **注意**：`.env` 应加入 `.gitignore`，避免密钥泄漏。项目使用了 `ignore` 依赖，说明存在基于忽略规则的文件处理逻辑（具体用途「待确认」）。

---

### 1.4 包管理器混用

**问题描述**
仓库内同时存在 `package-lock.json` 与 `pnpm-lock.yaml` / `yarn.lock`，安装结果不一致，CLI 行为异常。

**原因分析**
- 不同包管理器的依赖树解析策略不同，混用会导致 `node_modules` 内容与预期不符。

**解决方案**
1. 统一包管理器：确认仓库中实际提交的 lockfile，删除其他 lockfile 与 `node_modules`：
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
2. 具体使用哪种包管理器「待确认」（未提供 lockfile 数据）。

---

## 二、构建问题

项目使用 `tsup` 作为构建工具（通常用于将 TypeScript 打包为 ESM/CJS 产物）。

### 2.1 TypeScript 编译错误

**问题描述**
`npm run build`（调用 `tsup`）报类型错误，如 `TS2307: Cannot find module` 或 `TS2345: Argument of type ... is not assignable`。

**原因分析**
- `tsup` 基于 esbuild，默认**不做完整类型检查**（只转译）。类型错误通常在 `tsc --noEmit` 或 IDE 中暴露。
- 模块路径别名（如 `@/shared`）未在 `tsconfig.json` 的 `paths` 中正确配置。

**解决方案**
1. 单独运行类型检查以定位问题：
   ```bash
   npx tsc --noEmit
   ```
2. 若涉及模块解析失败，检查 `tsconfig.json` 的 `compilerOptions.paths` 与 `baseUrl` 是否覆盖了 `core`、`services`、`shared` 等模块的引用路径。具体别名配置「待确认」。
3. 修复报告的类型错误后重新构建。

---

### 2.2 ESM / CJS 兼容问题

**问题描述**
构建成功但运行时出现：
- `Error [ERR_REQUIRE_ESM]: require() of ES Module ... not supported`
- `Cannot use import statement outside a module`
- `Dynamic require of "..." is not supported`

**原因分析**
- `ai` / `@ai-sdk/openai` 以 ESM 为主；若项目输出为 CJS（`tsup` 默认可能同时输出 `cjs` 和 `esm`），则可能出现 ESM 依赖无法被 CJS 产物加载。
- `tsup` 的 `format` 配置决定了输出产物的模块规范，具体配置「待确认」（未提供 `tsup.config.ts`）。

**解决方案**
1. 查看构建产物与 `package.json` 中的 `type`、`main`、`module`、`exports` 字段：
   ```bash
   cat package.json
   ```
2. 若产物为 ESM，确保 Node 运行入口对应 `.mjs`，或在 `package.json` 中设置 `"type": "module"`。
3. 在 `tsup.config.ts` 中显式指定 `format: ['esm']`（若项目仅支持 ESM）。具体文件路径与配置「待确认」。
4. 对于纯 ESM 依赖（如 `ai`），优先让整个 CLI 输出 ESM，避免 CJS/ESM 桥接。

---

### 2.3 外部依赖未正确标记（被错误打包）

**问题描述**
构建产物体积异常增大，或运行时报 `Dynamic require of "node:fs" is not supported` 之类的错误。

**原因分析**
- `tsup` 默认会尝试打包所有依赖；将 Node 内置模块（`node:*`）或原生依赖打包会导致运行错误。
- 需要在 `tsup` 配置中使用 `external` 或 `noExternal` 显式区分。

**解决方案**
1. 检查 `tsup.config.ts` 中的 `external` 配置，确保 Node 内置模块与 `@ai-sdk/openai`、`ai` 等被标记为外部依赖。具体配置「待确认」。
2. 若需要将依赖打进产物，则用 `noExternal: ['some-pkg']`。
3. 重新构建后检查 `dist/` 输出。

---

### 2.4 Clean 与增量构建冲突

**问题描述**
修改源码后重建，产物仍为旧版本，行为未更新。

**原因分析**
- `tsup` 默认每次构建前清理 `dist`，但若被 `--no-clean` 或 watch 模式下残留缓存目录覆盖，可能读到旧产物。

**解决方案**
1. 手动清理并重建：
   ```bash
   rm -rf dist && npx tsup
   ```
2. 若使用 watch 模式，先停止 watch 进程再重启。

---

## 三、运行时问题

### 3.1 模块解析失败（Cannot find module）

**问题描述**
CLI 运行时报 `Error: Cannot find module 'xxx'`，`xxx` 可能是内部模块（如 `@/shared`）或第三方包。

**原因分析**
- 构建产物中残留未被解析的路径别名（`tsup` 不会自动处理 `tsconfig.paths` 运行时映射）。
- 依赖未安装或 `node_modules` 不完整。

**解决方案**
1. 确认依赖完整：
   ```bash
   npm ls --depth=0
   ```
2. 若为路径别名问题，可在 `tsup.config.ts` 中配置 `esbuildOptions.alias`，或引入 `tsconfig-paths` 之类的运行时解析插件。具体方案「待确认」。
3. 检查 `package.json` 的 `bin` 字段是否指向正确的构建产物路径：
   ```bash
   cat package.json | grep -A2 '"bin"'
   ```

---

### 3.2 `codebase-memory-mcp` 未安装 / 找不到

**问题描述**
CLI 涉及 `mcp` 模块的功能在运行时提示找不到 `codebase-memory-mcp` 相关可执行文件或服务。

**原因分析**
> ⚠️ 本项说明为「待确认」——所提供的 JSON 数据仅包含模块名 `mcp`，**不包含**任何名为 `codebase-memory-mcp` 的依赖或调用点信息。以下为基于"外部 MCP 服务"这一常见模式的通用排查框架，**具体命令与路径需以项目实际文档为准，请勿据此臆断**。

**解决方案（待项目确认）**
1. 查阅项目 `README` 中关于 `mcp` 模块的说明，确认 `codebase-memory-mcp` 是否为外部进程/包，以及其确切安装方式。「待确认」
2. 若确为需要单独安装的外部工具，按官方指引安装后在 `PATH` 中验证：
   ```bash
   which codebase-memory-mcp
   ```
3. 若为 Node 包，检查是否在 `devDependencies` 或 `optionalDependencies` 中，并手动安装。「待确认」

> 结论：由于缺少 `mcp` 模块的源码调用点证据（R1、R3 约束），无法确认 `codebase-memory-mcp` 的存在与集成方式，以上仅为通用排查思路，**不得作为项目事实引用**。

---

### 3.3 文件忽略规则不生效（`ignore` 依赖）

**问题描述**
CLI 处理目录时未按预期忽略 `node_modules`、`.git` 等目录，导致耗时过长或误处理。

**原因分析**
- 项目使用 `ignore` 依赖来处理 `.gitignore` 类规则。若当前工作目录下缺少 `.gitignore`，或规则文件未按路径加载，会导致忽略失效。
- 具体忽略逻辑「待确认」（未提供 `knowledge` / `core` 模块源码）。

**解决方案**
1. 确认运行目录下存在 `.gitignore`：
   ```bash
   ls -la .gitignore
   ```
2. 检查 `.gitignore` 中是否包含必要规则（如 `node_modules/`、`dist/`）。
3. 若仍不生效，需查看 `ignore` 实例的构造与 `add()` 调用点。具体位置「待确认」。

---

### 3.4 `commander` 参数解析错误

**问题描述**
CLI 命令报 `error: unknown option '--xxx'` 或 `error: missing required argument`。

**原因分析**
- 使用了未定义的选项，或必填参数未提供。
- 子命令注册顺序/名称与文档不符。

**解决方案**
1. 使用内置帮助查看所有可用命令与选项：
   ```bash
   <your-cli> --help
   <your-cli> <subcommand> --help
   ```
2. 核对命令拼写。具体可用命令列表「待确认」（未提供 `cli` 模块源码）。
3. 若为脚本调用，注意参数中带空格或特殊字符时需加引号。

---

### 3.5 网络请求超时 / 代理问题

**问题描述**
调用 OpenAI API 时出现 `ETIMEDOUT`、`ECONNREFUSED` 或长时间挂起。

**原因分析**
- 处于需要代理的网络环境，但 Node 进程未配置代理。
- API 端点不通或被打断。

**解决方案**
1. 为 Node 配置代理（如需要）：
   ```bash
   export HTTPS_PROXY=http://127.0.0.1:7890
   export HTTP_PROXY=http://127.0.0.1:7890
   ```
2. 测试连通性：
   ```bash
   curl -I https://api.openai.com
   ```
3. 若为 `@ai-sdk/openai` 自定义 `baseURL`，检查该地址配置是否正确。「待确认」

---

### 3.6 权限问题（EACCES）

**问题描述**
执行 CLI 时报 `EACCES: permission denied`，或读写某目录被拒。

**原因分析**
- CLI 二进制未加可执行权限。
- 运行用户对目标目录（如 CLI 输出目录、缓存目录）无写权限。

**解决方案**
1. 确保 `bin` 指向的文件可执行：
   ```bash
   chmod +x ./dist/cli.js
   ```
2. 用 `npx` 或全局安装方式运行以自动处理权限：
   ```bash
   npx <package-name> <args>
   ```
3. 若为目录写权限问题，检查目标路径权限或换用有写权限的目录。

---

### 3.7 全局安装后命令未生效

**问题描述**
`npm i -g <pkg>` 后执行命令提示 `command not found`。

**原因分析**
- npm 全局 `bin` 目录不在 `PATH` 中。
- 全局安装的包名与 CLI 命令名不一致。

**解决方案**
1. 查看全局 `bin` 路径：
   ```bash
   npm bin -g
   ```
2. 将其加入 `PATH`（写入 shell 配置）：
   ```bash
   export PATH="$(npm bin -g):$PATH"
   ```
3. 确认命令名与 `package.json` 的 `bin` 字段一致。具体名称「待确认」。

---

## 四、调试技巧

### 4.1 增量构建与监听

用于本地开发时实时验证构建产物：

```bash
npx tsup --watch
```

> `tsup` 的具体监听配置「待确认」（未提供 `tsup.config.ts`）。

### 4.2 单文件 / 单用例测试调试

项目使用 `vitest`（模块清单中存在 `fixtures`，说明测试数据与测试共存），可用以下方式聚焦：

- 只跑某个测试文件：
  ```bash
  npx vitest run path/to/file.test.ts
  ```
- 只跑匹配名称的用例：
  ```bash
  npx vitest run -t "用例名"
  ```
- 交互式 watch 模式（开发时推荐）：
  ```bash
  npx vitest
  ```

> 具体测试文件路径与命名「待确认」（未提供 tests 目录结构；且按规则本页不描述测试代码本身的功能）。

### 4.3 Node 调试器

断点调试 CLI 入口：

```bash
node --inspect-brk ./dist/cli.js <args>
```

然后打开 `chrome://inspect` 连接调试。若通过 `tsx` / `ts-node` 直接运行源码调试，命令需依项目实际脚本调整。「待确认」

### 4.4 查看详细错误堆栈

- 忽略已捕获异常、暴露完整堆栈：
  ```bash
  NODE_OPTIONS=--stack-trace-limit=50 <your-cli> <args>
  ```
- 若 CLI 内部捕获了错误导致信息不全，可临时用 `DEBUG=*` 观察相关库输出（如 `@ai-sdk` 是否支持「待确认」）。

### 4.5 检查构建产物内容

定位"运行的是旧版本/缺失模块"问题：

```bash
# 查看产物结构
ls -R dist

# 检索某符号是否被打进产物
grep -rn "someSymbol" dist/
```

### 4.6 依赖树诊断

```bash
# 查看全部依赖
npm ls --all

# 查找重复版本
npm dedupe --dry-run
```

### 4.7 环境变量与配置确认

CLI 行为常受环境变量影响，调试前先确认：

```bash
env | grep -i -E "openai|api|proxy|node_env"
```

> 项目实际读取的环境变量清单「待确认」。

---

## 五、参考：问题速查表

| 症状 | 可能原因 | 快速排查命令 |
|------|----------|--------------|
| `401 Unauthorized` | API Key 未配置 | `echo $OPENAI_API_KEY` |
| `Cannot use import statement outside a module` | ESM/CJS 混用 | 检查 `package.json` 的 `type` / `exports` |
| `Cannot find module` | 路径别名未解析 / 依赖缺失 | `npm ls --depth=0` |
| `ERR_REQUIRE_ESM` | CJS 产物加载 ESM 依赖 | 检查 `tsup` 的 `format` |
| `EACCES: permission denied` | 文件/目录权限 | `chmod +x`、`ls -l` |
| `ETIMEDOUT` | 网络/代理 | `curl -I https://api.openai.com` |
| `command not found`（全局安装后） | PATH 未包含全局 bin | `npm bin -g` |
| 忽略规则不生效 | `.gitignore` 缺失 | `ls -la .gitignore` |

---

## 待确认清单

以下方面因缺少源码/配置数据，**无法给出确定结论**，需补充证据后再行完善：

1. `package.json` 的 `engines`、`type`、`bin`、`exports` 字段内容。
2. `tsup.config.ts` 中的 `format`、`external`、`alias`、`entry` 配置。
3. `mcp` 模块与 `codebase-memory-mcp` 的真实关系（调用点、依赖声明、安装方式）。
4. 项目读取的环境变量名与配置加载位置（`services` / `core` 模块）。
5. `ignore` 依赖的实例化与使用位置。
6. `cli` 模块中 `commander` 注册的子命令与选项清单。
7. `knowledge`、`fixtures`、`shared`、`helpers` 各模块的公开职责与相互依赖关系。

> 补充上述任一证据（源码行或 qualified_name）后，本页对应条目可升级为可引用事实；在此之前，请勿将这些待确认项作为项目已知行为使用。
## Related

- 同目录：[onboarding.md](onboarding.md) · [testing.md](testing.md)
- 总入口：[README](../README.md)
