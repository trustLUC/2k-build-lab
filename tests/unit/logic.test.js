import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHeight, fmtHeight, normalizeRow, validateRow, validateDataset, parseRowText, diffDatasets, ATTR_KEYS } from '../../js/model.js?v=1';
import { findBuilds } from '../../js/search.js?v=1';
import { createStore, DATA_KEY, BACKUP_KEY } from '../../js/store.js?v=1';

const row = (id, position, h, caps, w = 200, ws = h + 4) => normalizeRow({ id, position, heightIn: h, weightLb: w, wingspanIn: ws, caps });

test('parseHeight handles common formats', () => {
  assert.equal(parseHeight("6'5"), 77);
  assert.equal(parseHeight('6\'5"'), 77);
  assert.equal(parseHeight('6-5'), 77);
  assert.equal(parseHeight('6 5'), 77);
  assert.equal(parseHeight('77'), 77);
  assert.equal(parseHeight("7'0"), 84);
  assert.ok(Number.isNaN(parseHeight("6'13")));
  assert.ok(Number.isNaN(parseHeight('')));
  assert.equal(fmtHeight(77), '6\'5"');
});

test('validateRow catches bad values', () => {
  assert.deepEqual(validateRow(row('a', 'PG', 76, { speed: { min: 25, max: 85 } })), []);
  const bad = validateRow(normalizeRow({ position: 'QB', heightIn: 40, weightLb: 50, wingspanIn: 200, caps: { speed: { min: 90, max: 80 } } }));
  assert.ok(bad.length >= 5);
});

test('parseRowText: CSV/TSV and JSON', () => {
  const r = parseRowText("pg, 6'5, 210, 6'9, 25-80, 85");
  assert.equal(r.position, 'PG'); assert.equal(r.heightIn, 77); assert.equal(r.wingspanIn, 81); assert.equal(r.weightLb, 210);
  assert.deepEqual(r.caps[ATTR_KEYS[0]], { min: 25, max: 80 });
  assert.deepEqual(r.caps[ATTR_KEYS[1]], { max: 85 });
  const t = parseRowText('C\t84\t250\t90');
  assert.equal(t.heightIn, 84);
  const j = parseRowText('{"position":"SF","height":"6\'8","weight":220,"wingspan":"7\'0","caps":{"block":{"max":70}}}');
  assert.equal(j.heightIn, 80); assert.equal(j.caps.block.max, 70);
  assert.throws(() => parseRowText('PG, 6\'5'));
});

test('findBuilds ranks full matches first, then by misses and shortfall', () => {
  const rows = [
    row('short', 'PG', 75, { threePoint: { max: 80 }, speed: { max: 90 } }),
    row('best', 'SG', 77, { threePoint: { max: 92 }, speed: { max: 88 } }),
    row('ok', 'SG', 78, { threePoint: { max: 90 }, speed: { max: 85 } }),
    row('close', 'SF', 80, { threePoint: { max: 88 }, speed: { max: 85 } }),
    row('unknown', 'SF', 80, { threePoint: { max: 99 } }),
  ];
  const r = findBuilds(rows, { targets: { threePoint: 90, speed: 85 } });
  assert.deepEqual(r.results.map(x => x.row.id), ['best', 'ok', 'close', 'short', 'unknown']);
  assert.equal(r.results[0].meetsAll, true);
  assert.equal(r.results[0].surplus, 5);
  const close = r.results[2];
  assert.deepEqual(close.misses, [{ key: 'threePoint', target: 90, max: 88, short: 2 }]);
  assert.equal(r.results[4].unknown[0].key, 'speed');
  assert.equal(r.results[3].totalShort, 10);
});

test('findBuilds filters by position and height', () => {
  const rows = [row('a', 'PG', 75, {}), row('b', 'SG', 77, {}), row('c', 'SG', 80, {})];
  assert.deepEqual(findBuilds(rows, { position: 'SG' }).results.map(x => x.row.id), ['b', 'c']);
  assert.deepEqual(findBuilds(rows, { heightMin: 76, heightMax: 79 }).results.map(x => x.row.id), ['b']);
  assert.equal(findBuilds([], { targets: { speed: 80 } }).total, 0);
});

test('diffDatasets reports added, removed, changed fields', () => {
  const a = { rows: [row('x', 'PG', 75, { speed: { max: 80 } }), row('y', 'C', 84, {})] };
  const b = { rows: [row('x', 'PG', 75, { speed: { max: 85 } }), row('z', 'SF', 80, {})] };
  const d = diffDatasets(a, b);
  assert.deepEqual(d.added.map(r => r.id), ['z']);
  assert.deepEqual(d.removed.map(r => r.id), ['y']);
  assert.equal(d.changed.length, 1);
  assert.equal(d.changed[0].fields[0].field, 'Speed');
  assert.ok(diffDatasets(a, a).empty);
});

test('validateDataset accepts arrays, dedupes ids, reports errors', () => {
  const v = validateDataset({ rows: [{ id: 'a', position: 'PG', heightIn: 75, weightLb: 190, wingspanIn: 78 }, { id: 'a', position: 'PG', heightIn: 75, weightLb: 190, wingspanIn: 78 }] });
  assert.ok(v.ok); assert.notEqual(v.dataset.rows[0].id, v.dataset.rows[1].id);
  assert.equal(validateDataset({ foo: 1 }).ok, false);
  assert.equal(validateDataset({ rows: [{ position: 'X' }] }).ok, false);
});

test('store backs up before every write', () => {
  const m = new Map();
  const ls = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  const s = createStore(ls);
  s.save({ schema: '2k-build-lab/v1', rows: [] }, 'first');
  assert.equal(s.backups().length, 0);
  s.save({ schema: '2k-build-lab/v1', rows: [row('a', 'PG', 75, {})] }, 'add');
  assert.equal(s.backups().length, 1);
  assert.equal(s.backups()[0].reason, 'add');
  assert.equal(s.backups()[0].data.rows.length, 0);
  assert.equal(s.load().rows.length, 1);
  assert.ok(m.has(DATA_KEY) && m.has(BACKUP_KEY));
});
