// All user-visible UI strings in English, with the same shape as strings.js (test/strings.test.mjs checks the parity).
// The Hebrew text is authoritative; this is a translation of it. Glossary: CLAUDE.md.
export const plural = (n, one, many) => (n === 1 ? one : `${n} ${many}`);
const topicsN = (n) => plural(n, '1 topic', 'topics');
const inTopics = (n) => `on ${topicsN(n)}`;
// Head-on clashes with the parties outside the coalition: the snapshot's outside block and the share text.
const clashesN = (n) => (n === 0 ? 'no head-on clashes' : n === 1 ? '1 head-on clash' : `${n} head-on clashes`);
const seatsN = (n) => plural(n, '1 seat', 'seats');
// People and channels named in the data (quote speakers, where a quote was published, who translated it). The source
// of each English spelling is in docs/research/decisions.md; test/strings.test.mjs checks every value has an entry.
export const NAMES = {
  'בנימין נתניהו': 'Benjamin Netanyahu', 'גדי איזנקוט': 'Gadi Eisenkot', 'נפתלי בנט': 'Naftali Bennett',
  'איתמר בן גביר': 'Itamar Ben-Gvir', 'אריה דרעי': 'Aryeh Deri', 'בצלאל סמוטריץ׳': 'Bezalel Smotrich',
  'מנסור עבאס': 'Mansour Abbas', 'יריב לוין': 'Yariv Levin', 'משה פייגלין': 'Moshe Feiglin',
  'פייסבוק': 'Facebook', 'כיפה': 'Kipa',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMonth = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };

export const S = {
  lang: 'en',
  dir: 'ltr',
  locale: 'en',
  // 2026-10-30 -> 30 Oct 2026; a year alone (an older platform with no exact date) stays as is.
  fmtDate: (iso) => (!iso ? '' : /^\d{4}$/.test(iso) ? iso : `${dayMonth(iso)} ${iso.slice(0, 4)}`),
  appName: 'Mi Im Mi',
  pageTitle: 'Mi Im Mi · Who With Whom',
  tagline: 'Build a coalition and see where the parties agree and where they clash',
  updated: (d) => `Updated ${d}`,
  stubBanner: 'Dummy data for development only: these positions are not real',
  skip: 'Skip to results',
  loadError: 'The data could not be loaded. Try refreshing the page.',
  langSwitch: { label: 'Language', other: 'he' },
  langNames: { he: 'עברית', en: 'English' },
  translatedNote: 'Translated from Hebrew; the Hebrew is authoritative',
  nameOf: (n) => NAMES[n] ?? n,

  nav: {
    method: 'How it works',
    methodShort: 'About',
    back: '← Edit',
    toResults: 'Results →',
    backFromMethod: '← Back',
    partyCount: (n) => `${plural(n, '1 party', 'parties')} selected`,
  },
  buildIntro: (n) => `Where the parties agree and where they clash, ${inTopics(n)}, with a source for every position.`,
  // The build view's task cards (#26), in a fixed order. Each line says what the tool shows, never what it concludes.
  home: {
    title: 'What you can do here',
    build: 'Build a coalition',
    buildLine: (n) => `Pick parties, give each one a role, and see where they agree and where they clash ${inTopics(n)}.`,
    closest: 'Find coalitions for a party',
    // The first two keys of the #22 order, exactly; the rest is on the method page (closestRule).
    closestLine: 'Pick a party to see majority coalitions that include it. Listed first: those that cross fewer of its red lines; on a tie, those with fewer topics in head-on clash with it.',
    pair: 'Compare two parties',
    pairLine: (n) => `Two parties' stated positions side by side ${inTopics(n)}, with a source for each.`,
  },
  sourceMix: (n, p, s, r) => `${n} documented positions: ${p} from platforms, ${s} from statements, ${r} from the record.`,
  voterInfo: 'Election day: Tuesday, 27 Oct · Most polling stations are open 7:00–22:00 ·',
  voterInfoLink: 'Where do I vote? (Hebrew)',
  voterInfoUrl: 'https://www.gov.il/apps/moin/bocharim/',
  buildPurpose: 'Positions come from platforms, official statements and bills the parties initiated or advanced. This is not a voting recommendation.',

  how: {
    title: 'How it works',
    lines: [
      'Pick parties, or start from a ready-made scenario and change it.',
      'Each party has a position on 8 topics, based on its platform, official statements and actual record (bills the party initiated or advanced), with a source.',
      'The color shows the distance between positions, not what is right.',
    ],
    more: 'Full methodology →',
    tapHint: 'Tap any cell or topic to see the source and why it has this color',
  },

  presets: {
    title: 'Ready-made scenarios',
    'opposition-arab': 'Opposition + Arab support from outside',
    unity: 'Unity',
    opposition: 'Opposition bloc',
    coalition: 'Coalition bloc',
    blocNote: 'Blocs as defined by Bakalpi and N12.',
    scenariosTitle: (d) => `Scenarios raised in the media · as of ${d}`,
    scenariosNote: 'Tapping a scenario fills in the selection, and you can change it. A party not named in it counts as opposed.',
    // The collapsed disclosure in the builder section (#26).
    scenariosStart: (n, d) => `Or start from a scenario raised in the media (${n}) · as of ${d}`,
    presetsStart: 'Or start from a ready-made scenario',
    scenarioLabel: (members, supporters, abstainers) => [
      members.join(' + '),
      supporters.length ? `${supporters.length === 1 ? 'supporter' : 'supporters'}: ${supporters.join(', ')}` : '',
      abstainers.length ? `${abstainers.length === 1 ? 'abstainer' : 'abstainers'}: ${abstainers.join(', ')}` : '',
    ].filter(Boolean).join(' · '),
    sourcesLabel: (n) => (n === 1 ? 'Source:' : 'Sources:'),
    personIn: (person) => `${person} in `,
    // 2026-10-31 -> 31 Oct
    shortDate: (iso) => dayMonth(iso),
  },

  builder: {
    yours: 'Your coalition',
    empty: 'No parties selected yet',
    add: 'Add a partner',
    clear: 'Clear all',
    base: 'Base',
    setBase: (n) => `Make ${n} the base`,
    unsetBase: (n) => `Remove ${n} as the base`,
    remove: (n) => `Remove ${n}`,
    addParty: (n) => `Add ${n}`,
    outside: 'From outside',
    borderline: 'At the threshold',
    seatsChip: (n) => seatsN(n),
    title: 'Build a coalition',
    pick: 'Pick parties',
    baseTag: '★ Base',
    hint: 'Each party you pick has a role: in the coalition (sits in the government), supporter (supports the government from outside) or abstainer (in the confidence vote). A party you did not pick counts as opposed. Clashes are checked among coalition members, and the gaps of supporters and abstainers are shown separately. You choose a base for comparison in the results.',
    roles: { member: 'In coalition', supporter: 'Supporter', abstainer: 'Abstainer' },
    roleGroup: (n) => `${n}: role`,
    roleAnnounce: (n, role) => `${n}: ${role}`,
    rowLabel: (n) => n,
    ownMissing: (n) => `?${n}`,
    ownMissingLabel: (n) => `No stated position ${inTopics(n)}`,
    impactLabel: (a, c, u) => `Compared with the current coalition: ${topicsN(a)} in agreement or a small gap, ${c} in a head-on clash, ${u} with no stated position`,
    impactHeading: 'Compared with the current coalition',
    impactAgree: 'Agreement or small gap',
    impactClash: 'Head-on clash',
    impactUnknown: 'No position',
    clashChipLabel: (n) => `Adding it creates a head-on clash ${inTopics(n)}`,
    coverage: (n) => `Positions: ${n} of 8`,
    jointListNote: (letters) => `Ran on a joint list (${letters})`,
    linkedNote: (a, b) => `${a} and ${b} ran on a joint list and announced they would split and negotiate separately.`,
  },

  seats: {
    counter: (n) => `About ${n} of 61 seats`,
    missing: (n) => `${n} short of 61`,
    reached: 'A majority of 61',
    withOutside: (inside, out) => `About ${inside} in the coalition, plus ${out} from outside`,
    total: (n) => `(about ${n} in total)`,
    borderlineNote: (n) => `Includes ${n} from a party at the threshold, possibly 0`,
    unityMissing: (n) => `You are ${seatsN(n)} short of 61`,
    unit: 'seats',
    boxTitle: 'Seats',
    empty: 'Pick parties to see how many seats they have together.',
    num: (n, exact) => `${exact ? '' : '≈'}${n}`,
    vote: (f, a, z) => `For ${f} · Against ${a} · Abstaining ${z}`,
    approved: 'The government would win the confidence vote (for > against)',
    rejected: 'The government would not win the confidence vote',
    membersLine: (n, missing) => (missing ? `Coalition members alone: ${n} of 61 · ${missing} short` : `Coalition members alone: ${n} · a majority of 61`),
    meterLabel: (n) => `Coalition members: ${n} of 61`,
    // Parties a result depends on (#13). Numbers come formatted (≈ in polls mode); members is null unless the 61 breaks.
    // A removed party votes against; an abstainer is shown as voting against.
    pivotalIntro: (majority) => `Parties without which ${majority ? 'the members no longer have 61, or ' : ''}the confidence vote has no majority (for vs against):`,
    pivotalRow: (name, role, members, f, a) => (role === 'abstainer' ? `If ${name} votes against: ${f} vs ${a}`
      : `Without ${name}${role === 'supporter' ? ' (supports from outside)' : ''}: ${members != null ? `coalition members ${members} of 61 · ` : ''}${f} vs ${a}`),
    pivotalNone: 'No single party does this.',
    majority: 'Majority',
    short: (n) => `${n} short`,
    outsideBit: (n) => `+ ${n} from outside`,
    // A translation for the reader; the app shows the required Hebrew sentence verbatim before it.
    pollLegal: (d) => `Average of polls published up to ${d}. The polls are not current, and nothing should be inferred from them about voting patterns or public opinion today.`,
    sourceInfo: 'Source',
    infoTitle: 'Where the seat numbers come from',
    infoBody: 'The seat numbers are the average of each party\'s last five polls, as shown on Bakalpi, and are shown only to give a sense of scale. This is not a forecast.',
    infoSource: 'Bakalpi: polls and averages (Hebrew)',
    infoGuidance: 'Election guidance (gov.il) on republishing polls (Hebrew)',
  },

  elected: {
    positionsAsOf: 'Positions: as of election eve (27 Oct)',
    sourceLink: 'Results on the Central Elections Committee website (Hebrew)',
    belowTitle: 'Did not pass the electoral threshold',
    belowHint: 'You can see their positions, but you cannot pick them for a coalition.',
    belowPct: (pct) => `${pct}% of the vote`,
    viewPositions: (n) => `Positions of ${n}`,
    partyResult: (seats, pct, votes, joint) => `${seatsN(seats)}${joint ? ' (part of the joint list)' : ''} · ${pct}% of the vote · ${votes} votes${joint ? ' for the list' : ''}`,
    partyBelow: (pct, threshold) => `Did not pass the electoral threshold: ${pct}% of the vote (threshold ${threshold}%).`,
    resultsTitle: 'Election results',
    vsTitle: (d) => `Poll average (${d.replace(/ \d{4}$/, '')}) vs. results`,
    vsSplitNote: '* The joint list\'s average (about 7), split by us according to Zehut\'s places on the list.',
    vsCols: (d) => ['Party', `Average of polls published up to ${d}`, 'Seats in the results'],
    resultsText: 'The seat numbers are the results published by the Central Elections Committee, as published. They are not recomputed from vote shares, because surplus-vote agreements change the allocation.',
  },

  levels: {
    AGREE: { label: 'Agree', icon: '✓' },
    MINOR: { label: 'Small gap', icon: '≈' },
    MAJOR: { label: 'Substantial gap', icon: '≠' },
    CLASH: { label: 'Head-on clash', icon: '✕' },
    NONE: { label: 'No stated position', icon: '–' },
    NODATA: { label: 'Not enough positions', icon: '–' },
  },
  redLine: 'Red line',
  componentsDisagree: 'Divided within the list',
  componentsIcon: '◐',
  componentsNote: (names) => `A joint list of ${names}. Where its components differ on a topic, the cell is marked ◐ and the summary gives each one's position.`,
  // Hebrew attaches "to" to the name; English needs no change.
  toParty: (name) => name,

  results: {
    pickOne: 'Pick at least one party, or a ready-made scenario.',
    summaryTitle: 'Overview',
    // The snapshot title with 2+ members: everything up to the outside block is between the members only.
    summaryTitleScoped: (n) => `Overview: between the ${n} coalition members`,
    // Before the counts, only when there are parties outside the coalition.
    breakdownLabel: 'Topics between the coalition members:',
    addPartner: 'Add a partner to see clashes',
    crisesTitle: (n) => (n === 1 ? 'The crisis waiting for this coalition' : `The ${n} crises waiting for this coalition`),
    gapsTitle: 'The topics with the largest gaps',
    pairsTag: (label, n) => `${label} · ${plural(n, '1 pair of parties', 'pairs of parties')}`,
    expand: 'Show all pairs of parties on this topic',
    collapse: 'Hide the pairs of parties',
    pairsInTopic: (n, levelIn) => `${plural(n, '1 pair of parties', 'pairs of parties')} ${levelIn}`,
    levelIn: { CLASH: 'in a head-on clash', MAJOR: 'with a substantial gap', MINOR: 'with a small gap', AGREE: 'in agreement' },
    noCrises: 'No substantial gaps between the partners',
    morePairs: (n) => `and ${plural(n, '1 more pair of parties', 'more pairs of parties')}`,
    glueTitle: 'What unites it',
    noGlue: 'No topic on which all the partners agree',
    noAgree: 'No topic on which all the partners agree',
    minorOnly: (names) => `Small gap only: ${names}`,
    // The results header: one line when every party is a member, two labelled groups otherwise.
    coalitionLabel: 'The coalition being checked',
    membersLabel: (n) => `In the coalition (${n})`,
    outsideLabel: 'Outside the coalition',
    outsideParty: (name, role) => `${name} · ${role}`,
    noMembers: 'Mark at least one party as "In coalition" to see clashes.',
    peripheryTitle: 'Where the supporters and abstainers are far from the coalition',
    peripheryIntro: 'For each supporter and abstainer: the topics where it has a substantial gap or a head-on clash with a coalition member, and the member furthest from it. These gaps are not counted in the overview above.',
    peripheryNone: 'No topic with a substantial gap or a head-on clash with the coalition members.',
    roleName: { supporter: 'supports from outside', abstainer: 'abstains' },
    versus: (n) => `vs. ${n}`,
    // Red lines crossed among the members (#14): one line in the snapshot, also shown when there are none.
    redLinesCrossed: (n, list) => `${n === 1 ? '1 red line is' : `${n} red lines are`} crossed between the coalition members: ${list}`,
    noRedLinesCrossed: 'No red line is crossed between the coalition members',
    // The snapshot's outside block: its heading, and the link to the supporters/abstainers card.
    outsideHeading: 'Versus the parties outside the coalition',
    peripheryLink: (n) => `↓ ${n === 0 ? 'No head-on clashes' : clashesN(n)} with the coalition members`,
    glueCoverage: (k, n) => `(${k} of ${n} partners stated a position)`,
    frictionTitle: 'The partner that creates the most friction',
    frictionTie: 'The partners that create the most friction',
    whatIfRemove: 'What if we drop it?',
    withoutPreview: (delta, seats, exact) => {
      const parts = [];
      if (delta) {
        const what = delta.kind === 'clash' ? 'in a head-on clash' : 'with a substantial gap';
        parts.push(delta.after === 0 ? `no topic ${what} instead of ${delta.before}` : `${topicsN(delta.after)} ${what} instead of ${delta.before}`);
      }
      if (seats != null) parts.push(`${exact ? '' : 'about '}${seatsN(seats)}`);
      return parts.length ? `Without it: ${parts.join(' · ')}` : '';
    },
    // The inline undo line at the top of the results view (#29): what changed, "Restore previous", and a close button.
    undoReplaced: 'The coalition was replaced',
    undoAdded: (names) => `Added: ${names.join(', ')}`,
    undoRemoved: (n) => `Removed: ${n}`,
    undo: 'Restore previous',
    undoClose: 'Close this message',
    // Announced after undo; outside parties mirror the header's groups ("C (supports from outside)").
    restored: (members, outside) => {
      const out = outside.length ? `Outside the coalition: ${outside.join(', ')}` : '';
      if (!members.length) return `Previous coalition restored · ${out}`;
      return `Previous coalition restored: ${members.join(' + ')}${out ? ` · ${out}` : ''}`;
    },
    overall: (x, y) => `${x} of ${topicsN(y)} without a head-on clash`,
    breakdown: (a, mi, m, c, w) => [
      [`${topicsN(a)} in agreement`, 'bd-ok', false],
      [`${mi} with a small gap`, 'bd-minor', false],
      [`${m} with a substantial gap`, 'bd-major', false],
      [`${c} in a head-on clash`, 'bd-clash', true],
      [`${w} with no data`, 'bd-none', true],
    ],
    resultsEmpty: 'You have not picked any parties yet.',
    resultsEmptyLink: 'Pick parties',
    noData: 'No data',
    coverageLine: (toName, n) => `* ${toName} has no stated position on ${n} of the 8 topics.`,
    coverageTail: 'Topics without a position are not counted, so the coalition may look more harmonious than it really is.',
    live: (name, n) => `${name}: ${topicsN(n)} in a head-on clash in the coalition`,
  },

  completions: {
    title: 'What is missing for a majority of 61 coalition members?',
    note: 'Supporters and abstainers are not counted here; they affect only the confidence vote.',
    intro: (have) => `The coalition members have ${have} seats. These are the smallest combinations of additional parties that bring them to 61: remove any one party from a combination and it no longer gets there. Order: combinations with the fewest parties first, then by the number of seats added. This is not a recommendation. Tapping adds the parties to the coalition.`,
    currentRedLines: (n, list) => `The current coalition already crosses ${n === 1 ? '1 red line' : `${n} red lines`}: ${list}`,
    seats: (added, total) => `+${seatsN(added)} (${total} in total)`,
    clashes: (n, fresh) => (n === 0 ? 'No topic in a head-on clash'
      : `${topicsN(n)} in a head-on clash (${fresh === 0 ? 'none new' : `${fresh} new`})`),
    newRedLines: (n, list) => `${n === 1 ? '1 new red line' : `${n} new red lines`}: ${list}`,
    noNewRedLines: 'No new red lines',
    nowRole: { supporter: '(currently a supporter)', abstainer: '(currently an abstainer)' },
    aria: (names, meta, red) => `Add ${names}: ${meta}, ${red}`,
    showAll: (n) => `Show all ${n}`,
    showFewer: 'Show fewer',
    none: 'No combination of the remaining parties brings the coalition members to 61.',
    applied: (names) => `Added to the coalition: ${names}`,
  },

  // "Coalitions closest to the stated positions of X" (#22, results mode): from the party sheet or the build view.
  closest: {
    button: (x) => `Coalitions closest to the stated positions of ${x}`,
    title: (x) => `Coalitions closest to the stated positions of ${x}`,
    back: (x) => `Back to ${x}`,
    intro: (x) => `Order: red lines · clashes with ${x} · clashes in the whole coalition · agreement · seats. Not a recommendation.`,
    howLink: 'How is this calculated?',
    ownCoverage: (toX, n) => `${toX} has a stated position on ${n} of 8 topics; only those are compared.`,
    noRedLines: (toX) => `${toX} has no declared red line.`,
    agree: (n) => `${topicsN(n)} in agreement or a small gap`,
    xClash: (n, x) => `${n} in a head-on clash with ${x}`,
    wholeClash: (n) => `${n} in a head-on clash in the whole coalition`,
    redLines: (n, list) => (n === 0 ? 'none of its red lines crossed' : `${n === 1 ? '1 of its red lines crossed' : `${n} of its red lines crossed`}: ${list}`),
    seats: (n) => seatsN(n),
    warn: (list) => `Few stated positions: ${list}`,
    warnItem: (name, missing, first) => (first ? `${name} (no position on ${missing} of 8)` : `${name} (${missing})`),
    orList: (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`),
    showPartial: (n, list) => (n === 1 ? `Also show 1 coalition that includes ${list}` : `Also show ${n} coalitions that include ${list}`),
    hidePartial: (list) => `Hide the coalitions that include ${list}`,
    onlyPartial: (list) => `All of these coalitions include ${list}`,
    partialNote: 'These parties have no stated position on some topics, so the comparison with them is partial and the counts may be lower than reality. For example, a red line isn\'t counted when there\'s no position on that topic.',
    none: 'No minimal coalition of 61 seats includes this party.',
    aria: (partners, meta) => `Select the coalition ${partners}: ${meta}`,
    applied: (names) => `Coalition selected: ${names}`,
    pickerChoose: 'Choose a party',
  },

  matrix: {
    title: 'Map of positions',
    reference: '● Reference point',
    relBase: (n) => `Color = the gap from ${n} (the base)`,
    relWorst: 'Color = the party\'s most severe clash on the topic with any partner',
    baseHint: 'Pick a party to see how all the others match it.',
    colorBy: 'Color by:',
    colorByAll: 'All',
    colorByAllHint: 'All: the color shows the most severe clash with any partner',
    baseNull: 'The base has no position',
    cellLabel: (party, topic, level, ref) => (ref
      ? `${party}, ${topic}: ${level} vs. ${ref}`
      : `${party}, ${topic}: ${level}`),
  },

  sheet: {
    siteTranslation: '(the site\'s free translation)',
    translationBy: (n) => `(translation: ${n})`,
    close: 'Close',
    source: 'Source',
    extraSource: 'Additional source',
    via: 'via Bakalpi',
    sourceTypes: { platform: 'Platform', statement: 'Statement', record: 'Legislative record' },
    date: (d) => (/^\d{4}$/.test(d) ? `from ${d}` : `dated ${d}`),
    why: 'Why this color?',
    noPosition: 'We found no stated position of the party on this topic in a source that meets our rules.',
    gap: (a, b, d, la, lb) => `${a} ↔ ${b}: ${d} steps (${la} ↔ ${lb})`,
    gapRed: (a, b, d, red) => `${a} ↔ ${b}: ${d} steps, and ${red} has declared this a red line`,
    officialName: 'Official list name',
    archive: 'Archived copy',
    correction: 'Found a mistake in this position?',
    correctionBody: 'Link to the page:',
    correctionSubject: (party, topic) => `Correction: ${party} · ${topic}`,
    refExplain: 'This is the base party. The rest of the column is colored by the distance from it.',
    noneExplain: 'One of the parties has no stated position on this topic, so there is no comparison. The cell is not counted in the results.',
    agree: (a, b) => `${a} and ${b} are at the same point on the scale.`,
    gapTitle: (a, b, d) => `${a} ↔ ${b}: ${d === 1 ? '1 step' : `${d} steps`} on the scale`,
    redByLine: (party) => `${party} has declared this topic a red line, so a gap of 2 steps counts as a head-on clash.`,
    axisTitle: 'The scale for this topic',
    noPositionLabel: 'No stated position',
    partyProfile: 'All positions',
    nobodyHere: 'None',
  },

  pair: {
    title: 'Compare a pair',
    compareWith: 'Compare with…',
    choose: 'Pick a party to compare',
    viewTitle: 'Comparing two parties',
    intro: (n) => `The stated positions of two parties side by side, on ${topicsN(n)}, with a source for each. This is not a recommendation or a forecast.`,
    pickA: 'First party',
    pickB: 'Second party',
    pickBoth: 'Pick two parties to see their positions on each topic.',
    // summary: pair.summary(...) for the two parties, all four levels.
    shareText: (a, b, summary) => `Positions compared: ${a} ↔ ${b} · ${summary}`,
    summary: (agree, minor, major, clash, n) =>
      `Agree on ${agree}, small gap on ${minor}, substantial gap on ${major}, head-on clash on ${clash}, out of ${topicsN(n)}`,
  },

  share: {
    button: 'Share',
    copied: 'Link copied',
    whatsapp: 'Send on WhatsApp',
    // names: the members. outside: [name, role] of the supporters and abstainers, with periphery = their head-on clashes
    // with the members; without outside parties the text is unchanged.
    text: (names, clashes, periphery = null, outside = []) => (outside.length
      ? `The coalition I built: ${names} · Outside the coalition: ${outside.map(([n, r]) => `${n} (${r})`).join(', ')} · ${topicsN(clashes)} in a head-on clash between the coalition members · ${clashesN(periphery)} with the parties outside the coalition`
      : `The coalition I built: ${names} · ${topicsN(clashes)} in a head-on clash`),
  },

  method: {
    title: 'Methodology, sources and clarifications',
    translationTitle: 'About this translation',
    translation: 'This English version was translated from the Hebrew, which is authoritative. The summaries, the translations of quotes and the topic and scale labels were translated by the site, then checked by an independent reviewer: first a blind back-translation into Hebrew, then a comparison with the original. Quotes stay in their original language. Party and leader names follow the Government Press Office\'s English list or the party\'s own English, and are otherwise transliterated.',
    colorRule: 'Red = the parties are 3 or more steps apart on the scale, or 2 steps when one of them has declared it a red line.',
    disclaimer: 'This is not a voting recommendation.',
    independent: 'The site is independent and not affiliated with Bakalpi or with any party.',
    names: 'List names as published by the Central Elections Committee. English names follow the Government Press Office\'s English list or the party\'s own English, and are otherwise transliterated.',
    intro: (n) => `For each of the ${n} parties we set a position on a 5-point scale on each of 8 topics, based on what the party itself said or wrote. The match between parties is computed automatically from the distance on the scale, with no manual judgment of pairs.`,
    levelsTitle: 'How the color is set',
    levelRules: [
      ['AGREE', 'The same point on the scale'],
      ['MINOR', '1 step'],
      ['MAJOR', '2 steps'],
      ['CLASH', '3 or more steps, or 2 steps when one of the parties has declared it a red line'],
      ['NONE', 'One of the parties has no stated position; not counted'],
    ],
    impactRule: 'When picking parties: next to each party not yet picked are three numbers relative to the current coalition. On each topic, the party\'s largest gap with the current members is checked: ✓ = agreement or a small gap (counted separately in the results summary), ✕ = a head-on clash, ? = no stated position (of the party, or of all the current members). A substantial gap counts in none of them. The numbers are for information only: they do not change the order of the parties and are not a recommendation.',
    breakdownRule: 'In the results: a topic counts as "in agreement" when all coalition members that stated a position are at the same point, "with a small gap" when its largest gap is 1 step, "with a substantial gap" when it is a substantial gap, "in a head-on clash" when it has a head-on clash, and "with no data" when at least two members have no stated position. There is no overall score.',
    pairRule: 'The two-party comparison shows every topic in its fixed order, with the same gap levels as the rest of the site. A topic where either party has no stated position is marked "No stated position" and is not counted in the summary.',
    closestTitle: 'Coalitions closest to a party',
    closestRule: 'The sheet of every party that passed the threshold shows the coalitions closest to its stated positions. Only minimal coalitions are included: the party plus partners that together hold at least 61 seats, where without any one of the partners there is no 61. Supporters and abstainers are not counted. The list shows the coalitions where every partner has a stated position on at least 6 of the 8 topics. Coalitions with a partner that has no position on 3 or more topics are shown separately, only on request, each with a warning: the comparison with them is partial, and the counts may be lower than reality (for example, a red line isn\'t counted when there\'s no position on that topic). In both lists the order is fixed, with no weights and no combined score: first, fewer of the party\'s own red lines crossed; then fewer topics where it is in a head-on clash with any partner; then fewer topics with a head-on clash anywhere in the coalition, between any two members; then more topics where the party agrees, or has a small gap, with every partner that stated a position (a topic counts only if the party and at least one partner stated a position on it); then more seats. On a full tie: fewer partners, then party order. A topic without a stated position is not counted. This is not a recommendation or a forecast.',
    matrixRule: 'On the map: under "Color by" you can pick a base party, and then each cell is colored by the gap from the base. Without a base, each cell shows the party\'s most severe clash on the topic with any partner.',
    resultsRule: (seats) => `The crises: the topics with the most severe gap, by severity, distance${seats ? ', red line and then the pair\'s total seats' : ' and red line'}. The partner that creates the most friction: 3 points for each head-on clash and 1 point for each substantial gap with the other partners (the base party is not counted). A party with fewer stated positions collects fewer points.`,
    axesTitle: 'The scales',
    sourcesTitle: 'Sources',
    sourceRules: [
      ['platform', 'Platform: the election platform or a program the party published.'],
      ['statement', 'Statement: the words of the party or its leaders in their own voice: a website, an official account, a recorded interview or a direct quote. A journalist\'s description is not a source.'],
      ['record', 'Legislative record: a bill the party itself initiated or advanced. We planned to include votes in which a party broke from its bloc\'s line as well, but in practice no position rests on a vote. An ordinary vote under coalition discipline is not evidence of a position.'],
    ],
    corrections: 'Found a mistake? Write to us and we will fix it.',
    researchDocs: 'Placement reasoning and review decisions',
    researchDocsNote: 'Every position has a record of the evidence and of the review decisions, including red lines and considerations that came up.',
    redLineRule: 'A red line is marked only when the party or its leader said explicitly, in their own words and in public, that the topic is a condition for joining a coalition. Not from media reports.',
    redLineTest: 'The wording test: it takes a statement that without X the party will not join or support a government ("we will not be partners in any government that…", "a threshold condition"), or that X is not up for negotiation ("no concession", "we will not give in"). A list of priorities ("at the top of our demands") is not a red line. The test is by wording only, regardless of the bloc.',
    redLinesCrossedRule: 'The status summary has one line on red lines: a member\'s red line is crossed when another member is 2 or more steps away on that topic (the same rule that turns a 2-step gap into a head-on clash). Only stated red lines count, and a topic with no stated position is not counted. When none is crossed, the line says so. It is the same list as in the "what is missing for 61" card. This line checks only the coalition members. Red lines of supporters and abstainers are not checked here. In their card, 🚩 marks a 2-step gap that counts as a head-on clash because of a red line.',
    rolesTitle: 'Roles and the confidence vote',
    rolesRules: (seats, linked) => [
      'Each party has one of four roles: in the coalition, supporter from outside, abstainer, or opposed. Opposed is the default for any party not picked.',
      'The crises, what unites it, the friction and the map of positions are checked only among coalition members. The gaps of supporters and abstainers with the coalition members are shown in a separate card.',
      ...(seats ? [
        'The confidence vote: for = the seats of the coalition members and the supporters. Abstaining = the seats of the abstainers. Against = everyone else, assuming every party not marked votes against. The government wins the confidence vote when there are more votes for than against (a majority of those voting).',
        'Whether the coalition members alone have 61 seats is shown separately.',
        'Under the vote, the parties the outcome depends on, each on its own: a member without which the coalition members no longer have 61, and a member or supporter without which the confidence vote has no majority (for not greater than against; a tie included). A party that leaves counts as opposed, like any party not picked. An abstainer is checked as if it voted against. Each party is shown with the numbers without it (for vs against, and the coalition members\' seats when they drop below 61). The parties are listed by role and then in party order, with no ranking. When the government would not win the confidence vote, the list is not shown.',
        'Not computed: individual Knesset members moving between positions, absences, and Knesset members voting against their faction\'s position.',
        `What is missing for a majority of 61: the smallest combinations of parties that are not coalition members (including supporters and abstainers) that bring the coalition members alone to at least 61 seats. A combination counts as "smallest" when removing any one of its parties leaves the coalition below 61. ${linked ? 'Religious Zionism and Zehut, which ran on one list, count as one unit when neither is in the coalition. ' : ''}Order: combinations with the fewest lists first, then by the number of seats added, then by the party order. 6 are shown, and you can show all of them. For each combination we show the number of topics in a head-on clash in the resulting coalition and how many of them are new, and only the red lines that the combination crosses for the first time; red lines that the current coalition already crosses are shown once above the list. This is information, not a recommendation.`,
      ] : []),
    ],
    jointTitle: 'Joint lists',
    jointResults: 'Lists that announced they would split after the election are shown as separate parties. Religious Zionism and Zehut ran on one list (ט), but announced that the link between them is "technical" and that after the election they would split and negotiate the coalition separately. After the election each of them is picked separately, and in "What is missing for a majority" each one counts on its own.',
    jointRules: [
      'Lists that announced they would split after the election are shown as separate parties. Religious Zionism and Zehut ran on one list (ט), but announced that the link between them is "technical" and that after the election they would split and negotiate the coalition separately. Picking one of them adds the other automatically, and either can be removed.',
      'Other joint lists are shown as one list. Where their components hold clearly different positions on a topic, the cell is marked ◐ and the summary gives the position of each component by name.',
    ],
    jointSeats: 'Their seats are a split of the joint list\'s average (about 7) according to Zehut\'s places on the list (2, 8, 10, 11): about 1 for Zehut and about 6 for Religious Zionism. This is our estimate, not a poll result.',
    jointSource: 'Source on the split (Hebrew)',
    nullRule: 'When we found no source that meets the rules, the position is marked "No stated position". We do not guess. When we found words of the party that are not a position on the axis (for example a general statement, or one about another part of the topic), they are shown with their source, but the position is not placed and not counted. When there is no current position, an item from an official platform of a previous election may also be shown, as a note with its year and its source. It is never used for placement, and the rule is the same for every party.',
    bakalpi: 'The research started from the independent site Bakalpi, which collects the parties\' positions. The summaries were rewritten, and every position links to its primary source.',
    sourceMixTitle: 'Source types by bloc',
    sourceMixIntro: 'Not every party has a platform for the 2026 election, so the type of source varies between parties and blocs. The table shows how many of the set positions rest on each type of source, and how many topics were left without a position. Blocs as defined by Bakalpi (N12).',
    sourceMixCols: ['Bloc', 'Platform', 'Statement', 'Record', 'No position'],
    blocNames: { coalition: 'Coalition bloc', opposition: 'Opposition bloc', arab: 'Arab parties', none: 'Not in a bloc' },
    undatedNote: 'Sources with no date are shown without one.',
    coverageTitle: 'Data coverage',
    coverageCols: ['Party', 'Positions', 'No position', 'Red lines', '2026 platform'],
    platformStatus: { full: 'Published', partial: 'Partial', none: 'Not published' },
    orderTitle: 'Order and display',
    orderRulesResults: [
      'The parties are ordered by their number of seats in the results, and on a tie by their number of votes. All parties have the same color.',
      'Scenarios raised in the media: up to 4 compositions reported by media outlets or proposed by a commentator, with a source and a date for each. A scenario\'s name is the composition itself, with no label. The roles (in the coalition, supporter, abstainer) follow the source; a party not mentioned counts as opposed. When a source mentions a party that ran on a joint list, the whole list is included (for example Religious Zionism and Zehut). The scenarios are in alphabetical order, and they are a starting point only, not a forecast.',
      'The scale numbers are not shown, and the direction of the scale (who is "right" and who is "left") carries no meaning.',
    ],
    orderRules: (order, unityPartner) => [
      { polls: 'The parties are ordered by poll average. All parties have the same color.', ballot: 'The parties are ordered by their ballot letters, in Hebrew alphabetical order. All parties have the same color.' }[order],
      'The ready-made scenarios are in alphabetical order.',
      'Blocs as defined by Bakalpi and N12. Parties not in a bloc are not included in any scenario, but you can add them.',
      { polls: 'Unity = Likud plus the largest party in the opposition bloc by poll average. You pick the rest.', ballot: `Unity = Likud plus ${unityPartner} (you pick the rest).` }[order],
      'The scale numbers are not shown, and the direction of the scale (who is "right" and who is "left") carries no meaning.',
    ],
    examplesTitle: 'Examples from the data',
    exampleBloc: { coalition: 'Within the coalition bloc', opposition: 'Within the opposition bloc' },
    example: (a, b, topic, level) => `${a} ↔ ${b}, ${topic}: ${level}`,
    pollsTitle: 'Polls',
    pollsText: 'The seat numbers are the average of each party\'s last five polls, as shown on Bakalpi. They are shown only to give a sense of scale.',
    pollsGuidance: 'The restriction on publishing polls began at the end of the Friday before the election. According to the election guide on gov.il (section 16E(h) of the Elections Law), republishing an earlier poll in this period is allowed only with a prominent statement that the poll is not current and that nothing should be inferred from it about voting patterns or public opinion on the day of publication. That is why this sentence appears wherever seats are shown.',
    pollsGuidanceLink: 'Election guide (gov.il, Hebrew)',
    updated: (d) => `Data last updated: ${d}`,
  },

  privacy: {
    title: 'Privacy',
    lines: [
      'No cookies, and we do not collect personal information.',
      'The visit counter (GoatCounter) receives only the page path, the title, the screen width and the domain you came from, and only from the site itself.',
      'The hosting server (Netlify) sees IP addresses, as with any website.',
      'The coalition you pick is kept only in the address in your browser, after the # sign, so it is not sent to the server. When you share a link, your selection is in it. Links in the old format are converted automatically.',
    ],
    contact: 'Questions about privacy:',
  },

  a11y: {
    title: 'Accessibility statement',
    standard: 'The site aims to meet Israeli Standard SI 5568, which is based on the WCAG 2.0 guidelines at level AA.',
    doneTitle: 'What we did:',
    done: [
      'Semantic HTML: real headings, lists, tables and buttons.',
      'Full keyboard navigation, with visible focus.',
      'ARIA labels and roles for the checkboxes, the buttons, the map and the dialogs.',
      'Color is always accompanied by a symbol or text, never on its own.',
      'Color contrast at level AA.',
      'Right-to-left Hebrew and left-to-right English, with a design made for phones first.',
    ],
    limitsTitle: 'Known limitations:',
    limits: [
      'On phones, the topic names at the top of the map of positions are in small type.',
      'In "Color by" and in a party\'s role, you move between the options with the Tab key, not the arrow keys.',
      'After a choice in "Compare with…", the focus does not stay on the list.',
      'After a party is removed, the screen-reader message is worded as if it were still in the coalition.',
      'The picking and results views have no main heading (h1).',
    ],
    contact: 'Ran into an accessibility problem? Write to us and we will handle it soon:',
    date: 'This statement was updated on 1 Nov 2026.',
  },

  why: {
    title: 'Why I built this',
    p1: 'I\'m Lioz, a software engineer and researcher, and I have done research in computational social choice. Before every election there is talk of "blocs", but almost no one checks whether the parties expected to sit together agree with each other at all. I wanted a simple tool that shows this, with a source for every position, and leaves the conclusions to you. I have no connection to any party, and the tool does not recommend whom to vote for.',
    p2: 'The code and the data are open on purpose: so that anyone can check the positions and the sources, so that the tool keeps up with developments, and so that it improves through users\' feedback. Found a mistake or a better source?',
    writeMe: 'Write to me',
  },

  footer: {
    by: 'Built by Lioz Akirav',
    githubLabel: 'GitHub',
    emailLabel: 'Send an email',
    why: 'Why I built this',
    how: 'How it works',
    openData: 'The data and sources are open for review',
    privacy: 'Privacy',
    a11y: 'Accessibility statement',
    notAdvice: 'Not a voting recommendation',
  },

  links: {
    media: {
      'x.com': 'X', 'www.ynet.co.il': 'ynet', 'www.mako.co.il': 'N12 (Mako)', 'www.maariv.co.il': 'Maariv', 'www.walla.co.il': 'Walla',
      'www.i24news.tv': 'i24NEWS', 'www.inn.co.il': 'Arutz Sheva (Israel National News)', 'www.israelnationalnews.com': 'Arutz Sheva (Israel National News)', 'www.kipa.co.il': 'Kipa',
      '13tv.co.il': 'Channel 13 News', 'www.arab48.com': 'Arab48', 'bokra.net': 'Bokra', 'www.hakalkalit.org': 'The New Economic Party',
      'main.knesset.gov.il': 'Bill in the Knesset',
    },
    platform: 'Party platform',
    partySite: 'Party website',
    translatedBy: (who) => `(Hebrew translation: ${who})`,
  },
};
