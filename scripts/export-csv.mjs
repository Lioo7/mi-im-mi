// Exports the merged research records to a review CSV (UTF-8 with BOM, for Sheets/Excel).
// Usage: node scripts/export-csv.mjs [source.json] [out.csv]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadData, readJson, toCsv, reviewSort, MERGED, REVIEW_CSV } from './lib.mjs';

const src = process.argv[2] ?? MERGED;
const out = process.argv[3] ?? REVIEW_CSV;
const { parties, topics } = loadData();
const records = readJson(src);
const party = new Map(parties.map((p) => [p.id, p]));
const topic = new Map(topics.map((t) => [t.id, t]));

const COLUMNS = [
  'flagged', 'flag_reason', 'red_line', 'components_disagree', 'position', 'position_label', 'topic', 'party', 'summary', 'quote', 'quote_by', 'quote_translated_by', 'quote_channel',
  'source_type', 'source_url', 'archive_url', 'via_url', 'source_date', 'confidence', 'party_id', 'topic_id',
  'evidence_note', 'red_line_evidence',
];

const rows = reviewSort(records, parties, topics).map((r) => ({
  flagged: r.flagged ? 'TRUE' : '',
  flag_reason: r.flagReason ?? '',
  red_line: r.redLine ? 'TRUE' : 'FALSE',
  components_disagree: r.componentsDisagree ? 'TRUE' : 'FALSE',
  position: r.position ?? '',
  position_label: r.position == null ? '— אין עמדה מוצהרת —' : topic.get(r.topicId).axis[String(r.position)],
  topic: topic.get(r.topicId).name,
  party: party.get(r.partyId).name,
  summary: r.summary ?? '',
  quote: r.quote ?? '',
  quote_by: r.quoteBy ?? '',
  quote_translated_by: r.quoteTranslatedBy ?? '',
  quote_channel: r.quoteChannel ?? '',
  source_type: r.sourceType ?? '',
  source_url: r.sourceUrl ?? '',
  archive_url: r.archiveUrl ?? '',
  via_url: r.viaUrl ?? '',
  source_date: r.sourceDate ?? '',
  confidence: r.confidence ?? '',
  party_id: r.partyId,
  topic_id: r.topicId,
  evidence_note: r.evidenceNote ?? '',
  red_line_evidence: r.redLineEvidence ? `${r.redLineEvidence.quote ?? ''} ${r.redLineEvidence.url ?? ''}`.trim() : '',
}));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, toCsv(COLUMNS, rows));
const flagged = rows.filter((r) => r.flagged).length;
console.log(`✓ wrote ${rows.length} rows to ${out} (${flagged} flagged first)`);
