import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  level, makeContext, topicStatus, crises, glue, friction, overall, newClashTopics,
  matrixCell, pairSummary, investiture, periphery, analyze, without, presets, parseState, serializeState,
  parseLocation, parsePair, locationFor, moveLegacyState, localize, contextFor,
  withLinked, lowCoverage, addImpact, breakdown, ballotOrder, selected, completions, redLinesCrossed, closestTo, groupRedLines,
  peripheryClashes, pivotal, coalitionGroups, canUndo,
} from '../site/js/compat.js';

const P = (partyId, topicId, position, redLine = false) => ({ partyId, topicId, position, redLine });

// Bloc "x" = a, b, c; bloc "y" = d, e. Topics t1..t3.
function fixture(positions) {
  return makeContext({
    parties: [
      { id: 'a', pollAvg: 30, bloc: 'x', threshold: 'above' },
      { id: 'b', pollAvg: 20, bloc: 'y', threshold: 'above' },
      { id: 'c', pollAvg: 10, bloc: 'x', threshold: 'above' },
      { id: 'd', pollAvg: 8, bloc: 'y', threshold: 'above' },
      { id: 'e', pollAvg: 4, bloc: null, threshold: 'borderline' },
    ],
    topics: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
    positions,
  });
}

test('level thresholds by distance', () => {
  const at = (x) => ({ position: x, redLine: false });
  assert.equal(level(at(0), at(0)).level, 'AGREE');
  assert.equal(level(at(-1), at(0)).level, 'MINOR');
  assert.equal(level(at(-1), at(1)).level, 'MAJOR');
  assert.equal(level(at(-2), at(1)).level, 'CLASH');
  assert.equal(level(at(-2), at(2)).level, 'CLASH');
});

test('red line escalates distance 2 to CLASH, but not distance 1', () => {
  const r = { position: -1, redLine: true };
  const two = level(r, { position: 1, redLine: false });
  assert.equal(two.level, 'CLASH');
  assert.equal(two.byRedLine, true);
  assert.equal(level(r, { position: 0, redLine: false }).level, 'MINOR');
  assert.equal(level({ position: -2, redLine: true }, { position: 1 }).byRedLine, false);
});

test('null or missing positions give NONE', () => {
  assert.equal(level({ position: null }, { position: 1 }).level, 'NONE');
  assert.equal(level(undefined, { position: 1 }).level, 'NONE');
});

test('level is symmetric', () => {
  for (const x of [-2, -1, 0, 1, 2]) for (const y of [-2, -1, 0, 1, 2]) for (const r of [true, false]) {
    const a = { position: x, redLine: r };
    const b = { position: y, redLine: false };
    assert.deepEqual(level(a, b), level(b, a));
  }
});

test('mirrored positions give identical results', () => {
  const pos = [P('a', 't1', -2), P('b', 't1', 1, true), P('c', 't1', 0), P('a', 't2', 1), P('b', 't2', 2), P('c', 't2', null)];
  const mirrored = pos.map((p) => ({ ...p, position: p.position == null ? null : -p.position }));
  const s = { members: ['a', 'b', 'c'], base: null, outside: [] };
  const r1 = analyze(fixture(pos), s);
  const r2 = analyze(fixture(mirrored), s);
  assert.deepEqual(r1.statuses.map((x) => x.status), r2.statuses.map((x) => x.status));
  assert.deepEqual(r1.crises, r2.crises);
  assert.deepEqual(r1.friction, r2.friction);
});

test('topic status is the worst pair; NODATA when fewer than 2 positions', () => {
  const ctx = fixture([P('a', 't1', 0), P('b', 't1', 1), P('c', 't1', 2), P('a', 't2', 1), P('b', 't2', null)]);
  assert.equal(topicStatus(ctx, ['a', 'b', 'c'], 't1').status, 'MAJOR');
  const t2 = topicStatus(ctx, ['a', 'b', 'c'], 't2');
  assert.equal(t2.status, 'NODATA');
  assert.equal(t2.withPosition, 1);
});

test('crises: only CLASH/MAJOR, one per topic, worst first, max 3', () => {
  const ctx = fixture([
    P('a', 't1', -1), P('b', 't1', 1), // MAJOR
    P('a', 't2', -2), P('b', 't2', 2), P('c', 't2', 2), // CLASH d=4, two pairs
    P('a', 't3', 0), P('b', 't3', 0), // AGREE
  ]);
  const st = ['t1', 't2', 't3'].map((t) => topicStatus(ctx, ['a', 'b', 'c'], t));
  const c = crises(ctx, st);
  assert.deepEqual(c.map((x) => x.topicId), ['t2', 't1']);
  assert.equal(c[0].worst.level, 'CLASH');
  assert.equal(c[0].morePairs, 1);
});

test('crisis tie-break: red line, then combined seats', () => {
  const ctx = fixture([
    P('c', 't1', -1), P('d', 't1', 1, true), // CLASH by red line, d=2, seats 18
    P('a', 't2', -1), P('b', 't2', 1, true), // CLASH by red line, d=2, seats 50
  ]);
  const st = ['t1', 't2', 't3'].map((t) => topicStatus(ctx, ['a', 'b', 'c', 'd'], t));
  assert.deepEqual(crises(ctx, st).map((x) => x.topicId), ['t2', 't1']);
});

test('glue: AGREE before MINOR, with coverage', () => {
  const ctx = fixture([P('a', 't1', 1), P('b', 't1', 2), P('a', 't2', 0), P('b', 't2', 0), P('c', 't2', null)]);
  const st = ['t1', 't2', 't3'].map((t) => topicStatus(ctx, ['a', 'b', 'c'], t));
  const g = glue(st);
  assert.deepEqual(g.map((x) => [x.topicId, x.status]), [['t2', 'AGREE'], ['t1', 'MINOR']]);
  assert.equal(g[0].withPosition, 2);
  assert.equal(g[0].total, 3);
});

test('friction: needs 3 members, excludes base, reports ties', () => {
  const ctx = fixture([P('a', 't1', 0), P('b', 't1', 2), P('c', 't1', -2)]);
  assert.deepEqual(friction(ctx, ['a', 'b'], null), []);
  // b and c clash (d=4): each scores 3 + 1 (MAJOR vs a) = 4; a scores 1 + 1 = 2.
  assert.deepEqual(friction(ctx, ['a', 'b', 'c'], null).map((f) => f.partyId), ['b', 'c']);
  assert.deepEqual(friction(ctx, ['a', 'b', 'c'], 'b').map((f) => f.partyId), ['c']);
});

test('friction is empty when there is no friction', () => {
  const ctx = fixture([P('a', 't1', 0), P('b', 't1', 0), P('c', 't1', 1)]);
  assert.deepEqual(friction(ctx, ['a', 'b', 'c'], null), []);
});

test('overall counts clash-free topics among topics with data', () => {
  const ctx = fixture([P('a', 't1', -2), P('b', 't1', 2), P('a', 't2', 0), P('b', 't2', 1)]);
  const st = ['t1', 't2', 't3'].map((t) => topicStatus(ctx, ['a', 'b'], t));
  assert.deepEqual(overall(st), { clashFree: 1, of: 2 });
});

test('newClashTopics counts topics, not pairs', () => {
  const ctx = fixture([P('a', 't1', -2), P('b', 't1', -2), P('c', 't1', 2), P('a', 't2', 0), P('c', 't2', 1)]);
  assert.equal(newClashTopics(ctx, 'c', ['a', 'b']), 1);
  assert.equal(newClashTopics(ctx, 'c', []), 0);
});

test('matrix cell vs base, base null, and worst-vs-any without base', () => {
  const ctx = fixture([P('a', 't1', 0), P('b', 't1', 2), P('c', 't1', -1), P('a', 't2', null), P('b', 't2', 1)]);
  assert.equal(matrixCell(ctx, 'a', 't1', ['a', 'b', 'c'], 'a').level, 'REF');
  assert.equal(matrixCell(ctx, 'b', 't1', ['a', 'b', 'c'], 'a').level, 'MAJOR');
  assert.equal(matrixCell(ctx, 'b', 't2', ['a', 'b', 'c'], 'a').level, 'BASE_NULL');
  const worst = matrixCell(ctx, 'c', 't1', ['a', 'b', 'c'], null);
  assert.equal(worst.level, 'CLASH');
  assert.equal(worst.ref, 'b');
});

test('pair summary counts only topics where both have positions', () => {
  const ctx = fixture([P('a', 't1', 0), P('b', 't1', 0), P('a', 't2', -2), P('b', 't2', 2), P('a', 't3', 1)]);
  const s = pairSummary(ctx, 'a', 'b');
  assert.equal(s.n, 2);
  assert.deepEqual(s.counts, { AGREE: 1, MINOR: 0, MAJOR: 0, CLASH: 1 });
  // Rows follow the fixed topic order (never severity); a topic without both positions is NONE and not counted.
  assert.deepEqual(s.rows.map((r) => [r.topicId, r.level]), [['t1', 'AGREE'], ['t2', 'CLASH'], ['t3', 'NONE']]);
});

test('pair summary marks a clash made by a declared red line, the same in either order', () => {
  const ctx = fixture([P('a', 't1', 0, true), P('b', 't1', 2), P('a', 't2', 0), P('b', 't2', 2)]);
  for (const [x, y] of [['a', 'b'], ['b', 'a']]) {
    const [t1, t2] = pairSummary(ctx, x, y).rows;
    assert.deepEqual([t1.level, t1.byRedLine, t2.level, t2.byRedLine], ['CLASH', true, 'MAJOR', false]);
  }
});

// Seats in the fixture: a 30, b 20, c 10, d 8, e 4 (all 72).
test('investiture: for = members + supporters, against = everyone else except abstainers', () => {
  const ctx = fixture([]);
  assert.deepEqual(investiture(ctx, { members: ['a', 'e'], supporters: ['b'], abstainers: ['c'] }), {
    for: 54, against: 8, abstain: 10, approved: true, membersSeats: 34, membersMajority: false, missing: 27, borderline: 4,
  });
  // Without the abstention, c votes against: 54 vs 18.
  assert.equal(investiture(ctx, { members: ['a', 'e'], supporters: ['b'] }).against, 18);
  // Members only, everyone else against: 30 vs 42.
  const alone = investiture(ctx, { members: ['a'] });
  assert.deepEqual([alone.for, alone.against, alone.abstain, alone.approved], [30, 42, 0, false]);
});

test('investiture: a tie is not approved; abstainers count on neither side', () => {
  const ctx = fixture([]);
  // a alone (30) vs b + c (30), with d and e (12) abstaining.
  const tie = investiture(ctx, { members: ['a'], abstainers: ['d', 'e'] });
  assert.deepEqual([tie.for, tie.against, tie.abstain, tie.approved], [30, 30, 12, false]);
  const nobody = investiture(ctx, { members: [] });
  assert.deepEqual([nobody.for, nobody.against, nobody.approved], [0, 72, false]);
});

test('investiture: members alone reaching 61 is reported separately from the vote', () => {
  const ctx = makeContext({ parties: [{ id: 'x', pollAvg: 61 }, { id: 'y', pollAvg: 59 }], topics: [], positions: [] });
  const v = investiture(ctx, { members: ['x'] });
  assert.equal(v.membersMajority, true);
  assert.equal(v.missing, 0);
  assert.equal(v.approved, true);
  assert.equal(investiture(ctx, { members: ['y'] }).membersMajority, false);
});

test('analyze counts clashes among members only; supporters and abstainers go to periphery', () => {
  const ctx = fixture([P('a', 't1', -2), P('b', 't1', -2), P('c', 't1', 2), P('d', 't1', 0), P('a', 't2', 0), P('c', 't2', 2)]);
  const state = { members: ['a', 'b'], supporters: ['c'], abstainers: ['d'], base: null };
  const r = analyze(ctx, state);
  assert.equal(r.clashTopics, 0);
  assert.ok(r.statuses.every((s) => s.pairs.every((p) => state.members.includes(p.a) && state.members.includes(p.b))));
  const per = periphery(ctx, state);
  assert.deepEqual(per.map((x) => [x.partyId, x.role]), [['c', 'supporter'], ['d', 'abstainer']]);
  // c vs a and b on t1: both d=4; the tie goes to the pair with more seats (a). t2: c vs a d=2 MAJOR.
  assert.deepEqual(per[0].items.map((i) => [i.topicId, i.b, i.level]), [['t1', 'a', 'CLASH'], ['t2', 'a', 'MAJOR']]);
  // d (0) vs a/b (-2): MAJOR on t1.
  assert.deepEqual(per[1].items.map((i) => [i.topicId, i.level]), [['t1', 'MAJOR']]);
  assert.deepEqual(periphery(ctx, { members: ['a', 'b'] }), []);
});

test('coalitionGroups: members, then the outside parties with their role; outside is empty when all are members', () => {
  assert.deepEqual(coalitionGroups({ members: ['a', 'b'] }), { members: ['a', 'b'], outside: [] });
  assert.deepEqual(coalitionGroups({ members: ['a', 'b'], supporters: [], abstainers: [] }), { members: ['a', 'b'], outside: [] });
  assert.deepEqual(coalitionGroups({ members: ['a', 'b'], supporters: ['c'], abstainers: ['e', 'd'] }), {
    members: ['a', 'b'],
    outside: [{ partyId: 'c', role: 'supporter' }, { partyId: 'e', role: 'abstainer' }, { partyId: 'd', role: 'abstainer' }],
  });
  // Abstainers only, and no members: the groups still split by role.
  assert.deepEqual(coalitionGroups({ members: [], abstainers: ['d'] }), { members: [], outside: [{ partyId: 'd', role: 'abstainer' }] });
  // The input is not shared with the result.
  const st = { members: ['a'], supporters: ['c'] };
  coalitionGroups(st).members.push('x');
  assert.deepEqual(st.members, ['a']);
});

test('peripheryClashes: null without supporters or abstainers, else the CLASH items of periphery()', () => {
  const ctx = fixture([P('a', 't1', -2), P('b', 't1', -2), P('c', 't1', 2), P('d', 't1', 0), P('a', 't2', 0), P('c', 't2', 2), P('d', 't2', 2)]);
  assert.equal(peripheryClashes(ctx, { members: ['a', 'b'] }), null);
  // d: MAJOR on t1 (0 vs -2) and t2 (2 vs 0), no clash.
  assert.equal(peripheryClashes(ctx, { members: ['a', 'b'], abstainers: ['d'] }), 0);
  // c: CLASH on t1 only (t2 is MAJOR); d adds none.
  const state = { members: ['a', 'b'], supporters: ['c'], abstainers: ['d'] };
  assert.equal(peripheryClashes(ctx, state), 1);
  const n = periphery(ctx, state).flatMap((row) => row.items).filter((i) => i.level === 'CLASH').length;
  assert.equal(peripheryClashes(ctx, state), n);
});

test('redLinesCrossed (#14): the same list as completions().currentRedLines; empty with one member or no crossing', () => {
  // a's red line on t1 is crossed by c (2 steps); b's on t2 is not (1 step); d's red line has no other member on t3.
  const ctx = fixture([P('a', 't1', -1, true), P('c', 't1', 1), P('b', 't2', 0, true), P('c', 't2', 1), P('d', 't3', 2, true)]);
  const crossed = redLinesCrossed(ctx, ['a', 'b', 'c']);
  assert.deepEqual(crossed, [{ partyId: 'a', topicId: 't1' }]);
  assert.deepEqual(completions(ctx, ['a', 'b', 'c']).currentRedLines, crossed);
  assert.deepEqual(redLinesCrossed(ctx, ['a']), []);
  assert.deepEqual(redLinesCrossed(ctx, ['b', 'c', 'd']), []);
});

test('groupRedLines (#31): by topic in topic order, parties in party order; display only', () => {
  const ctx = fixture([P('a', 't1', 0)]);
  const lines = [{ partyId: 'c', topicId: 't2' }, { partyId: 'b', topicId: 't1' }, { partyId: 'a', topicId: 't2' }, { partyId: 'd', topicId: 't1' }];
  assert.deepEqual(groupRedLines(ctx, lines), [{ topicId: 't1', partyIds: ['b', 'd'] }, { topicId: 't2', partyIds: ['a', 'c'] }]);
  assert.deepEqual(groupRedLines(ctx, []), []);
  // Every entry stays: the count shown is still the number of party-topic lines.
  assert.equal(groupRedLines(ctx, lines).reduce((n, g) => n + g.partyIds.length, 0), lines.length);
});

test('without() removes a party from any role', () => {
  const ctx = fixture([P('a', 't1', -2), P('b', 't1', 2), P('c', 't1', -2)]);
  const r = without(ctx, { members: ['a', 'b', 'c'], base: 'b' }, 'b');
  assert.equal(r.clashTopics, 0);
  assert.equal(r.vote.membersSeats, 40);
  assert.equal(without(ctx, { members: ['a'], supporters: ['c'] }, 'c').vote.for, 30);
});

// Exact seats (results-style) for the pivotal tests; parties in the given order.
const seated = (pairs) => makeContext({ parties: pairs.map(([id]) => ({ id })), topics: [], positions: [], seats: new Map(pairs) });
const piv = (ctx, state) => pivotal(ctx, state).map((p) => [p.partyId, p.role, p.breaksMajority, p.breaksVote]);

test('pivotal (#13): one member with 61+ breaks both the 61 and the vote', () => {
  const ctx = seated([['x', 62], ['y', 58]]);
  assert.deepEqual(piv(ctx, { members: ['x'] }), [['x', 'member', true, true]]);
});

test('pivotal: with exactly 61, every member with seats breaks the 61', () => {
  const ctx = seated([['a', 30], ['b', 20], ['c', 11], ['d', 59]]);
  const r = pivotal(ctx, { members: ['a', 'b', 'c'] });
  assert.deepEqual(r.map((p) => [p.partyId, p.breaksMajority, p.breaksVote]), [['a', true, true], ['b', true, true], ['c', true, true]]);
  // Without c: members 50, for 50 vs 70 against (c now votes against).
  assert.deepEqual([r[2].vote.membersSeats, r[2].vote.for, r[2].vote.against], [50, 50, 70]);
});

test('pivotal: members short of 61 but the vote passes: only the vote counts, and a supporter never breaks the 61', () => {
  const ctx = seated([['a', 30], ['b', 20], ['c', 11], ['d', 10], ['e', 49]]);
  // for 61 (a + b + c) vs 49, d abstaining. Without d (voting against): 61 vs 59, still a majority.
  assert.deepEqual(piv(ctx, { members: ['a', 'b'], supporters: ['c'], abstainers: ['d'] }),
    [['a', 'member', false, true], ['b', 'member', false, true], ['c', 'supporter', false, true]]);
});

test('pivotal: a removal that leaves a tie fails the vote; a vote that is already a tie lists nobody', () => {
  const ctx = seated([['x', 31], ['y', 29], ['z', 2], ['w', 58]]);
  // 62 vs 58; without z: 60 vs 60, a tie, so no majority.
  assert.deepEqual(piv(ctx, { members: ['x', 'y'], supporters: ['z'] }),
    [['x', 'member', false, true], ['y', 'member', false, true], ['z', 'supporter', false, true]]);
  // 60 vs 60 already: not approved, nothing depends on one party.
  assert.deepEqual(pivotal(ctx, { members: ['x', 'y'] }), []);
});

test('pivotal: an abstainer is listed only when its vote against makes the vote fail; rows in role, then party order', () => {
  // Party order puts the abstainers first; the rows still start with the members.
  const ctx = seated([['b', 10], ['d', 1], ['a', 58], ['c', 51]]);
  // 58 vs 51, b and d abstaining. b against: 58 vs 61 (fails). d against: 58 vs 52 (passes).
  const r = pivotal(ctx, { members: ['a'], abstainers: ['b', 'd'] });
  assert.deepEqual(r.map((p) => [p.partyId, p.role, p.breaksMajority, p.breaksVote]), [['a', 'member', false, true], ['b', 'abstainer', false, true]]);
  assert.deepEqual([r[1].vote.for, r[1].vote.against, r[1].vote.abstain], [58, 61, 1]);
});

test('pivotal: when any one party can leave and 61 and the majority remain, nobody is listed', () => {
  // Six members of 13 (78) and a supporter of 2; without any one of them: 65+ members, a majority either way.
  const ctx = seated([['m1', 13], ['m2', 13], ['m3', 13], ['m4', 13], ['m5', 13], ['m6', 13], ['s', 2], ['o', 40]]);
  assert.deepEqual(pivotal(ctx, { members: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'], supporters: ['s'] }), []);
});

test('presets use blocs only; unity = likud + largest opposition', () => {
  const ctx = makeContext({
    parties: [
      { id: 'likud', pollAvg: 21, bloc: 'coalition' },
      { id: 'o1', pollAvg: 20, bloc: 'opposition' },
      { id: 'o2', pollAvg: 25, bloc: 'opposition' },
      { id: 'ar', pollAvg: 9, bloc: 'arab' },
      { id: 'n', pollAvg: 4, bloc: null },
    ],
    topics: [],
    positions: [],
  });
  const pr = presets(ctx);
  assert.deepEqual(pr.coalition.members, ['likud']);
  assert.deepEqual(pr['opposition-arab'], { members: ['o1', 'o2'], supporters: ['ar'], abstainers: [] });
  assert.deepEqual(pr.unity.members, ['likud', 'o2']);
  assert.ok(!Object.values(pr).some((x) => x.members.includes('n')));
});

test('URL state round-trips roles and ignores unknown ids', () => {
  const ctx = fixture([]);
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const state = { base: 'c', members: ['c', 'a'], supporters: ['e'], abstainers: ['d', 'b'] };
  const qs = serializeState(ctx, state);
  assert.equal(qs, '?b=c&m=a&o=e&a=b,d');
  const back = parseState(qs, ids);
  assert.equal(back.base, 'c');
  assert.deepEqual([...back.members].sort(), ['a', 'c']);
  assert.deepEqual(back.supporters, ['e']);
  assert.deepEqual(back.abstainers, ['b', 'd']);
  assert.deepEqual(parseState('?m=a,zzz,a&b=nope', ids), { base: null, members: ['a'], supporters: [], abstainers: [] });
  assert.equal(serializeState(ctx, { base: null, members: [] }), '');
});

test('canUndo (#29): only when the previous state had a party in any role and the change made a difference', () => {
  const ctx = fixture([]);
  const st = (members, supporters = [], abstainers = [], base = null) => ({ base, members, supporters, abstainers });
  // From an empty coalition (e.g. the home card), there is nothing to restore.
  assert.equal(canUndo(ctx, st([]), st(['a', 'b'], [], [], 'a')), false);
  // The same coalition again: nothing changed (the order of ids does not matter).
  assert.equal(canUndo(ctx, st(['a', 'b'], [], [], 'a'), st(['b', 'a'], [], [], 'a')), false);
  // Supporters or abstainers alone count as something to restore.
  assert.equal(canUndo(ctx, st([], ['c']), st(['a', 'b'], [], [], 'a')), true);
  assert.equal(canUndo(ctx, st([], [], ['d']), st(['a', 'b'], [], [], 'a')), true);
  // A different base alone is a change.
  assert.equal(canUndo(ctx, st(['a', 'b'], [], [], 'a'), st(['a', 'b'], [], [], 'b')), true);
  // The three changes that offer undo: a closest coalition replaces, a completion adds, removing the friction party.
  assert.equal(canUndo(ctx, st(['a', 'b'], ['e']), st(['c', 'd'], [], [], 'c')), true);
  assert.equal(canUndo(ctx, st(['a']), st(['a', 'b', 'c'])), true);
  assert.equal(canUndo(ctx, st(['a', 'b', 'c'], [], [], 'a'), st(['a', 'b'], [], [], 'a')), true);
});

test('old links: m= only means all members; o= (outside support) means supporters', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(parseState('?m=a,b,c', ids), { base: null, members: ['a', 'b', 'c'], supporters: [], abstainers: [] });
  const old = parseState('?b=a&m=b&o=c', ids);
  assert.deepEqual(old, { base: 'a', members: ['a', 'b'], supporters: ['c'], abstainers: [] });
  // The supporter's clashes move from the coalition analysis to periphery().
  const ctx = fixture([P('a', 't1', -2), P('b', 't1', -2), P('c', 't1', 2)]);
  assert.equal(analyze(ctx, old).clashTopics, 0);
  assert.equal(analyze(ctx, { members: ['a', 'b', 'c'] }).clashTopics, 1, 'before roles, the same link counted the clash');
  assert.deepEqual(periphery(ctx, old)[0].items.map((i) => [i.a, i.level]), [['c', 'CLASH']]);
});

test('a party named under two roles keeps the first of b/m > o > a', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(parseState('?b=a&o=a,b&a=b,c&m=c', ids), { base: 'a', members: ['a', 'c'], supporters: ['b'], abstainers: [] });
  assert.deepEqual(selected(parseState('?m=a&o=b&a=c', ids)), ['a', 'b', 'c']);
});

test('the state lives in the fragment; a legacy query is read when the fragment has none', () => {
  const ids = ['a', 'b', 'c'];
  const st = (members, supporters = [], abstainers = []) => ({ base: null, members, supporters, abstainers });
  const loc = (search, hash) => parseLocation({ search, hash }, ids);
  assert.deepEqual(loc('', '#results?m=a,b&o=c'), { route: 'results', state: st(['a', 'b'], ['c']), legacy: false, fromFragment: true, search: '', lang: 'he', hasParams: true, pair: [null, null] });
  assert.deepEqual(loc('?m=a,b', ''), { route: '', state: st(['a', 'b']), legacy: true, fromFragment: false, search: '', lang: 'he', hasParams: false, pair: [null, null] });
  assert.deepEqual(loc('?m=a&a=c', '#build'), { route: 'build', state: st(['a'], [], ['c']), legacy: true, fromFragment: false, search: '', lang: 'he', hasParams: false, pair: [null, null] });
  // The fragment wins over a legacy query; other query params stay.
  assert.deepEqual(loc('?s=wa&m=c', '#results?m=a'), { route: 'results', state: st(['a']), legacy: false, fromFragment: true, search: '?s=wa', lang: 'he', hasParams: true, pair: [null, null] });
  assert.deepEqual(loc('?s=wa&m=a', ''), { route: '', state: st(['a']), legacy: true, fromFragment: false, search: '?s=wa', lang: 'he', hasParams: false, pair: [null, null] });
  assert.deepEqual(loc('?s=wa', '#method'), { route: 'method', state: st([]), legacy: false, fromFragment: false, search: '?s=wa', lang: 'he', hasParams: false, pair: [null, null] });
  assert.equal(loc('', '#privacy?m=a').route, 'privacy');
  assert.deepEqual(loc('', '#?m=a').state, st(['a']));
  const ctx = fixture([]);
  const state = { base: 'c', members: ['c', 'a'], supporters: ['e'], abstainers: ['b'] };
  const url = locationFor(ctx, state, 'results', '?s=wa');
  assert.equal(url, '?s=wa#results?b=c&m=a&o=e&a=b');
  const [search, hash] = [url.slice(0, url.indexOf('#')), url.slice(url.indexOf('#'))];
  const back = parseLocation({ search, hash }, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual([back.route, back.search, serializeState(ctx, back.state)], ['results', '?s=wa', '?b=c&m=a&o=e&a=b']);
});

test('the language rides in the fragment as l=, Hebrew by default and omitted', () => {
  const ids = ['a', 'b'];
  const loc = (hash) => parseLocation({ search: '', hash }, ids);
  assert.equal(loc('#results?m=a&l=en').lang, 'en');
  assert.equal(loc('#build?l=en').lang, 'en');
  assert.equal(loc('#build?l=fr').lang, 'he');
  assert.equal(loc('#results?m=a').lang, 'he');
  // A nav link (no params) carries no language; the app keeps the current one.
  assert.deepEqual([loc('#method').hasParams, loc('#method?l=en').hasParams], [false, true]);
  // l is not coalition state: it never turns a link into a stateful or legacy one.
  assert.equal(loc('#build?l=en').fromFragment, false);
  assert.equal(parseLocation({ search: '?l=en', hash: '' }, ids).lang, 'he');
  const ctx = fixture([]);
  const state = { base: null, members: ['a'], supporters: [], abstainers: [] };
  assert.equal(locationFor(ctx, state, 'results', '', 'en'), '#results?m=a&l=en');
  assert.equal(locationFor(ctx, state, 'results', '', 'he'), '#results?m=a');
  assert.equal(locationFor(ctx, { ...state, members: [] }, 'build', '', 'en'), '#build?l=en');
  const back = parseLocation({ search: '', hash: locationFor(ctx, state, 'results', '', 'en') }, ['a']);
  assert.deepEqual([back.lang, back.state.members], ['en', ['a']]);
});

test('the pair view: p= in the fragment, two distinct known ids in picked order, written only when given', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const loc = (hash) => parseLocation({ search: '', hash }, ['a', 'b'], ids);
  assert.deepEqual(parsePair('p=c,a', ids), ['c', 'a']);
  assert.deepEqual(parsePair('p=a,a', ids), ['a', null], 'the same party twice is one');
  assert.deepEqual(parsePair('p=zzz,b,,c,d', ids), ['b', 'c'], 'unknown ids dropped, two at most');
  assert.deepEqual(parsePair('m=a', ids), [null, null]);
  // Pair ids are checked against every party (a list under the threshold included), state ids against the passed ones.
  assert.deepEqual(loc('#pair?p=e,a&l=en').pair, ['e', 'a']);
  assert.deepEqual(loc('#pair?p=e,a').state.members, []);
  // p is not coalition state: a pair link never brings or replaces a coalition, and a legacy ?p= is not moved.
  assert.equal(loc('#pair?p=a,b').fromFragment, false);
  assert.equal(moveLegacyState({ search: '?p=a,b', hash: '#pair' }), null);
  const ctx = fixture([]);
  const empty = { base: null, members: [], supporters: [], abstainers: [] };
  const state = { ...empty, members: ['c', 'a'] };
  assert.equal(locationFor(ctx, empty, 'pair', '', 'he', ['c', 'a']), '#pair?p=c,a');
  assert.equal(locationFor(ctx, empty, 'pair', '', 'en', ['c', 'a']), '#pair?p=c,a&l=en');
  assert.equal(locationFor(ctx, state, 'pair', '?s=wa', 'en', ['b', null]), '?s=wa#pair?m=a,c&p=b&l=en');
  assert.equal(locationFor(ctx, empty, 'pair', '', 'he', [null, null]), '#pair');
  assert.equal(locationFor(ctx, state, 'results', '', 'en'), '#results?m=a,c&l=en');
  const back = parseLocation({ search: '', hash: locationFor(ctx, state, 'pair', '', 'en', ['e', 'c']) }, ids);
  assert.deepEqual([back.route, back.pair, back.state.members, back.lang], ['pair', ['e', 'c'], ['a', 'c'], 'en']);
});

test('localize lays a record\'s en fields over the Hebrew; the order never depends on the language', () => {
  const rec = { id: 'x', name: 'עברית', axis: { 0: 'א' }, en: { name: 'English', axis: { 0: 'A' } } };
  assert.equal(localize(rec, 'he'), rec);
  assert.deepEqual(localize(rec, 'en'), { ...rec, name: 'English', axis: { 0: 'A' } });
  assert.equal(localize({ id: 'y' }, 'en').id, 'y');
  // Shared ballot letters tie-break on the Hebrew name, so English names must not reorder them.
  const parties = [
    { id: 'z', name: 'זהות', ballotLetters: 'ט', en: { name: 'A first in English' } },
    { id: 'rz', name: 'הציונות הדתית', ballotLetters: 'ט', en: { name: 'Z last in English' } },
  ];
  const data = { meta: { mode: 'polls', showSeats: false }, parties, topics: [{ id: 't', name: 'נושא', en: { name: 'Topic' } }], positions: [], results: null };
  const he = contextFor(data, 'he');
  const en = contextFor(data, 'en');
  assert.deepEqual(en.parties.map((p) => p.id), he.parties.map((p) => p.id));
  assert.deepEqual([en.byId.get('z').name, en.topics[0].name, he.byId.get('z').name], ['A first in English', 'Topic', 'זהות']);
});

test('moveLegacyState moves query state into the fragment verbatim, before any id check', () => {
  assert.equal(moveLegacyState({ search: '', hash: '#results?m=a' }), null);
  assert.equal(moveLegacyState({ search: '?s=wa', hash: '' }), null);
  assert.equal(moveLegacyState({ search: '?m=a,zzz&o=b', hash: '' }), '#?m=a,zzz&o=b');
  assert.equal(moveLegacyState({ search: '?b=a&m=b', hash: '#build' }), '#build?b=a&m=b');
  assert.equal(moveLegacyState({ search: '?s=wa&m=a&utm_source=x', hash: '#results' }), '?s=wa&utm_source=x#results?m=a');
  // A fragment that already has state wins; the query's copy is dropped.
  assert.equal(moveLegacyState({ search: '?m=c', hash: '#results?m=a' }), '#results?m=a');
});

test('withLinked adds the soft-linked partner once, and only on add', () => {
  const ctx = makeContext({
    parties: [{ id: 'a' }, { id: 'rz', linkedWith: 'z' }, { id: 'z', linkedWith: 'rz' }],
    topics: [], positions: [],
  });
  assert.deepEqual(withLinked(ctx, ['a'], 'rz'), ['a', 'rz', 'z']);
  assert.deepEqual(withLinked(ctx, ['a', 'z'], 'rz'), ['a', 'z', 'rz']);
  assert.deepEqual(withLinked(ctx, [], 'a'), ['a']);
});

test('lowCoverage lists members with 3+ null topics', () => {
  const topics = [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }];
  const ctx = makeContext({
    parties: [{ id: 'a' }, { id: 'b' }],
    topics,
    positions: [P('a', 't1', 0), P('b', 't1', 0), P('b', 't2', 1), P('b', 't3', 1)],
  });
  assert.deepEqual(lowCoverage(ctx, ['a', 'b']), [{ partyId: 'a', missing: 3 }]);
});

test('addImpact: worst level per topic against current members; MAJOR counts in neither', () => {
  const ctx = fixture([
    P('a', 't1', 0), P('b', 't1', 0), P('c', 't1', 1),   // c vs a: MINOR, vs b: MINOR -> agree
    P('a', 't2', 0), P('b', 't2', 0), P('c', 't2', 2),   // MAJOR -> neither
    P('a', 't3', -2), P('b', 't3', 0), P('c', 't3', 2),  // CLASH vs a -> clash
  ]);
  assert.deepEqual(addImpact(ctx, 'c', ['a', 'b']), { agree: 1, clash: 1, unknown: 0 });
});

test('addImpact: unknown when the candidate or every member lacks a position', () => {
  const ctx = fixture([P('a', 't1', 0), P('b', 't1', null), P('c', 't1', 1), P('d', 't2', 1), P('a', 't2', 1)]);
  // t1: candidate c has a position, members a (has) -> counted; t2: c null -> unknown; t3: c null -> unknown
  assert.deepEqual(addImpact(ctx, 'c', ['a', 'b']), { agree: 1, clash: 0, unknown: 2 });
  // members with no positions on t1 at all -> unknown
  assert.deepEqual(addImpact(ctx, 'c', ['b']), { agree: 0, clash: 0, unknown: 3 });
});

test('addImpact does not depend on member order', () => {
  const ctx = fixture([P('a', 't1', -2), P('b', 't1', 2), P('c', 't1', 0)]);
  assert.deepEqual(addImpact(ctx, 'c', ['a', 'b']), addImpact(ctx, 'c', ['b', 'a']));
});

test('breakdown counts agreement and minor gaps separately', () => {
  const st = [{ status: 'AGREE' }, { status: 'MINOR' }, { status: 'MINOR' }, { status: 'MAJOR' }, { status: 'CLASH' }, { status: 'CLASH' }, { status: 'NODATA' }];
  assert.deepEqual(breakdown(st), { agree: 1, minor: 2, major: 1, clash: 2, nodata: 1 });
});

test('withoutDelta: clash counts first, then substantial gaps, else null', async () => {
  const { withoutDelta } = await import('../site/js/compat.js');
  const st = (...s) => s.map((status, i) => ({ topicId: `t${i}`, status }));
  assert.deepEqual(withoutDelta(st('CLASH', 'CLASH', 'MAJOR'), st('CLASH', 'MINOR', 'MINOR')), { kind: 'clash', before: 2, after: 1 });
  assert.deepEqual(withoutDelta(st('MAJOR', 'MAJOR', 'MAJOR'), st('MAJOR', 'MINOR', 'MINOR')), { kind: 'major', before: 3, after: 1 });
  assert.equal(withoutDelta(st('MINOR', 'AGREE'), st('AGREE', 'AGREE')), null);
  assert.equal(withoutDelta(st('CLASH', 'MAJOR'), st('CLASH', 'MAJOR')), null);
});

test('ballotOrder sorts by ballot letters (Hebrew), then name for shared letters', () => {
  const ps = [
    { id: 'l', ballotLetters: 'מחל', name: 'הליכוד' },
    { id: 'z', ballotLetters: 'ט', name: 'זהות' },
    { id: 'd', ballotLetters: 'אמת', name: 'הדמוקרטים' },
    { id: 'k', ballotLetters: 'ך', name: 'עמך ישראל' },
    { id: 'rz', ballotLetters: 'ט', name: 'הציונות הדתית' },
  ];
  assert.deepEqual(ballotOrder(ps).map((p) => p.id), ['d', 'rz', 'z', 'k', 'l']);
  assert.deepEqual(ps.map((p) => p.id), ['l', 'z', 'd', 'k', 'rz'], 'input is not mutated');
});

test('rankBySeats=false: crisis ties fall back to topic order, not poll seats', () => {
  const pos = [
    P('c', 't1', -1), P('d', 't1', 1, true), // CLASH by red line, seats 18
    P('a', 't2', -1), P('b', 't2', 1, true), // CLASH by red line, seats 50
  ];
  const base = fixture(pos);
  const ctx = makeContext({ parties: base.parties, topics: base.topics, positions: pos, rankBySeats: false });
  const st = ['t1', 't2', 't3'].map((t) => topicStatus(ctx, ['a', 'b', 'c', 'd'], t));
  assert.deepEqual(crises(ctx, st).map((x) => x.topicId), ['t1', 't2']);
});

// Brute force over party subsets (not units): every set of non-members that reaches 61 with the members, keeps a
// soft-linked pair together when both are non-members, and falls short when any one party (or pair) is dropped.
function bruteMinimal(ctx, members) {
  const reach = (ids) => Math.round([...members, ...ids].reduce((n, id) => n + ctx.seatsOf(id), 0)) >= 61;
  const free = ctx.parties.map((p) => p.id).filter((id) => !members.includes(id) && ctx.passed(id) && ctx.seatsOf(id) > 0);
  const out = [];
  for (let mask = 1; mask < 1 << free.length; mask++) {
    const ids = free.filter((_, i) => mask & (1 << i));
    const pairOk = ids.every((id) => { const l = ctx.byId.get(id).linkedWith; return !l || !free.includes(l) || ids.includes(l); });
    if (!pairOk || !reach(ids)) continue;
    const groups = ids.filter((id) => { const l = ctx.byId.get(id).linkedWith; return !(l && ids.includes(l) && ctx.order.get(l) < ctx.order.get(id)); })
      .map((id) => { const l = ctx.byId.get(id).linkedWith; return l && ids.includes(l) ? [id, l] : [id]; });
    if (groups.some((g) => reach(ids.filter((id) => !g.includes(id))))) continue;
    out.push(ids.join('+'));
  }
  return out.sort();
}

function seatFixture() {
  return makeContext({
    parties: [
      { id: 'p30', pollAvg: 30 }, { id: 'p20', pollAvg: 20 }, { id: 'p14', pollAvg: 14 }, { id: 'p12', pollAvg: 12 },
      { id: 'p10', pollAvg: 10 }, { id: 'rz', pollAvg: 9, linkedWith: 'z' }, { id: 'p8', pollAvg: 8 }, { id: 'p6', pollAvg: 6 },
      { id: 'z', pollAvg: 2, linkedWith: 'rz' }, { id: 'p0', pollAvg: 0 },
    ],
    topics: [{ id: 't1' }],
    positions: [P('p30', 't1', -2, true), P('p20', 't1', 0), P('p14', 't1', 2)],
  });
}

test('completions: exactly the minimal sets, found by brute force; the linked pair is one unit', () => {
  const ctx = seatFixture();
  for (const members of [['p30'], ['p20'], ['p30', 'p20'], ['p12', 'p10'], ['p30', 'z'], ['p6']]) {
    const c = completions(ctx, members, { limit: Infinity });
    assert.deepEqual(c.list.map((x) => [...x.add].sort().join('+')).sort(), bruteMinimal(ctx, members).map((x) => x.split('+').sort().join('+')).sort(), members.join(','));
    assert.equal(c.total, c.list.length);
    for (const x of c.list) {
      assert.ok(x.total >= 61);
      assert.ok(!(x.add.includes('rz') && !members.includes('z')) || x.add.includes('z'), 'rz without z');
      assert.ok(!(x.add.includes('z') && !members.includes('rz')) || x.add.includes('rz'), 'z without rz');
    }
  }
  // With rz already a member, z alone is its own unit (9 + 30 + 20 = 59, + z 2 = 61).
  assert.ok(completions(ctx, ['rz', 'p30', 'p20'], { limit: Infinity }).list.some((x) => x.add.join() === 'z'));
});

test('completions: sorted by unit count, then added seats, then party order; a limit keeps the full count', () => {
  const ctx = seatFixture();
  const all = completions(ctx, ['p6']).list;
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1], b = all[i];
    const key = (x) => x.add.map((id) => ctx.order.get(id)).join(',');
    assert.ok(a.units < b.units || (a.units === b.units && (a.seats < b.seats || (a.seats === b.seats && key(a) < key(b)))), `${a.add} before ${b.add}`);
  }
  // p30 + p14 = 44: the single p20 (+20) comes before the pair p12 + p6 (+18).
  const one = completions(ctx, ['p30', 'p14']).list;
  assert.equal(one[0].add.join(), 'p20');
  assert.equal(one[0].units, 1);
  assert.ok(one.some((x) => x.units === 2 && x.seats < one[0].seats), 'fixture has a cheaper two-list completion');
  const capped = completions(ctx, ['p6'], { limit: 6 });
  assert.equal(capped.list.length, 6);
  assert.equal(capped.total, all.length);
  assert.deepEqual(capped.list.map((x) => x.add), all.slice(0, 6).map((x) => x.add));
});

test('completions: none with no members, none once members reach 61, supporters never count', () => {
  const ctx = seatFixture();
  assert.deepEqual(completions(ctx, []), { list: [], total: 0, currentRedLines: [] });
  assert.deepEqual(completions(ctx, ['p30', 'p20', 'p12']), { list: [], total: 0, currentRedLines: [] });
  // p30 + p20 = 50: p12 alone completes it, even if p12 is "supporting" (supporters are not members).
  assert.ok(completions(ctx, ['p30', 'p20']).list.some((x) => x.add.join() === 'p12'));
});

test('completions report deltas: new clash topics and only newly crossed red lines', () => {
  const ctx = seatFixture();
  // p30 (-2, red line) + p20 (0): the red line is already crossed at distance 2, which makes t1 a head-on clash.
  const already = completions(ctx, ['p30', 'p20']);
  assert.deepEqual(already.currentRedLines, [{ partyId: 'p30', topicId: 't1' }]);
  const p14 = already.list.find((x) => x.add.join() === 'p14');
  assert.equal(p14.clashTopics, 1);
  assert.equal(p14.newClashTopics, 0, 't1 was already a head-on clash (red line at distance 2)');
  assert.deepEqual(p14.newRedLines, [], 'the red line was already crossed');
  assert.deepEqual(redLinesCrossed(ctx, ['p30', 'p6']), []); // p6 has no position
});

test('completions: a new clash and a newly crossed red line are reported as new', () => {
  const ctx = makeContext({
    parties: [{ id: 'a', pollAvg: 40 }, { id: 'b', pollAvg: 15 }, { id: 'c', pollAvg: 10 }],
    topics: [{ id: 't1' }, { id: 't2' }],
    positions: [P('a', 't1', -1, true), P('b', 't1', -1), P('c', 't1', 1), P('a', 't2', -2), P('b', 't2', 2), P('c', 't2', 2)],
  });
  // a + b = 55: t2 is already a clash (d = 4); adding c (10) adds t1 (red line of a, d = 2).
  const r = completions(ctx, ['a', 'b']);
  assert.deepEqual(r.currentRedLines, []);
  assert.deepEqual(r.list.map((x) => [x.add.join(), x.clashTopics, x.newClashTopics, x.newRedLines]), [
    ['c', 2, 1, [{ partyId: 'a', topicId: 't1' }]],
  ]);
});

// ---------- closest coalitions to a party (#22) ----------

// Results-mode context: `seats` maps id -> seats (0 = under the threshold); parties keep the given order.
function closestFixture(seats, positions, topicIds = ['t1', 't2', 't3', 't4']) {
  return makeContext({
    parties: Object.keys(seats).map((id) => ({ id })),
    topics: topicIds.map((id) => ({ id })),
    positions,
    seats: new Map(Object.entries(seats)),
    mode: 'results',
  });
}

const ids = (rows) => rows.map((r) => r.add.join('+'));

// Brute force, independent of completions(): every set of other lists with seats that gives X 61+, where dropping any
// partner leaves it short; the keys come straight from the positions (gap, the red-line rule, any-pair clashes).
function bruteClosest(seats, positions, topicIds, x) {
  const at = (id, t) => positions.find((p) => p.partyId === id && p.topicId === t && p.position != null);
  const clash = (a, b, t) => { const p = at(a, t), q = at(b, t); if (!p || !q) return false; const d = Math.abs(p.position - q.position); return d >= 3 || (d === 2 && Boolean(p.redLine || q.redLine)); };
  const gap = (a, b, t) => { const p = at(a, t), q = at(b, t); return p && q ? Math.abs(p.position - q.position) : null; };
  const order = Object.keys(seats);
  const free = order.filter((id) => id !== x && seats[id] > 0);
  const sum = (s) => Math.round(s.reduce((n, id) => n + seats[id], seats[x]));
  const rows = [];
  if (seats[x] <= 0) return { full: [], partial: [] };
  for (let mask = 1; mask < 1 << free.length; mask++) {
    const add = free.filter((_, i) => mask & (1 << i));
    if (sum(add) < 61 || add.some((id) => sum(add.filter((o) => o !== id)) >= 61)) continue;
    const m = [x, ...add];
    const row = {
      add, seats: sum(add),
      red: topicIds.filter((t) => at(x, t)?.redLine && add.some((p) => gap(x, p, t) >= 2)).length,
      xClash: topicIds.filter((t) => add.some((p) => clash(x, p, t))).length,
      whole: topicIds.filter((t) => m.some((a, i) => m.slice(i + 1).some((b) => clash(a, b, t)))).length,
      agree: topicIds.filter((t) => { const g = add.map((p) => gap(x, p, t)).filter((d) => d != null); return g.length && g.every((d) => d <= 1); }).length,
      low: add.filter((p) => topicIds.filter((t) => !at(p, t)).length >= 3),
    };
    rows.push(row);
  }
  const key = (r) => r.add.map((id) => order.indexOf(id));
  const lex = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  rows.sort((a, b) => a.red - b.red || a.xClash - b.xClash || a.whole - b.whole || b.agree - a.agree || b.seats - a.seats
    || a.add.length - b.add.length || lex(key(a), key(b)));
  return { full: rows.filter((r) => !r.low.length), partial: rows.filter((r) => r.low.length) };
}

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('closestTo: the same coalitions, order, counts and groups as a brute force, for every party, over random fixtures', () => {
  const seats = { a: 30, b: 25, c: 20, d: 15, e: 12, f: 10, g: 8, h: 0 };
  const topicIds = ['t1', 't2', 't3', 't4'];
  let sawPartial = 0;
  let sawFull = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const rnd = mulberry32(seed);
    const positions = [];
    for (const id of Object.keys(seats)) {
      topicIds.forEach((t, i) => {
        // g states one position only (3 without), f two (2 without: still enough); the rest are random.
        const none = id === 'g' ? i > 0 : id === 'f' ? i >= 2 : rnd() < 0.15;
        positions.push(P(id, t, none ? null : Math.floor(rnd() * 5) - 2, !none && rnd() < 0.15));
      });
    }
    const ctx = closestFixture(seats, positions, topicIds);
    for (const x of Object.keys(seats)) {
      const got = closestTo(ctx, x);
      const want = bruteClosest(seats, positions, topicIds, x);
      const view = (rows) => rows.map((r) => [r.add.join('+'), r.redLines.length, r.xClash, r.wholeClash, r.agree, r.seats, r.low.map((l) => l.partyId).join()]);
      const wantView = (rows) => rows.map((r) => [r.add.join('+'), r.red, r.xClash, r.whole, r.agree, r.seats, r.low.join()]);
      assert.deepEqual(view(got.full), wantView(want.full), `seed ${seed}, x=${x}, full`);
      assert.deepEqual(view(got.partial), wantView(want.partial), `seed ${seed}, x=${x}, partial`);
      assert.equal(got.total, want.full.length + want.partial.length);
      assert.ok([...got.full, ...got.partial].every((r) => !r.add.includes('h')), 'a list under the threshold is never a partner');
      sawPartial += got.partial.length;
      sawFull += got.full.length;
    }
  }
  assert.ok(sawPartial > 0 && sawFull > 0, 'the fixtures populate both groups');
});

test('closestTo key 1: fewer of X\'s own red lines crossed comes first, even with more head-on clashes', () => {
  // x + a: x's red line on t1 is crossed (gap 2), one clash. x + b: no red line, but two clashes (t2, t3).
  const ctx = closestFixture({ x: 40, a: 25, b: 25 }, [
    P('x', 't1', -1, true), P('a', 't1', 1), P('b', 't1', -1),
    P('x', 't2', -2), P('a', 't2', -2), P('b', 't2', 2),
    P('x', 't3', -2), P('a', 't3', -2), P('b', 't3', 1),
  ]);
  const r = closestTo(ctx, 'x');
  assert.deepEqual(ids(r.full), ['b', 'a']);
  assert.deepEqual(r.full.map((c) => [c.redLines.length, c.xClash]), [[0, 2], [1, 1]]);
});

test('closestTo key 2: fewer topics where X clashes with a partner comes before fewer clashes in the whole coalition', () => {
  // x + a + (b|c): x clashes with a on t1. x + b + c: x clashes with nobody, but b and c clash on t2 and t3.
  const ctx = closestFixture({ x: 31, a: 15, b: 15, c: 15 }, [
    P('x', 't1', 2), P('a', 't1', -2), P('b', 't1', 2), P('c', 't1', 2),
    P('x', 't2', 0), P('a', 't2', 0), P('b', 't2', -2), P('c', 't2', 2),
    P('x', 't3', 0), P('a', 't3', 0), P('b', 't3', 2), P('c', 't3', -2),
  ]);
  const r = closestTo(ctx, 'x');
  assert.equal(ids(r.full)[0], 'b+c');
  assert.deepEqual([r.full[0].xClash, r.full[0].wholeClash], [0, 2]);
  assert.ok(r.full.slice(1).every((c) => c.xClash === 1 && c.wholeClash === 1));
});

test('closestTo key 3: partners that clash with each other count, before agreement with X', () => {
  // x agrees with a and b on t2 and t3, but a and b clash head-on on t1 (x is 2 away from each, no clash with x).
  const ctx = closestFixture({ x: 31, a: 15, b: 15, c: 15 }, [
    P('x', 't1', 0), P('a', 't1', -2), P('b', 't1', 2), P('c', 't1', 0),
    P('x', 't2', 1), P('a', 't2', 1), P('b', 't2', 1), P('c', 't2', null),
    P('x', 't3', 0), P('a', 't3', 0), P('b', 't3', 0), P('c', 't3', 2),
  ]);
  const r = closestTo(ctx, 'x');
  const ab = r.full.find((c) => c.add.join() === 'a,b');
  assert.deepEqual([ab.xClash, ab.wholeClash, ab.agree], [0, 1, 2]);
  assert.equal(ids(r.full).at(-1), 'a+b', 'more agreement does not outweigh a clash between the partners');
  assert.ok(r.full.slice(0, -1).every((c) => c.wholeClash === 0 && c.agree < ab.agree));
});

test('closestTo key 4: more agreement comes before more seats; key 5: then more seats, over the completions order', () => {
  // x + b agrees on t1 (61 seats); x + a is 2 apart (70 seats).
  const agree = closestFixture({ x: 40, a: 30, b: 21 }, [P('x', 't1', 0), P('a', 't1', 2), P('b', 't1', 0)], ['t1']);
  assert.deepEqual(ids(closestTo(agree, 'x').full), ['b', 'a']);
  // No positions at all: every key ties up to seats, so x + a (70) comes before x + b (61), although completions lists b first.
  const seats = closestFixture({ x: 40, a: 30, b: 21 }, [], ['t1']);
  assert.deepEqual(completions(seats, ['x']).list.map((c) => c.add.join()), ['b', 'a']);
  assert.deepEqual(ids(closestTo(seats, 'x').full), ['a', 'b']);
});

test('closestTo tie-break: fewer partners, then party order', () => {
  const pos = ['x', 'b', 'c', 'a', 'd'].flatMap((id) => ['t1', 't2', 't3', 't4'].map((t) => P(id, t, 0)));
  const ctx = closestFixture({ x: 40, b: 11, c: 10, a: 21, d: 21 }, pos);
  assert.deepEqual(ids(closestTo(ctx, 'x').full), ['a', 'd', 'b+c']);
});

test('closestTo groups: a partner without a position on 3+ topics moves its coalition to `partial`; X\'s own gaps do not', () => {
  const ctx = closestFixture({ x: 40, a: 21, b: 21 }, [
    // a: one position (3 without), never in conflict. b: two without (enough), clashing with x on t1 and t2.
    P('x', 't1', -2), P('x', 't2', -2), P('x', 't3', 0), P('x', 't4', 0),
    P('a', 't1', null), P('a', 't2', null), P('a', 't3', null), P('a', 't4', 0),
    P('b', 't1', 2), P('b', 't2', 2), P('b', 't3', null), P('b', 't4', null),
  ]);
  const r = closestTo(ctx, 'x');
  assert.deepEqual(ids(r.full), ['b'], 'exactly 2 topics without a position stays in the main list');
  assert.deepEqual(ids(r.partial), ['a'], 'a silent partner would sort first, but is listed apart');
  assert.deepEqual(r.partial[0].low, [{ partyId: 'a', missing: 3 }]);
  assert.deepEqual([r.partial[0].xClash, r.full[0].xClash], [0, 2]);
  // a as X: its own missing positions are noted (ownCoverage), not grouped.
  const asA = closestTo(ctx, 'a');
  assert.deepEqual([ids(asA.full), ids(asA.partial), asA.ownCoverage], [['x'], [], 1]);
});

test('closestTo: partners\' red lines are not X\'s; X without a position never agrees; under the threshold gives nothing', () => {
  const ctx = closestFixture({ x: 40, a: 21, h: 0 }, [
    P('x', 't1', -1), P('a', 't1', 1, true), // a's red line, crossed by x: a clash, but not one of x's red lines
    P('x', 't2', null), P('a', 't2', 0), P('h', 't2', 0),
  ]);
  const [row] = closestTo(ctx, 'x').full;
  assert.deepEqual([row.add.join(), row.redLines.length, row.xClash, row.wholeClash, row.agree], ['a', 0, 1, 1, 0]);
  assert.equal(closestTo(ctx, 'x').ownRedLines, 0);
  assert.equal(closestTo(ctx, 'a').ownRedLines, 1);
  assert.deepEqual(closestTo(ctx, 'h'), { full: [], partial: [], total: 0, ownCoverage: 1, ownRedLines: 0 });
});
