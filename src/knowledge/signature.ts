/**
 * 图谱签名口径统一（W4）：CBM 把参数列表（`signature`，如 `(path: &Path)`）
 * 与返回类型（`return_type`，如 `Result<bool, String>`）存成两个字段，
 * 消费端只读 signature 会渲染出「缺返回类型」的残缺签名（v3 实测硬伤）。
 *
 * 本模块是唯一的合并点：signature 末尾已带返回标记（TS `): T` / Rust `) -> T`）
 * 时原样返回；否则按文件语言域补 `: T` / ` -> T`。图谱的换行以字面 `\n` 存储，
 * 归一后处理。
 */

export function normalizeGraphText(raw: string): string {
  return raw.replace(/\\[nrt]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function mergeGraphSignature(
  signature: string | null | undefined,
  returnType: string | null | undefined,
  filePath: string,
): string | null {
  const sig = signature ? normalizeGraphText(signature) : '';
  if (!sig) return returnType ? returnType : null;
  const rt = returnType ? normalizeGraphText(returnType) : '';
  if (!rt) return sig || null;
  // 已带返回类型标记（"): T" / ") -> T" / 已有显式 void 等）不再追加
  if (!/\)\s*$/.test(sig)) return sig;
  const isRust = filePath.endsWith('.rs');
  return `${sig}${isRust ? ' -> ' : ': '}${rt}`;
}
