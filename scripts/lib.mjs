// Shared helpers for the data scripts: paths, JSON IO, CSV, validation. Node built-ins only.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPLY_KINDS, contextFor } from '../site/js/compat.js';
import { S as HE } from '../site/js/strings.js';
import { S as EN } from '../site/js/strings.en.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = join(ROOT, 'site', 'data');
export const MERGED = join(ROOT, 'research', 'merged.json');
export const REVIEW_CSV = join(ROOT, 'review', 'positions_review.csv');

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
export const exists = existsSync;
export const RESULTS_FILE = 'results-26.json';
export const SCENARIOS_FILE = 'scenarios.json';
export const RECOMMENDATIONS_FILE = 'recommendations.json';

export function loadData() {
  return {
    parties: readJson(join(DATA, 'parties.json')),
    topics: readJson(join(DATA, 'topics.json')),
    meta: readJson(join(DATA, 'meta.json')),
    positions: exists(join(DATA, 'positions.json')) ? readJson(join(DATA, 'positions.json')) : [],
    results: exists(join(DATA, RESULTS_FILE)) ? readJson(join(DATA, RESULTS_FILE)) : null,
    scenarios: exists(join(DATA, SCENARIOS_FILE)) ? readJson(join(DATA, SCENARIOS_FILE)) : null,
    recommendations: exists(join(DATA, RECOMMENDATIONS_FILE)) ? readJson(join(DATA, RECOMMENDATIONS_FILE)) : null,
    changelog: exists(join(DATA, 'changelog.json')) ? readJson(join(DATA, 'changelog.json')) : null,
  };
}

// Fields published in site/data/positions.json, in output order.
export const PUBLIC_FIELDS = [
  'partyId', 'topicId', 'position', 'redLine', 'summary', 'summaryEn', 'quote', 'quoteBy', 'quoteTranslation', 'quoteTranslationEn', 'quoteTranslatedBy', 'quoteChannel',
  'sourceUrl', 'extraSourceUrl', 'sourceType', 'sourceDate', 'viaUrl', 'archiveUrl', 'confidence', 'componentsDisagree',
];

export const SOURCE_TYPES = ['platform', 'statement', 'record'];
export const CONFIDENCE = ['high', 'med', 'low'];
export const key = (p) => `${p.partyId}|${p.topicId}`;

// ---------- CSV (RFC 4180) ----------
export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  const [header, ...body] = nonEmpty;
  return body.map((r, i) => ({ _row: i + 2, ...Object.fromEntries(header.map((h, j) => [h.trim(), r[j] ?? ''])) }));
}

export function toCsv(columns, records) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [columns.join(','), ...records.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\r\n') + '\r\n';
}

// ---------- validation ----------
// https only (#12): the data has no plain http: links, and a new one is refused.
const isHttps = (u) => typeof u === 'string' && /^https:\/\/[^\s]+$/.test(u);
// Non-empty English text: no Hebrew or Arabic letters.
const isEnglish = (v) => typeof v === 'string' && v.trim() !== '' && !/[\u0590-\u06FF]/.test(v);
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
// A year alone, for an older platform whose exact date is not known (null rows only).
const isYear = (d) => typeof d === 'string' && /^(19|20)\d{2}$/.test(d);

export function validateParties(parties) {
  const errors = [];
  const ids = new Set();
  for (const p of parties) {
    const at = `party ${p.id}`;
    if (ids.has(p.id)) errors.push(`${at}: duplicate id`);
    ids.add(p.id);
    for (const f of ['officialName', 'name', 'ballotLetters']) {
      if (!p[f] || typeof p[f] !== 'string') errors.push(`${at}: missing ${f}`);
    }
    for (const f of ['officialName', 'name']) {
      if (p[f]?.startsWith(p.ballotLetters + ' ')) errors.push(`${at}: ${f} starts with ballot letters`);
    }
    if (!['above', 'borderline'].includes(p.threshold)) errors.push(`${at}: bad threshold`);
    if (![null, 'coalition', 'opposition', 'arab'].includes(p.bloc)) errors.push(`${at}: bad bloc`);
    if (!['full', 'partial', 'none'].includes(p.platformStatus)) errors.push(`${at}: bad platformStatus`);
    if (p.pollAvg != null && typeof p.pollAvg !== 'number') errors.push(`${at}: pollAvg not a number`);
    if (p.components && (!Array.isArray(p.components) || p.components.length < 2)) errors.push(`${at}: components must list 2+ names`);
  }
  // Soft-linked parties (ran together, announced a split) must point at each other.
  const byId = new Map(parties.map((p) => [p.id, p]));
  for (const p of parties) {
    if (p.linkedWith && byId.get(p.linkedWith)?.linkedWith !== p.id) errors.push(`party ${p.id}: linkedWith is not reciprocal`);
  }
  return errors;
}

export const MODES = ['polls', 'results'];

// meta.mode and, in results mode, the CEC results file. Seats are entered as published (surplus agreements
// make them differ from a proportional split), so only their consistency is checked here, never recomputed.
export function validateResults(meta, results, parties) {
  const errors = [];
  if (!MODES.includes(meta.mode)) errors.push(`meta: mode must be one of ${MODES.join('/')}`);
  if (meta.mode !== 'results') return errors;
  for (const f of ['resultsAsOf', 'resultsStatus', 'resultsSourceUrl']) if (!meta[f]) errors.push(`meta: missing ${f}`);
  if (meta.resultsAsOf && !isDate(meta.resultsAsOf)) errors.push('meta: resultsAsOf must be YYYY-MM-DD');
  if (!results) return [...errors, `results: site/data/${RESULTS_FILE} is missing`];
  const seen = new Map();
  let total = 0;
  for (const l of results.lists ?? []) {
    const at = `results ${l.parties?.join('+')}`;
    for (const id of l.parties ?? []) seen.set(id, (seen.get(id) ?? 0) + 1);
    if (!Number.isInteger(l.votes) || l.votes < 0) errors.push(`${at}: bad votes`);
    if (typeof l.pct !== 'number') errors.push(`${at}: bad pct`);
    if (!Number.isInteger(l.seats) || l.seats < 0) errors.push(`${at}: bad seats`);
    if ((l.seats === 0) !== (l.pct < results.threshold)) errors.push(`${at}: seats=0 must match pct below the threshold`);
    if (l.parties?.length > 1) {
      const split = l.split ?? {};
      const sum = l.parties.reduce((n, id) => n + (split[id] ?? NaN), 0);
      if (sum !== l.seats) errors.push(`${at}: split must give every party a seat count summing to ${l.seats}`);
    }
    total += l.seats ?? 0;
  }
  if (total !== results.totalSeats) errors.push(`results: seats sum to ${total}, expected ${results.totalSeats}`);
  for (const p of parties) if (seen.get(p.id) !== 1) errors.push(`results: party ${p.id} must appear in exactly one list`);
  for (const id of seen.keys()) if (!parties.some((p) => p.id === id)) errors.push(`results: unknown party ${id}`);
  return errors;
}

// Media scenarios (results mode): at most 4; ids of lists that won seats; disjoint roles; every source dated and linked.
export function validateScenarios(meta, data, parties, results) {
  if (meta.mode !== 'results') return [];
  if (!data) return [`scenarios: site/data/${SCENARIOS_FILE} is missing`];
  const errors = [];
  if (!isDate(data.asOf)) errors.push('scenarios: asOf must be YYYY-MM-DD');
  const list = data.scenarios ?? [];
  if (!list.length || list.length > 4) errors.push(`scenarios: expected 1–4, got ${list.length}`);
  const seated = new Set((results?.lists ?? []).filter((l) => l.seats > 0).flatMap((l) => l.parties));
  const ids = new Set();
  for (const sc of list) {
    const at = `scenario ${sc.id}`;
    if (!sc.id || ids.has(sc.id)) errors.push(`${at}: missing or duplicate id`);
    ids.add(sc.id);
    const all = [...(sc.members ?? []), ...(sc.supporters ?? []), ...(sc.abstainers ?? [])];
    if (!sc.members?.length) errors.push(`${at}: no members`);
    if (new Set(all).size !== all.length) errors.push(`${at}: a party has two roles`);
    for (const id of all) if (!parties.some((p) => p.id === id) || !seated.has(id)) errors.push(`${at}: ${id} is unknown or has no seats`);
    if (!sc.sources?.length) errors.push(`${at}: no source`);
    for (const src of sc.sources ?? []) {
      if (!src.outlet || !isDate(src.date) || !/^https:\/\/\S+$/.test(src.url ?? '')) errors.push(`${at}: each source needs outlet, YYYY-MM-DD date and an https url`);
      const replies = REPLY_KINDS.map((k) => `${k}By`).filter((f) => src[f] != null);
      if (replies.length > 1) errors.push(`${at}: a source carries at most one of ${replies.join(', ')}`);
      for (const f of replies) if (!all.includes(src[f])) errors.push(`${at}: ${f} must be a party in the scenario (${src[f]})`);
    }
  }
  return errors;
}

// The factions' recommendations to the President (#4, results mode). Sources are the President's office's own releases
// only: the Hebrew page in `sourceUrl`, the English one in `en.sourceUrl`. A "TODO" anywhere (a URL or quote not yet
// confirmed in a browser) fails, so nothing unconfirmed is deployed. The seats behind each candidate must match the
// totals the office published (`mandate.counts`).
export const PRESIDENT_HE = /^https:\/\/www\.president\.gov\.il\/(?!en\/)\S+$/;
export const PRESIDENT_EN = /^https:\/\/www\.president\.gov\.il\/en\/\S+$/;
export function validateRecommendations(meta, data, parties, results) {
  if (meta.mode !== 'results') return [];
  if (!data) return [`recommendations: site/data/${RECOMMENDATIONS_FILE} is missing`];
  const errors = [];
  const isTodo = (v) => typeof v === 'string' && /^\s*TODO/i.test(v);
  const todo = [];
  const walk = (v, path) => {
    if (typeof v === 'string') { if (isTodo(v)) todo.push(path); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${Array.isArray(v) ? (v[k]?.partyId ?? k) : k}`);
  };
  walk(data, 'recommendations');
  if (todo.length) errors.push(`recommendations: ${todo.length} unconfirmed placeholder(s): ${todo.join(', ')}`);
  const seats = new Map();
  for (const l of results?.lists ?? []) for (const id of l.parties) seats.set(id, l.parties.length > 1 ? l.split?.[id] ?? 0 : l.seats);
  const seated = (id) => (seats.get(id) ?? 0) > 0;
  const { from, to } = data.consultations ?? {};
  if (!isDate(from) || !isDate(to) || from > to) errors.push('recommendations: consultations needs from <= to, YYYY-MM-DD');
  const candidate = (at, id) => {
    const p = parties.find((x) => x.id === id);
    if (!p || !seated(id) || !p.leader) errors.push(`${at}: ${id} must be a party in the Knesset with a leader`);
  };
  // A placeholder is reported once, in this line, not again as a bad URL or quote.
  const urls = (at, rec) => {
    if (!isTodo(rec.sourceUrl) && !PRESIDENT_HE.test(rec.sourceUrl ?? '')) errors.push(`${at}: sourceUrl must be a Hebrew president.gov.il page`);
    if (!isTodo(rec.en?.sourceUrl) && !PRESIDENT_EN.test(rec.en?.sourceUrl ?? '')) errors.push(`${at}: en.sourceUrl must be a president.gov.il/en/ page`);
  };
  const m = data.mandate ?? {};
  // `announced`: the release saying who he will task, `tasked`: the tasking itself. The sentence follows the kind.
  if (!['announced', 'tasked'].includes(m.kind)) errors.push('recommendations mandate: kind must be announced or tasked');
  candidate('recommendations mandate', m.partyId);
  if (!isDate(m.date) || (isDate(to) && m.date < to)) errors.push('recommendations mandate: date must be YYYY-MM-DD, after the consultations');
  if (!isTodo(m.quote) && !/[\u0590-\u05FF]/.test(m.quote ?? '')) errors.push('recommendations mandate: quote must be the Hebrew tally sentence');
  urls('recommendations mandate', m);
  const seen = new Map();
  for (const f of data.factions ?? []) {
    const at = `recommendations ${f.partyId}`;
    seen.set(f.partyId, (seen.get(f.partyId) ?? 0) + 1);
    if (!parties.some((p) => p.id === f.partyId) || !seated(f.partyId)) errors.push(`${at}: unknown or not in the Knesset`);
    if (f.recommended !== null) candidate(at, f.recommended);
    if (!isDate(f.date) || f.date < from || f.date > to) errors.push(`${at}: date must be within the consultations`);
    urls(at, f);
  }
  for (const [id, n] of seats) if (n > 0 && seen.get(id) !== 1) errors.push(`recommendations: ${id} must appear exactly once`);
  const totals = {};
  for (const f of data.factions ?? []) totals[f.recommended ?? 'none'] = (totals[f.recommended ?? 'none'] ?? 0) + (seats.get(f.partyId) ?? 0);
  const official = m.counts ?? {};
  for (const k of new Set([...Object.keys(totals), ...Object.keys(official)])) {
    if (totals[k] !== official[k]) errors.push(`recommendations: ${k} has ${totals[k] ?? 0} seats in the data, ${official[k] ?? 0} in the President's totals`);
  }
  return errors;
}

export function validateTopics(topics) {
  const errors = [];
  if (topics.length !== 8) errors.push(`topics: expected 8, got ${topics.length}`);
  for (const t of topics) {
    for (const k of ['-2', '-1', '0', '1', '2']) if (!t.axis?.[k]) errors.push(`topic ${t.id}: missing axis label ${k}`);
    if (!t.short || !t.name) errors.push(`topic ${t.id}: missing name/short`);
    for (const f of ['name', 'short', 'axisNote']) if (!isEnglish(t.en?.[f])) errors.push(`topic ${t.id}: missing or non-English en.${f}`);
    for (const k of ['-2', '-1', '0', '1', '2']) if (!isEnglish(t.en?.axis?.[k])) errors.push(`topic ${t.id}: missing or non-English en.axis ${k}`);
  }
  return errors;
}

// The English version (#3): every Hebrew text field in parties, meta, results and scenarios has an `en` twin, and
// an English text carries no Hebrew except a ballot letter in parentheses.
export function validateEnglish({ parties, meta, results, scenarios, recommendations }) {
  const errors = [];
  const text = (v) => typeof v === 'string' && v.trim() !== '' && !/[\u0590-\u05FF]/.test(v.replace(/\([\u0590-\u05FF]{1,3}\)/g, ''));
  const need = (at, rec, fields) => {
    for (const f of fields) {
      if (rec[f] == null) continue;
      const en = rec.en?.[f];
      const ok = Array.isArray(rec[f]) ? Array.isArray(en) && en.length === rec[f].length && en.every(text) : text(en);
      if (!ok) errors.push(`${at}: missing or non-English en.${f}`);
    }
  };
  for (const p of parties) need(`party ${p.id}`, p, ['name', 'officialName', 'leader', 'components', 'seatNote']);
  need('meta', meta, ['resultsStatus']);
  for (const l of results?.lists ?? []) need(`results list ${l.parties.join('+')}`, l, ['splitNote']);
  for (const sc of scenarios?.scenarios ?? []) for (const src of sc.sources ?? []) need(`scenario ${sc.id} source ${src.url}`, src, ['outlet', 'by']);
  if (recommendations?.mandate) need('recommendations mandate', recommendations.mandate, ['quote']);
  return errors;
}

// `where(p)` labels an error (e.g. a CSV row number).
export function validatePositions(positions, parties, topics, where = (p) => key(p)) {
  const errors = [];
  const partyIds = new Set(parties.map((p) => p.id));
  const topicIds = new Set(topics.map((t) => t.id));
  const seen = new Set();
  for (const p of positions) {
    const at = where(p);
    if (!partyIds.has(p.partyId)) errors.push(`${at}: unknown partyId "${p.partyId}"`);
    if (!topicIds.has(p.topicId)) errors.push(`${at}: unknown topicId "${p.topicId}"`);
    if (seen.has(key(p))) errors.push(`${at}: duplicate ${key(p)}`);
    seen.add(key(p));
    if (p.position !== null && ![-2, -1, 0, 1, 2].includes(p.position)) errors.push(`${at}: position out of range (${p.position})`);
    if (typeof p.redLine !== 'boolean') errors.push(`${at}: redLine must be true/false`);
    if (p.redLine && p.position === null) errors.push(`${at}: redLine without a position`);
    if (!p.summary || !p.summary.trim()) errors.push(`${at}: empty summary`);
    // English (#3): every summary has a translation, and so does every quote not already in English.
    if (!isEnglish(p.summaryEn)) errors.push(`${at}: missing or non-English summaryEn`);
    if (p.quote && /[\u0590-\u06FF]/.test(p.quote) ? !isEnglish(p.quoteTranslationEn) : p.quoteTranslationEn != null) {
      errors.push(`${at}: quoteTranslationEn must translate a non-English quote, and only one`);
    }
    if (p.position !== null) {
      if (!isHttps(p.sourceUrl)) errors.push(`${at}: missing or invalid sourceUrl`);
      if (!SOURCE_TYPES.includes(p.sourceType)) errors.push(`${at}: bad sourceType "${p.sourceType}"`);
      // Undated source pages keep sourceDate null rather than an invented date.
      if (p.sourceDate != null && !isDate(p.sourceDate)) errors.push(`${at}: bad sourceDate "${p.sourceDate}"`);
    } else {
      // A null row may show what was found, with its source: a valid URL and date when present, a quote only with a
      // source, and no source type (it is not placed, so it is not counted as a platform, statement or record).
      if (p.sourceUrl != null && !isHttps(p.sourceUrl)) errors.push(`${at}: invalid sourceUrl`);
      if (p.sourceDate != null && !isDate(p.sourceDate) && !isYear(p.sourceDate)) errors.push(`${at}: bad sourceDate "${p.sourceDate}"`);
      if (p.sourceType != null) errors.push(`${at}: sourceType on a row without a position`);
      if (p.quote && p.sourceUrl == null) errors.push(`${at}: quote without a sourceUrl`);
    }
    if (p.viaUrl && !isHttps(p.viaUrl)) errors.push(`${at}: invalid viaUrl`);
    // A second source (shown as "additional source"): on a placed row, the second document the placement rests on; on a
    // null row, the source of a dated note from an older official platform (never used for placement).
    if (p.extraSourceUrl != null && (!isHttps(p.extraSourceUrl) || p.sourceUrl == null)) errors.push(`${at}: extraSourceUrl must be a URL, next to a sourceUrl`);
    if (p.archiveUrl && !/^https:\/\/web\.archive\.org\/web\/\d{14}\//.test(p.archiveUrl)) errors.push(`${at}: archiveUrl must be a Wayback Machine snapshot`);
    if (p.archiveUrl && p.position === null) errors.push(`${at}: archiveUrl on a row without a position`);
    if (p.confidence && !CONFIDENCE.includes(p.confidence)) errors.push(`${at}: bad confidence "${p.confidence}"`);
    if (p.quote && p.quote.length > 300) errors.push(`${at}: quote too long`);
    if (p.componentsDisagree != null && typeof p.componentsDisagree !== 'boolean') errors.push(`${at}: componentsDisagree must be true/false`);
  }
  for (const party of partyIds) for (const topic of topicIds) {
    if (!seen.has(`${party}|${topic}`)) errors.push(`missing row ${party}|${topic}`);
  }
  return errors;
}

export function publicRecord(p) {
  const out = {};
  for (const f of PUBLIC_FIELDS) out[f] = p[f] ?? null;
  out.redLine = Boolean(p.redLine);
  out.componentsDisagree = Boolean(p.componentsDisagree);
  return out;
}

// Sort as the reviewer sees rows: flagged, red lines, ±2, then topic and party order.
export function reviewSort(records, parties, topics) {
  const po = new Map(parties.map((p, i) => [p.id, i]));
  const to = new Map(topics.map((t, i) => [t.id, i]));
  const bucket = (r) => (r.flagged ? 0 : r.redLine ? 1 : Math.abs(r.position ?? 0) === 2 ? 2 : 3);
  return [...records].sort((a, b) =>
    bucket(a) - bucket(b) || to.get(a.topicId) - to.get(b.topicId) || po.get(a.partyId) - po.get(b.partyId));
}

// ---------- public evidence files (docs/research/evidence.{json,csv}, #40) ----------
// Local working paths are not meaningful to readers; describe the source instead.
const cleanNote = (s) => (s ?? '')
  .replace(/\(research\/platforms\/[^)]*\)/g, '(סיכום המצע של המפלגה הכלכלית החדשה)')
  .replace(/\s+/g, ' ')
  .trim();

// One row per position, in topic then party order. `records` are research/merged.json rows (with evidenceNote)
// or the live positions (evidence_note is then empty: it exists only in merged.json).
export function evidenceRows(records, parties, topics) {
  const party = new Map(parties.map((p) => [p.id, p]));
  const topic = new Map(topics.map((t) => [t.id, t]));
  const po = new Map(parties.map((p, i) => [p.id, i]));
  const to = new Map(topics.map((t, i) => [t.id, i]));
  return [...records]
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
      extra_source_url: r.extraSourceUrl ?? '',
      archive_url: r.archiveUrl ?? '',
      source_date: r.sourceDate ?? '',
      confidence: r.confidence ?? '',
      summary: r.summary ?? '',
      summary_en: r.summaryEn ?? '',
      quote: r.quote ?? '',
      quote_by: r.quoteBy ?? '',
      quote_translation: r.quoteTranslation ?? '',
      quote_translation_en: r.quoteTranslationEn ?? '',
      quote_translated_by: r.quoteTranslatedBy ?? '',
      quote_channel: r.quoteChannel ?? '',
      evidence_note: cleanNote(r.evidenceNote),
    }));
}

// Columns that come from merged.json alone, so the live data cannot check them.
const MERGED_ONLY = ['red_line_evidence', 'evidence_note'];

// The published evidence files must match the live positions (they fell behind once, #40), and the CSV must be the JSON.
// `merged` (research/merged.json, gitignored) is checked only where it exists: its public fields must equal positions.json.
export function validateEvidence({ positions, parties, topics, evidenceJson, evidenceCsv, merged = null }) {
  const errors = [];
  const fix = ' (run node scripts/export-evidence.mjs)';
  if (!Array.isArray(evidenceJson)) return ['evidence.json: missing or not an array' + fix];
  const want = evidenceRows(positions, parties, topics);
  if (evidenceJson.length !== want.length) errors.push(`evidence.json: ${evidenceJson.length} rows, positions.json has ${want.length}${fix}`);
  want.forEach((w, i) => {
    const got = evidenceJson[i] ?? {};
    const cols = Object.keys(w).filter((c) => !MERGED_ONLY.includes(c) && String(got[c] ?? '') !== String(w[c]));
    if (cols.length) errors.push(`evidence.json row ${i + 1} (${w.party_id}|${w.topic_id}): stale ${cols.join(', ')}${fix}`);
  });
  if (evidenceJson.length && evidenceCsv !== toCsv(Object.keys(evidenceJson[0]), evidenceJson)) errors.push('evidence.csv: differs from evidence.json' + fix);
  if (merged) {
    const live = new Map(positions.map((p) => [key(p), JSON.stringify(publicRecord(p))]));
    if (merged.length !== positions.length) errors.push(`research/merged.json: ${merged.length} rows, positions.json has ${positions.length}`);
    for (const r of merged) {
      if (live.get(key(r)) !== JSON.stringify(publicRecord(r))) errors.push(`research/merged.json ${key(r)}: public fields differ from positions.json`);
    }
  }
  return errors;
}

// ---------- data download (site/download/, #18) ----------
// Built from the live site/data only, so it is exactly what the site shows. validate.mjs rebuilds it and fails on any
// difference from the files on disk. Rows: topic order, then the site's party order for the current mode.
export const DOWNLOAD_DIR = join(ROOT, 'site', 'download');
export const DOWNLOAD_FILES = { csv: 'mi-im-mi-positions.csv', json: 'mi-im-mi-positions.json' };
export const SITE_URL = 'https://mi-im-mi-2026.netlify.app/';

export function downloadRows({ meta, parties, topics, positions, results }) {
  const order = contextFor({ meta, parties, topics, positions, results }).parties;
  const pos = new Map(positions.map((p) => [key(p), p]));
  const rows = [];
  for (const t of topics) {
    for (const p of order) {
      const r = pos.get(`${p.id}|${t.id}`);
      if (!r) continue;
      const none = r.position == null;
      rows.push({
        party: p.name,
        party_en: p.en.name,
        party_id: p.id,
        topic: t.name,
        topic_en: t.en.name,
        topic_id: t.id,
        position: r.position ?? null,
        position_label: none ? HE.levels.NONE.label : t.axis[String(r.position)],
        position_label_en: none ? EN.levels.NONE.label : t.en.axis[String(r.position)],
        red_line: Boolean(r.redLine),
        components_disagree: Boolean(r.componentsDisagree),
        source_type: r.sourceType ?? null,
        source_date: r.sourceDate ?? null,
        source_url: r.sourceUrl ?? null,
        extra_source_url: r.extraSourceUrl ?? null,
        archive_url: r.archiveUrl ?? null,
        via_url: r.viaUrl ?? null,
        confidence: r.confidence ?? null,
        summary: r.summary ?? null,
        summary_en: r.summaryEn ?? null,
        quote: r.quote ?? null,
        quote_by: r.quoteBy ?? null,
        quote_channel: r.quoteChannel ?? null,
        quote_translation: r.quoteTranslation ?? null,
        quote_translation_en: r.quoteTranslationEn ?? null,
        quote_translated_by: r.quoteTranslatedBy ?? null,
      });
    }
  }
  return rows;
}

// The two files' exact contents. The JSON carries the notes shown next to the links (from strings*.js).
export function buildDownload(data) {
  const rows = downloadRows(data);
  const D = HE.method.download;
  const E = EN.method.download;
  const json = {
    site: SITE_URL,
    dataUpdated: data.meta.dataUpdated,
    license: { name: D.licenseName, url: D.licenseUrl, he: D.license, en: E.license },
    positionNote: { he: D.positionNote, en: E.positionNote },
    rows,
  };
  return {
    csv: toCsv(Object.keys(rows[0]), rows.map((r) => ({ ...r, red_line: r.red_line ? 'TRUE' : 'FALSE', components_disagree: r.components_disagree ? 'TRUE' : 'FALSE' }))),
    json: JSON.stringify(json, null, 2) + '\n',
  };
}

// `files` maps csv/json to the text on disk (null when missing).
export function validateDownload(data, files) {
  const want = buildDownload(data);
  return Object.entries(DOWNLOAD_FILES)
    .filter(([k]) => files[k] !== want[k])
    .map(([k, f]) => `site/download/${f}: ${files[k] == null ? 'missing' : 'out of date'} (run node scripts/export-download.mjs)`);
}

// ---------- data changelog (site/data/changelog.json, #19) ----------
// The method page's dated list of data changes a visitor would notice. Neutral by construction: a placement entry has no
// text (it is rendered from parties.json names and topics.json axis labels), and the other kinds name parties and topics
// only as {party:<id>} / {topic:<id>} tokens. `reviewed` is the fingerprint of the data files when the list was last
// checked, so any data change fails validate until it gets an entry or an explicit `node scripts/changelog.mjs --ack`.
export const CHANGELOG_FILE = 'changelog.json';
export const CHANGE_KINDS = ['results', 'placement', 'name', 'scenario', 'recommendations'];
const TOKEN = /\{(party|topic):([^}]*)\}/g;

// sha256 of every data file the site shows, except the changelog itself, in name order.
export function dataFingerprint(dir = DATA) {
  const h = createHash('sha256');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && x !== CHANGELOG_FILE).sort()) h.update(`${f}\n`).update(readFileSync(join(dir, f)));
  return h.digest('hex');
}

export function validateChangelog(log, { parties, topics, positions, fingerprint }) {
  const errors = [];
  if (!log || !Array.isArray(log.entries) || !log.entries.length) return ['changelog: entries missing or empty'];
  const pids = new Set(parties.map((p) => p.id));
  const tids = new Set(topics.map((t) => t.id));
  const live = new Map(positions.map((p) => [key(p), p.position]));
  const isPos = (v) => v === null || [-2, -1, 0, 1, 2].includes(v);
  const seen = new Set();
  log.entries.forEach((e, i) => {
    const at = `changelog entry ${i + 1} (${e.date})`;
    if (!isDate(e.date)) errors.push(`${at}: bad date`);
    if (i && e.date > log.entries[i - 1].date) errors.push(`${at}: entries must be newest first`);
    if (!CHANGE_KINDS.includes(e.kind)) { errors.push(`${at}: unknown kind ${e.kind}`); return; }
    if (e.kind === 'placement') {
      if (!pids.has(e.party) || !tids.has(e.topic)) errors.push(`${at}: unknown party or topic (${e.party}, ${e.topic})`);
      if (!isPos(e.from) || !isPos(e.to) || e.from === e.to) errors.push(`${at}: from/to must be different positions (−2…2 or null)`);
      if ('he' in e || 'en' in e) errors.push(`${at}: a placement entry has no text (it is rendered from the data)`);
      // The newest entry for a cell must say what the data shows now.
      const k = `${e.party}|${e.topic}`;
      if (!seen.has(k) && live.has(k) && live.get(k) !== e.to) errors.push(`${at}: says ${e.party} × ${e.topic} is now ${e.to}, positions.json has ${live.get(k)}`);
      seen.add(k);
      return;
    }
    if (typeof e.he !== 'string' || !e.he.trim()) errors.push(`${at}: missing he`);
    if (typeof e.en !== 'string' || !isEnglish(e.en.replace(TOKEN, 'x'))) errors.push(`${at}: missing or non-English en`);
    const tokens = (s) => [...(s ?? '').matchAll(TOKEN)].map((m) => `${m[1]}:${m[2]}`).sort().join();
    for (const f of ['he', 'en']) if (/[{}]/.test((e[f] ?? '').replace(TOKEN, ''))) errors.push(`${at}: ${f} has a brace that is not a {party:<id>} or {topic:<id>} token`);
    for (const t of [...(e.he ?? '').matchAll(TOKEN)]) if (!(t[1] === 'party' ? pids : tids).has(t[2])) errors.push(`${at}: unknown ${t[1]} ${t[2]}`);
    if (tokens(e.he) !== tokens(e.en)) errors.push(`${at}: he and en must name the same parties and topics`);
  });
  if (log.reviewed !== fingerprint) errors.push('changelog: the data changed since the changelog was last reviewed. Add an entry to site/data/changelog.json for a change a visitor would notice, then run node scripts/changelog.mjs --ack');
  return errors;
}
