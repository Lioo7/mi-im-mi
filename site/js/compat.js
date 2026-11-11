// Pure compatibility logic. No DOM; imported by the app and by node tests.
// Type-checked with JSDoc (#20): `node --test` runs tsc over this file (test/typecheck.test.mjs).

/**
 * @typedef {'AGREE' | 'MINOR' | 'MAJOR' | 'CLASH'} Level
 * @typedef {Level | 'NONE'} PairLevelName
 * @typedef {{ id: string, name: string, ballotLetters: string, pollAvg?: number, bloc?: string, threshold?: string,
 *   linkedWith?: string | null, en?: object, [key: string]: any }} Party
 * @typedef {{ id: string, en?: object, [key: string]: any }} Topic
 * @typedef {{ partyId: string, topicId: string, position: number | null, redLine?: boolean, summary?: string,
 *   summaryEn?: string | null, [key: string]: any }} Position
 * @typedef {{ parties: string[], seats: number, votes?: number, split?: Record<string, number>, en?: object,
 *   [key: string]: any }} ResultsList
 * @typedef {{ lists: ResultsList[], [key: string]: any }} Results
 * @typedef {{ mode?: string, showSeats?: boolean, [key: string]: any }} Meta
 * @typedef {{ level: PairLevelName, d: number | null, red: boolean, byRedLine: boolean }} LevelResult
 * @typedef {LevelResult & { a: string, b: string, topicId: string }} Pair
 * @typedef {{ base?: string | null, members: string[], supporters?: string[], abstainers?: string[] }} State
 * @typedef {{ partyId: string, topicId: string }} RedLine
 * @typedef {{ topicId: string, status: PairLevelName | 'NODATA', worst: Pair | null, pairs: Pair[],
 *   withPosition: number, total: number }} TopicStatus
 * @typedef {ReturnType<typeof makeContext>} Context
 */

/** @type {Readonly<Record<string, number>>} */
export const SEV = { NONE: -1, AGREE: 0, MINOR: 1, MAJOR: 2, CLASH: 3 };
/** @type {Level[]} */
const BY_SEV = ['AGREE', 'MINOR', 'MAJOR', 'CLASH'];
/** @type {Readonly<Record<string, number>>} */
const FRICTION_WEIGHT = { CLASH: 3, MAJOR: 1 };

/** @param {Position[]} positions */
export function indexPositions(positions) {
  /** @type {Map<string, Position>} */
  const idx = new Map();
  for (const p of positions) idx.set(`${p.partyId}|${p.topicId}`, p);
  return idx;
}

/** @param {Map<string, Position>} idx @param {string} partyId @param {string} topicId */
const posOf = (idx, partyId, topicId) => idx.get(`${partyId}|${topicId}`);
/** @param {Position | null | undefined} p @returns {p is Position & { position: number }} */
const hasPos = (p) => p != null && p.position != null;

// Level between two positions on one topic.
/** @param {Position | null | undefined} a @param {Position | null | undefined} b @returns {LevelResult} */
export function level(a, b) {
  if (!hasPos(a) || !hasPos(b)) return { level: 'NONE', d: null, red: false, byRedLine: false };
  const d = Math.abs(a.position - b.position);
  const red = Boolean(a.redLine || b.redLine);
  if (d >= 3) return { level: 'CLASH', d, red, byRedLine: false };
  if (d === 2 && red) return { level: 'CLASH', d, red, byRedLine: true };
  return { level: BY_SEV[d], d, red, byRedLine: false };
}

/** @param {Map<string, Position>} idx @param {string} partyA @param {string} partyB @param {string} topicId */
export function pairLevel(idx, partyA, partyB, topicId) {
  return level(posOf(idx, partyA, topicId), posOf(idx, partyB, topicId));
}

// Context shared by everything below: data indexes and party order.
// rankBySeats=false (seats hidden) drops poll seats from every tie-break, so no ordering reveals poll standings.
// `seats` (optional Map id -> seats) overrides pollAvg, e.g. with election results; `lists` maps id -> its results list.
/**
 * @param {{ parties: Party[], topics: Topic[], positions: Position[], rankBySeats?: boolean,
 *   seats?: Map<string, number> | null, lists?: Map<string, ResultsList> | null, mode?: string, house?: number }} opts
 */
export function makeContext({ parties, topics, positions, rankBySeats = true, seats = null, lists = null, mode = 'polls', house = 120 }) {
  const order = new Map(parties.map((p, i) => [p.id, i]));
  const byId = new Map(parties.map((p) => [p.id, p]));
  return {
    parties,
    topics,
    positions,
    idx: indexPositions(positions),
    order,
    byId,
    /** @type {(id: string) => number} */
    seatsOf: seats ? (id) => seats.get(id) ?? 0 : (id) => byId.get(id)?.pollAvg ?? 0,
    /** @param {string} id */
    listOf: (id) => lists?.get(id) ?? null,
    // In results mode a list under the threshold has no seats and cannot take part in a government.
    /** @param {string} id */
    passed: (id) => mode !== 'results' || (seats?.get(id) ?? 0) > 0,
    // Soft link between parties that ran on one list (polls mode). After the election each is chosen on its own.
    /** @param {string} id @returns {string | null} */
    linkedOf: (id) => (mode === 'results' ? null : byId.get(id)?.linkedWith ?? null),
    rankBySeats,
    mode,
    // Seats in the house, for the investiture vote. Always the Knesset's 120 on the site, smaller in test fixtures.
    house,
  };
}

// Seats per party for meta.mode ('polls' | 'results'). Switching modes is the one-line change meta.mode;
// pollAvg is never touched. In results mode a joint list's seats come from its published `split`.
/**
 * @param {Meta} meta @param {Party[]} parties @param {Results | null | undefined} results
 * @returns {{ mode: 'polls', seats: null, lists: null }
 *   | { mode: 'results', seats: Map<string, number>, lists: Map<string, ResultsList> }}
 */
export function seatSource(meta, parties, results) {
  if (meta.mode !== 'results') return { mode: 'polls', seats: null, lists: null };
  /** @type {Map<string, number>} */
  const seats = new Map();
  /** @type {Map<string, ResultsList>} */
  const lists = new Map();
  for (const l of /** @type {Results} */ (results).lists) {
    for (const id of l.parties) {
      seats.set(id, l.split?.[id] ?? l.seats);
      lists.set(id, l);
    }
  }
  return { mode: 'results', seats, lists };
}

// Results order: seats, then the list's votes, then the original (poll) order.
/** @param {Party[]} parties @param {{ seats: Map<string, number>, lists: Map<string, ResultsList> }} src */
export function resultsOrder(parties, { seats, lists }) {
  const at = new Map(parties.map((p, i) => [p.id, i]));
  return [...parties].sort((a, b) => (seats.get(b.id) ?? 0) - (seats.get(a.id) ?? 0)
    || (lists.get(b.id)?.votes ?? 0) - (lists.get(a.id)?.votes ?? 0)
    || /** @type {number} */ (at.get(a.id)) - /** @type {number} */ (at.get(b.id)));
}

// The app's context for the active mode. Results: CEC seats and seat order. Polls: poll order, or ballot
// order with seats hidden. Seats are official in results mode, so showSeats applies to polls mode only.
// The order is computed from the Hebrew records before they are localized, so it never changes with the language.
/**
 * @param {{ meta: Meta, parties: Party[], topics: Topic[], positions: Position[], results?: Results | null }} data
 * @param {string} [lang]
 */
export function contextFor({ meta, parties, topics, positions, results }, lang = 'he') {
  const src = seatSource(meta, parties, results);
  /** @template {object} T @param {T} rec @returns {T} */
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
/** @param {Record<string, any> | null | undefined} src @returns {{ kind: string, party: string } | null} */
export function sourceReply(src) {
  const kind = REPLY_KINDS.find((k) => src?.[`${k}By`] != null);
  return kind && src ? { kind, party: src[`${kind}By`] } : null;
}

// The factions' recommendations to the President (#4, results mode), from the President's office's releases.
// One row per list in the Knesset, in party order (seats, then votes). `recommended` is the candidate's party id, or null.
/**
 * @typedef {{ partyId: string, [key: string]: any }} Faction
 * @param {Context} ctx @param {{ factions?: Faction[] } | null | undefined} data
 */
export function recommendationRows(ctx, data) {
  const byId = new Map((data?.factions ?? []).map((f) => [f.partyId, f]));
  return ctx.parties.filter((p) => ctx.passed(p.id) && byId.has(p.id)).map((p) => byId.get(p.id));
}

/** @param {{ factions?: Faction[] } | null | undefined} data @param {string} pid */
export function recommendationOf(data, pid) {
  return data?.factions?.find((f) => f.partyId === pid) ?? null;
}

// A data record in the reader's language: its `en` fields over the Hebrew ones. Hebrew records are returned as is.
/** @template {object | null | undefined} T @param {T} rec @param {string} lang @returns {T} */
export function localize(rec, lang) {
  const en = /** @type {{ en?: object } | null | undefined} */ (rec)?.en;
  return lang === 'he' || !en ? rec : /** @type {T} */ ({ .../** @type {object} */ (rec), ...en });
}

// Party order when seats are hidden: by ballot letters (Hebrew alphabetical), then name for shared letters.
/** @param {Party[]} parties */
export function ballotOrder(parties) {
  return [...parties].sort((a, b) => a.ballotLetters.localeCompare(b.ballotLetters, 'he') || a.name.localeCompare(b.name, 'he'));
}

/** Party order of a known party id. @param {Context} ctx @param {string} id */
const rank = (ctx, id) => /** @type {number} */ (ctx.order.get(id));

/** @param {Context} ctx @param {Iterable<string>} ids */
const sortByParty = (ctx, ids) => [...ids].sort((a, b) => rank(ctx, a) - rank(ctx, b));

// Higher = worse. Used to rank pairs and crises.
/** @param {Context} ctx @param {Pair} pair @returns {number[]} */
function pairRank(ctx, pair) {
  return [SEV[pair.level], pair.d ?? -1, pair.red ? 1 : 0, ctx.rankBySeats === false ? 0 : ctx.seatsOf(pair.a) + ctx.seatsOf(pair.b)];
}

/** @param {number[]} x @param {number[]} y */
function compareRankDesc(x, y) {
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i];
  return 0;
}

// All pairs among members on one topic, worst first.
/** @param {Context} ctx @param {string[]} members @param {string} topicId */
export function topicPairs(ctx, members, topicId) {
  const ids = sortByParty(ctx, members);
  /** @type {Pair[]} */
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
/** @param {Context} ctx @param {string[]} members @param {string} topicId @returns {TopicStatus} */
export function topicStatus(ctx, members, topicId) {
  const withPosition = members.filter((id) => hasPos(posOf(ctx.idx, id, topicId))).length;
  if (withPosition < 2) return { topicId, status: 'NODATA', worst: null, pairs: [], withPosition, total: members.length };
  const pairs = topicPairs(ctx, members, topicId);
  return { topicId, status: pairs[0].level, worst: pairs[0], pairs, withPosition, total: members.length };
}

/** @param {Context} ctx @param {TopicStatus[]} statuses @param {number} [limit] */
export function crises(ctx, statuses, limit = 3) {
  // Only CLASH and MAJOR statuses are kept, and those always have a worst pair.
  return statuses
    .map((s, topicOrder) => ({ ...s, worst: /** @type {Pair} */ (s.worst), topicOrder }))
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
/** @param {{ statuses: TopicStatus[], crises: ReturnType<typeof crises>, clashTopics: number }} input */
export function crisesHeading({ statuses, crises: list, clashTopics }) {
  if (statuses.every((s) => s.status === 'NODATA')) return { kind: 'nodata' };
  if (clashTopics > 0 && list.length === clashTopics && list.every((c) => c.worst.level === 'CLASH')) return { kind: 'crises', n: clashTopics };
  return { kind: 'gaps' };
}

/** @param {TopicStatus[]} statuses */
export function glue(statuses) {
  return statuses
    .map((s, topicOrder) => ({ ...s, topicOrder }))
    .filter((s) => s.status === 'AGREE' || s.status === 'MINOR')
    .sort((x, y) => SEV[x.status] - SEV[y.status] || x.topicOrder - y.topicOrder)
    .map(({ topicId, status, withPosition, total }) => ({ topicId, status, withPosition, total }));
}

/** @param {Context} ctx @param {string[]} members @param {string | null | undefined} base */
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

/** @param {{ status: string }[]} statuses */
export function countClashTopics(statuses) {
  return statuses.filter((s) => s.status === 'CLASH').length;
}

// How many topics would the candidate clash on with at least one current member.
/** @param {Context} ctx @param {string} candidate @param {string[]} members */
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
/** @param {Context} ctx @param {string | string[]} candidate @param {string[]} members */
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
/** @param {{ status: string }[]} statuses */
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

// The summary rows to show: rows come from S.results.breakdown in count order (agree, minor, major, clash, no data),
// each `[text, class, always]`. A row with a zero count is hidden unless it is always shown. Filtered on the
// count, never on the translated text (#46).
/** @template {[string, string, boolean]} R @param {ReturnType<typeof breakdown>} counts @param {R[]} rows @returns {R[]} */
export function shownBreakdown(counts, rows) {
  const n = [counts.agree, counts.minor, counts.major, counts.clash, counts.nodata];
  return rows.filter(([, , always], i) => always || n[i] > 0);
}

// What changes when a party leaves: head-on clash topics if they differ, else substantial-gap topics, else null.
/** @param {{ status: string }[]} statusesBefore @param {{ status: string }[]} statusesAfter */
export function withoutDelta(statusesBefore, statusesAfter) {
  const b = breakdown(statusesBefore);
  const a = breakdown(statusesAfter);
  if (b.clash !== a.clash) return { kind: 'clash', before: b.clash, after: a.clash };
  if (b.major !== a.major) return { kind: 'major', before: b.major, after: a.major };
  return null;
}

// Matrix cell: vs the base if there is one, else the party's worst level vs any other member.
/**
 * @param {Context} ctx @param {string} partyId @param {string} topicId @param {string[]} members
 * @param {string | null} [base]
 */
export function matrixCell(ctx, partyId, topicId, members, base) {
  if (base) {
    if (partyId === base) return { level: 'REF' };
    if (!hasPos(posOf(ctx.idx, base, topicId))) return { level: 'BASE_NULL' };
    return { ...pairLevel(ctx.idx, base, partyId, topicId), ref: base };
  }
  /** @type {{ level: PairLevelName, d: number | null, red: boolean, byRedLine?: boolean }} */
  let worst = { level: 'NONE', d: null, red: false };
  /** @type {string | null} */
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

/** @param {Context} ctx @param {string} a @param {string} b */
export function pairSummary(ctx, a, b) {
  /** @type {Record<string, number>} */
  const counts = { AGREE: 0, MINOR: 0, MAJOR: 0, CLASH: 0 };
  const rows = ctx.topics.map((t) => {
    const l = pairLevel(ctx.idx, a, b, t.id);
    if (l.level !== 'NONE') counts[l.level]++;
    return { topicId: t.id, ...l };
  });
  return { rows, counts, n: rows.filter((r) => r.level !== 'NONE').length };
}

/** @param {Context} ctx @param {string} partyId */
export function coverage(ctx, partyId) {
  return ctx.topics.filter((t) => hasPos(posOf(ctx.idx, partyId, t.id))).length;
}

/** @param {Context} ctx @param {string[]} ids */
const sumSeats = (ctx, ids) => ids.reduce((n, id) => n + ctx.seatsOf(id), 0);

// Every party that is not a member, supporter or abstainer is an opponent (the default role).
/** @param {State} state */
export const selected = ({ members, supporters = [], abstainers = [] }) => [...members, ...supporters, ...abstainers];

// The results header's two groups: the members, and the parties outside the coalition with their role (supporters, then
// abstainers, each in state order). `outside` is empty when every selected party is a member.
/** @param {State} state */
export const coalitionGroups = ({ members, supporters = [], abstainers = [] }) => ({
  members: [...members],
  outside: [...supporters.map((partyId) => ({ partyId, role: 'supporter' })), ...abstainers.map((partyId) => ({ partyId, role: 'abstainer' }))],
});

// Investiture vote: for = members + supporters, abstain = abstainers, against = everyone else (the house minus both).
// Approved when for > against (a majority of those voting). Members alone reaching 61 is reported separately.
// The house is the Knesset's 120 seats in both modes (#46): poll averages can add up to more than 120 (123 in October
// 2026), and counting that sum as the house would let 61 members lose the vote.
/** @param {Context} ctx @param {State} state */
export function investiture(ctx, { members, supporters = [], abstainers = [] }) {
  const membersSeats = Math.round(sumSeats(ctx, members));
  const forSeats = Math.round(sumSeats(ctx, [...members, ...supporters]));
  const abstain = Math.round(sumSeats(ctx, abstainers));
  const against = Math.max(0, ctx.house - forSeats - abstain);
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

// The axis, from one pole to the other. Shown only through each topic's labels, never as numbers.
export const AXIS = [-2, -1, 0, 1, 2];

// Seats at each axis label on one topic (#15, the topic sheet): coalition members only (supporters and abstainers are
// not counted), in axis order and never by size, plus the members with no stated position. Seats are summed as is (the
// app rounds poll averages), so the five labels and the no-position group always add up to the members' seats.
/**
 * @param {Context} ctx @param {string[]} members @param {string} topicId
 * @returns {{ byPosition: { position: number, seats: number, partyIds: string[] }[], noPosition: { seats: number, partyIds: string[] } }}
 */
export function seatsByPosition(ctx, members, topicId) {
  const ids = sortByParty(ctx, members);
  /** @param {number | null} pos */
  const at = (pos) => {
    const partyIds = ids.filter((id) => (posOf(ctx.idx, id, topicId)?.position ?? null) === pos);
    return { seats: sumSeats(ctx, partyIds), partyIds };
  };
  return { byPosition: AXIS.map((position) => ({ position, ...at(position) })), noPosition: at(null) };
}

// Supporters and abstainers vs the coalition: per party and topic, the worst MAJOR/CLASH pair against any member.
// Member-member pairs are covered by analyze(); these never are. Rows keep party order; items run worst first.
/** @param {Context} ctx @param {State} state */
export function periphery(ctx, { members, supporters = [], abstainers = [] }) {
  /** @type {{ partyId: string, role: string, items: Pair[] }[]} */
  const rows = [];
  for (const [role, ids] of /** @type {[string, string[]][]} */ ([['supporter', supporters], ['abstainer', abstainers]])) {
    for (const id of sortByParty(ctx, ids)) {
      /** @type {Pair[]} */
      const items = [];
      for (const t of ctx.topics) {
        /** @type {Pair | null} */
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
/** @param {Context} ctx @param {State} state */
export function peripheryClashes(ctx, state) {
  const rows = periphery(ctx, state);
  return rows.length ? rows.reduce((k, row) => k + row.items.filter((i) => i.level === 'CLASH').length, 0) : null;
}

// Members with at least `min` topics lacking a stated position (shown as a footnote under results).
/** @param {Context} ctx @param {string[]} members @param {number} [min] */
export function lowCoverage(ctx, members, min = 3) {
  return sortByParty(ctx, members)
    .map((id) => ({ partyId: id, missing: ctx.topics.length - coverage(ctx, id) }))
    .filter((x) => x.missing >= min);
}

// Red lines crossed inside a coalition: a member's red-line topic where another member is 2+ steps away
// (the same rule that turns a 2-step gap into a head-on clash). One entry per party and topic, in topic order.
/** @param {Context} ctx @param {string[]} members */
export function redLinesCrossed(ctx, members) {
  /** @type {RedLine[]} */
  const out = [];
  for (const t of ctx.topics) {
    for (const id of sortByParty(ctx, members)) {
      const own = posOf(ctx.idx, id, t.id);
      if (!hasPos(own) || !own.redLine) continue;
      if (members.some((m) => m !== id && (pairLevel(ctx.idx, id, m, t.id).d ?? 0) >= 2)) out.push({ partyId: id, topicId: t.id });
    }
  }
  return out;
}

// Display only (#31): red-line entries grouped by topic, topics in topic order and parties in party order.
/** @param {Context} ctx @param {RedLine[]} lines */
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
/** @param {Context} ctx @param {string[]} members @param {{ limit?: number }} [opts] */
export function completions(ctx, members, { limit = Infinity } = {}) {
  /** @param {number} seats */
  const reach = (seats) => Math.round(seats) >= 61;
  const have = sumSeats(ctx, members);
  if (!members.length || reach(have)) return { list: [], total: 0, currentRedLines: [] };
  const taken = new Set(members);
  /** @type {{ ids: string[], seats: number }[]} */
  const units = [];
  for (const p of ctx.parties) {
    if (taken.has(p.id) || !ctx.passed(p.id) || ctx.seatsOf(p.id) <= 0) continue;
    const partner = ctx.linkedOf(p.id);
    const ids = partner && ctx.byId.has(partner) && !taken.has(partner) && ctx.seatsOf(partner) > 0 ? [p.id, partner] : [p.id];
    for (const id of ids) taken.add(id);
    units.push({ ids, seats: sumSeats(ctx, ids) });
  }
  /** @type {{ add: string[], units: number, seats: number, total: number }[]} */
  const found = [];
  for (let mask = 1; mask < 1 << units.length; mask++) {
    const picked = units.filter((_, i) => mask & (1 << i));
    const added = picked.reduce((n, u) => n + u.seats, 0);
    if (!reach(have + added) || picked.some((u) => reach(have + added - u.seats))) continue;
    const add = sortByParty(ctx, picked.flatMap((u) => u.ids));
    found.push({ add, units: picked.length, seats: Math.round(added), total: Math.round(have + added) });
  }
  /** @param {{ add: string[] }} c */
  const orderKey = (c) => c.add.map((id) => rank(ctx, id));
  found.sort((x, y) => x.units - y.units || x.seats - y.seats || compareRankDesc(orderKey(y), orderKey(x)));
  /** @param {string[]} ids */
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
/** @param {Context} ctx @param {string} x */
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
    ownRedLines: ctx.topics.filter((t) => hasPos(posOf(ctx.idx, x, t.id)) && posOf(ctx.idx, x, t.id)?.redLine).length,
  };
}

// Clash analysis covers coalition members only; supporters and abstainers are in periphery().
/** @param {Context} ctx @param {State} state */
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
/** @param {State} state @param {string} partyId @returns {State & { base: string | null, supporters: string[], abstainers: string[] }} */
export function dropParty(state, partyId) {
  /** @param {string[]} [ids] */
  const keep = (ids = []) => ids.filter((id) => id !== partyId);
  return {
    base: state.base === partyId ? null : state.base ?? null,
    members: keep(state.members),
    supporters: keep(state.supporters),
    abstainers: keep(state.abstainers),
  };
}

// What the coalition looks like without one party (for the friction card preview).
/** @param {Context} ctx @param {State} state @param {string} partyId */
export function without(ctx, state, partyId) {
  return analyze(ctx, dropParty(state, partyId));
}

// Parties a result depends on (#13): a member without which the members drop below 61; a member or supporter without
// which the investiture vote fails (for ≤ against); an abstainer whose vote against makes it fail. "Without" is
// dropParty: an unselected party votes against. Nothing when the vote already fails (61 members implies it passes).
// Role order (members, supporters, abstainers), then party order; never ranked.
/** @param {Context} ctx @param {State} state */
export function pivotal(ctx, state) {
  return dependence(ctx, state).filter((p) => p.needed);
}

// The seats card's rows (#H1): every selected party, with the vote without it, by the same rule as pivotal() (needed =
// pivotal). Role order, then party order; never ranked. tie: without it, for = against. Nothing when the vote fails.
/** @param {Context} ctx @param {State} state */
export function dependence(ctx, state) {
  const now = investiture(ctx, state);
  if (!now.approved) return [];
  const { members, supporters = [], abstainers = [] } = state;
  return /** @type {[string, string[]][]} */ ([['member', members], ['supporter', supporters], ['abstainer', abstainers]])
    .flatMap(([role, ids]) => sortByParty(ctx, ids).map((partyId) => {
      const vote = without(ctx, state, partyId).vote;
      const breaksMajority = role === 'member' && now.membersMajority && !vote.membersMajority;
      const breaksVote = !vote.approved;
      return { partyId, role, vote, breaksMajority, breaksVote, needed: breaksMajority || breaksVote, tie: vote.for === vote.against };
    }));
}

// The seats card's summary: how many members, and how many parties outside the coalition, are needed (#H1).
/** @param {{ role: string, needed: boolean }[]} rows */
export function neededCount(rows) {
  /** @param {(r: { role: string }) => boolean} f */
  const count = (f) => ({ needed: rows.filter((r) => f(r) && r.needed).length, total: rows.filter(f).length });
  return { members: count((r) => r.role === 'member'), outside: count((r) => r.role !== 'member') };
}

// Seats against the 61 majority, for the wording: above it by n, exactly at it, or n short.
/** @param {number} seats @param {number} [quota] @returns {{ kind: 'over' | 'exact' | 'short', n: number }} */
export function majorityMargin(seats, quota = 61) {
  if (seats > quota) return { kind: 'over', n: seats - quota };
  return seats === quota ? { kind: 'exact', n: 0 } : { kind: 'short', n: quota - seats };
}

/** @param {Context} ctx */
export function presets(ctx) {
  /** @param {string} bloc */
  const inBloc = (bloc) => ctx.parties.filter((p) => p.bloc === bloc && ctx.passed(p.id)).map((p) => p.id);
  const opposition = inBloc('opposition');
  const largestOpposition = [...opposition].sort((a, b) => ctx.seatsOf(b) - ctx.seatsOf(a) || rank(ctx, a) - rank(ctx, b))[0];
  const arab = inBloc('arab');
  return {
    coalition: { members: inBloc('coalition'), supporters: [], abstainers: [] },
    opposition: { members: opposition, supporters: [], abstainers: [] },
    'opposition-arab': { members: opposition, supporters: arab, abstainers: [] },
    unity: { members: ['likud', largestOpposition].filter((id) => id != null && ctx.byId.has(id)), supporters: [], abstainers: [] },
  };
}

// URL state: ?b=base&m=members&o=supporters&a=abstainers (the base is a member and is not repeated in m).
// o= has meant outside support since launch, so old links keep their meaning. A party named under two roles
// takes the first of b/m > o > a.
/** @param {string} search @param {Iterable<string>} validIds @returns {State & { base: string | null, supporters: string[], abstainers: string[] }} */
export function parseState(search, validIds) {
  const q = new URLSearchParams(search);
  const valid = new Set(validIds);
  /** @param {string} k */
  const list = (k) => (q.get(k) ?? '').split(',').map((s) => s.trim()).filter((id) => valid.has(id));
  const b = list('b')[0] ?? null;
  const members = [...new Set([...(b ? [b] : []), ...list('m')])];
  const supporters = [...new Set(list('o'))].filter((id) => !members.includes(id));
  const abstainers = [...new Set(list('a'))].filter((id) => !members.includes(id) && !supporters.includes(id));
  return { base: b, members, supporters, abstainers };
}

/** @param {Context} ctx @param {State} state */
export function serializeState(ctx, { base, members, supporters = [], abstainers = [] }) {
  const q = new URLSearchParams();
  if (base) q.set('b', base);
  for (const [k, ids] of /** @type {[string, string[]][]} */ ([['m', members.filter((id) => id !== base)], ['o', supporters], ['a', abstainers]])) {
    if (ids.length) q.set(k, sortByParty(ctx, ids).join(','));
  }
  const s = q.toString().replace(/%2C/g, ',');
  return s ? `?${s}` : '';
}

// The undo line (#29) shows only when there is something to restore: the previous state had at least one party in any
// role, and the change made a difference. An empty start (e.g. from the home card) has nothing to go back to.
/** @param {Context} ctx @param {State} prev @param {State} next */
export const canUndo = (ctx, prev, next) => selected(prev).length > 0 && serializeState(ctx, prev) !== serializeState(ctx, next);

// The state lives in the fragment, `#<route>?b=…&m=…&o=…&a=…`, which browsers never send to the server.
// Links from before the move carry it in the query (`?m=…#results`); they are read once and rewritten.
// In-page targets of the method view (#why, a group, or a section inside a group): a fragment route that opens the
// method view, opens the target's group and scrolls to it. The routes the footer, the closest sheet and the TOC link to.
export const METHOD_ANCHORS = ['why', 'calc', 'closest-rule', 'rules', 'data', 'power', 'download', 'changes', 'privacy-a11y', 'privacy', 'accessibility'];
export const STATE_KEYS = ['b', 'm', 'o', 'a'];

/** @param {string | URLSearchParams} params */
export const stateKeysIn = (params) => STATE_KEYS.some((k) => new URLSearchParams(params).has(k));

// Splits a location into its route, its state (fragment first, then a legacy query) and the query without the
// state keys, which keeps any other param (e.g. ?s=wa) as it was.
// The pair view's two pickers (`#pair?p=a,b`): known ids, the same party at most once, in the order picked. A party
// under the threshold is allowed (its positions stay viewable). Returns two slots, null when empty.
/** @param {string} fragment @param {Iterable<string>} validIds @returns {[string | null, string | null]} */
export function parsePair(fragment, validIds) {
  const valid = new Set(validIds);
  const ids = [...new Set((new URLSearchParams(fragment).get('p') ?? '').split(',').map((s) => s.trim()).filter((id) => valid.has(id)))];
  return [ids[0] ?? null, ids[1] ?? null];
}

/** @param {{ search: string, hash: string }} location @param {Iterable<string>} validIds @param {Iterable<string>} [pairIds] */
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
    lang: l != null && LANGS.includes(l) ? l : 'he', hasParams: i >= 0,
    pair: parsePair(fragment, pairIds),
  };
}

// The first step on load, before any request: moves a legacy query's state params verbatim into the fragment
// (unless the fragment already has state, which wins) and returns the new `search + hash`, or null if there is none.
// The fragment's other params (l=, p=) are kept after the moved state (#46).
/** @param {{ search: string, hash: string }} location */
export function moveLegacyState({ search, hash }) {
  if (!stateKeysIn(search)) return null;
  const pairs = search.replace(/^\?/, '').split('&').filter(Boolean);
  const rest = pairs.filter((p) => !stateKeysIn(p)).join('&');
  const h = hash.replace(/^#/, '');
  const i = h.indexOf('?');
  const route = i < 0 ? h : h.slice(0, i);
  const own = i >= 0 ? h.slice(i + 1) : '';
  const fragment = stateKeysIn(own) ? own : [...pairs.filter(stateKeysIn), ...own.split('&').filter(Boolean)].join('&');
  return `${rest ? `?${rest}` : ''}#${route}?${fragment}`;
}

// `pair` (the pair view's slots) is written only when given; the caller passes it on the pair route alone.
/**
 * @param {Context} ctx @param {State} state @param {string} route @param {string} [search] @param {string} [lang]
 * @param {(string | null)[]} [pair]
 */
export function locationFor(ctx, state, route, search = '', lang = 'he', pair = []) {
  const s = serializeState(ctx, state);
  const ids = pair.filter(Boolean);
  const extra = [ids.length ? `p=${ids.join(',')}` : '', lang === 'he' ? '' : `l=${lang}`].filter(Boolean).join('&');
  return `${search}#${route}${s}${extra ? `${s ? '&' : '?'}${extra}` : ''}`;
}

// The /en/ entry page (#21): link previews can't see the fragment, so English share links go to /en/#…, a static page
// with English OG tags whose script calls this and redirects to /#…. Keeps the view and every parameter verbatim (b, m,
// o, a, p), drops any other l=, and adds l=en. The fragment never reaches the server or the query.
/** @param {string} hash */
export function enEntryHash(hash) {
  const h = hash.replace(/^#/, '');
  const i = h.indexOf('?');
  const route = i < 0 ? h : h.slice(0, i);
  const rest = (i < 0 ? '' : h.slice(i + 1)).split('&').filter((p) => p && !/^l(=|$)/.test(p));
  return `#${route}?${[...rest, 'l=en'].join('&')}`;
}

// ---------- a-priori voting power (#17, the method page, results mode) ----------
// Power from seats alone: no positions, red lines or preferences, only which sets of factions reach the quota. Exact,
// by dynamic programming over seat totals (no sampling). Weights are whole seat counts.

// Subsets of the other factions (every faction but `skip`) by size and seat total: count[k][w].
/** @param {number[]} weights @param {number} skip @returns {number[][]} */
function subsetCounts(weights, skip) {
  const total = weights.reduce((n, w) => n + w, 0);
  const count = Array.from({ length: weights.length + 1 }, () => new Array(total + 1).fill(0));
  count[0][0] = 1;
  let size = 0;
  weights.forEach((w, j) => {
    if (j === skip) return;
    size++;
    for (let k = size; k >= 1; k--) for (let s = total; s >= w; s--) count[k][s] += count[k - 1][s - w];
  });
  return count;
}

/** @param {number[]} weights @param {number} quota */
function checkGame(weights, quota) {
  if (!weights.every((w) => Number.isInteger(w) && w >= 0)) throw new Error('power indices: weights must be whole seat counts');
  if (!Number.isInteger(quota) || quota < 1) throw new Error('power indices: the quota must be a positive whole number');
}

// Faction i is a swing for a set S of the others when S is short of the quota and S with i reaches it.
/** @param {number[]} weights @param {number} quota @param {number} i @param {number[][]} count */
function swingSets(weights, quota, i, count) {
  /** @type {{ k: number, n: number }[]} */
  const out = [];
  for (let k = 0; k < weights.length; k++) {
    for (let s = Math.max(0, quota - weights[i]); s < quota && s < count[k].length; s++) if (count[k][s]) out.push({ k, n: count[k][s] });
  }
  return out;
}

// Normalized Banzhaf index: each faction's share of all swings (Dubey and Shapley, 1979). All zeros when no set wins.
/** @param {number[]} weights @param {number} quota @returns {number[]} */
export function banzhaf(weights, quota) {
  checkGame(weights, quota);
  const swings = weights.map((_, i) => swingSets(weights, quota, i, subsetCounts(weights, i)).reduce((n, x) => n + x.n, 0));
  const all = swings.reduce((n, x) => n + x, 0);
  return swings.map((x) => (all ? x / all : 0));
}

// Shapley-Shubik index: the share of the orders of joining in which the faction is the one that reaches the quota
// (Shapley and Shubik, 1954). A set S of k others before it, in any order, is k!(n-1-k)!/n! = 1 / (n · C(n-1, k)).
/** @param {number[]} weights @param {number} quota @returns {number[]} */
export function shapleyShubik(weights, quota) {
  checkGame(weights, quota);
  const n = weights.length;
  /** @param {number} m @param {number} k */
  const choose = (m, k) => { let c = 1; for (let j = 1; j <= k; j++) c = (c * (m - k + j)) / j; return c; };
  return weights.map((_, i) => swingSets(weights, quota, i, subsetCounts(weights, i)).reduce((sum, { k, n: c }) => sum + c / (n * choose(n - 1, k)), 0));
}

// The method page's table: every faction in the Knesset, in party order (never by index), with both indices.
/** @param {Context} ctx @param {number} [quota] */
export function powerIndices(ctx, quota = 61) {
  const ids = ctx.parties.filter((p) => ctx.passed(p.id) && ctx.seatsOf(p.id) > 0).map((p) => p.id);
  const seats = ids.map((id) => ctx.seatsOf(id));
  const b = banzhaf(seats, quota);
  const s = shapleyShubik(seats, quota);
  return ids.map((partyId, i) => ({ partyId, seats: seats[i], banzhaf: b[i], shapleyShubik: s[i] }));
}
