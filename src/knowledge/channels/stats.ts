/**
 * 通道级统计（W6 通道覆盖报告的数据源）。
 *
 * 模块级注册表 + 构建期生命周期：service 在 build 开始时 reset，各通道在
 * 采集时 record，构建报告在结尾统一打印。数字全部确定性可回归——
 * 「扫描盲区被当成项目事实」这类回归会直接体现为指标跌落，而非静默发生。
 */

export interface EdgeFilterStats {
  crossLanguage: number;
  nonCode: number;
  noLexicalEvidence: number;
}

export interface VueSfcStats {
  files: number;
  components: number;
  props: number;
  emits: number;
  /** 编译器解析失败、回落正则通道的文件数 */
  fallbackFiles: number;
}

export interface RustMethodStats {
  /** 图谱 Method 节点数（impl 方法全集） */
  methods: number;
  /** 名称唯一/import 佐证的调用点 */
  resolved: number;
  /** 多候选、只进参考表的调用点 */
  ambiguous: number;
}

export interface NegativeClaimStats {
  /** 二次检索命中 → 降级为「扫描口径局限」的断言 */
  suspect: number;
  /** 二次检索确认可断言不存在的 */
  confirmed: number;
}

export interface ChannelStats {
  edgeFilter?: EdgeFilterStats;
  vueSfc?: VueSfcStats;
  rustMethods?: RustMethodStats;
  negativeClaim?: NegativeClaimStats;
}

let stats: ChannelStats = {};

export function resetChannelStats(): void {
  stats = {};
}

export function getChannelStats(): Readonly<ChannelStats> {
  return stats;
}

export function recordEdgeFilter(patch: Partial<EdgeFilterStats>): void {
  const cur = stats.edgeFilter ?? { crossLanguage: 0, nonCode: 0, noLexicalEvidence: 0 };
  cur.crossLanguage += patch.crossLanguage ?? 0;
  cur.nonCode += patch.nonCode ?? 0;
  cur.noLexicalEvidence += patch.noLexicalEvidence ?? 0;
  stats.edgeFilter = cur;
}

export function recordVueSfc(patch: Partial<VueSfcStats>): void {
  const cur = stats.vueSfc ?? { files: 0, components: 0, props: 0, emits: 0, fallbackFiles: 0 };
  cur.files += patch.files ?? 0;
  cur.components += patch.components ?? 0;
  cur.props += patch.props ?? 0;
  cur.emits += patch.emits ?? 0;
  cur.fallbackFiles += patch.fallbackFiles ?? 0;
  stats.vueSfc = cur;
}

export function recordRustMethods(patch: Partial<RustMethodStats>): void {
  const cur = stats.rustMethods ?? { methods: 0, resolved: 0, ambiguous: 0 };
  cur.methods += patch.methods ?? 0;
  cur.resolved += patch.resolved ?? 0;
  cur.ambiguous += patch.ambiguous ?? 0;
  stats.rustMethods = cur;
}

export function recordNegativeClaim(patch: Partial<NegativeClaimStats>): void {
  const cur = stats.negativeClaim ?? { suspect: 0, confirmed: 0 };
  cur.suspect += patch.suspect ?? 0;
  cur.confirmed += patch.confirmed ?? 0;
  stats.negativeClaim = cur;
}
