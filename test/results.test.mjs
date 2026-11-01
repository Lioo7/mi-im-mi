import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, validateResults } from '../scripts/lib.mjs';

const { parties, meta, results } = loadData();
const seatsOf = (id) => {
  const l = results.lists.find((x) => x.parties.includes(id));
  return l.split?.[id] ?? l.seats;
};

test('results file passes validation in the current mode', () => {
  assert.deepEqual(validateResults(meta, results, parties), []);
});

test('CEC seats sum to 120', () => {
  assert.equal(results.lists.reduce((n, l) => n + l.seats, 0), 120);
  assert.equal(parties.reduce((n, p) => n + seatsOf(p.id), 0), 120);
});

test('published CEC seats, entered as published (not computed)', () => {
  const expected = {
    likud: 27, yashar: 21, together: 12, 'joint-list': 11, democrats: 8, raam: 8, 'yisrael-beiteinu': 7,
    'otzma-yehudit': 7, utj: 7, shas: 6, 'religious-zionism': 5, zehut: 1, kalkalit: 0, 'amcha-yisrael': 0,
  };
  for (const p of parties) assert.equal(seatsOf(p.id), expected[p.id], p.id);
});

test('ט is one CEC list split 5+1 by Zehut slots; only the two lists under the threshold have 0 seats', () => {
  const t = results.lists.find((l) => l.parties.includes('zehut'));
  assert.deepEqual(t.parties, ['religious-zionism', 'zehut']);
  assert.deepEqual(t.split, { 'religious-zionism': 5, zehut: 1 });
  assert.deepEqual(results.lists.filter((l) => l.seats === 0).map((l) => l.parties[0]).sort(), ['amcha-yisrael', 'kalkalit']);
  for (const l of results.lists) assert.equal(l.seats === 0, l.pct < results.threshold);
});

test('validateResults catches a wrong total, a missing party and a bad split', () => {
  const r = structuredClone(results);
  r.lists[0].seats += 1;
  assert.ok(validateResults(meta, r, parties).some((e) => e.includes('sum to 121')));
  const missing = { ...results, lists: results.lists.filter((l) => !l.parties.includes('shas')) };
  assert.ok(validateResults(meta, missing, parties).some((e) => e.includes('shas')));
  const split = structuredClone(results);
  split.lists.find((l) => l.split).split.zehut = 2;
  assert.ok(validateResults(meta, split, parties).some((e) => e.includes('split')));
  assert.ok(validateResults({ ...meta, mode: 'nope' }, results, parties).some((e) => e.includes('mode')));
  assert.deepEqual(validateResults({ ...meta, mode: 'polls' }, null, parties), [], 'polls mode needs no results file');
});
