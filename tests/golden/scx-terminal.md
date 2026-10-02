# Golden 基准：scx-terminal（人工核对 ground truth）

> 通道改动必须保持以下断言全绿（`tests/golden/scx-terminal.test.ts` 自动执行，
> 仓库不存在时 skip）。来源：v0.2.1 人工核对（2026-10）。

## IPC 对表（tauri-ipc 通道）

| 对象 | 事实 | 锚点 |
|---|---|---|
| monitor-fatal | Rust 发射 + 前端监听 | mod.rs:127 / services/monitor.ts |
| monitor-sample | 双侧 | mod.rs:147 / stores/monitor.ts:37 |
| monitor-sample-error | 双侧（2 个发射点） | mod.rs:171,181 / stores/monitor.ts:43 |
| monitor-unsupported | 双侧 | mod.rs:156 / stores/monitor.ts:48 |
| history_list | 前端调用（嵌套泛型 invoke） | src/services/history.ts:33 |

## Vue 组件面（vue-sfc 通道，51 个 .vue 全量）

| 组件 | emits（事件名级） | props |
|---|---|---|
| split/SplitContainer.vue | 6：leafActivated, leafTitle, paneClosed, leafSplit, leafBell, treeUpdated | node |
| settings/TabGroupFormDialog.vue | 2：update:open, submit | - |
| sftp/SftpBrowserPane.vue | 3：transfer, pathChange, rowDragstart | side, path |

## 约束

- `'right' | 'down'` 等 payload 联合字面量**不是**事件名
- 图谱对 .vue 仅 File/Module 节点——组件面唯一权威源是 vue-sfc 通道
