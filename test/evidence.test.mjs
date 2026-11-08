// The public evidence files (docs/research/evidence.*) must not fall behind the live positions (#40).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evidenceRows, validateEvidence, toCsv } from '../scripts/lib.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const parties = JSON.parse(read('site/data/parties.json'));
const topics = JSON.parse(read('site/data/topics.json'));
const positions = JSON.parse(read('site/data/positions.json'));
const evidenceJson = JSON.parse(read('docs/research/evidence.json'));
const evidenceCsv = read('docs/research/evidence.csv');

test('the committed evidence files match the live positions', () => {
  assert.deepEqual(validateEvidence({ positions, parties, topics, evidenceJson, evidenceCsv }), []);
});

test('a stale summary, a dropped row or a CSV that is not the JSON fails', () => {
  const stale = structuredClone(evidenceJson);
  stale[3].summary += ' x';
  assert.match(validateEvidence({ positions, parties, topics, evidenceJson: stale, evidenceCsv }).join('\n'), /row 4 .*stale summary/);
  assert.match(validateEvidence({ positions, parties, topics, evidenceJson: evidenceJson.slice(1), evidenceCsv }).join('\n'), /111 rows/);
  assert.match(validateEvidence({ positions, parties, topics, evidenceJson, evidenceCsv: evidenceCsv + 'x' }).join('\n'), /evidence\.csv: differs/);
});

test('a merged.json whose public fields differ from positions.json fails', () => {
  const merged = structuredClone(positions).map((p) => ({ ...p, evidenceNote: 'working note' }));
  assert.deepEqual(validateEvidence({ positions, parties, topics, evidenceJson, evidenceCsv, merged }), []);
  merged[0].position = merged[0].position === 2 ? 1 : 2;
  assert.match(validateEvidence({ positions, parties, topics, evidenceJson, evidenceCsv, merged }).join('\n'), /merged\.json likud\|draft: public fields differ/);
});

test('rows are in topic order, then party order, with the live columns', () => {
  const rows = evidenceRows(positions, parties, topics);
  assert.equal(rows[0].topic_id, topics[0].id);
  assert.equal(rows[0].party_id, parties[0].id);
  assert.equal(rows[parties.length].topic_id, topics[1].id);
  assert.equal(evidenceCsv, toCsv(Object.keys(evidenceJson[0]), evidenceJson));
});
