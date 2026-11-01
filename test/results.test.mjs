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

test('mode switch: meta.mode alone flips seats and order between polls and results', async () => {
  const { contextFor } = await import('../site/js/compat.js');
  const { topics, positions } = loadData();
  const ctxFor = (mode) => contextFor({ meta: { ...meta, mode }, parties, topics, positions, results });

  const polls = ctxFor('polls');
  assert.equal(polls.mode, 'polls');
  assert.deepEqual(polls.parties.map((p) => p.id), parties.map((p) => p.id), 'polls: parties.json (poll) order');
  for (const p of parties) assert.equal(polls.seatsOf(p.id), p.pollAvg ?? 0, `polls: ${p.id} seats = pollAvg`);
  assert.ok(parties.every((p) => polls.passed(p.id)), 'polls: every party selectable');

  const res = ctxFor('results');
  assert.equal(res.mode, 'results');
  for (const p of parties) assert.equal(res.seatsOf(p.id), seatsOf(p.id), `results: ${p.id} CEC seats`);
  assert.deepEqual(res.parties.map((p) => p.id), [
    'likud', 'yashar', 'together', 'joint-list', 'democrats', 'raam', 'yisrael-beiteinu',
    'otzma-yehudit', 'utj', 'shas', 'religious-zionism', 'zehut', 'kalkalit', 'amcha-yisrael',
  ], 'results: seats, then votes (Yisrael Beiteinu has more votes than Ra\'am but fewer seats)');
  assert.deepEqual(res.parties.filter((p) => !res.passed(p.id)).map((p) => p.id), ['kalkalit', 'amcha-yisrael']);
  assert.ok(parties.every((p, i) => p.pollAvg === loadData().parties[i].pollAvg), 'pollAvg untouched');

  // Seats hidden is a polls-mode setting; results are official and always shown.
  const hidden = contextFor({ meta: { ...meta, mode: 'polls', showSeats: false }, parties, topics, positions, results });
  assert.equal(hidden.rankBySeats, false);
  assert.equal(contextFor({ meta: { ...meta, mode: 'results', showSeats: false }, parties, topics, positions, results }).seatsOf('likud'), 27);
});

test('results mode: bloc presets skip lists under the threshold', async () => {
  const { contextFor, presets } = await import('../site/js/compat.js');
  const { topics, positions } = loadData();
  const ctx = contextFor({ meta: { ...meta, mode: 'results' }, parties, topics, positions, results });
  for (const p of Object.values(presets(ctx))) assert.ok(p.members.every((id) => ctx.passed(id)));
});

test('completions on the CEC results: the 53-seat bloc needs one more list of 8+ seats', async () => {
  const { contextFor, completions } = await import('../site/js/compat.js');
  const { topics, positions } = loadData();
  const ctx = contextFor({ meta: { ...meta, mode: 'results' }, parties, topics, positions, results });
  const c = completions(ctx, ['likud', 'otzma-yehudit', 'shas', 'utj', 'religious-zionism', 'zehut']);
  assert.deepEqual(c.list.map((x) => [x.add.join('+'), x.seats, x.total]), [
    ['democrats', 8, 61], ['raam', 8, 61], ['joint-list', 11, 64], ['together', 12, 65], ['yashar', 21, 74],
  ]);
  assert.ok(c.list.every((x) => !x.add.some((id) => ['kalkalit', 'amcha-yisrael'].includes(id))), 'lists under the threshold are never added');
});

test('investiture on the CEC results for the media scenarios (roles as reported)', async () => {
  const { contextFor, investiture } = await import('../site/js/compat.js');
  const { topics, positions } = loadData();
  const ctx = contextFor({ meta: { ...meta, mode: 'results' }, parties, topics, positions, results });
  const members = ['yashar', 'together', 'democrats', 'yisrael-beiteinu'];
  const a = investiture(ctx, { members, supporters: ['raam'] });
  assert.deepEqual([a.for, a.against, a.abstain, a.approved], [56, 64, 0, false]);
  const b = investiture(ctx, { members, supporters: ['joint-list'], abstainers: ['raam', 'utj'] });
  assert.deepEqual([b.for, b.against, b.abstain, b.approved], [59, 46, 15, true]);
  const c = investiture(ctx, { members: ['likud', 'yashar', 'otzma-yehudit', 'religious-zionism', 'zehut'] });
  assert.deepEqual([c.membersSeats, c.membersMajority, c.approved], [61, true, true]);
});
