// Folds flag files (research/verify/*.json) into research/merged.json.
// Each flag file is an array of { partyId, topicId, flagged, flagReason, suggestedPosition? }.
// Multiple flags on the same row are joined.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, MERGED, readJson, writeJson, exists, key } from './lib.mjs';

const dir = join(ROOT, 'research', 'verify');
const records = readJson(MERGED);
const byKey = new Map(records.map((r) => [key(r), r]));
for (const r of records) { r.flagged = false; r.flagReason = null; }

let applied = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  for (const v of readJson(join(dir, f))) {
    if (!v.flagged) continue;
    const r = byKey.get(key(v));
    if (!r) { console.warn(`! ${f}: unknown row ${key(v)}`); continue; }
    const reason = v.suggestedPosition != null ? `${v.flagReason} [מוצע: ${v.suggestedPosition}]` : v.flagReason;
    r.flagged = true;
    r.flagReason = r.flagReason ? `${r.flagReason} | ${reason}` : reason;
    applied++;
  }
}
writeJson(MERGED, records);
console.log(`✓ applied ${applied} flag(s); ${records.filter((r) => r.flagged).length} row(s) flagged`);
