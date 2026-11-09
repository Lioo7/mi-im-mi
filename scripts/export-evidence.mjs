// Writes the public research-transparency files to docs/research/: per-position evidence (JSON + CSV).
// Source of truth is research/merged.json (gitignored: it also holds working notes). Only our own summaries,
// short quotes already shown on the site, source URLs and our evidence notes are exported; no third-party files.
// validate.mjs fails when these files fall behind site/data/positions.json (#40).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, MERGED, loadData, readJson, toCsv, evidenceRows } from './lib.mjs';

const OUT = join(ROOT, 'docs', 'research');
const { parties, topics } = loadData();
const rows = evidenceRows(readJson(MERGED), parties, topics);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'evidence.json'), JSON.stringify(rows, null, 2) + '\n');
writeFileSync(join(OUT, 'evidence.csv'), toCsv(Object.keys(rows[0]), rows, { formulaSafe: true }));
console.log(`✓ wrote ${rows.length} evidence rows to docs/research/evidence.{json,csv}`);
