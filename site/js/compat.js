// Pure compatibility logic. No DOM; imported by the app and by node tests.

export const SEV = { NONE: -1, AGREE: 0, MINOR: 1, MAJOR: 2, CLASH: 3 };
const BY_SEV = ['AGREE', 'MINOR', 'MAJOR', 'CLASH'];
const FRICTION_WEIGHT = { CLASH: 3, MAJOR: 1 };

export function indexPositions(positions) {
  const idx = new Map();
  for (const p of positions) idx.set(`${p.partyId}|${p.topicId}`, p);
  return idx;
}

const posOf = (idx, partyId, topicId) => idx.get(`${partyId}|${topicId}`);
const hasPos = (p) => p != null && p.position != null;

// Level between two positions on one topic.
export function level(a, b) {
  if (!hasPos(a) || !hasPos(b)) return { level: 'NONE', d: null, red: false, byRedLine: false };
  const d = Math.abs(a.position - b.position);
  const red = Boolean(a.redLine || b.redLine);
  if (d >= 3) return { level: 'CLASH', d, red, byRedLine: false };
  if (d === 2 && red) return { level: 'CLASH', d, red, byRedLine: true };
  return { level: BY_SEV[d], d, red, byRedLine: false };
}

export function pairLevel(idx, partyA, partyB, topicId) {
  return level(posOf(idx, partyA, topicId), posOf(idx, partyB, topicId));
}

// Context shared by everything below: data indexes and party order.
export function makeContext({ parties, topics, positions }) {
  const order = new Map(parties.map((p, i) => [p.id, i]));
  return {
    parties,
    topics,
    idx: indexPositions(positions),
    order,
    byId: new Map(parties.map((p) => [p.id, p])),
    seatsOf: (id) => parties[order.get(id)]?.pollAvg ?? 0,
  };
}

const sortByParty = (ctx, ids) => [...ids].sort((a, b) => ctx.order.get(a) - ctx.order.get(b));

// Higher = worse. Used to rank pairs and crises.
function pairRank(ctx, pair) {
  return [SEV[pair.level], pair.d ?? -1, pair.red ? 1 : 0, ctx.seatsOf(pair.a) + ctx.seatsOf(pair.b)];
}

function compareRankDesc(x, y) {
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i];
  return 0;
}

// All pairs among members on one topic, worst first.
export function topicPairs(ctx, members, topicId) {
  const ids = sortByParty(ctx, members);
  const pairs = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const l = pairLevel(ctx.idx, ids[i], ids[j], topicId);
      if (l.level !== 'NONE') pairs.push({ a: ids[i], b: ids[j], topicId, ...l });
    }
  }
  return pairs.sort((p, q) => compareRankDesc(pairRank(ctx, p), pairRank(ctx, q)));
}

// Topic status for a coalition = worst pair level; NODATA when <2 members have a position.
export function topicStatus(ctx, members, topicId) {
  const withPosition = members.filter((id) => hasPos(posOf(ctx.idx, id, topicId))).length;
  if (withPosition < 2) return { topicId, status: 'NODATA', worst: null, pairs: [], withPosition, total: members.length };
  const pairs = topicPairs(ctx, members, topicId);
  return { topicId, status: pairs[0].level, worst: pairs[0], pairs, withPosition, total: members.length };
}

export function crises(ctx, statuses, limit = 3) {
  return statuses
    .map((s, topicOrder) => ({ ...s, topicOrder }))
    .filter((s) => s.status === 'CLASH' || s.status === 'MAJOR')
    .sort((x, y) => compareRankDesc(pairRank(ctx, x.worst), pairRank(ctx, y.worst)) || x.topicOrder - y.topicOrder)
    .slice(0, limit)
    .map((s) => ({
      topicId: s.topicId,
      worst: s.worst,
      morePairs: s.pairs.filter((p) => p.level === s.worst.level).length - 1,
    }));
}

export function glue(statuses) {
  return statuses
    .map((s, topicOrder) => ({ ...s, topicOrder }))
    .filter((s) => s.status === 'AGREE' || s.status === 'MINOR')
    .sort((x, y) => SEV[x.status] - SEV[y.status] || x.topicOrder - y.topicOrder)
    .map(({ topicId, status, withPosition, total }) => ({ topicId, status, withPosition, total }));
}

export function friction(ctx, members, base) {
  if (members.length < 3) return [];
  const scores = members
    .filter((id) => id !== base)
    .map((id) => {
      let score = 0;
      for (const t of ctx.topics) {
        for (const other of members) {
          if (other === id) continue;
          score += FRICTION_WEIGHT[pairLevel(ctx.idx, id, other, t.id).level] ?? 0;
        }
      }
      return { partyId: id, score };
    });
  const max = Math.max(0, ...scores.map((s) => s.score));
  if (max === 0) return [];
  return sortByParty(ctx, scores.filter((s) => s.score === max).map((s) => s.partyId))
    .map((partyId) => ({ partyId, score: max }));
}

export function countClashTopics(statuses) {
  return statuses.filter((s) => s.status === 'CLASH').length;
}

export function overall(statuses) {
  const counted = statuses.filter((s) => s.status !== 'NODATA');
  return { clashFree: counted.filter((s) => s.status !== 'CLASH').length, of: counted.length };
}

// How many topics would the candidate clash on with at least one current member.
export function newClashTopics(ctx, candidate, members) {
  let n = 0;
  for (const t of ctx.topics) {
    if (members.some((m) => pairLevel(ctx.idx, candidate, m, t.id).level === 'CLASH')) n++;
  }
  return n;
}

// Per-topic effect of adding `candidate` to the current coalition (informational, never used to order chips).
// Per topic, the worst level against current members decides: AGREE/MINOR -> agree, CLASH -> clash,
// MAJOR -> neither, no stated position (candidate, or every member) -> unknown.
export function addImpact(ctx, candidate, members) {
  const out = { agree: 0, clash: 0, unknown: 0 };
  for (const t of ctx.topics) {
    if (!hasPos(posOf(ctx.idx, candidate, t.id))) { out.unknown++; continue; }
    const levels = members.map((m) => pairLevel(ctx.idx, candidate, m, t.id).level).filter((l) => l !== 'NONE');
    if (!levels.length) { out.unknown++; continue; }
    const worst = Math.max(...levels.map((l) => SEV[l]));
    if (worst === SEV.CLASH) out.clash++;
    else if (worst <= SEV.MINOR) out.agree++;
  }
  return out;
}

// Topic-status counts for the results summary: agree (AGREE), minor, major, clash, no data.
export function breakdown(statuses) {
  const n = { agree: 0, minor: 0, major: 0, clash: 0, nodata: 0 };
  for (const s of statuses) {
    if (s.status === 'NODATA') n.nodata++;
    else if (s.status === 'CLASH') n.clash++;
    else if (s.status === 'MAJOR') n.major++;
    else if (s.status === 'MINOR') n.minor++;
    else n.agree++;
  }
  return n;
}

// Matrix cell: vs the base if there is one, else the party's worst level vs any other member.
export function matrixCell(ctx, partyId, topicId, members, base) {
  if (base) {
    if (partyId === base) return { level: 'REF' };
    if (!hasPos(posOf(ctx.idx, base, topicId))) return { level: 'BASE_NULL' };
    return { ...pairLevel(ctx.idx, base, partyId, topicId), ref: base };
  }
  let worst = { level: 'NONE', d: null, red: false };
  let ref = null;
  for (const other of sortByParty(ctx, members)) {
    if (other === partyId) continue;
    const l = pairLevel(ctx.idx, partyId, other, topicId);
    if (SEV[l.level] > SEV[worst.level] || (l.level === worst.level && (l.d ?? -1) > (worst.d ?? -1))) {
      worst = l;
      ref = other;
    }
  }
  return { ...worst, ref };
}

export function pairSummary(ctx, a, b) {
  const counts = { AGREE: 0, MINOR: 0, MAJOR: 0, CLASH: 0 };
  const rows = ctx.topics.map((t) => {
    const l = pairLevel(ctx.idx, a, b, t.id);
    if (l.level !== 'NONE') counts[l.level]++;
    return { topicId: t.id, ...l };
  });
  return { rows, counts, n: rows.filter((r) => r.level !== 'NONE').length };
}

export function coverage(ctx, partyId) {
  return ctx.topics.filter((t) => hasPos(posOf(ctx.idx, partyId, t.id))).length;
}

export function seats(ctx, members, outside = []) {
  const out = new Set(outside);
  let inside = 0;
  let outsideSum = 0;
  let borderline = 0;
  for (const id of members) {
    const s = ctx.seatsOf(id);
    if (out.has(id)) outsideSum += s;
    else inside += s;
    if (ctx.byId.get(id)?.threshold === 'borderline') borderline += s;
  }
  const total = Math.round(inside + outsideSum);
  return {
    inside: Math.round(inside),
    outside: Math.round(outsideSum),
    total,
    missing: Math.max(0, 61 - total),
    borderline: Math.round(borderline),
  };
}

// Parties that ran on one list but announced a split are soft-linked: adding one adds the other.
export function withLinked(ctx, members, added) {
  const partner = ctx.byId.get(added)?.linkedWith;
  const next = members.includes(added) ? [...members] : [...members, added];
  return partner && ctx.byId.has(partner) && !next.includes(partner) ? [...next, partner] : next;
}

// Members with at least `min` topics lacking a stated position (shown as a footnote under results).
export function lowCoverage(ctx, members, min = 3) {
  return sortByParty(ctx, members)
    .map((id) => ({ partyId: id, missing: ctx.topics.length - coverage(ctx, id) }))
    .filter((x) => x.missing >= min);
}

export function analyze(ctx, { members, base = null, outside = [] }) {
  const statuses = ctx.topics.map((t) => topicStatus(ctx, members, t.id));
  return {
    statuses,
    crises: crises(ctx, statuses),
    glue: glue(statuses),
    friction: friction(ctx, members, base),
    overall: overall(statuses),
    clashTopics: countClashTopics(statuses),
    seats: seats(ctx, members, outside),
  };
}

// What the coalition looks like without one party (for the friction card preview).
export function without(ctx, state, partyId) {
  const members = state.members.filter((id) => id !== partyId);
  const outside = (state.outside ?? []).filter((id) => id !== partyId);
  const base = state.base === partyId ? null : state.base;
  return analyze(ctx, { members, base, outside });
}

export function presets(ctx) {
  const inBloc = (bloc) => ctx.parties.filter((p) => p.bloc === bloc).map((p) => p.id);
  const opposition = inBloc('opposition');
  const largestOpposition = [...opposition].sort((a, b) => ctx.seatsOf(b) - ctx.seatsOf(a) || ctx.order.get(a) - ctx.order.get(b))[0];
  const arab = inBloc('arab');
  return {
    coalition: { members: inBloc('coalition'), outside: [] },
    opposition: { members: opposition, outside: [] },
    'opposition-arab': { members: [...opposition, ...arab], outside: arab },
    unity: { members: ['likud', largestOpposition].filter((id) => ctx.byId.has(id)), outside: [] },
  };
}

// URL state: ?b=base&m=inside,members&o=outside,members (base excluded from m).
export function parseState(search, validIds) {
  const q = new URLSearchParams(search);
  const valid = new Set(validIds);
  const list = (k) => (q.get(k) ?? '').split(',').map((s) => s.trim()).filter((id) => valid.has(id));
  const b = list('b')[0] ?? null;
  const outside = [...new Set(list('o'))].filter((id) => id !== b);
  const members = [...new Set([...(b ? [b] : []), ...list('m'), ...outside])];
  return { base: b, members, outside };
}

export function serializeState(ctx, { base, members, outside = [] }) {
  const out = new Set(outside);
  const q = new URLSearchParams();
  if (base) q.set('b', base);
  const inside = sortByParty(ctx, members.filter((id) => id !== base && !out.has(id)));
  if (inside.length) q.set('m', inside.join(','));
  const o = sortByParty(ctx, members.filter((id) => out.has(id) && id !== base));
  if (o.length) q.set('o', o.join(','));
  const s = q.toString().replace(/%2C/g, ',');
  return s ? `?${s}` : '';
}
