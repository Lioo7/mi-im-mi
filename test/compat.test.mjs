import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  level, makeContext, topicStatus, crises, glue, friction, overall, newClashTopics,
  matrixCell, pairSummary, seats, analyze, without, presets, parseState, serializeState,
  withLinked, lowCoverage, addImpact, breakdown,
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

test('seats: inside, outside, borderline, missing', () => {
  const ctx = fixture([]);
  const s = seats(ctx, ['a', 'b', 'e'], ['b']);
  assert.deepEqual(s, { inside: 34, outside: 20, total: 54, missing: 7, borderline: 4 });
});

test('without() removes a party and its base/outside role', () => {
  const ctx = fixture([P('a', 't1', -2), P('b', 't1', 2), P('c', 't1', -2)]);
  const r = without(ctx, { members: ['a', 'b', 'c'], base: 'b', outside: [] }, 'b');
  assert.equal(r.clashTopics, 0);
  assert.equal(r.seats.total, 40);
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
  assert.deepEqual(pr['opposition-arab'], { members: ['o1', 'o2', 'ar'], outside: ['ar'] });
  assert.deepEqual(pr.unity.members, ['likud', 'o2']);
  assert.ok(!Object.values(pr).some((x) => x.members.includes('n')));
});

test('URL state round-trips and ignores unknown ids', () => {
  const ctx = fixture([]);
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const state = { base: 'c', members: ['c', 'a', 'd', 'e'], outside: ['e'] };
  const qs = serializeState(ctx, state);
  assert.equal(qs, '?b=c&m=a,d&o=e');
  const back = parseState(qs, ids);
  assert.equal(back.base, 'c');
  assert.deepEqual([...back.members].sort(), ['a', 'c', 'd', 'e']);
  assert.deepEqual(back.outside, ['e']);
  assert.deepEqual(parseState('?m=a,zzz,a&b=nope', ids), { base: null, members: ['a'], outside: [] });
  assert.equal(serializeState(ctx, { base: null, members: [], outside: [] }), '');
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
