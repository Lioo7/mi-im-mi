// Copies Wayback snapshot URLs from research/archive-map.json into research/merged.json (archiveUrl) and writes
// docs/research/archive-failures.json for any source that could not be archived. Positions then flow through
// export-csv -> import-csv like every other data change.
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, MERGED, readJson, writeJson } from './lib.mjs';

// Merge the result files of all archiver workers (a snapshot beats an error).
const map = {};
for (const f of ['archive-map.json', 'archive-map-b.json']) {
  const path = join(ROOT, 'research', f);
  if (!existsSync(path)) continue;
  for (const [url, m] of Object.entries(readJson(path))) if (!map[url]?.snapshot) map[url] = m;
}
const rows = readJson(MERGED);
let set = 0;
const failed = new Map();
for (const r of rows) {
  if (r.position === null || !r.sourceUrl) { r.archiveUrl = null; continue; }
  const m = map[r.sourceUrl];
  if (m?.snapshot) { r.archiveUrl = m.snapshot; set++; }
  else { r.archiveUrl = null; failed.set(r.sourceUrl, m?.error ?? 'not attempted'); }
}
writeJson(MERGED, rows);
const log = [...failed].map(([url, reason]) => ({ sourceUrl: url, reason }));
writeFileSync(join(ROOT, 'docs', 'research', 'archive-failures.json'), JSON.stringify(log, null, 2) + '\n');
console.log(`✓ archiveUrl set on ${set} positions; ${failed.size} source URL(s) could not be archived (docs/research/archive-failures.json)`);
