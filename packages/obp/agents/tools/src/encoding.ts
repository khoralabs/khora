/** Extract numeric price from demo `type` strings (`|p=`). */
export function parsePriceFromType(type: string): number | null {
  const m = /\|p=(\d+(?:\.\d+)?)/.exec(type);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}
