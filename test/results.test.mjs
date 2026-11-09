import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, validateResults, validateScenarios } from '../scripts/lib.mjs';

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

test('closest coalitions on the CEC results: minimal, 61+, with X; silent partners only in the partial list', async () => {
  const { contextFor, completions, closestTo, coverage } = await import('../site/js/compat.js');
  const { topics, positions } = loadData();
  const ctx = contextFor({ meta: { ...meta, mode: 'results' }, parties, topics, positions, results });
  for (const p of parties) {
    const r = closestTo(ctx, p.id);
    if (!ctx.passed(p.id)) { assert.equal(r.total, 0, p.id); continue; }
    assert.equal(r.full.length + r.partial.length, completions(ctx, [p.id]).total, p.id);
    for (const c of [...r.full, ...r.partial]) {
      const sum = (ids) => ids.reduce((n, id) => n + ctx.seatsOf(id), 0);
      assert.equal(c.members[0], p.id);
      assert.ok(sum(c.members) >= 61, `${c.members} reaches 61`);
      assert.ok(c.add.every((id) => sum(c.members) - ctx.seatsOf(id) < 61), `${c.members} is minimal`);
      assert.ok(c.add.every((id) => ctx.passed(id)));
    }
    assert.ok(r.full.every((c) => c.add.every((id) => topics.length - coverage(ctx, id) < 3)), `${p.id}: a silent partner in the main list`);
    assert.ok(r.partial.every((c) => c.add.some((id) => topics.length - coverage(ctx, id) >= 3)), p.id);
  }
});

test('media scenarios: valid, at most 4, and their investiture math on the CEC results', async () => {
  const { contextFor, investiture } = await import('../site/js/compat.js');
  const { topics, positions, scenarios } = loadData();
  assert.deepEqual(validateScenarios({ ...meta, mode: 'results' }, scenarios, parties, results), []);
  const ctx = contextFor({ meta: { ...meta, mode: 'results' }, parties, topics, positions, results });
  const vote = (id) => {
    const v = investiture(ctx, scenarios.scenarios.find((x) => x.id === id));
    return [v.for, v.against, v.abstain, v.approved, v.membersSeats];
  };
  assert.equal(scenarios.scenarios.length, 4);
  assert.ok(scenarios.scenarios.every((sc) => !('note' in sc)), 'notes live in decisions.md, not in the data');
  // mako 28.10 + Tibi 31.10: הרשימה המשותפת supporting, רע״ם abstaining: 59 vs 53. Unlike ynet, יהדות התורה votes against.
  assert.deepEqual(vote('change-arab-not-opposing'), [59, 53, 8, true, 48]);
  // JPost 29.10: "Smotrich" means the whole ט list (joint-list rule), so זהות is in: 61 vs 59.
  assert.deepEqual(vote('likud-yashar-right'), [61, 59, 0, true, 61]);
  // d (Amit Segal, kipa 31.10): "33 + 33" = הליכוד 27 + the full ט list 6, ישר! 21 + ביחד 12.
  assert.deepEqual(vote('segal-unity'), [66, 54, 0, true, 66]);
  // mako 5.11 (Amit Segal): "48 חברי גוש השינוי, לצד 13 חברי הכנסת של המפלגות החרדיות, יהדות התורה וש"ס". 48 = ישר! 21 +
  // ביחד 12 + הדמוקרטים 8 + ישראל ביתנו 7, the four parties of the change bloc (bakalpi); 13 = יהדות התורה 7 + ש״ס 6.
  assert.deepEqual(vote('change-haredim'), [61, 59, 0, true, 61]);
  const ch = scenarios.scenarios.find((x) => x.id === 'change-haredim');
  assert.equal(parties.filter((p) => p.bloc === 'opposition').map((p) => p.id).sort().join(), ['yashar', 'together', 'democrats', 'yisrael-beiteinu'].sort().join());
  // 8.11: Liberman's statement (ynet, 6.11) replaced Yisrael Beytenu's denial (The Jerusalem Post, 5.11), with UTJ's
  // response (Asher, same article) and Shas's denial (mako, 7.11). The prefixes are generated from the party's name.
  assert.deepEqual(ch.sources.map((x) => [x.by ?? null, x.responseBy ?? null, x.denialBy ?? null]),
    [[null, null, null], ['אביגדור ליברמן', null, null], [null, 'utj', null], [null, null, 'shas']]);
  // Scenario 3 keeps its sources and adds Yisrael Beytenu's rejection (ynet, 6.11): the refusing party is a member.
  const ca = scenarios.scenarios.find((x) => x.id === 'change-arab-not-opposing');
  assert.deepEqual(ca.sources.map((x) => x.refusalBy ?? null), [null, null, 'yisrael-beiteinu']);
  assert.ok(ca.members.includes('yisrael-beiteinu'));
});

test('media scenarios, share text (#1): the supporters\' and abstainers\' clashes on the real data', async () => {
  const { contextFor, peripheryClashes } = await import('../site/js/compat.js');
  const { topics, positions, scenarios } = loadData();
  const ctx = contextFor({ meta: { ...meta, mode: 'results' }, parties, topics, positions, results });
  const sc = (id) => scenarios.scenarios.find((x) => x.id === id);
  // הרשימה המשותפת 4 + רע״ם 3; the two scenarios without supporters or abstainers keep today's text.
  assert.equal(peripheryClashes(ctx, sc('change-arab-not-opposing')), 7);
  assert.equal(peripheryClashes(ctx, sc('likud-yashar-right')), null);
  assert.equal(peripheryClashes(ctx, sc('segal-unity')), null);
});

test('red-line summary (#14) on the real data: none in the first three media scenarios, four in the Haredi one, two in the coalition bloc', async () => {
  const { contextFor, redLinesCrossed, completions, presets } = await import('../site/js/compat.js');
  const { topics, positions, scenarios } = loadData();
  const ctx = contextFor({ meta: { ...meta, mode: 'results' }, parties, topics, positions, results });
  for (const sc of scenarios.scenarios.filter((x) => x.id !== 'change-haredim')) assert.deepEqual(redLinesCrossed(ctx, sc.members), [], sc.id);
  // ישראל ביתנו's draft and inquiry red lines and the Haredi parties' draft red lines: the 4 of #31's example.
  assert.deepEqual(redLinesCrossed(ctx, scenarios.scenarios.find((x) => x.id === 'change-haredim').members), [
    { partyId: 'yisrael-beiteinu', topicId: 'draft' }, { partyId: 'utj', topicId: 'draft' }, { partyId: 'shas', topicId: 'draft' }, { partyId: 'yisrael-beiteinu', topicId: 'inquiry' },
  ]);
  const bloc = presets(ctx).coalition.members;
  const crossed = redLinesCrossed(ctx, bloc);
  assert.deepEqual(crossed, [{ partyId: 'utj', topicId: 'draft' }, { partyId: 'shas', topicId: 'draft' }]);
  assert.deepEqual(completions(ctx, bloc).currentRedLines, crossed);
});

test('pivotal parties (#13) on the real data: the four media scenarios', async () => {
  const { contextFor, pivotal } = await import('../site/js/compat.js');
  const { topics, positions, scenarios } = loadData();
  const ctx = contextFor({ meta: { ...meta, mode: 'results' }, parties, topics, positions, results });
  const rows = (id) => pivotal(ctx, scenarios.scenarios.find((x) => x.id === id))
    .map((p) => [p.partyId, p.role, p.breaksMajority ? p.vote.membersSeats : null, p.vote.for, p.vote.against]);
  // 59 vs 53 with רע״ם abstaining: every member and the supporter, and רע״ם voting against makes it 59 vs 61.
  assert.deepEqual(rows('change-arab-not-opposing'), [
    ['yashar', 'member', null, 38, 74], ['together', 'member', null, 47, 65], ['democrats', 'member', null, 51, 61],
    ['yisrael-beiteinu', 'member', null, 52, 60], ['joint-list', 'supporter', null, 48, 64], ['raam', 'abstainer', null, 59, 61],
  ]);
  // Exactly 61: every member; without זהות it is a 60–60 tie.
  assert.deepEqual(rows('likud-yashar-right'), [
    ['likud', 'member', 34, 34, 86], ['yashar', 'member', 40, 40, 80], ['otzma-yehudit', 'member', 54, 54, 66],
    ['religious-zionism', 'member', 56, 56, 64], ['zehut', 'member', 60, 60, 60],
  ]);
  // 66: הציונות הדתית (5) and זהות (1) can each leave.
  assert.deepEqual(rows('segal-unity'), [['likud', 'member', 39, 39, 81], ['yashar', 'member', 45, 45, 75], ['together', 'member', 54, 54, 66]]);
  // Exactly 61: every member.
  assert.deepEqual(rows('change-haredim'), [
    ['yashar', 'member', 40, 40, 80], ['together', 'member', 49, 49, 71], ['democrats', 'member', 53, 53, 67],
    ['yisrael-beiteinu', 'member', 54, 54, 66], ['utj', 'member', 54, 54, 66], ['shas', 'member', 55, 55, 65],
  ]);
});

test('validateScenarios rejects a fifth scenario, double roles, seatless lists and undated sources', () => {
  const { scenarios } = loadData();
  const m = { ...meta, mode: 'results' };
  const one = scenarios.scenarios[0];
  const bad = (sc) => validateScenarios(m, { ...scenarios, scenarios: [sc] }, parties, results);
  const five = ['x1', 'x2', 'x3', 'x4', 'x5'].map((id) => ({ ...one, id }));
  assert.ok(validateScenarios(m, { ...scenarios, scenarios: five }, parties, results).some((e) => e.includes('1–4')));
  assert.ok(bad({ ...one, supporters: [one.members[0]] }).some((e) => e.includes('two roles')));
  assert.ok(bad({ ...one, abstainers: ['kalkalit'] }).some((e) => e.includes('kalkalit')));
  assert.ok(bad({ ...one, sources: [{ outlet: 'x', url: 'https://x.y' }] }).some((e) => e.includes('date')));
  for (const f of ['denialBy', 'refusalBy', 'responseBy']) {
    assert.ok(bad({ ...one, sources: [{ ...one.sources[0], [f]: 'likud' }] }).some((e) => e.includes(f)), `${f} names a party of the scenario`);
  }
  assert.ok(bad({ ...one, sources: [{ ...one.sources[0], denialBy: one.members[0], responseBy: one.members[0] }] }).some((e) => e.includes('at most one')), 'one reply per source');
  assert.deepEqual(validateScenarios({ ...meta, mode: 'polls' }, null, parties, results), [], 'polls mode needs no scenarios');
});

test('results mode: הציונות הדתית and זהות are chosen and counted independently; polls mode keeps the link', async () => {
  const { contextFor, completions } = await import('../site/js/compat.js');
  const { topics, positions } = loadData();
  const change = ['yashar', 'together', 'democrats', 'yisrael-beiteinu'];
  const res = contextFor({ meta: { ...meta, mode: 'results' }, parties, topics, positions, results });
  assert.equal(res.linkedOf('religious-zionism'), null);
  const r = completions(res, change).list.map((x) => x.add);
  assert.ok(r.some((add) => add.includes('religious-zionism') && !add.includes('zehut')), 'religious-zionism (5) on its own');
  assert.ok(r.every((add) => !add.includes('zehut') || add.length > 1), 'zehut (1) never completes alone');
  const polls = contextFor({ meta: { ...meta, mode: 'polls' }, parties, topics, positions, results });
  assert.equal(polls.linkedOf('religious-zionism'), 'zehut');
  assert.ok(completions(polls, change).list.every((x) => x.add.includes('zehut') === x.add.includes('religious-zionism')));
});

test('seatsByPosition on the CEC results: every topic\'s labels and no-position group add up to the members\' seats', async () => {
  const { contextFor, seatsByPosition, investiture } = await import('../site/js/compat.js');
  const { topics, positions } = loadData();
  const ctx = contextFor({ meta: { ...meta, mode: 'results' }, parties, topics, positions, results });
  const everyone = ctx.parties.filter((p) => ctx.passed(p.id)).map((p) => p.id);
  for (const members of [everyone, ['likud', 'otzma-yehudit', 'shas', 'utj', 'religious-zionism', 'zehut']]) {
    for (const t of topics) {
      const r = seatsByPosition(ctx, members, t.id);
      const total = r.byPosition.reduce((n, g) => n + g.seats, 0) + r.noPosition.seats;
      assert.equal(total, investiture(ctx, { members }).membersSeats, `${t.id}: ${members.join('+')}`);
    }
  }
  assert.equal(investiture(ctx, { members: everyone }).membersSeats, 120);
});
