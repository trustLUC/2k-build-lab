import { ATTR_KEYS } from './model.js?v=2';

// targets: { attrKey: minimumWanted }. A target is met when the row's cap max >= target.
// Missing cap data is "unknown" (ranked below a known miss of the same count).
export function findBuilds(rows, { targets = {}, position = '', heightMin = NaN, heightMax = NaN, limit = 50 } = {}) {
  const t = Object.entries(targets).filter(([k, v]) => ATTR_KEYS.includes(k) && Number.isFinite(v) && v > 0);
  const out = [];
  for (const row of rows) {
    if (position && row.position !== position) continue;
    if (Number.isFinite(heightMin) && row.heightIn < heightMin) continue;
    if (Number.isFinite(heightMax) && row.heightIn > heightMax) continue;
    const misses = [], unknown = [], met = [];
    let surplus = 0;
    for (const [k, want] of t) {
      const max = row.caps?.[k]?.max;
      if (!Number.isFinite(max)) { unknown.push({ key: k, target: want }); continue; }
      if (max >= want) { met.push({ key: k, target: want, max }); surplus += max - want; }
      else misses.push({ key: k, target: want, max, short: want - max });
    }
    misses.sort((a, b) => b.short - a.short);
    const totalShort = misses.reduce((s, m) => s + m.short, 0);
    out.push({ row, met, misses, unknown, totalShort, surplus, meetsAll: !misses.length && !unknown.length });
  }
  out.sort((a, b) =>
    (a.misses.length + a.unknown.length) - (b.misses.length + b.unknown.length) ||
    a.unknown.length - b.unknown.length ||
    a.totalShort - b.totalShort ||
    b.surplus - a.surplus ||
    a.row.heightIn - b.row.heightIn ||
    a.row.weightLb - b.row.weightLb);
  return { total: out.length, targets: t.length, results: out.slice(0, limit) };
}
