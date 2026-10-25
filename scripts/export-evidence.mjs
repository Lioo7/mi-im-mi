// Writes the public research-transparency files to docs/research/: per-position evidence (JSON + CSV).
// Source of truth is research/merged.json (gitignored: it also holds working notes). Only our own summaries,
// short quotes already shown on the site, source URLs and our evidence notes are exported; no third-party files.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, MERGED, loadData, readJson, toCsv, key } from './lib.mjs';

const OUT = join(ROOT, 'docs', 'research');
const { parties, topics } = loadData();
const party = new Map(parties.map((p) => [p.id, p]));
const topic = new Map(topics.map((t) => [t.id, t]));
const po = new Map(parties.map((p, i) => [p.id, i]));
const to = new Map(topics.map((t, i) => [t.id, i]));

// Local working paths are not meaningful to readers; describe the source instead.
const clean = (s) => (s ?? '')
  .replace(/\(research\/platforms\/[^)]*\)/g, '(סיכום המצע של המפלגה הכלכלית החדשה)')
  .replace(/\s+/g, ' ')
  .trim();

const rows = readJson(MERGED)
  .sort((a, b) => to.get(a.topicId) - to.get(b.topicId) || po.get(a.partyId) - po.get(b.partyId))
  .map((r) => ({
    party: party.get(r.partyId).name,
    party_id: r.partyId,
    topic: topic.get(r.topicId).name,
    topic_id: r.topicId,
    position: r.position ?? '',
    position_label: r.position == null ? 'אין עמדה מוצהרת' : topic.get(r.topicId).axis[String(r.position)],
    red_line: r.redLine ? 'TRUE' : 'FALSE',
    red_line_evidence: r.redLineEvidence ? `${r.redLineEvidence.quote ?? ''} ${r.redLineEvidence.url ?? ''}`.trim() : '',
    components_disagree: r.componentsDisagree ? 'TRUE' : 'FALSE',
    source_type: r.sourceType ?? '',
    source_url: r.sourceUrl ?? '',
    archive_url: r.archiveUrl ?? '',
    source_date: r.sourceDate ?? '',
    confidence: r.confidence ?? '',
    summary: r.summary ?? '',
    quote: r.quote ?? '',
    quote_by: r.quoteBy ?? '',
    evidence_note: clean(r.evidenceNote),
  }));

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'evidence.json'), JSON.stringify(rows, null, 2) + '\n');
writeFileSync(join(OUT, 'evidence.csv'), toCsv(Object.keys(rows[0]), rows));
console.log(`✓ wrote ${rows.length} evidence rows to docs/research/evidence.{json,csv}`);
