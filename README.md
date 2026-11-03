# 2K Build Lab (private)
Owner-only NBA 2K27 MyPLAYER build tool. Data is entered by the owner and stored in the browser (localStorage), with JSON import/export.
Estimates from user-entered data. Not affiliated with 2K or Take-Two.

## Use
- Open the site, enter the owner passcode (kept off-repo; only its SHA-256 is in `js/config.js`). The gate is client-side: it keeps casual visitors out, it is not real security. Data never leaves your browser.
- **Find**: set target minimums (+ optional position/height). Rows are ranked: meets-all first, then fewest misses, known misses before missing data, smallest total shortfall, most surplus.
- **Enter**: keyboard form (Tab through min/max per attribute, Ctrl/⌘+Enter saves) or paste a row (JSON, or CSV/TSV: `position, height, weight, wingspan, <one cell per attribute in order: max or min-max>`).
- **Data**: export/import JSON (`schema/build-data.schema.json`), delete/edit rows, restore backups. Every write saves a backup first and shows a before/after diff.
- Ships with 2 rows flagged `EXAMPLE` (made-up placeholder numbers, not game data). Remove them from the Data tab.

## Dev
`npm i && npm test` (unit + Playwright on Chrome at 1280px and 390px, includes CLS). `npm run bump` before each deploy.
