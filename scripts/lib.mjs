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

export function loadData() {
  return {
    parties: readJson(join(DATA, 'parties.json')),
    topics: readJson(join(DATA, 'topics.json')),
    meta: readJson(join(DATA, 'meta.json')),
    positions: exists(join(DATA, 'positions.json')) ? readJson(join(DATA, 'positions.json')) : [],
  };
}

// Fields published in site/data/positions.json, in output order.
export const PUBLIC_FIELDS = [
  'partyId', 'topicId', 'position', 'redLine', 'summary', 'quote', 'quoteBy',
  'sourceUrl', 'sourceType', 'sourceDate', 'viaUrl', 'archiveUrl', 'confidence', 'componentsDisagree',
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
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

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

export function validateTopics(topics) {
  const errors = [];
  if (topics.length !== 8) errors.push(`topics: expected 8, got ${topics.length}`);
  for (const t of topics) {
    for (const k of ['-2', '-1', '0', '1', '2']) if (!t.axis?.[k]) errors.push(`topic ${t.id}: missing axis label ${k}`);
    if (!t.short || !t.name) errors.push(`topic ${t.id}: missing name/short`);
  }
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
    if (p.position !== null) {
      if (!isHttps(p.sourceUrl)) errors.push(`${at}: missing or invalid sourceUrl`);
      if (!SOURCE_TYPES.includes(p.sourceType)) errors.push(`${at}: bad sourceType "${p.sourceType}"`);
      // Undated source pages keep sourceDate null rather than an invented date.
      if (p.sourceDate != null && !isDate(p.sourceDate)) errors.push(`${at}: bad sourceDate "${p.sourceDate}"`);
    }
    if (p.viaUrl && !isHttps(p.viaUrl)) errors.push(`${at}: invalid viaUrl`);
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
