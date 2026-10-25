// Merges research/drafts/<topic>.json into research/merged.json and prints a neutrality audit.
// Usage: node scripts/merge-drafts.mjs [--partial]   (--partial: merge whatever topics exist)
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, MERGED, loadData, readJson, writeJson, exists, validatePositions, key } from './lib.mjs';

const partial = process.argv.includes('--partial');
const { parties, topics } = loadData();
const dir = join(ROOT, 'research', 'drafts');
const files = exists(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];

const records = [];
const problems = [];
for (const t of topics) {
  const f = join(dir, `${t.id}.json`);
  if (!exists(f)) { (partial ? console.warn : problems.push.bind(problems))(`missing draft for topic ${t.id}`); continue; }
  const rows = readJson(f);
  if (rows.length !== parties.length) problems.push(`${t.id}: ${rows.length} rows (expected ${parties.length})`);
  for (const r of rows) {
    if (r.topicId !== t.id) problems.push(`${t.id}: row with topicId ${r.topicId}`);
    // Normalize: blank strings to null, position to number, gershayim in our own text.
    const clean = { ...r };
    for (const k of Object.keys(clean)) if (clean[k] === '') clean[k] = null;
    if (typeof clean.position === 'string') clean.position = clean.position.trim() === '' ? null : Number(clean.position);
    clean.redLine = Boolean(clean.redLine);
    if (clean.position === null) { clean.redLine = false; }
    if (clean.redLine && !clean.redLineEvidence?.url) problems.push(`${key(clean)}: redLine without redLineEvidence.url`);
    if (clean.position !== null && clean.confidence === 'low') problems.push(`${key(clean)}: low confidence (review)`);
    records.push(clean);
  }
}

const topicSubset = partial ? topics.filter((t) => exists(join(dir, `${t.id}.json`))) : topics;
const errors = validatePositions(records, parties, topicSubset);

// ---- neutrality audit ----
const blocOf = new Map(parties.map((p) => [p.id, p.bloc ?? 'none']));
const audit = {};
for (const r of records) {
  const b = blocOf.get(r.partyId);
  audit[b] ??= { rows: 0, nulls: 0, red: 0, extremes: 0 };
  audit[b].rows++;
  if (r.position === null) audit[b].nulls++;
  if (r.redLine) audit[b].red++;
  if (Math.abs(r.position ?? 0) === 2) audit[b].extremes++;
}
console.log('\nBy bloc (rows / nulls / red lines / ±2):');
for (const [b, a] of Object.entries(audit)) console.log(`  ${b.padEnd(11)} ${a.rows} / ${a.nulls} / ${a.red} / ${a.extremes}`);

console.log('\nBy party (positions per topic; · = null, R = red line):');
const shownTopics = topicSubset.map((t) => t.id);
console.log('  ' + ''.padEnd(20) + shownTopics.map((t) => t.slice(0, 5).padStart(6)).join(''));
for (const p of parties) {
  const cells = shownTopics.map((t) => {
    const r = records.find((x) => x.partyId === p.id && x.topicId === t);
    if (!r) return '?'.padStart(6);
    return ((r.position === null ? '·' : (r.position > 0 ? '+' : '') + r.position) + (r.redLine ? 'R' : '')).padStart(6);
  });
  console.log('  ' + p.id.padEnd(20) + cells.join(''));
}
const types = records.reduce((m, r) => ((m[r.sourceType ?? 'null'] = (m[r.sourceType ?? 'null'] ?? 0) + 1), m), {});
console.log('\nSource types:', JSON.stringify(types));

if (problems.length) console.log(`\nNotes (${problems.length}):\n  ` + problems.join('\n  '));
if (errors.length) {
  console.error(`\n✗ ${errors.length} validation error(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}
writeJson(MERGED, records);
console.log(`\n✓ wrote ${records.length} records to research/merged.json`);
