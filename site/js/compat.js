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
// rankBySeats=false (seats hidden) drops poll seats from every tie-break, so no ordering reveals poll standings.
// `seats` (optional Map id -> seats) overrides pollAvg, e.g. with election results; `lists` maps id -> its results list.
export function makeContext({ parties, topics, positions, rankBySeats = true, seats = null, lists = null, mode = 'polls' }) {
  const order = new Map(parties.map((p, i) => [p.id, i]));
  const byId = new Map(parties.map((p) => [p.id, p]));
  return {
    parties,
    topics,
    positions,
    idx: indexPositions(positions),
    order,
    byId,
    seatsOf: seats ? (id) => seats.get(id) ?? 0 : (id) => byId.get(id)?.pollAvg ?? 0,
    listOf: (id) => lists?.get(id) ?? null,
    // In results mode a list under the threshold has no seats and cannot take part in a government.
    passed: (id) => mode !== 'results' || (seats?.get(id) ?? 0) > 0,
    // Soft link between parties that ran on one list (polls mode). After the election each is chosen on its own.
    linkedOf: (id) => (mode === 'results' ? null : byId.get(id)?.linkedWith ?? null),
    rankBySeats,
    mode,
  };
}

// Seats per party for meta.mode ('polls' | 'results'). Switching modes is the one-line change meta.mode;
// pollAvg is never touched. In results mode a joint list's seats come from its published `split`.
export function seatSource(meta, parties, results) {
  if (meta.mode !== 'results') return { mode: 'polls', seats: null, lists: null };
  const seats = new Map();
  const lists = new Map();
  for (const l of results.lists) {
    for (const id of l.parties) {
      seats.set(id, l.split?.[id] ?? l.seats);
      lists.set(id, l);
    }
  }
  return { mode: 'results', seats, lists };
}

// Results order: seats, then the list's votes, then the original (poll) order.
export function resultsOrder(parties, { seats, lists }) {
  const at = new Map(parties.map((p, i) => [p.id, i]));
  return [...parties].sort((a, b) => (seats.get(b.id) ?? 0) - (seats.get(a.id) ?? 0)
    || (lists.get(b.id)?.votes ?? 0) - (lists.get(a.id)?.votes ?? 0)
    || at.get(a.id) - at.get(b.id));
}

// The app's context for the active mode. Results: CEC seats and seat order. Polls: poll order, or ballot
// order with seats hidden. Seats are official in results mode, so showSeats applies to polls mode only.
// The order is computed from the Hebrew records before they are localized, so it never changes with the language.
export function contextFor({ meta, parties, topics, positions, results }, lang = 'he') {
  const src = seatSource(meta, parties, results);
  const L = (rec) => localize(rec, lang);
  if (src.lists) src.lists = new Map([...src.lists].map(([id, l]) => [id, L(l)]));
  // A position's summary in English; its quote stays as said (the app shows quoteTranslationEn under it).
  const loc = { topics: topics.map(L), positions: lang === 'he' ? positions : positions.map((p) => ({ ...p, summary: p.summaryEn ?? p.summary })) };
  if (src.mode === 'results') return makeContext({ parties: resultsOrder(parties, src).map(L), ...loc, ...src });
  return meta.showSeats !== false
    ? makeContext({ parties: parties.map(L), ...loc })
    : makeContext({ parties: ballotOrder(parties).map(L), ...loc, rankBySeats: false });
}

// Languages the site is published in; Hebrew is the default and the authoritative text.
export const LANGS = ['he', 'en'];

// A scenario source that carries a party's own reply to the report (#34): a denial, a refusal or a response, in the
// field `<kind>By` (a party of the scenario). At most one per source.
export const REPLY_KINDS = ['denial', 'refusal', 'response'];
export function sourceReply(src) {
  const kind = REPLY_KINDS.find((k) => src?.[`${k}By`] != null);
  return kind ? { kind, party: src[`${kind}By`] } : null;
}

// The factions' recommendations to the President (#4, results mode), from the President's office's releases.
// One row per list in the Knesset, in party order (seats, then votes). `recommended` is the candidate's party id, or null.
export function recommendationRows(ctx, data) {
  const byId = new Map((data?.factions ?? []).map((f) => [f.partyId, f]));
  return ctx.parties.filter((p) => ctx.passed(p.id) && byId.has(p.id)).map((p) => byId.get(p.id));
}

export function recommendationOf(data, pid) {
  return data?.factions?.find((f) => f.partyId === pid) ?? null;
}

// A data record in the reader's language: its `en` fields over the Hebrew ones. Hebrew records are returned as is.
export function localize(rec, lang) {
  return lang === 'he' || !rec?.en ? rec : { ...rec, ...rec.en };
}

// Party order when seats are hidden: by ballot letters (Hebrew alphabetical), then name for shared letters.
export function ballotOrder(parties) {
  return [...parties].sort((a, b) => a.ballotLetters.localeCompare(b.ballotLetters, 'he') || a.name.localeCompare(b.name, 'he'));
}

const sortByParty = (ctx, ids) => [...ids].sort((a, b) => ctx.order.get(a) - ctx.order.get(b));

// Higher = worse. Used to rank pairs and crises.
function pairRank(ctx, pair) {
  return [SEV[pair.level], pair.d ?? -1, pair.red ? 1 : 0, ctx.rankBySeats === false ? 0 : ctx.seatsOf(pair.a) + ctx.seatsOf(pair.b)];
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

// The crises card's heading (#10). "N המשברים" only when the list is exactly the head-on clash topics, so N matches the
// clash count above it; a list with substantial gaps, or capped below the clash count, gets the gaps title. When no
// topic has two members with a position, 'nodata': the card must not read as agreement.
export function crisesHeading({ statuses, crises: list, clashTopics }) {
  if (statuses.every((s) => s.status === 'NODATA')) return { kind: 'nodata' };
  if (clashTopics > 0 && list.length === clashTopics && list.every((c) => c.worst.level === 'CLASH')) return { kind: 'crises', n: clashTopics };
  return { kind: 'gaps' };
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
// `candidate` may be the parties one tap adds together (polls mode: a soft-linked pair, #10): then every newcomer is
// compared with every member and with the other newcomers, and the topic is unknown only when no newcomer has a position.
export function addImpact(ctx, candidate, members) {
  const added = [candidate].flat();
  const out = { agree: 0, clash: 0, unknown: 0 };
  for (const t of ctx.topics) {
    if (!added.some((id) => hasPos(posOf(ctx.idx, id, t.id)))) { out.unknown++; continue; }
    const levels = added.flatMap((id, i) => [...members, ...added.slice(i + 1)].map((m) => pairLevel(ctx.idx, id, m, t.id).level))
      .filter((l) => l !== 'NONE');
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

// What changes when a party leaves: head-on clash topics if they differ, else substantial-gap topics, else null.
export function withoutDelta(statusesBefore, statusesAfter) {
  const b = breakdown(statusesBefore);
  const a = breakdown(statusesAfter);
  if (b.clash !== a.clash) return { kind: 'clash', before: b.clash, after: a.clash };
  if (b.major !== a.major) return { kind: 'major', before: b.major, after: a.major };
  return null;
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

const sumSeats = (ctx, ids) => ids.reduce((n, id) => n + ctx.seatsOf(id), 0);

// Every party that is not a member, supporter or abstainer is an opponent (the default role).
export const selected = ({ members, supporters = [], abstainers = [] }) => [...members, ...supporters, ...abstainers];

// The results header's two groups: the members, and the parties outside the coalition with their role (supporters, then
// abstainers, each in state order). `outside` is empty when every selected party is a member.
export const coalitionGroups = ({ members, supporters = [], abstainers = [] }) => ({
  members: [...members],
  outside: [...supporters.map((partyId) => ({ partyId, role: 'supporter' })), ...abstainers.map((partyId) => ({ partyId, role: 'abstainer' }))],
});

// Investiture vote: for = members + supporters, abstain = abstainers, against = everyone else (all seats minus both).
// Approved when for > against (a majority of those voting). Members alone reaching 61 is reported separately.
// All seats = 120 with results; with polls it is the sum of the poll averages.
export function investiture(ctx, { members, supporters = [], abstainers = [] }) {
  const all = Math.round(sumSeats(ctx, ctx.parties.map((p) => p.id)));
  const membersSeats = Math.round(sumSeats(ctx, members));
  const forSeats = Math.round(sumSeats(ctx, [...members, ...supporters]));
  const abstain = Math.round(sumSeats(ctx, abstainers));
  const against = all - forSeats - abstain;
  const borderline = Math.round(sumSeats(ctx, [...members, ...supporters].filter((id) => ctx.byId.get(id)?.threshold === 'borderline')));
  return {
    for: forSeats,
    against,
    abstain,
    approved: forSeats > against,
    membersSeats,
    membersMajority: membersSeats >= 61,
    missing: Math.max(0, 61 - membersSeats),
    borderline,
  };
}

// Supporters and abstainers vs the coalition: per party and topic, the worst MAJOR/CLASH pair against any member.
// Member-member pairs are covered by analyze(); these never are. Rows keep party order; items run worst first.
export function periphery(ctx, { members, supporters = [], abstainers = [] }) {
  const rows = [];
  for (const [role, ids] of [['supporter', supporters], ['abstainer', abstainers]]) {
    for (const id of sortByParty(ctx, ids)) {
      const items = [];
      for (const t of ctx.topics) {
        let worst = null;
        for (const m of sortByParty(ctx, members)) {
          const l = pairLevel(ctx.idx, id, m, t.id);
          if (l.level !== 'CLASH' && l.level !== 'MAJOR') continue;
          const pair = { a: id, b: m, topicId: t.id, ...l };
          if (!worst || compareRankDesc(pairRank(ctx, pair), pairRank(ctx, worst)) < 0) worst = pair;
        }
        if (worst) items.push(worst);
      }
      items.sort((x, y) => compareRankDesc(pairRank(ctx, x), pairRank(ctx, y)));
      rows.push({ partyId: id, role, items });
    }
  }
  return rows;
}

// Head-on clashes of supporters and abstainers with the members (the snapshot's "↓ ועוד N…" and the share text),
// or null when there are no supporters or abstainers.
export function peripheryClashes(ctx, state) {
  const rows = periphery(ctx, state);
  return rows.length ? rows.reduce((k, row) => k + row.items.filter((i) => i.level === 'CLASH').length, 0) : null;
}

// Members with at least `min` topics lacking a stated position (shown as a footnote under results).
export function lowCoverage(ctx, members, min = 3) {
  return sortByParty(ctx, members)
    .map((id) => ({ partyId: id, missing: ctx.topics.length - coverage(ctx, id) }))
    .filter((x) => x.missing >= min);
}

// Red lines crossed inside a coalition: a member's red-line topic where another member is 2+ steps away
// (the same rule that turns a 2-step gap into a head-on clash). One entry per party and topic, in topic order.
export function redLinesCrossed(ctx, members) {
  const out = [];
  for (const t of ctx.topics) {
    for (const id of sortByParty(ctx, members)) {
      const own = posOf(ctx.idx, id, t.id);
      if (!hasPos(own) || !own.redLine) continue;
      if (members.some((m) => m !== id && pairLevel(ctx.idx, id, m, t.id).d >= 2)) out.push({ partyId: id, topicId: t.id });
    }
  }
  return out;
}

// Display only (#31): red-line entries grouped by topic, topics in topic order and parties in party order.
export function groupRedLines(ctx, lines) {
  return ctx.topics
    .map((t) => ({ topicId: t.id, partyIds: sortByParty(ctx, lines.filter((l) => l.topicId === t.id).map((l) => l.partyId)) }))
    .filter((g) => g.partyIds.length);
}

// "What is missing for 61?": the smallest sets of additional parties that give the members alone 61 seats
// (supporters and abstainers do not count; any non-member may be added). Units: each non-member list with seats; a
// soft-linked pair that ran as one list is one unit in polls mode (with results, each party is its own unit).
// A set is minimal when dropping any of its units leaves the members short of 61. Sorted by unit count, then added seats, then party order. Informational, never a ranking
// of partners. Each entry carries what the addition changes: head-on clash topics in the resulting coalition and how
// many of them are new, and only the red lines it newly crosses (those already crossed are in `currentRedLines`).
export function completions(ctx, members, { limit = Infinity } = {}) {
  const reach = (seats) => Math.round(seats) >= 61;
  const have = sumSeats(ctx, members);
  if (!members.length || reach(have)) return { list: [], total: 0, currentRedLines: [] };
  const taken = new Set(members);
  const units = [];
  for (const p of ctx.parties) {
    if (taken.has(p.id) || !ctx.passed(p.id) || ctx.seatsOf(p.id) <= 0) continue;
    const partner = ctx.linkedOf(p.id);
    const ids = partner && ctx.byId.has(partner) && !taken.has(partner) && ctx.seatsOf(partner) > 0 ? [p.id, partner] : [p.id];
    for (const id of ids) taken.add(id);
    units.push({ ids, seats: sumSeats(ctx, ids) });
  }
  const found = [];
  for (let mask = 1; mask < 1 << units.length; mask++) {
    const picked = units.filter((_, i) => mask & (1 << i));
    const added = picked.reduce((n, u) => n + u.seats, 0);
    if (!reach(have + added) || picked.some((u) => reach(have + added - u.seats))) continue;
    const add = sortByParty(ctx, picked.flatMap((u) => u.ids));
    found.push({ add, units: picked.length, seats: Math.round(added), total: Math.round(have + added) });
  }
  const orderKey = (c) => c.add.map((id) => ctx.order.get(id));
  found.sort((x, y) => x.units - y.units || x.seats - y.seats || compareRankDesc(orderKey(y), orderKey(x)));
  const clashSet = (ids) => new Set(ctx.topics.filter((t) => topicStatus(ctx, ids, t.id).status === 'CLASH').map((t) => t.id));
  const nowClash = clashSet(members);
  const currentRedLines = redLinesCrossed(ctx, members);
  const crossed = new Set(currentRedLines.map((r) => `${r.partyId}|${r.topicId}`));
  const list = found.slice(0, limit).map((c) => {
    const next = [...members, ...c.add];
    const clash = clashSet(next);
    return {
      ...c,
      clashTopics: clash.size,
      newClashTopics: [...clash].filter((t) => !nowClash.has(t)).length,
      newRedLines: redLinesCrossed(ctx, next).filter((r) => !crossed.has(`${r.partyId}|${r.topicId}`)),
    };
  });
  return { list, total: found.length, currentRedLines };
}

// "The coalitions closest to X's stated positions": the minimal winning coalitions that include X (completions of [x]).
// Per coalition: X's own red lines crossed, topics where X clashes head-on with a partner, head-on clash topics in the
// whole coalition (any pair), topics where X agrees or has a small gap with every partner that stated a position
// (counted only if X and at least one partner did), and seats. Sorted by those, in that order, with no weights;
// a full tie keeps the completions order (fewer partners, then party order). Coalitions with a partner that has no
// position on 3+ topics (lowCoverage) go in `partial`: silence cannot clash, so they are listed apart.
export function closestTo(ctx, x) {
  const { list, total } = ctx.passed(x) ? completions(ctx, [x]) : { list: [], total: 0 };
  const rows = list.map((c) => {
    const members = [x, ...c.add];
    let xClash = 0;
    let agree = 0;
    for (const t of ctx.topics) {
      const levels = c.add.map((p) => pairLevel(ctx.idx, x, p, t.id).level).filter((l) => l !== 'NONE');
      if (levels.includes('CLASH')) xClash++;
      if (levels.length && levels.every((l) => SEV[l] <= SEV.MINOR)) agree++;
    }
    return {
      add: c.add,
      members,
      seats: c.total,
      redLines: redLinesCrossed(ctx, members).filter((r) => r.partyId === x),
      xClash,
      wholeClash: ctx.topics.filter((t) => topicStatus(ctx, members, t.id).status === 'CLASH').length,
      agree,
      low: lowCoverage(ctx, c.add),
    };
  });
  rows.sort((a, b) => a.redLines.length - b.redLines.length || a.xClash - b.xClash || a.wholeClash - b.wholeClash
    || b.agree - a.agree || b.seats - a.seats);
  return {
    full: rows.filter((r) => !r.low.length),
    partial: rows.filter((r) => r.low.length),
    total,
    ownCoverage: coverage(ctx, x),
    ownRedLines: ctx.topics.filter((t) => hasPos(posOf(ctx.idx, x, t.id)) && posOf(ctx.idx, x, t.id).redLine).length,
  };
}

// Clash analysis covers coalition members only; supporters and abstainers are in periphery().
export function analyze(ctx, { members, base = null, supporters = [], abstainers = [] }) {
  const statuses = ctx.topics.map((t) => topicStatus(ctx, members, t.id));
  return {
    statuses,
    crises: crises(ctx, statuses),
    glue: glue(statuses),
    friction: friction(ctx, members, base),
    clashTopics: countClashTopics(statuses),
    vote: investiture(ctx, { members, supporters, abstainers }),
  };
}

// The state without one party, in any role.
export function dropParty(state, partyId) {
  const keep = (ids = []) => ids.filter((id) => id !== partyId);
  return {
    base: state.base === partyId ? null : state.base,
    members: keep(state.members),
    supporters: keep(state.supporters),
    abstainers: keep(state.abstainers),
  };
}

// What the coalition looks like without one party (for the friction card preview).
export function without(ctx, state, partyId) {
  return analyze(ctx, dropParty(state, partyId));
}

// Parties a result depends on (#13): a member without which the members drop below 61; a member or supporter without
// which the investiture vote fails (for ≤ against); an abstainer whose vote against makes it fail. "Without" is
// dropParty: an unselected party votes against. Nothing when the vote already fails (61 members implies it passes).
// Role order (members, supporters, abstainers), then party order; never ranked.
export function pivotal(ctx, state) {
  const now = investiture(ctx, state);
  if (!now.approved) return [];
  const { members, supporters = [], abstainers = [] } = state;
  return [['member', members], ['supporter', supporters], ['abstainer', abstainers]]
    .flatMap(([role, ids]) => sortByParty(ctx, ids).map((partyId) => {
      const vote = without(ctx, state, partyId).vote;
      return { partyId, role, vote, breaksMajority: role === 'member' && now.membersMajority && !vote.membersMajority, breaksVote: !vote.approved };
    }))
    .filter((p) => p.breaksMajority || p.breaksVote);
}

export function presets(ctx) {
  const inBloc = (bloc) => ctx.parties.filter((p) => p.bloc === bloc && ctx.passed(p.id)).map((p) => p.id);
  const opposition = inBloc('opposition');
  const largestOpposition = [...opposition].sort((a, b) => ctx.seatsOf(b) - ctx.seatsOf(a) || ctx.order.get(a) - ctx.order.get(b))[0];
  const arab = inBloc('arab');
  return {
    coalition: { members: inBloc('coalition'), supporters: [], abstainers: [] },
    opposition: { members: opposition, supporters: [], abstainers: [] },
    'opposition-arab': { members: opposition, supporters: arab, abstainers: [] },
    unity: { members: ['likud', largestOpposition].filter((id) => ctx.byId.has(id)), supporters: [], abstainers: [] },
  };
}

// URL state: ?b=base&m=members&o=supporters&a=abstainers (the base is a member and is not repeated in m).
// o= has meant outside support since launch, so old links keep their meaning. A party named under two roles
// takes the first of b/m > o > a.
export function parseState(search, validIds) {
  const q = new URLSearchParams(search);
  const valid = new Set(validIds);
  const list = (k) => (q.get(k) ?? '').split(',').map((s) => s.trim()).filter((id) => valid.has(id));
  const b = list('b')[0] ?? null;
  const members = [...new Set([...(b ? [b] : []), ...list('m')])];
  const supporters = [...new Set(list('o'))].filter((id) => !members.includes(id));
  const abstainers = [...new Set(list('a'))].filter((id) => !members.includes(id) && !supporters.includes(id));
  return { base: b, members, supporters, abstainers };
}

export function serializeState(ctx, { base, members, supporters = [], abstainers = [] }) {
  const q = new URLSearchParams();
  if (base) q.set('b', base);
  for (const [k, ids] of [['m', members.filter((id) => id !== base)], ['o', supporters], ['a', abstainers]]) {
    if (ids.length) q.set(k, sortByParty(ctx, ids).join(','));
  }
  const s = q.toString().replace(/%2C/g, ',');
  return s ? `?${s}` : '';
}

// The undo line (#29) shows only when there is something to restore: the previous state had at least one party in any
// role, and the change made a difference. An empty start (e.g. from the home card) has nothing to go back to.
export const canUndo = (ctx, prev, next) => selected(prev).length > 0 && serializeState(ctx, prev) !== serializeState(ctx, next);

// The state lives in the fragment, `#<route>?b=…&m=…&o=…&a=…`, which browsers never send to the server.
// Links from before the move carry it in the query (`?m=…#results`); they are read once and rewritten.
export const STATE_KEYS = ['b', 'm', 'o', 'a'];

export const stateKeysIn = (params) => STATE_KEYS.some((k) => new URLSearchParams(params).has(k));

// Splits a location into its route, its state (fragment first, then a legacy query) and the query without the
// state keys, which keeps any other param (e.g. ?s=wa) as it was.
// The pair view's two pickers (`#pair?p=a,b`): known ids, the same party at most once, in the order picked. A party
// under the threshold is allowed (its positions stay viewable). Returns two slots, null when empty.
export function parsePair(fragment, validIds) {
  const valid = new Set(validIds);
  const ids = [...new Set((new URLSearchParams(fragment).get('p') ?? '').split(',').map((s) => s.trim()).filter((id) => valid.has(id)))];
  return [ids[0] ?? null, ids[1] ?? null];
}

export function parseLocation({ search, hash }, validIds, pairIds = validIds) {
  const h = hash.replace(/^#/, '');
  const i = h.indexOf('?');
  const route = i < 0 ? h : h.slice(0, i);
  const fragment = i < 0 ? '' : h.slice(i + 1);
  const legacy = !stateKeysIn(fragment) && stateKeysIn(search);
  const q = new URLSearchParams(search);
  for (const k of STATE_KEYS) q.delete(k);
  const rest = q.toString();
  const l = new URLSearchParams(fragment).get('l');
  return {
    route, state: parseState(legacy ? search : fragment, validIds), legacy, fromFragment: stateKeysIn(fragment), search: rest ? `?${rest}` : '',
    // `l=` (fragment only) names a language other than Hebrew; `hasParams` tells a full link from a nav link (`#method`).
    lang: LANGS.includes(l) ? l : 'he', hasParams: i >= 0,
    pair: parsePair(fragment, pairIds),
  };
}

// The first step on load, before any request: moves a legacy query's state params verbatim into the fragment
// (unless the fragment already has state, which wins) and returns the new `search + hash`, or null if there is none.
export function moveLegacyState({ search, hash }) {
  if (!stateKeysIn(search)) return null;
  const pairs = search.replace(/^\?/, '').split('&').filter(Boolean);
  const rest = pairs.filter((p) => !stateKeysIn(p)).join('&');
  const h = hash.replace(/^#/, '');
  const i = h.indexOf('?');
  const route = i < 0 ? h : h.slice(0, i);
  const fragment = i >= 0 && stateKeysIn(h.slice(i + 1)) ? h.slice(i + 1) : pairs.filter(stateKeysIn).join('&');
  return `${rest ? `?${rest}` : ''}#${route}?${fragment}`;
}

// `pair` (the pair view's slots) is written only when given; the caller passes it on the pair route alone.
export function locationFor(ctx, state, route, search = '', lang = 'he', pair = []) {
  const s = serializeState(ctx, state);
  const ids = pair.filter(Boolean);
  const extra = [ids.length ? `p=${ids.join(',')}` : '', lang === 'he' ? '' : `l=${lang}`].filter(Boolean).join('&');
  return `${search}#${route}${s}${extra ? `${s ? '&' : '?'}${extra}` : ''}`;
}

// The /en/ entry page (#21): link previews can't see the fragment, so English share links go to /en/#…, a static page
// with English OG tags whose script calls this and redirects to /#…. Keeps the view and every parameter verbatim (b, m,
// o, a, p), drops any other l=, and adds l=en. The fragment never reaches the server or the query.
export function enEntryHash(hash) {
  const h = hash.replace(/^#/, '');
  const i = h.indexOf('?');
  const route = i < 0 ? h : h.slice(0, i);
  const rest = (i < 0 ? '' : h.slice(i + 1)).split('&').filter((p) => p && !/^l(=|$)/.test(p));
  return `#${route}?${[...rest, 'l=en'].join('&')}`;
}
