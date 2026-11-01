import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  level, makeContext, topicStatus, crises, glue, friction, overall, newClashTopics,
  matrixCell, pairSummary, investiture, periphery, analyze, without, presets, parseState, serializeState,
  withLinked, lowCoverage, addImpact, breakdown, ballotOrder, selected,
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

test('without() removes a party from any role', () => {
  const ctx = fixture([P('a', 't1', -2), P('b', 't1', 2), P('c', 't1', -2)]);
  const r = without(ctx, { members: ['a', 'b', 'c'], base: 'b' }, 'b');
  assert.equal(r.clashTopics, 0);
  assert.equal(r.vote.membersSeats, 40);
  assert.equal(without(ctx, { members: ['a'], supporters: ['c'] }, 'c').vote.for, 30);
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
