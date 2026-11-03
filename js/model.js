// Data model for owner-entered build rows. No game data lives here.
export const SCHEMA_ID = '2k-build-lab/v1';
export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

// [key, label, short, group]
export const ATTRS = [
  ['closeShot', 'Close Shot', 'CLS', 'Finishing'],
  ['drivingLayup', 'Driving Layup', 'LAY', 'Finishing'],
  ['drivingDunk', 'Driving Dunk', 'DDK', 'Finishing'],
  ['standingDunk', 'Standing Dunk', 'SDK', 'Finishing'],
  ['postControl', 'Post Control', 'PST', 'Finishing'],
  ['midRange', 'Mid-Range Shot', 'MID', 'Shooting'],
  ['threePoint', 'Three-Point Shot', '3PT', 'Shooting'],
  ['freeThrow', 'Free Throw', 'FT', 'Shooting'],
  ['passAccuracy', 'Pass Accuracy', 'PAS', 'Playmaking'],
  ['ballHandle', 'Ball Handle', 'BH', 'Playmaking'],
  ['speedWithBall', 'Speed With Ball', 'SWB', 'Playmaking'],
  ['interiorDefense', 'Interior Defense', 'IDF', 'Defense'],
  ['perimeterDefense', 'Perimeter Defense', 'PDF', 'Defense'],
  ['steal', 'Steal', 'STL', 'Defense'],
  ['block', 'Block', 'BLK', 'Defense'],
  ['offensiveRebound', 'Offensive Rebound', 'ORB', 'Rebounding'],
  ['defensiveRebound', 'Defensive Rebound', 'DRB', 'Rebounding'],
  ['speed', 'Speed', 'SPD', 'Physicals'],
  ['agility', 'Agility', 'AGI', 'Physicals'],
  ['strength', 'Strength', 'STR', 'Physicals'],
  ['vertical', 'Vertical', 'VRT', 'Physicals'],
].map(([key, label, short, group]) => ({ key, label, short, group }));
export const ATTR_KEYS = ATTRS.map(a => a.key);
export const ATTR_BY_KEY = Object.fromEntries(ATTRS.map(a => [a.key, a]));

export function emptyDataset() {
  return { schema: SCHEMA_ID, game: 'NBA 2K27', rows: [] };
}

// Accepts 6'5, 6'5", 6-5, 6 5, 6ft5, or plain inches (77). Returns inches or NaN.
export function parseHeight(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? '').trim().replace(/[″"]/g, '').replace(/[′’]/g, "'");
  if (!s) return NaN;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = s.match(/^(\d)\s*(?:'|ft|-|\s)\s*(\d{1,2}(?:\.\d+)?)?\s*(?:in)?$/i);
  if (!m) return NaN;
  const ft = Number(m[1]), inch = Number(m[2] || 0);
  return inch < 12 ? ft * 12 + inch : NaN;
}
export function fmtHeight(inches) {
  if (!Number.isFinite(inches)) return '—';
  const ft = Math.floor(inches / 12), i = +(inches - ft * 12).toFixed(1);
  return `${ft}'${i}"`;
}

const num = v => (v === '' || v === null || v === undefined ? NaN : Number(v));

export function makeId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Normalize any partial row into the canonical shape.
export function normalizeRow(r = {}) {
  const caps = {};
  for (const k of ATTR_KEYS) {
    const c = r.caps?.[k];
    if (c === undefined || c === null) continue;
    const min = num(typeof c === 'object' ? c.min : undefined);
    const max = num(typeof c === 'object' ? c.max : c);
    if (!Number.isFinite(min) && !Number.isFinite(max)) continue;
    caps[k] = {};
    if (Number.isFinite(min)) caps[k].min = min;
    if (Number.isFinite(max)) caps[k].max = max;
  }
  return {
    id: r.id || makeId(),
    position: String(r.position || '').toUpperCase(),
    heightIn: parseHeight(r.heightIn ?? r.height),
    weightLb: num(r.weightLb ?? r.weight),
    wingspanIn: parseHeight(r.wingspanIn ?? r.wingspan),
    caps,
    capBreakers: r.capBreakers && typeof r.capBreakers === 'object' ? r.capBreakers : {},
    badgeReqs: Array.isArray(r.badgeReqs) ? r.badgeReqs : [],
    source: String(r.source || ''),
    notes: String(r.notes || ''),
    example: !!r.example,
    updatedAt: r.updatedAt || new Date().toISOString(),
  };
}

export function validateRow(r) {
  const e = [];
  if (!POSITIONS.includes(r.position)) e.push('position must be one of ' + POSITIONS.join('/'));
  if (!(r.heightIn >= 60 && r.heightIn <= 96)) e.push('height must be 5\'0"–8\'0"');
  if (!(r.weightLb >= 100 && r.weightLb <= 400)) e.push('weight must be 100–400 lb');
  if (!(r.wingspanIn >= 60 && r.wingspanIn <= 108)) e.push('wingspan must be 5\'0"–9\'0"');
  for (const [k, c] of Object.entries(r.caps || {})) {
    for (const f of ['min', 'max']) if (c[f] !== undefined && !(c[f] >= 0 && c[f] <= 99)) e.push(`${ATTR_BY_KEY[k]?.label || k} ${f} must be 0–99`);
    if (c.min !== undefined && c.max !== undefined && c.min > c.max) e.push(`${ATTR_BY_KEY[k]?.label || k} min > max`);
  }
  return e;
}

export function validateDataset(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['not a JSON object'], dataset: null };
  const rowsIn = Array.isArray(obj) ? obj : obj.rows;
  if (!Array.isArray(rowsIn)) return { ok: false, errors: ['missing "rows" array'], dataset: null };
  const seen = new Set();
  const rows = rowsIn.map((r, i) => {
    const n = normalizeRow(r);
    if (seen.has(n.id)) n.id = makeId();
    seen.add(n.id);
    validateRow(n).forEach(m => errors.push(`row ${i + 1}: ${m}`));
    return n;
  });
  return { ok: errors.length === 0, errors, dataset: { schema: SCHEMA_ID, game: obj.game || 'NBA 2K27', rows } };
}

// Paste formats:
//  - JSON object (a row) or JSON with rows[0]
//  - CSV/TSV: position, height, weight, wingspan, then one cell per attribute in ATTRS order.
//    Each attribute cell is "max" or "min-max" (or "min/max"); blank = unknown.
export function parseRowText(text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('nothing to parse');
  if (t[0] === '{' || t[0] === '[') {
    const o = JSON.parse(t);
    const r = Array.isArray(o) ? o[0] : o.rows ? o.rows[0] : o;
    return normalizeRow({ ...r, id: undefined });
  }
  const cells = t.split(/\t|,|;/).map(s => s.trim());
  if (cells.length < 4) throw new Error('need at least position, height, weight, wingspan');
  const [position, height, weight, wingspan, ...rest] = cells;
  const caps = {};
  rest.forEach((c, i) => {
    const k = ATTR_KEYS[i];
    if (!k || !c) return;
    const m = c.match(/^(\d+)\s*[-/]\s*(\d+)$/);
    caps[k] = m ? { min: +m[1], max: +m[2] } : { max: +c };
  });
  return normalizeRow({ position, height, weight, wingspan, caps });
}

export function rowLabel(r) {
  return `${r.position} · ${fmtHeight(r.heightIn)} · ${r.weightLb} lb · ${fmtHeight(r.wingspanIn)} WS`;
}

function flat(r) {
  const o = { position: r.position, height: fmtHeight(r.heightIn), weight: r.weightLb, wingspan: fmtHeight(r.wingspanIn), source: r.source, notes: r.notes, example: r.example };
  for (const k of ATTR_KEYS) {
    const c = r.caps?.[k];
    if (c) o[ATTR_BY_KEY[k].label] = `${c.min ?? '?'}–${c.max ?? '?'}`;
  }
  o.capBreakers = JSON.stringify(r.capBreakers || {});
  o.badgeReqs = JSON.stringify(r.badgeReqs || []);
  return o;
}

// Before/after diff by row id.
export function diffDatasets(before, after) {
  const b = new Map((before?.rows || []).map(r => [r.id, r]));
  const a = new Map((after?.rows || []).map(r => [r.id, r]));
  const added = [], removed = [], changed = [];
  for (const [id, r] of a) if (!b.has(id)) added.push(r);
  for (const [id, r] of b) if (!a.has(id)) removed.push(r);
  for (const [id, r] of a) {
    if (!b.has(id)) continue;
    const fb = flat(b.get(id)), fa = flat(r), fields = [];
    for (const k of new Set([...Object.keys(fb), ...Object.keys(fa)])) {
      if (String(fb[k] ?? '') !== String(fa[k] ?? '')) fields.push({ field: k, from: fb[k] ?? '', to: fa[k] ?? '' });
    }
    if (fields.length) changed.push({ row: r, fields });
  }
  return { added, removed, changed, empty: !added.length && !removed.length && !changed.length };
}
