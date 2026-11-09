// Copies the English translations (research/translations-en.json, after the verifier pass) into research/merged.json
// (summaryEn, quoteTranslationEn) and site/data/topics.json (en). A position with an open verifier dispute
// (research/verify-en/open.json: { "<party|topic>": "<reason>" }) is flagged, so import-csv refuses it until resolved.
// Positions then flow through export-csv -> import-csv like every other data change.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, DATA, MERGED, readJson, writeJson, exists, key } from './lib.mjs';

const tr = readJson(join(ROOT, 'research', 'translations-en.json'));
const openPath = join(ROOT, 'research', 'verify-en', 'open.json');
const open = exists(openPath) ? readJson(openPath) : {};

const rows = readJson(MERGED);
let flagged = 0;
for (const r of rows) {
  const t = tr.positions[key(r)];
  if (!t) throw new Error(`no translation for ${key(r)}`);
  r.summaryEn = t.summaryEn;
  r.quoteTranslationEn = t.quoteTranslationEn ?? null;
  if (open[key(r)]) { r.flagged = true; r.flagReason = `EN: ${open[key(r)]}`; flagged++; }
}
writeJson(MERGED, rows);

const topics = readJson(join(DATA, 'topics.json'));
for (const t of topics) {
  if (!tr.topics[t.id]) throw new Error(`no translation for topic ${t.id}`);
  t.en = tr.topics[t.id];
}
// Axis keys stay in scale order (-2 … 2); JSON.stringify would put the integer-like keys "0", "1", "2" first.
const POLES = ['-2', '-1', '0', '1', '2'];
const text = JSON.stringify(topics, null, 2).replace(/^( +)"axis": \{\n([\s\S]*?)\n\1\}/gm, (m, indent, body) => {
  const lines = body.split('\n').map((/** @type {string} */ l) => l.replace(/,$/, ''));
  /** @param {string} l */
  const at = (l) => POLES.indexOf(Object.keys(JSON.parse(`{${l}}`))[0]);
  return `${indent}"axis": {\n${lines.sort((/** @type {string} */ a, /** @type {string} */ b) => at(a) - at(b)).join(',\n')}\n${indent}}`;
});
writeFileSync(join(DATA, 'topics.json'), text + '\n');
console.log(`✓ English for ${rows.length} positions and ${topics.length} topics; ${flagged} position(s) flagged with an open dispute`);
