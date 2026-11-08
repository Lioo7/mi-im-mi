// The data changelog (#19): well-formed, neutral by construction, in step with positions.json, and reviewed since the
// last data change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, validateChangelog, dataFingerprint } from '../scripts/lib.mjs';

const { parties, topics, positions, changelog } = loadData();
const ctx = { parties, topics, positions, fingerprint: dataFingerprint() };
const check = (log, c = ctx) => validateChangelog(log, c).join('\n');
const withEntries = (...entries) => ({ ...changelog, entries });
const text = { date: '2026-11-01', kind: 'scenario', he: 'נוסף תרחיש: {party:likud}.', en: 'Added a scenario: {party:likud}.' };
const zehutCrime = positions.find((p) => p.partyId === 'zehut' && p.topicId === 'crime').position;

test('the committed changelog passes, and was reviewed for the current data', () => {
  assert.equal(check(changelog), '');
});

test('a data change without a review fails, with the instruction', () => {
  assert.match(check(changelog, { ...ctx, fingerprint: 'other' }), /data changed since the changelog was last reviewed.*changelog\.mjs --ack/);
});

test('entries are newest first, of a known kind, in both languages, naming only real parties', () => {
  assert.match(check(withEntries(text, { ...text, date: '2026-11-02' })), /newest first/);
  assert.match(check(withEntries({ ...text, kind: 'opinion' })), /unknown kind opinion/);
  assert.match(check(withEntries({ ...text, en: '' })), /missing or non-English en/);
  assert.match(check(withEntries({ ...text, he: 'נוסף תרחיש: {party:nope}.', en: 'Added: {party:nope}.' })), /unknown party nope/);
  assert.match(check(withEntries({ ...text, en: 'Added a scenario.' })), /same parties and topics/);
  assert.match(check(withEntries({ ...text, he: 'נוסף תרחיש: {likud}.', en: 'Added a scenario: {likud}.' })), /brace that is not/);
});

test('a placement entry has no text, and the newest one for a cell matches the live position', () => {
  const pl = { date: '2026-11-02', kind: 'placement', party: 'zehut', topic: 'crime', from: 1, to: zehutCrime };
  assert.equal(check(withEntries(pl)), '');
  assert.match(check(withEntries({ ...pl, to: zehutCrime === 2 ? 1 : 2, from: 0 })), /positions\.json has/);
  assert.match(check(withEntries({ ...pl, he: 'x' })), /has no text/);
  assert.match(check(withEntries({ ...pl, from: zehutCrime })), /must be different/);
  // An older entry for the same cell may name an earlier position.
  assert.equal(check(withEntries(pl, { ...pl, date: '2026-11-01', from: 0, to: 1 })), '');
});
