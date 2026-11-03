import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const PASS = process.env.BL_PASSCODE || readFileSync(new URL('../../../PASSCODE.txt', import.meta.url), 'utf8').trim();
const SHOTS = process.env.BL_SHOTS || '/workspace/2k-build-lab/screenshots';

// Record every layout shift from first paint.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__ls = [];
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__ls.push({ v: e.value, input: e.hadRecentInput, t: e.startTime }); })
      .observe({ type: 'layout-shift', buffered: true });
  });
});
const cls = page => page.evaluate(() => ({
  cls: window.__ls.filter(e => !e.input).reduce((s, e) => s + e.v, 0),
  all: window.__ls.reduce((s, e) => s + e.v, 0),
  n: window.__ls.length,
}));
async function unlock(page, hash = '') {
  await page.goto('./' + hash);
  await page.fill('#gate-pass', PASS);
  await page.press('#gate-pass', 'Enter');
  await expect(page.locator('#app')).toBeVisible();
}
const tab = (page, name) => page.click(`.tabs [data-tab="${name}"]`);
const confirm = page => page.locator('#c-ok').click();

test('privacy: gate, noindex, robots, footer', async ({ page, request }) => {
  await page.goto('./');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex.*nofollow/);
  await expect(page.locator('#app')).toBeHidden();
  await page.fill('#gate-pass', 'wrong');
  await page.press('#gate-pass', 'Enter');
  await expect(page.locator('#gate-msg')).toHaveText('Wrong passcode.');
  await page.fill('#gate-pass', PASS);
  await page.press('#gate-pass', 'Enter');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('.foot')).toHaveText('Estimates from user-entered data. Not affiliated with 2K or Take-Two.');
  const robots = await (await request.get('robots.txt')).text();
  expect(robots).toMatch(/User-agent: \*\s+Disallow: \//);
  await page.reload();
  await expect(page.locator('#app')).toBeVisible(); // stays unlocked on this device
});

test('find ranks example rows and shows misses', async ({ page }) => {
  await unlock(page);
  await expect(page.locator('#f-results .res')).toHaveCount(2);
  await expect(page.locator('#f-results .badge.ex').first()).toBeVisible();
  await page.fill('[data-key="threePoint"]', '90');
  await page.fill('[data-key="ballHandle"]', '90');
  const first = page.locator('#f-results .res').nth(0), second = page.locator('#f-results .res').nth(1);
  await expect(first).toContainText('PG');
  await expect(first).toContainText('Meets all');
  await expect(second).toContainText('Misses 2 · −25');
  await expect(second.locator('.chip.miss').first()).toHaveText('BH 90 · cap 75 (−15)');
  await page.fill('[data-key="block"]', '60');
  await expect(first.locator('.chip.unk')).toHaveText('BLK 60 · no cap data');
  await page.selectOption('#f-pos', 'SF');
  await expect(page.locator('#f-results .res')).toHaveCount(1);
  await page.selectOption('#f-pos', '');
  await page.fill('#f-hmin', "6'7");
  await expect(page.locator('#f-results .res')).toHaveCount(1);
  await expect(page.locator('#f-results .res')).toContainText('SF');
  await page.fill('#f-hmax', "6'5");
  await expect(page.locator('#f-results .empty')).toHaveText('No rows match those filters.');
  await page.click('#f-clear');
  await expect(page.locator('[data-key="threePoint"]')).toHaveValue('');
});

test('keyboard entry, paste, edit, delete — all with diff + backup', async ({ page }) => {
  await unlock(page, '#enter');
  await expect(page.locator('#tab-enter')).toBeVisible();
  await page.focus('#e-pos');
  await page.selectOption('#e-pos', 'SG');
  await page.keyboard.press('Tab'); await page.keyboard.type("6'6");
  await page.keyboard.press('Tab'); await page.keyboard.type('205');
  await page.keyboard.press('Tab'); await page.keyboard.type("6'11");
  await page.keyboard.press('Tab'); await page.keyboard.type('25');   // close shot min
  await page.keyboard.press('Tab'); await page.keyboard.type('81');   // close shot max
  await expect(page.locator('[data-max="closeShot"]')).toHaveValue('81');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#confirm')).toBeVisible();
  await expect(page.locator('#c-body .add')).toContainText("SG · 6'6\" · 205 lb · 6'11\" WS");
  await expect(page.locator('#c-body')).toContainText('Before: 2 rows → After: 3 rows');
  await page.keyboard.press('Enter');
  await expect(page.locator('#confirm')).toBeHidden();
  await expect(page.locator('#e-msg')).toContainText('Added SG');
  await expect(page.locator('#e-height')).toBeFocused(); // ready for the next row, frame kept

  await page.fill('#e-paste', "c, 7'0, 250, 7'4, 30-75, 70");
  await page.click('#e-paste-btn');
  await expect(page.locator('#e-height')).toHaveValue('7\'0"');
  await expect(page.locator('[data-min="closeShot"]')).toHaveValue('30');
  await page.click('#e-save');
  await confirm(page);

  await tab(page, 'data');
  await expect(page.locator('#d-count')).toHaveText('4 rows · 2 example');
  await expect(page.locator('#d-backups li')).toHaveCount(2);

  await page.locator('#d-rows li', { hasText: 'C · 7\'0"' }).locator('[data-act="edit"]').click();
  await expect(page.locator('#e-title')).toHaveText('Edit row');
  await page.fill('[data-max="closeShot"]', '78');
  await page.click('#e-save');
  await expect(page.locator('#c-body .chg')).toContainText('Close Shot');
  await expect(page.locator('#c-body .from')).toContainText('30–75');
  await expect(page.locator('#c-body .to')).toContainText('30–78');
  await confirm(page);

  await tab(page, 'data');
  await page.locator('#d-rows li', { hasText: 'SG · 6\'6"' }).locator('[data-act="del"]').click();
  await expect(page.locator('#c-body .del')).toBeVisible();
  await page.locator('#c-cancel').click();
  await expect(page.locator('#d-count')).toHaveText('4 rows · 2 example');
  await page.click('#d-examples-del');
  await confirm(page);
  await expect(page.locator('#d-count')).toHaveText('2 rows');
  await expect(page.locator('#d-backups li')).toHaveCount(4);
  // restore the backup taken before "remove examples"
  await page.locator('#d-backups li').first().locator('[data-restore]').click();
  await confirm(page);
  await expect(page.locator('#d-count')).toHaveText('4 rows · 2 example');
});

test('export then import with diff; bad import blocked', async ({ page }, info) => {
  await unlock(page, '#data');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#d-export')]);
  const exported = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  expect(exported.schema).toBe('2k-build-lab/v1');
  expect(exported.rows).toHaveLength(2);

  const next = { ...exported, rows: [exported.rows[0], { id: 'n1', position: 'PF', heightIn: 81, weightLb: 235, wingspanIn: 86, caps: { block: { min: 30, max: 80 } } }] };
  next.rows[0] = { ...next.rows[0], weightLb: 205 };
  await page.setInputFiles('#d-import', { name: 'next.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(next)) });
  await expect(page.locator('#c-body .add')).toContainText('PF');
  await expect(page.locator('#c-body .del')).toContainText('SF');
  await expect(page.locator('#c-body .chg')).toContainText('weight');
  await confirm(page);
  await expect(page.locator('#d-count')).toHaveText('2 rows · 1 example');
  await expect(page.locator('#d-backups li').first()).toContainText('import next.json');

  await page.setInputFiles('#d-import', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"rows":[{"position":"QB"}]}') });
  await expect(page.locator('#d-msg')).toContainText('Import blocked');
  await page.setInputFiles('#d-import', { name: 'junk.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
  await expect(page.locator('#d-msg')).toHaveText('That file is not valid JSON.');
  await expect(page.locator('#d-count')).toHaveText('2 rows · 1 example');
});

test('tabs, scrolling, live updates: zero layout shift', async ({ page }, info) => {
  await unlock(page);
  await page.waitForTimeout(300);
  // Grow the dataset so results scroll.
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('2kbl.data.v1'));
    for (let i = 0; i < 40; i++) d.rows.push({ id: 'x' + i, position: ['PG', 'SG', 'SF', 'PF', 'C'][i % 5], heightIn: 72 + (i % 13), weightLb: 180 + i, wingspanIn: 76 + (i % 13), caps: { threePoint: { min: 25, max: 60 + (i % 40) }, speed: { min: 25, max: 99 - (i % 30) } } });
    localStorage.setItem('2kbl.data.v1', JSON.stringify(d));
  });
  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  await page.waitForTimeout(500);
  const docTop = () => page.evaluate(() => document.querySelector('#f-results').getBoundingClientRect().top + scrollY);
  const resultsTop = await docTop();
  for (const v of ['8', '85', '9', '90']) { await page.fill('[data-key="threePoint"]', v); }
  await page.fill('[data-key="speed"]', '80');
  expect(await docTop()).toBe(resultsTop); // results don't move on live update
  await page.mouse.wheel(0, 1500); await page.waitForTimeout(250);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(250);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(250);
  await expect(page.locator('.top')).toBeInViewport();
  for (const t of ['enter', 'data', 'find', 'data', 'enter', 'find']) { await tab(page, t); await page.waitForTimeout(120); }
  await page.focus('.tabs [data-tab="find"]');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tab-enter')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tab-data')).toBeVisible();
  await tab(page, 'find');
  await page.waitForTimeout(600);
  const m = await cls(page);
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(`${SHOTS}/cls-${info.project.name}.json`, JSON.stringify(m));
  await page.screenshot({ path: `${SHOTS}/${info.project.name}.png`, fullPage: false });
  await page.locator('#f-results .res').first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-results.png` });
  console.log(`[${info.project.name}] CLS=${m.cls.toFixed(4)} (all shifts incl. input-driven=${m.all.toFixed(4)}, entries=${m.n})`);
  expect(m.cls).toBeLessThan(0.1);
  expect(m.all).toBeLessThan(0.1);
});
