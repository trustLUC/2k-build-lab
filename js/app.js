import { ATTRS, ATTR_BY_KEY, POSITIONS, emptyDataset, normalizeRow, validateRow, validateDataset, parseRowText, parseHeight, fmtHeight, rowLabel, diffDatasets } from './model.js?v=2';
import { findBuilds } from './search.js?v=2';
import { createStore } from './store.js?v=2';
import { PASS_HASH } from './config.js?v=2';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = createStore();
let data = emptyDataset();
let editingId = null;
const SEED_URL = 'data/example-seed.json?v=2';

/* ---------- gate ---------- */
const UNLOCK_KEY = '2kbl.unlock';
async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function reveal() { $('#gate').remove(); $('#app').hidden = false; }

/* ---------- writes: backup + diff confirm ---------- */
function renderDiff(d) {
  const capTable = r => {
    const rows = Object.entries(r.caps).map(([k, c]) => `<tr><td>${esc(ATTR_BY_KEY[k].label)}</td><td>${c.min ?? '?'}–${c.max ?? '?'}</td></tr>`).join('');
    return rows ? `<table>${rows}</table>` : '';
  };
  let h = `<p class="hint">Before: ${d.beforeCount} rows → After: ${d.afterCount} rows. A backup is saved first.</p>`;
  for (const r of d.added) h += `<div class="d add"><b>+ Added</b> ${esc(rowLabel(r))}${r.example ? ' <span class="badge ex">EXAMPLE</span>' : ''}${capTable(r)}</div>`;
  for (const r of d.removed) h += `<div class="d del"><b>− Removed</b> ${esc(rowLabel(r))}</div>`;
  for (const c of d.changed) h += `<div class="d chg"><b>~ Changed</b> ${esc(rowLabel(c.row))}<table>${c.fields.map(f => `<tr><td>${esc(f.field)}</td><td class="from">${esc(f.from)}</td><td class="to">${esc(f.to)}</td></tr>`).join('')}</table></div>`;
  if (d.empty) h += '<p>No changes.</p>';
  return h;
}
function confirmWrite(next, reason, title) {
  const d = diffDatasets(data, next);
  d.beforeCount = data.rows.length; d.afterCount = next.rows.length;
  const dlg = $('#confirm');
  $('#c-title').textContent = title;
  $('#c-body').innerHTML = renderDiff(d);
  $('#c-ok').disabled = d.empty;
  return new Promise(res => {
    dlg.addEventListener('close', () => {
      if (dlg.returnValue === 'ok' && !d.empty) {
        store.save(next, reason);
        data = next;
        renderAll();
        res(true);
      } else res(false);
    }, { once: true });
    dlg.returnValue = '';
    dlg.showModal();
    $('#c-ok').focus();
  });
}
const withRows = rows => ({ ...data, rows });

/* ---------- tabs ---------- */
function showTab(name) {
  if (!['find', 'enter', 'data'].includes(name)) name = 'find';
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== 'tab-' + name;
  if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
}

/* ---------- find ---------- */
function buildTargets() {
  let h = '', g = '';
  for (const a of ATTRS) {
    if (a.group !== g) { g = a.group; h += `<div class="group">${esc(g)}</div>`; }
    h += `<label class="attr" title="${esc(a.label)}"><span>${esc(a.label)}</span><input data-key="${a.key}" inputmode="numeric" maxlength="2" placeholder="–" aria-label="Target ${esc(a.label)}"></label>`;
  }
  $('#f-targets').innerHTML = h;
}
function readTargets() {
  const t = {};
  for (const i of document.querySelectorAll('#f-targets input')) {
    const v = parseInt(i.value, 10);
    i.parentElement.classList.toggle('on', v > 0);
    if (v > 0) t[i.dataset.key] = Math.min(v, 99);
  }
  return t;
}
function runFind() {
  const q = {
    targets: readTargets(),
    position: $('#f-pos').value,
    heightMin: parseHeight($('#f-hmin').value),
    heightMax: parseHeight($('#f-hmax').value),
  };
  const r = findBuilds(data.rows, q);
  const all = r.results.filter(x => x.meetsAll).length;
  $('#f-summary').textContent = !data.rows.length ? 'No data yet. Add rows in the Enter tab.'
    : !r.targets ? `${r.total} of ${data.rows.length} rows match the filters. Set target minimums to rank them.`
    : `${r.total} rows searched · ${all} meet every target · estimates from your data`;
  if (!r.results.length) {
    $('#f-results').innerHTML = `<li class="empty">${data.rows.length ? 'No rows match those filters.' : 'Your dataset is empty.'}</li>`;
    return;
  }
  $('#f-results').innerHTML = r.results.map((x, i) => {
    const s = x.meetsAll ? '<span class="badge ok">Meets all</span>'
      : `<span class="badge bad">Misses ${x.misses.length + x.unknown.length}${x.totalShort ? ` · −${x.totalShort}` : ''}</span>`;
    const chips = [
      ...x.misses.map(m => `<span class="chip miss">${ATTR_BY_KEY[m.key].short} ${m.target} · cap ${m.max} (−${m.short})</span>`),
      ...x.unknown.map(m => `<span class="chip unk">${ATTR_BY_KEY[m.key].short} ${m.target} · no cap data</span>`),
      ...x.met.map(m => `<span class="chip met">${ATTR_BY_KEY[m.key].short} ${m.max}${m.max > m.target ? ` (+${m.max - m.target})` : ''}</span>`),
    ].join('');
    return `<li class="res${x.meetsAll ? ' all' : ''}"><div class="res-top"><span class="res-title"><span class="rank">${i + 1}</span>${esc(rowLabel(x.row))}</span>${x.row.example ? '<span class="badge ex">EXAMPLE</span>' : ''}${s}</div>${chips ? `<div class="chips">${chips}</div>` : ''}</li>`;
  }).join('');
}

/* ---------- enter ---------- */
function buildCaps() {
  $('#e-caps').innerHTML = ATTRS.map(a => `<div class="cap"><span>${esc(a.label)}</span><input data-min="${a.key}" inputmode="numeric" maxlength="2" placeholder="min" aria-label="${esc(a.label)} min"><input data-max="${a.key}" inputmode="numeric" maxlength="2" placeholder="max" aria-label="${esc(a.label)} max"></div>`).join('');
}
function fillForm(r) {
  $('#e-pos').value = r?.position || 'PG';
  $('#e-height').value = r && Number.isFinite(r.heightIn) ? fmtHeight(r.heightIn) : '';
  $('#e-weight').value = r && Number.isFinite(r.weightLb) ? r.weightLb : '';
  $('#e-wing').value = r && Number.isFinite(r.wingspanIn) ? fmtHeight(r.wingspanIn) : '';
  $('#e-source').value = r?.source || '';
  $('#e-notes').value = r?.notes || '';
  for (const a of ATTRS) {
    $(`[data-min="${a.key}"]`).value = r?.caps?.[a.key]?.min ?? '';
    $(`[data-max="${a.key}"]`).value = r?.caps?.[a.key]?.max ?? '';
  }
}
function readForm() {
  const caps = {};
  for (const a of ATTRS) {
    const min = $(`[data-min="${a.key}"]`).value.trim(), max = $(`[data-max="${a.key}"]`).value.trim();
    if (min || max) caps[a.key] = { min: min === '' ? undefined : +min, max: max === '' ? undefined : +max };
  }
  const prev = editingId ? data.rows.find(r => r.id === editingId) : null;
  return normalizeRow({
    ...(prev || {}),
    id: editingId || undefined,
    position: $('#e-pos').value, height: $('#e-height').value, weight: $('#e-weight').value, wingspan: $('#e-wing').value,
    heightIn: undefined, weightLb: undefined, wingspanIn: undefined,
    caps, source: $('#e-source').value.trim(), notes: $('#e-notes').value.trim(),
    example: prev ? prev.example : false, updatedAt: new Date().toISOString(),
  });
}
function setMsg(sel, text, cls = '') { const m = $(sel); m.textContent = text || '\u00a0'; m.className = 'msg ' + cls; }
function startEdit(id) {
  editingId = id;
  const r = data.rows.find(x => x.id === id);
  fillForm(r);
  $('#e-title').textContent = 'Edit row';
  $('#e-save').textContent = 'Save changes';
  showTab('enter');
  $('#e-pos').focus();
}
function resetForm() {
  editingId = null;
  fillForm(null);
  $('#e-title').textContent = 'New row';
  $('#e-save').textContent = 'Save row';
}
async function saveForm() {
  const r = readForm();
  const errs = validateRow(r);
  if (errs.length) return setMsg('#e-msg', errs[0], 'err');
  const rows = editingId ? data.rows.map(x => (x.id === editingId ? r : x)) : [...data.rows, r];
  const ok = await confirmWrite(withRows(rows), editingId ? 'edit row' : 'add row', editingId ? 'Save changes?' : 'Add this row?');
  if (!ok) return setMsg('#e-msg', 'Not saved.');
  setMsg('#e-msg', (editingId ? 'Updated ' : 'Added ') + rowLabel(r), 'ok');
  // Keep position/frame for fast entry of the next row.
  const keep = { position: r.position, heightIn: r.heightIn, weightLb: r.weightLb, wingspanIn: r.wingspanIn };
  resetForm();
  fillForm(keep);
  $('#e-height').focus();
  $('#e-height').select();
}

/* ---------- data ---------- */
function renderRows() {
  const n = data.rows.length, ex = data.rows.filter(r => r.example).length;
  $('#d-count').textContent = `${n} row${n === 1 ? '' : 's'}${ex ? ` · ${ex} example` : ''}`;
  $('#d-examples-del').hidden = !ex;
  $('#d-rows').innerHTML = n ? data.rows.map(r => `<li data-id="${esc(r.id)}"><div class="meta"><span>${esc(rowLabel(r))} ${r.example ? '<span class="badge ex">EXAMPLE</span>' : ''}</span><span class="sub">${Object.keys(r.caps).length} caps${r.source ? ' · ' + esc(r.source) : ''}${r.notes ? ' · ' + esc(r.notes) : ''}</span></div><div class="btns"><button class="btn sm" data-act="edit">Edit</button><button class="btn sm ghost danger" data-act="del">Delete</button></div></li>`).join('')
    : '<li class="empty">No rows yet.</li>';
  const b = store.backups();
  $('#d-backups').innerHTML = b.length ? b.map((x, i) => `<li><div class="meta"><span>${esc(new Date(x.at).toLocaleString())}</span><span class="sub">before “${esc(x.reason)}” · ${x.data?.rows?.length ?? 0} rows</span></div><div class="btns"><button class="btn sm" data-restore="${i}">Restore</button></div></li>`).join('')
    : '<li class="empty">No backups yet.</li>';
}
function exportJson() {
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `2k-build-lab-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  setMsg('#d-msg', `Exported ${data.rows.length} rows.`, 'ok');
}
async function importJson(file) {
  let obj;
  try { obj = JSON.parse(await file.text()); } catch { return setMsg('#d-msg', 'That file is not valid JSON.', 'err'); }
  const v = validateDataset(obj);
  if (!v.dataset) return setMsg('#d-msg', v.errors[0], 'err');
  if (!v.ok) return setMsg('#d-msg', `Import blocked: ${v.errors.length} problem(s). First: ${v.errors[0]}`, 'err');
  const ok = await confirmWrite(v.dataset, 'import ' + file.name, `Import ${v.dataset.rows.length} rows (replaces current data)?`);
  setMsg('#d-msg', ok ? `Imported ${v.dataset.rows.length} rows.` : 'Import cancelled.', ok ? 'ok' : '');
}
async function loadSeed() {
  const s = await (await fetch(SEED_URL)).json();
  return validateDataset(s).dataset.rows;
}

function renderAll() { renderRows(); runFind(); }

/* ---------- boot ---------- */
function wire() {
  $('#f-pos').innerHTML = '<option value="">Any</option>' + POSITIONS.map(p => `<option>${p}</option>`).join('');
  $('#e-pos').innerHTML = POSITIONS.map(p => `<option>${p}</option>`).join('');
  buildTargets(); buildCaps(); fillForm(null);

  document.querySelector('.tabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) showTab(t.dataset.tab); });
  document.querySelector('.tabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = [...document.querySelectorAll('.tabs button')], i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    n.focus(); showTab(n.dataset.tab);
  });
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

  for (const id of ['#f-targets', '#f-pos', '#f-hmin', '#f-hmax']) $(id).addEventListener('input', runFind);
  $('#f-clear').addEventListener('click', () => { for (const i of document.querySelectorAll('#f-targets input')) i.value = ''; runFind(); });

  $('#e-form').addEventListener('submit', e => { e.preventDefault(); saveForm(); });
  $('#e-form').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveForm(); } });
  $('#e-reset').addEventListener('click', () => { resetForm(); setMsg('#e-msg', ''); });
  $('#e-paste-btn').addEventListener('click', () => {
    try {
      const r = parseRowText($('#e-paste').value);
      fillForm(r);
      setMsg('#e-paste-msg', `Filled: ${rowLabel(r)} · ${Object.keys(r.caps).length} caps. Review, then save.`, 'ok');
    } catch (err) { setMsg('#e-paste-msg', 'Could not parse: ' + err.message, 'err'); }
  });

  $('#d-rows').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('li').dataset.id;
    if (b.dataset.act === 'edit') return startEdit(id);
    await confirmWrite(withRows(data.rows.filter(r => r.id !== id)), 'delete row', 'Delete this row?');
  });
  $('#d-backups').addEventListener('click', async e => {
    const b = e.target.closest('[data-restore]'); if (!b) return;
    const bk = store.backups()[+b.dataset.restore];
    const v = validateDataset(bk.data);
    if (v.dataset) await confirmWrite(v.dataset, 'restore backup', 'Restore this backup?');
  });
  $('#d-export').addEventListener('click', exportJson);
  $('#d-import').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await importJson(f); });
  $('#d-examples-del').addEventListener('click', () => confirmWrite(withRows(data.rows.filter(r => !r.example)), 'remove examples', 'Remove example rows?'));
  $('#d-examples-add').addEventListener('click', async () => {
    const have = new Set(data.rows.map(r => r.id));
    const add = (await loadSeed()).filter(r => !have.has(r.id));
    if (!add.length) return setMsg('#d-msg', 'Examples are already loaded.');
    await confirmWrite(withRows([...data.rows, ...add]), 'load examples', 'Load example rows?');
  });
}

async function boot() {
  wire();
  if (!store.hasData()) {
    // First run: start with the tiny EXAMPLE seed so the tool demos itself. Delete it from the Data tab.
    try { const ds = { ...emptyDataset(), rows: await loadSeed() }; store.save(ds, 'first run'); } catch { store.save(emptyDataset(), 'first run'); }
  }
  data = store.load();
  renderAll();
  showTab(location.hash.slice(1));
  if (localStorage.getItem(UNLOCK_KEY) === PASS_HASH) return reveal();
  $('#gate-pass').focus();
  $('#gate-form').addEventListener('submit', async e => {
    e.preventDefault();
    const h = await sha('2kbl:' + $('#gate-pass').value);
    if (h === PASS_HASH) { localStorage.setItem(UNLOCK_KEY, h); reveal(); }
    else { $('#gate-msg').textContent = 'Wrong passcode.'; $('#gate-pass').select(); }
  });
}
boot();
