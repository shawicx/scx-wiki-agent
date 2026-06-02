# 上手指南

## 环境准备

本项目是一个基于 TypeScript 的命令行工具，使用 pnpm 作为包管理器。请确保你的开发环境中已安装以下工具：

- **Node.js**：版本要求未明确，建议使用 LTS 版本（如 18.x 或 20.x）
- **pnpm**：作为包管理器，需要全局安装。安装命令：`npm install -g pnpm`

## 安装步骤

1. 克隆项目仓库到本地：
   ```bash
   git clone <仓库地址>
   cd <项目目录>
   ```

2. 使用 pnpm 安装依赖：
   ```bash
   pnpm install
   ```

3. 构建项目（生成可执行文件）：
   ```bash
   pnpm run build
   ```
   （具体构建命令请参考 `package.json` 中的 `scripts` 配置）

## 项目初始化

项目提供了初始化命令，用于创建或配置项目所需的环境。使用以下命令：

```bash
pnpm run start init
```

该命令会执行 `initcommand` 对应的逻辑，完成项目初始化工作。

## 基本使用

本工具提供多个 CLI 子命令，每个命令对应一个独立功能：

| 命令 | 功能描述 |
|------|----------|
| `ask` | 执行问答或查询操作（对应 `askcommand`） |
| `build` | 构建项目或代码（对应 `buildcommand`） |
| `index` | 索引相关操作（对应 `indexcommand`） |
| `init` | 初始化项目配置（对应 `initcommand`） |
| `scan` | 扫描项目文件或依赖（对应 `scancommand`） |
| `update` | 更新项目或组件（对应 `updatecommand`） |

通用调用方式：
```bash
pnpm run start <命令名称> [选项]
```

例如：
```bash
# 扫描当前目录
pnpm run start scan

# 执行构建
pnpm run start build
```

详细参数和选项请参考各命令的帮助信息：`pnpm run start <命令名称> --help`

## 项目结构概览

```
├── src/                    # 源代码主目录
│   ├── cli/                # CLI 相关代码
│   │   ├── commands/       # 各子命令实现（ask、build、index、init、scan、update）
│   │   └── index.ts        # CLI 入口文件
│   └── ...                 # 其他模块代码
├── tests/                  # 测试代码目录
│   └── fixtures/           # 测试用示例项目
│       └── sample-project/
├── node_modules/           # 依赖模块（由 pnpm 管理）
├── package.json            # 项目配置
├── tsconfig.json           # TypeScript 配置
└── tsup.config.ts          # 构建工具配置（使用 tsup 打包）
```

**目录说明**：
- `src/cli/commands/`：每个文件对应一个 CLI 子命令的实现逻辑，是工具的核心功能所在
- `src/cli/index.ts`：CLI 主入口，负责注册和调度各子命令
- `tests/`：包含测试用例和测试用的示例项目
- `tsup.config.ts`：使用 tsup 进行 TypeScript 打包，生成可执行文件