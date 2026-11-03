// Shared helpers for the data scripts: paths, JSON IO, CSV, validation. Node built-ins only.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = join(ROOT, 'site', 'data');
export const MERGED = join(ROOT, 'research', 'merged.json');
export const REVIEW_CSV = join(ROOT, 'review', 'positions_review.csv');

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
export const exists = existsSync;
export const RESULTS_FILE = 'results-26.json';
export const SCENARIOS_FILE = 'scenarios.json';

export function loadData() {
  return {
    parties: readJson(join(DATA, 'parties.json')),
    topics: readJson(join(DATA, 'topics.json')),
    meta: readJson(join(DATA, 'meta.json')),
    positions: exists(join(DATA, 'positions.json')) ? readJson(join(DATA, 'positions.json')) : [],
    results: exists(join(DATA, RESULTS_FILE)) ? readJson(join(DATA, RESULTS_FILE)) : null,
    scenarios: exists(join(DATA, SCENARIOS_FILE)) ? readJson(join(DATA, SCENARIOS_FILE)) : null,
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
const isHttps = (u) => typeof u === 'string' && /^https?:\/\/[^\s]+$/.test(u);
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
    }
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
export function validateEnglish({ parties, meta, results, scenarios }) {
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
  need('meta', meta, ['pollNote', 'resultsStatus']);
  for (const l of results?.lists ?? []) need(`results list ${l.parties.join('+')}`, l, ['splitNote']);
  for (const sc of scenarios?.scenarios ?? []) for (const src of sc.sources ?? []) need(`scenario ${sc.id} source ${src.url}`, src, ['outlet', 'by']);
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
