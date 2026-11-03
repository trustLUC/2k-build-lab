// Bump every ?v=N cache-buster in html/js by one.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const files = ['index.html', ...readdirSync('js').map(f => 'js/' + f)];
const cur = Math.max(...files.flatMap(f => [...readFileSync(f, 'utf8').matchAll(/\?v=(\d+)/g)].map(m => +m[1])));
const next = cur + 1;
for (const f of files) writeFileSync(f, readFileSync(f, 'utf8').replace(/\?v=\d+/g, '?v=' + next));
console.log('cache-buster v=' + next);
