// Imports the reviewed CSV into site/data/positions.json (public fields only), and prints what changed.
// Usage: node scripts/import-csv.mjs review/positions_review.csv [--allow-flagged] [--dry-run]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DATA, MERGED, REVIEW_CSV, loadData, parseCsv, readJson, writeJson, exists,
  validatePositions, publicRecord, key,
} from './lib.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--')) ?? REVIEW_CSV;
const allowFlagged = args.includes('--allow-flagged');
const dryRun = args.includes('--dry-run');

const { parties, topics, meta } = loadData();
const rows = parseCsv(readFileSync(file, 'utf8'));

const bool = (v) => /^(true|1|yes|כן)$/i.test(String(v).trim());
const textOrNull = (v) => (String(v ?? '').trim() === '' ? null : String(v).trim());
const errors = [];
const flaggedRows = [];

const records = rows.map((r) => {
  const pos = String(r.position ?? '').trim();
  const position = pos === '' || pos.toLowerCase() === 'null' ? null : Number(pos);
  if (position !== null && !Number.isInteger(position)) errors.push(`row ${r._row}: position "${pos}" is not an integer`);
  if (bool(r.flagged)) flaggedRows.push(r._row);
  return {
    _row: r._row,
    partyId: String(r.party_id ?? '').trim(),
    topicId: String(r.topic_id ?? '').trim(),
    position,
    redLine: bool(r.red_line),
    componentsDisagree: bool(r.components_disagree),
    summary: textOrNull(r.summary),
    quote: textOrNull(r.quote),
    quoteBy: textOrNull(r.quote_by),
    quoteTranslatedBy: textOrNull(r.quote_translated_by),
    quoteChannel: textOrNull(r.quote_channel),
    sourceUrl: textOrNull(r.source_url),
    sourceType: textOrNull(r.source_type),
    sourceDate: textOrNull(r.source_date),
    viaUrl: textOrNull(r.via_url),
    archiveUrl: textOrNull(r.archive_url),
    confidence: textOrNull(r.confidence),
  };
});

errors.push(...validatePositions(records, parties, topics, (p) => `row ${p._row} (${key(p)})`));
if (flaggedRows.length && !allowFlagged) {
  errors.push(`${flaggedRows.length} row(s) still flagged: ${flaggedRows.join(', ')} (clear "flagged" or pass --allow-flagged)`);
} else if (flaggedRows.length) {
  console.warn(`! importing ${flaggedRows.length} flagged row(s): ${flaggedRows.join(', ')}`);
}

if (errors.length) {
  console.error(`✗ import refused, ${errors.length} problem(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}

// Diff against what was exported for review (merged research), else the current file.
const before = exists(MERGED) ? readJson(MERGED) : exists(join(DATA, 'positions.json')) ? readJson(join(DATA, 'positions.json')) : [];
const prev = new Map(before.map((p) => [key(p), publicRecord(p)]));
const out = records.map(publicRecord);
const changes = [];
for (const r of out) {
  const old = prev.get(key(r));
  if (!old) { changes.push(`+ ${key(r)}`); continue; }
  for (const f of ['position', 'redLine', 'componentsDisagree', 'summary', 'quote', 'quoteBy', 'quoteTranslatedBy', 'quoteChannel', 'sourceUrl', 'sourceType', 'sourceDate', 'archiveUrl']) {
    if (JSON.stringify(old[f]) !== JSON.stringify(r[f])) {
      const show = (v) => (typeof v === 'string' && v.length > 60 ? v.slice(0, 57) + '…' : JSON.stringify(v));
      changes.push(`~ ${key(r)} ${f}: ${show(old[f])} → ${show(r[f])}`);
    }
  }
}
console.log(changes.length ? `${changes.length} change(s) vs the exported data:\n  ${changes.join('\n  ')}` : 'No changes vs the exported data.');

if (dryRun) {
  console.log('(dry run: nothing written)');
  process.exit(0);
}

// Keep a stable order: topic, then party, as in the data files.
const po = new Map(parties.map((p, i) => [p.id, i]));
const to = new Map(topics.map((t, i) => [t.id, i]));
out.sort((a, b) => to.get(a.topicId) - to.get(b.topicId) || po.get(a.partyId) - po.get(b.partyId));
writeJson(join(DATA, 'positions.json'), out);
if (meta.stub) writeJson(join(DATA, 'meta.json'), { ...meta, stub: false });
console.log(`✓ wrote ${out.length} positions to site/data/positions.json${meta.stub ? ' (stub mode turned off)' : ''}`);
