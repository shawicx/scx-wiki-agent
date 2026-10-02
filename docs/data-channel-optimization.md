# 数据通道优化技术方案（Data Channel Optimization）

> 状态：**已实施（P0–P3 完成，2026-10）**
> 落点：`src/knowledge/channels/`（stats / sanitizer / vue-sfc / rust-methods）、
> `src/knowledge/negative-claim.ts`、`src/knowledge/signature.ts`、
> `scripts/eval-vue-sfc.mjs`、golden 基准 `tests/golden/`。
> P3 结论：scx-terminal 51 组件抽样偏差 0%（compiler-sfc vs 正则回落），
> 无需引入 vue-tsc 校验通道。
> 前置结论：实测（scx-terminal，CBM 0.10.3，3057 节点/10572 边）确认 codebase-memory-mcp 的
> 解析层可靠、**名字解析层是短板**——Vue SFC 零符号、接收者方法调用零 CALLS 边、
> 存在 TS→Rust 跨语言假边、`signature` 与 `return_type` 字段口径分裂。
> 本方案在 **ADR-001（不自建索引）框架内**以「证据通道」形式补位，不替换 CBM 图查询层。

## 1. 目标与非目标

**目标**
1. Vue SFC 面获得结构化（非正则）权威数据源：组件、props/emits、内部函数、imports
2. Rust 接收者调用面（`app.emit(...)` 等）进入证据体系，标注解析置信度
3. 跨语言假边在生产端（通道层）过滤，全消费方共享
4. 签名口径统一：`signature` + `return_type` 合并后再渲染
5. 「未检出 → 项目事实」的失败模式在**所有通道**被机制化拦截（负面断言第二意见）
6. 通道质量可观测：每条通道的覆盖率/命中数进构建报告，可回归

**非目标**
- 不替换 codebase-memory-mcp，不自建全量索引（ADR-001）
- 不追求全语言编译器级类型推断（按面裁剪，够用即可）
- 不改动 LLM 生成层——本方案全部作用于确定性数据通道

## 2. 架构：三层数据面

```
┌─ 精确通道（按需，编译器/官方解析器）─┐
│  vue-sfc（@vue/compiler-sfc）        │  Vue 组件面权威源
│  （可选 Phase 3）scip / vue-tsc 校验 │
├─ 图谱通道（CBM，现状保留）──────────┤
│  模块/边界/簇/扇入扇出/CALLS 边      │  图查询层，唯一权威
├─ 确定性扫描通道（工具自有，现状扩展）┤
│  tauri-ipc / source-fallback /      │  表面形态 + 负面断言二次验证
│  tier2 探测器 / 新增 rust-methods    │
└──────────────────────────────────────┘
        ↓ 统一经 ChannelSanitizer（假边过滤/口径归一/置信度标注）
        ↓ WikiContextBuilder（现有汇总点，不动）
        ↓ 负面断言第二意见（negative-claim，全通道强制）
```

设计原则：**每条事实标注来源通道与置信度**（graph / exact / scan / heuristic），
页面渲染与质量闸门据此分级；任何通道的「未检出」必须过裸源码二次检索才能落为断言。

## 3. 工作流分解

### W1 · Vue SFC 权威通道（`knowledge/channels/vue-sfc.ts`，Phase 1）

**选型结论：`@vue/compiler-sfc`（进程内，确定性）**
- 官方解析器，`parse()` 切块 + `compileScript()` 可拿到**编译后**的 setup 变量/
  props/emits（含类型推导后的运行时形态），无子进程、无项目配置依赖
- 备选对比：vue-tsc/tsserver 精度同级但需 TS Program + 子进程，冷启动秒级、
  对 monorepo 配置敏感 → 降级为 Phase 3 校验器；裸正则（现状 source-fallback）
  保留为编译器失败的 fail-open 兜底

**接口**（对齐现有 `supplementalSymbols` 通道，`ContextDeps` 注入）：
```ts
interface VueSfcFacts {
  file: string;
  componentName: string;           // 文件名推导（与 components 页口径一致）
  props: Array<{ name: string; type?: string; required: boolean; anchor: Anchor }>;
  emits: Array<{ name: string; anchor: Anchor }>;   // 事件名级，替代 declCount 计数
  internals: Array<{ name: string; kind: 'function'|'const'; anchor: Anchor }>;
  imports: Array<{ source: string; anchor: Anchor }>;
  confidence: 'exact';             // 编译器产物
}
```
**落点**：`context/frontend.ts`（components/state 页）、`tauri-ipc.ts` 的
hasTauriEventApi 判定、`claim-verifier` 的 symbol universe 合并
（现有 `getSymbolUniverse` 已支持多源合并，直接喂入）。

### W2 · Rust 方法调用面（`knowledge/channels/rust-methods.ts`，Phase 2）

接收者类型推断不做（需 rust-analyzer，重）。**名称对齐 + 置信度分级**：
1. 从图谱收集 `Method` 节点 + `DEFINES_METHOD` 边 → impl 方法全集（名称→定义点）
2. 全文正则收集 `.method_name(` 调用点（沿用 tauri-ipc 的全文+行号反查模式）
3. 方法名全库唯一 → `confidence: 'resolved'`；多候选 → `confidence: 'ambiguous'`
   并列出候选定义点；调用点所在文件 import 了定义方 crate → 升级 resolved
4. 渲染口径：resolved 边进 calls/data-flow；ambiguous 只进参考表并如实标注

### W3 · 通道级假边过滤（`knowledge/channels/sanitizer.ts`，Phase 0）

把 `wiki-context-builder.ts` 里的消费端 CALLS 过滤（跨语言 ts↔rust、非代码 callee、
同名碰撞、无词法证据）抽为**生产端共享净化器**：所有通道产出的边先过
`sanitizeEdges()`，附被过滤统计。消费端保留现有逻辑（纵深防御不撤），
但 tier2/新通道天然获得同一防线，不再各写一份。

### W4 · 签名口径统一（Phase 0，小改）

`signature`（参数列表）与 `return_type` 是图谱的两个字段：渲染层统一在
`dataflow/shapes.ts` / api context 的入口处合并
（`sig.returnType ?? graph.return_type`，TS `: T` / Rust `-> T` 形态分别处理——
本次已实现 Rust `->` 兼容，补 TS 侧合并与渲染函数收敛到一处）。

### W5 · 负面断言第二意见框架化（`knowledge/negative-claim.ts`，Phase 2）

把 tauri-ipc 的 `grepSuspects`（snake/camel 双形、跳注释、排除自身已知锚点）
泛化为通用校验器，供所有通道的「未检出」声明调用：
```ts
verifyAbsence(name: string, side: ('frontend'|'rust'|'any'), knownAnchors: Anchor[]): AbsenceVerdict
// 'confirmed'（可断言不存在）| 'suspect'（口径局限，附引用点）| 'dynamic'（名字非字面量）
```
质量闸门新增规则 `unverified-absence`（warn）：正文中「未被调用/未检出/无发射点」
类断言，若其对象在通道数据里存在 suspect 记录 → 告警。**机制保证下限**：
任何新通道的盲区自动被降级为「口径局限」而非事实。

### W6 · 通道质量报告（Phase 1）

构建报告新增「通道覆盖」行（对齐现有 `图谱语言覆盖`）：
```
通道覆盖：vue-sfc 51 组件/51 文件（props 128·emits 96）｜rust-methods resolved 214·ambiguous 12｜
         假边过滤 47（跨语言 2·非代码 callee 31·无词法证据 14）｜负面断言 suspect 6/confirmed 89
```
每个数字都是确定性可回归的——防止「扫描盲区被当成项目事实」这类回归再次静默发生。

## 4. 实施排期

| 阶段 | 内容 | 规模 | 验收标准 |
|---|---|---|---|
| P0（先行） | W3 净化器抽取 + W4 签名合并 | ~2 天，纯重构+小修 | 全部现有测试绿；假边过滤统计进报告 |
| P1 | W1 vue-sfc 通道 + W6 报告 | ~4 天 | scx-terminal 51 组件全量结构化；emits 为事件名级清单（非计数）；components 页数据源切换 |
| P2 | W5 负面断言框架化 + W2 rust-methods | ~4 天 | 「未检出」类断言 100% 经过 verifyAbsence；`app.emit` 类调用以 resolved/ambiguous 分级进报告 |
| P3（可选） | vue-tsc 校验器：对 W1 产物抽样 diff，评估是否需要编译器级通道 | ~2 天 | W1 与 vue-tsc 的偏差 <2% 则不引入 |

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| `@vue/compiler-sfc` 对非常规 SFC（JSX in vue、web component）解析失败 | fail-open 回落现有 source-fallback 正则（通道级 try/catch，单文件降级不阻断） |
| rust-methods 名称对齐的假阳性 | ambiguous 分级 + 不进 calls 主表；报告可见，读者可核 |
| 净化器抽取引入行为漂移 | P0 纯重构：先抽接口+搬逻辑，测试全绿后再允许新规则；消费端防线暂不撤 |
| 通道增殖导致 prompt 膨胀 | 沿用现有预算模式（intent 层的 text/module/page caps）；每通道进 context 前设条目上限 |
| 依赖供应链（新增 @vue/compiler-sfc devDep） | pnpm 审计 + 锁定版本；仅 build 期使用，不入运行时 |

## 6. 评估方法（golden dataset）

以 scx-terminal 为基准仓库固化 golden 断言集（`tests/golden/scx-terminal.md`，
人工核对过的 ground truth）：
- 51 个组件清单、SplitContainer 6 个 emits 事件名、monitor-* 4 事件双侧锚点
  （mod.rs:127/147/156/171 ↔ stores/monitor.ts:37/43/48）、history_list ↔ history.ts:33
- CI 中跑通道级断言（不跑全量 build，单测直连通道函数）
- 每次通道改动：golden 全绿 + 报告数字不回退（W6 提供回归基线）
