import { S as HE } from './strings.js';
import { S as EN } from './strings.en.js';
import * as C from './compat.js';
import { countPageview } from './stats.js';
import { correctionMailto, quoteAttribution, SITE_TRANSLATOR } from './links.js';

const $ = (sel, root = document) => root.querySelector(sel);
// Escaped text with runs of the other script isolated in <bdi>: Latin (names, standards) in Hebrew, Hebrew (ballot
// letters, names) in English.
const OTHER_SCRIPT = { he: /[A-Za-z][A-Za-z0-9.]*(?: [A-Za-z0-9.]+)*/g, en: /[\u0590-\u05FF](?:[\u0590-\u05FF׳״"' -]*[\u0590-\u05FF׳״])?/g };
const bidi = (v) => esc(v).replace(OTHER_SCRIPT[lang], (m) => (lang === 'he' ? `<bdi>${m}</bdi>` : `<bdi lang="he">${m}</bdi>`));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The reader's language (fragment `l=`, Hebrew by default) and its strings; see setLanguage().
const STRINGS = { he: HE, en: EN };
let S = HE;
let lang = 'he';
let data;
let ctx;
let meta;
let electionResults = null;
let scenarioData = null;
// The factions' recommendations to the President (#4): results mode only.
let recData = null;
let state = { base: null, members: [], supporters: [], abstainers: [] };
let lastPreset = null;
// The inline undo line (#29): { prev, lastPreset, kind: 'replaced' | 'added' | 'removed', ids } or null. No timer; it
// clears on the next coalition change, undo, close, or leaving the results view. Kept across a language switch.
let undo = null;
// "מה חסר לרוב": rows shown before "הציגו את כל N"; the toggle resets whenever the coalition changes.
const COMPLETIONS_SHOWN = 6;
let showAllCompletions = false;
// "הקואליציות הקרובות לעמדות של X" in the party sheet: rows shown before "הציגו את כל N", and the collapsed list of
// coalitions with a partner silent on 3+ topics. Reset whenever the list opens for a party.
const CLOSEST_SHOWN = 5;
let closestView = { pid: null, fullAll: false, partialOpen: false, partialAll: false };
let toastTimer;
// Set by closest-apply from the build view: route() focuses the results heading once it has rendered.
let focusOnArrival = false;
// The pair view's two pickers, in the order picked (null = empty). Kept when leaving the view; written to the URL on it.
let pair = [null, null];

// ---------- data helpers ----------
const party = (id) => ctx.byId.get(id);
const name = (id) => party(id)?.name ?? id;
const topic = (id) => ctx.topics.find((t) => t.id === id);
const posOf = (pid, tid) => ctx.idx.get(`${pid}|${tid}`);
const axisLabel = (tid, position) => (position == null ? S.sheet.noPositionLabel : topic(tid).axis[String(position)]);
const fmtDate = (iso) => S.fmtDate(iso);
const ordered = (ids) => [...ids].sort((a, b) => ctx.order.get(a) - ctx.order.get(b));
const isResults = () => ctx.mode === 'results';
// Official results are always shown; poll averages only while showSeats is on.
const showSeats = () => isResults() || meta.showSeats !== false;
const fmtNum = (n) => n.toLocaleString('en-US');
// Red lines as "<party> · <topic>", comma-separated (the overview line and the completions card).
// Red lines by topic (#31): "גיוס: ישראל ביתנו, יהדות התורה · חקירה: ישראל ביתנו". The count stays one per party and topic.
const redList = (lines) => C.groupRedLines(ctx, lines).map((g) => `${topic(g.topicId).short}: ${g.partyIds.map(name).join(', ')}`).join(' · ');
// Parties outside the coalition share one neutral marker (a dashed outline, no fill); the role is always in the text.
const outsideChip = (text) => `<span class="outside">${esc(text)}</span>`;
const outsideParty = (id) => S.results.outsideParty(name(id), S.results.roleName[roleOf(id)]);
const passedIds = () => ctx.parties.filter((p) => ctx.passed(p.id)).map((p) => p.id);

// A party name, an outlet name or a number pair never breaks inside (#30, #31, #34): plain text in, HTML out, with each
// of the given names and every "53 מול 67" / "53 מתוך 61" / "59 vs 61" / "53 of 61" in a nowrap span. One pass, so a
// name inside another name is not wrapped twice; longer names win.
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NUM_PAIR = '≈?\\d[\\d,.]*(?: (?:מול|מתוך|vs|of) ≈?\\d[\\d,.]*)';
function keepWhole(text, names = []) {
  const alts = [...new Set(names.filter(Boolean).map(esc))].sort((a, b) => b.length - a.length).map(reEscape);
  return esc(text).replace(new RegExp([...alts, NUM_PAIR].join('|'), 'g'), (m) => `<span class="nw">${m}</span>`);
}
const partyNames = () => ctx.parties.map((p) => p.name);

function levelBadge(level, extraClass = '') {
  const l = S.levels[level] ?? S.levels.NONE;
  return `<span class="lv lv-${level} ${extraClass}"><span aria-hidden="true">${l.icon}</span> ${esc(l.label)}</span>`;
}

// ---------- state ----------
function applyState(next) {
  // Roles are disjoint; a party in two lists keeps the first of members > supporters > abstainers.
  const members = ordered([...new Set(next.members)]);
  const supporters = ordered([...new Set(next.supporters ?? [])].filter((id) => !members.includes(id)));
  const abstainers = ordered([...new Set(next.abstainers ?? [])].filter((id) => !members.includes(id) && !supporters.includes(id)));
  if (members.join() !== state.members.join()) showAllCompletions = false;
  state = { base: next.base ?? null, members, supporters, abstainers };
  if (state.base && !state.members.includes(state.base)) state.base = null;
}

// The URL is `<query>#<route>?<state>`; the state stays in the fragment, so it never reaches the server.
// A bare address with no coalition stays bare.
function writeUrl() {
  const rest = C.selected(state).length || location.hash || lang !== 'he'
    ? C.locationFor(ctx, state, routeToken, location.search, lang, routeToken === 'pair' ? pair : []) : location.search;
  history.replaceState(null, '', location.pathname + rest);
}

// Every state change clears the undo line; the three changes that offer undo pass the new one (undoFor()).
function setState(next, { announceParty, undo: nextUndo = null } = {}) {
  undo = nextUndo;
  applyState(next);
  writeUrl();
  render();
  // Added or removed (#7): a party with no role after the change was toggled off or removed.
  if (announceParty) {
    const r = C.analyze(ctx, state);
    announce((roleOf(announceParty) ? S.results.live : S.results.liveRemoved)(name(announceParty), r.clashTopics));
  }
}

const roleOf = (id) => (state.members.includes(id) ? 'member' : state.supporters.includes(id) ? 'supporter' : state.abstainers.includes(id) ? 'abstainer' : null);

// The state with `id` in `role` (null = opponent, i.e. unselected). In polls mode a new member brings its
// soft-linked partner, unless the partner already has a role; with results each is chosen on its own.
function withRole(id, role) {
  const next = C.dropParty(state, id);
  if (role === 'member' && state.base === id) next.base = id; // the base must be a member
  if (role === 'member') {
    next.members = [...next.members, id];
    const partner = ctx.linkedOf(id);
    if (partner && !roleOf(partner) && ctx.passed(partner)) next.members.push(partner);
  }
  if (role === 'supporter') next.supporters = [...next.supporters, id];
  if (role === 'abstainer') next.abstainers = [...next.abstainers, id];
  return next;
}

function announce(text) {
  const live = $('#live');
  live.textContent = '';
  setTimeout(() => { live.textContent = text; }, 50);
}

// Text only: a toast never holds an action (#29); undo lives in the inline line at the top of the results view.
function toast(text, ms = 5000) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------- static sections ----------
function renderHeader() {
  // Both languages, each named in its own language: the current one as plain text, the other a button that switches.
  const sw = $('#lang-switch');
  sw.setAttribute('aria-label', S.langSwitch.label);
  sw.innerHTML = [lang, S.langSwitch.other].map((l) => (l === lang
    ? `<strong lang="${l}" aria-current="true">${esc(S.langNames[l])}</strong>`
    : `<button type="button" class="lang-btn" lang="${l}" data-act="lang" data-key="lang-switch">${esc(S.langNames[l])}</button>`))
    .join('<span class="lang-sep" aria-hidden="true">|</span>');
  $('#lang-note').hidden = !S.translatedNote;
  $('#lang-note').textContent = S.translatedNote;
  $('#brand-name').textContent = S.appName;
  $('#nav-method').innerHTML = `<span class="nav-long">${esc(S.nav.method)}</span><span class="nav-short">${esc(S.nav.methodShort)}</span>`;
  $('#intro').textContent = S.buildIntro(ctx.topics.length);
  $('#results-h1').textContent = S.results.viewTitle;
  $('#purpose').textContent = S.buildPurpose;
  if (isResults()) {
    $('#voter-info')?.remove();
  } else {
    $('#voter-info').innerHTML = `${esc(S.voterInfo)} <a href="${esc(S.voterInfoUrl)}" rel="noopener" target="_blank">${esc(S.voterInfoLink)}</a>`;
  }
  const placed = ctx.positions ?? [];
  const n = (type) => placed.filter((p) => p.position != null && p.sourceType === type).length;
  $('#source-mix').textContent = S.sourceMix(placed.filter((p) => p.position != null).length, n('platform'), n('statement'), n('record'));
  $('#skip').textContent = S.skip;
  $('#method-back').textContent = S.nav.backFromMethod;
  if (meta.stub) {
    const b = $('#banner');
    b.textContent = S.stubBanner;
    b.hidden = false;
  }
}

function renderFooter() {
  const F = S.footer;
  $('#footer').innerHTML = `
    <p class="f-by"><a href="https://lioz.dev" rel="noopener">${bidi(F.by)}</a></p>
    <p class="f-icons">
      <a href="https://github.com/Lioo7/mi-im-mi" rel="noopener" aria-label="${esc(F.githubLabel)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 .5A11.5 11.5 0 0 0 .5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z"/></svg></a>
      <a href="mailto:lioz.akirav@gmail.com" aria-label="${esc(F.emailLabel)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1.3 2 7.7 5.9L19.7 7H4.3ZM4 17h16V9.1l-8 6.1-8-6.1V17Z"/></svg></a>
    </p>
    <p class="f-links"><a href="#why">${esc(F.why)}</a><a href="#method">${esc(F.how)}</a><a href="https://github.com/Lioo7/mi-im-mi/tree/main/site/data" rel="noopener">${esc(F.openData)}</a><a href="#privacy">${esc(F.privacy)}</a><a href="#accessibility">${esc(F.a11y)}</a></p>
    <p class="f-meta">${esc(S.updated(fmtDate(meta.dataUpdated)))} · ${esc(F.notAdvice)}</p>`;
}

// The closest-coalitions rule (#32): an intro, what is included, how the list is ordered (6 steps), the closing line.
function closestRuleHtml(M) {
  const R = M.closestRule;
  return `<h3 id="closest-rule" class="anchor" tabindex="-1">${esc(M.closestTitle)}</h3>
    <div class="rule" id="closest-rule-body">
      <p class="rule-intro">${esc(R.intro)}</p>
      <h4 class="rule-sub">${esc(R.includedTitle)}</h4>
      <ul class="rule-list">${R.included.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <h4 class="rule-sub">${esc(R.orderTitle)}</h4>
      <p class="rule-order-intro">${esc(R.orderIntro)}</p>
      <ol class="rule-steps">${R.order.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
      ${R.after.map((t) => `<p class="rule-after">${esc(t)}</p>`).join('')}
    </div>`;
}

function renderMethod() {
  const M = S.method;
  const coverage = ctx.parties.map((p) => {
    const rows = ctx.topics.map((t) => posOf(p.id, t.id));
    const withPos = rows.filter((r) => r?.position != null).length;
    const red = rows.filter((r) => r?.redLine).length;
    return `<tr><th scope="row">${esc(p.name)}</th><td>${withPos}</td><td>${8 - withPos}</td><td>${red}</td><td>${esc(M.platformStatus[p.platformStatus])}</td></tr>`;
  }).join('');

  const mixRow = (key) => {
    const ids = ctx.parties.filter((p) => (p.bloc ?? 'none') === key).map((p) => p.id);
    const rs = ids.flatMap((id) => ctx.topics.map((t) => posOf(id, t.id)));
    const n = (type) => rs.filter((r) => r?.position != null && r.sourceType === type).length;
    return `<tr><th scope="row">${esc(M.blocNames[key])}</th><td>${n('platform')}</td><td>${n('statement')}</td><td>${n('record')}</td><td>${rs.filter((r) => r?.position == null).length}</td></tr>`;
  };
  const sourceMix = ['coalition', 'opposition', 'arab', 'none'].map(mixRow).join('');

  const examples = ['coalition', 'opposition'].map((bloc) => {
    const ids = ctx.parties.filter((p) => p.bloc === bloc).map((p) => p.id);
    const worst = C.crises(ctx, ctx.topics.map((t) => C.topicStatus(ctx, ids, t.id)), 1)[0];
    if (!worst) return '';
    const w = worst.worst;
    return `<li>${esc(M.exampleBloc[bloc])}: ${esc(M.example(name(w.a), name(w.b), topic(w.topicId).name, S.levels[w.level].label))}</li>`;
  }).join('');

  const W = S.why;
  const P = S.privacy;
  const A = S.a11y;
  $('#method').innerHTML = `
    <section id="why" class="why-box" tabindex="-1">
      <h2>${esc(W.title)}</h2>
      <p>${esc(W.p1)}</p>
      <p>${esc(W.p2)} <a href="mailto:lioz.akirav@gmail.com">${esc(W.writeMe)}</a> · <a href="https://github.com/Lioo7/mi-im-mi" rel="noopener"><bdi>GitHub</bdi></a></p>
    </section>
    <h1 class="page-title">${esc(M.title)}</h1>
    <p>${esc(M.intro(ctx.parties.length))}</p>
    ${M.translation ? `<h3>${esc(M.translationTitle)}</h3><p>${esc(M.translation)}</p>` : ''}
    <ol>${S.how.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
    <h3>${esc(M.rolesTitle)}</h3>
    <ul>${M.rolesRules(showSeats(), !isResults()).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    <p class="disclaimer"><strong>${esc(M.disclaimer)}</strong> ${esc(M.independent)}</p>

    <h3>${esc(M.levelsTitle)}</h3>
    <ul class="level-rules">${M.levelRules.map(([lv, txt]) => `<li>${levelBadge(lv)} ${esc(txt)}</li>`).join('')}</ul>
    <p>${esc(M.colorRule)}</p>
    <p>${esc(M.matrixRule)}</p>
    <p>${esc(M.resultsRule(showSeats()))}</p>
    <p>${esc(M.impactRule)}</p>
    <p>${esc(M.breakdownRule)}</p>
    <p>${esc(M.pairRule)}</p>
    ${isResults() ? closestRuleHtml(M) : ''}

    <h3>${esc(M.axesTitle)}</h3>
    ${ctx.topics.map((t) => `
      <details class="axis">
        <summary>${esc(t.name)}</summary>
        <p class="muted">${esc(t.axisNote)}</p>
        <ol class="axis-list">${['-2', '-1', '0', '1', '2'].map((k) => `<li>${esc(t.axis[k])}</li>`).join('')}</ol>
      </details>`).join('')}

    <h3>${esc(M.sourcesTitle)}</h3>
    <ul>${M.sourceRules.map(([, txt]) => `<li>${esc(txt)}</li>`).join('')}</ul>
    <p>${esc(M.redLineRule)}</p>
    <p>${esc(M.redLineTest)}</p>
    <p>${esc(M.redLinesCrossedRule)}</p>
    <p>${esc(M.nullRule)}</p>
    <p>${esc(M.bakalpi)} <a href="https://www.bakalpi.co.il/he" rel="noopener"><bdi>bakalpi.co.il</bdi></a></p>
    <p>${esc(M.names)} <a href="${esc(meta.partyNamesSourceUrl)}" rel="noopener">gov.il</a></p>

    <h3>${esc(M.jointTitle)}</h3>
    ${isResults() ? seatSourceLine() : ''}
    <ul>${(showSeats() ? [isResults() ? M.jointResults : M.jointRules[0], isResults() ? ctx.listOf('zehut').splitNote : M.jointSeats, ...M.jointRules.slice(1)] : M.jointRules).map((r) => `<li>${bidi(r)}</li>`).join('')}</ul>
    ${showSeats() && !isResults() ? pollLegalLine() : ''}
    <p class="small"><a href="https://www.ynet.co.il/news/elections2026/article/rjuhrwvdfl" rel="noopener">${esc(M.jointSource)}</a></p>

    <h3>${esc(M.sourceMixTitle)}</h3>
    <p>${esc(M.sourceMixIntro)}</p>
    <div class="table-wrap"><table class="coverage">
      <thead><tr>${M.sourceMixCols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${sourceMix}</tbody>
    </table></div>
    <p class="muted small">${esc(M.undatedNote)}</p>

    <h3>${esc(M.coverageTitle)}</h3>
    <div class="table-wrap"><table class="coverage">
      <thead><tr>${M.coverageCols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${coverage}</tbody>
    </table></div>

    <h3>${esc(M.orderTitle)}</h3>
    <ul>${(isResults() ? M.orderRulesResults : M.orderRules(showSeats() ? 'polls' : 'ballot', name(C.presets(ctx).unity.members[1]))).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>

    ${examples ? `<h3>${esc(M.examplesTitle)}</h3><ul>${examples}</ul>` : ''}

    ${isResults() ? `<h3>${esc(S.elected.resultsTitle)}</h3><p>${esc(S.elected.resultsText)}</p>${seatSourceLine()}${pollsVsResults()}` : ''}
    ${showSeats() && !isResults() ? `<h3>${esc(M.pollsTitle)}</h3><p>${esc(M.pollsText)}</p><p><strong>${pollLegalText()}</strong></p>
    <p>${esc(M.pollsGuidance)} <a href="${esc(meta.pollGuidanceUrl)}" rel="noopener">${esc(M.pollsGuidanceLink)}</a></p>` : ''}
    <h3>${esc(M.researchDocs)}</h3>
    <p>${esc(M.researchDocsNote)} <a href="https://github.com/Lioo7/mi-im-mi/tree/main/docs/research" rel="noopener">${esc(M.researchDocs)}</a></p>
    ${changesSection()}
    ${downloadSection()}
    <section id="privacy" class="anchor" tabindex="-1">
      <h3>${esc(P.title)}</h3>
      <ul>${P.lines.map((l) => `<li>${bidi(l)}</li>`).join('')}</ul>
      <p>${esc(P.contact)} <a href="mailto:lioz.akirav@gmail.com"><bdi>lioz.akirav@gmail.com</bdi></a></p>
    </section>
    <section id="accessibility" class="anchor" tabindex="-1">
      <h3>${esc(A.title)}</h3>
      <p>${bidi(A.standard)}</p>
      <p>${esc(A.doneTitle)}</p>
      <ul>${A.done.map((l) => `<li>${bidi(l)}</li>`).join('')}</ul>
      <p>${esc(A.limitsTitle)}</p>
      <ul>${A.limits.map((l) => `<li>${bidi(l)}</li>`).join('')}</ul>
      <p>${esc(A.contact)} <a href="mailto:lioz.akirav@gmail.com"><bdi>lioz.akirav@gmail.com</bdi></a></p>
      <p class="muted">${esc(A.date)}</p>
    </section>
    <p><strong>${esc(M.corrections)}</strong> <a href="mailto:lioz.akirav@gmail.com"><bdi>lioz.akirav@gmail.com</bdi></a></p>
    <p class="muted">${esc(M.updated(fmtDate(meta.dataUpdated)))}</p>`;
}

// Method page: the data changes (#19), from data/changelog.json, fetched the first time the method page opens.
let changelog = null;
let changelogLoad = null;
function loadChangelog() {
  changelogLoad ??= fetch('data/changelog.json').then((r) => {
    if (!r.ok) throw new Error(`changelog: ${r.status}`);
    return r.json();
  }).then((d) => {
    changelog = d;
    const ul = $('#changes-list');
    if (ul) ul.innerHTML = changeItems();
  }).catch((err) => console.error(err));
}
const fillTokens = (text) => text.replace(/\{(party|topic):([^}]*)\}/g, (_, k, id) => (k === 'party' ? name(id) : topic(id)?.name ?? id));
function changeItems() {
  const G = S.method.changes;
  return (changelog?.entries ?? []).map((e) => {
    const t = e.kind === 'placement' ? topic(e.topic) : null;
    const line = t ? G.placement(name(e.party), t.name, axisLabel(e.topic, e.from), axisLabel(e.topic, e.to)) : fillTokens(e[lang] ?? e.he);
    return `<li data-kind="${esc(e.kind)}"><span class="muted"><time datetime="${esc(e.date)}">${esc(fmtDate(e.date))}</time> · ${esc(G.kinds[e.kind])}:</span> ${bidi(line)}</li>`;
  }).join('');
}
function changesSection() {
  const G = S.method.changes;
  const [before, after] = G.intro.split(G.logLink);
  return `<section id="changes" class="anchor" tabindex="-1">
      <h3>${esc(G.title)}</h3>
      <p>${esc(before)}<a href="${esc(G.logUrl)}" rel="noopener">${esc(G.logLink)}</a>${esc(after)}</p>
      <ul id="changes-list" class="changes">${changeItems()}</ul>
    </section>`;
}

// Method page: the data download (#18). The files are generated from the live data (scripts/export-download.mjs).
function downloadSection() {
  const D = S.method.download;
  const [before, after] = D.license.split(D.licenseName);
  const file = (f, label) => `<a href="download/mi-im-mi-positions.${f}" download data-download="${f}"><bdi>${esc(label)}</bdi></a>`;
  return `<section id="download" class="anchor" tabindex="-1">
      <h3>${esc(D.title)}</h3>
      <p>${esc(D.line(data.positions.length))} ${file('csv', D.csv)} · ${file('json', D.json)}</p>
      <p class="small">${bidi(D.positionNote)}</p>
      <p class="small">${bidi(before)}<a href="${esc(D.licenseUrl)}" rel="noopener license"><bdi>${esc(D.licenseName)}</bdi></a>${bidi(after)}</p>
    </section>`;
}

// Method page, results mode: the pre-election poll average next to the CEC seats, numbers only.
function pollsVsResults() {
  const E = S.elected;
  // Our split of a joint list's poll average (seatNote) is marked, since it is not a poll figure itself.
  const rows = ctx.parties.map((p) => `<tr><th scope="row">${esc(p.name)}</th><td>${p.pollAvg == null ? '–' : p.pollAvg.toFixed(1)}${p.seatNote ? '*' : ''}</td><td>${ctx.seatsOf(p.id)}</td></tr>`).join('');
  return `<h4>${esc(E.vsTitle(fmtDate(meta.pollsAsOf)))}</h4>
    <div class="table-wrap"><table class="coverage vs-table">
      <thead><tr>${E.vsCols(fmtDate(meta.pollsAsOf)).map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${ctx.parties.some((p) => p.seatNote) ? `<p class="muted small">${esc(E.vsSplitNote)}</p>` : ''}`;
}

// ---------- presets & builder ----------
function presetOrder() {
  const keys = ['opposition-arab', 'unity', 'opposition', 'coalition'];
  return keys.sort((a, b) => S.presets[a].localeCompare(S.presets[b], S.locale));
}

// Results mode: scenarios raised in the media, named by their composition only, sorted alphabetically by that name.
function scenarioList() {
  const P = S.presets;
  return (scenarioData?.scenarios ?? []).map((sc) => ({
    ...sc,
    label: P.scenarioLabel(ordered(sc.members).map(name), ordered(sc.supporters).map(name), ordered(sc.abstainers).map(name)),
  })).sort((a, b) => a.label.localeCompare(b.label, S.locale));
}

// One source: "הכחשת <party>: " stays whole up to its colon, a person's name stays whole, and the "ב"/"ב-" before the
// outlet stays with it, so the line breaks only between these pieces (#30).
function sourceHtml(src) {
  const P = S.presets;
  const reply = C.sourceReply(src);
  const replyText = reply ? P.replyBy[reply.kind](name(reply.party)) : '';
  const person = src.by ? P.personIn(src.by, src.outlet) : '';
  const cut = person.lastIndexOf(' ') + 1;
  return `${keepWhole(replyText, [replyText.trim()])}${keepWhole(person.slice(0, cut), [src.by])}<span class="nw">${esc(person.slice(cut))}<a href="${esc(src.url)}" rel="noopener" target="_blank">${bidi(src.outlet)}</a>, ${esc(P.shortDate(src.date))}</span>`;
}

function renderScenarios() {
  const P = S.presets;
  const items = scenarioList().map((sc) => `<li class="scenario">
    <button type="button" class="preset" data-act="scenario" data-id="${esc(sc.id)}" data-key="scenario-${esc(sc.id)}">${esc(sc.label)}</button>
    <p class="scen-src">${esc(P.sourcesLabel(sc.sources.length))} ${sc.sources.map((x) => C.localize(x, lang)).map(sourceHtml).join(' · ')}</p>
  </li>`).join('');
  const asOf = P.shortDate(scenarioData.asOf);
  $('#presets').innerHTML = startFrom(P.scenariosStart(scenarioList().length, asOf), `
    <ul class="scenario-list" aria-label="${esc(P.scenariosTitle(asOf))}">${items}</ul>
    <p class="muted small">${esc(P.scenariosNote)}</p>`);
}

// Scenarios and presets sit in the builder section, collapsed (#26): the party list stays the first thing in it.
const startFrom = (summary, body) => `<details class="start-from" data-key="start-from">
  <summary data-key="start-from-summary">${esc(summary)}</summary>${body}</details>`;

// The task cards (#26): what the site can do, in a fixed order, right after the intro. Each title is its control.
// Two levels at most: a card leads straight to its tool. Cards 1 and 3 are tappable as a whole (the control's ::after). The closest-coalitions card exists in results mode only (#22).
function renderTasks() {
  const H = S.home;
  const n = ctx.topics.length;
  // Title, then description, then the control, as in the other cards.
  const closest = isResults() ? `<li class="task">
      <label class="task-title" for="task-closest-pick">${esc(H.closest)}</label>
      <p class="task-line" id="task-closest-line">${esc(H.closestLine)}</p>
      <select id="task-closest-pick" class="task-select" data-act="closest-pick" data-key="closest-pick" aria-describedby="task-closest-line"><option value="">${esc(S.closest.pickerChoose)}</option>${ctx.parties.filter((p) => ctx.passed(p.id)).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
    </li>` : '';
  $('#tasks').innerHTML = `
    <h2 id="tasks-title">${esc(H.title)}</h2>
    <ul class="task-list">
      <li class="task">
        <button type="button" class="task-go" data-act="go-builder" data-key="home-build" aria-describedby="task-build-line"><span class="task-title">${esc(H.build)}</span>${JUMP}</button>
        <p class="task-line" id="task-build-line">${esc(H.buildLine(n))}</p>
      </li>
      ${closest}
      <li class="task">
        <a class="task-go" href="#pair" data-key="home-pair" aria-describedby="task-pair-line"><span class="task-title">${esc(H.pair)}</span>${CHEV_FWD}</a>
        <p class="task-line" id="task-pair-line">${esc(H.pairLine(n))}</p>
      </li>
    </ul>`;
}

// Card 1 jumps within the page: the site's in-page jump mark "↓" (as in "↓ … עם חברות הקואליציה"), not a chevron,
// which reads as expand-in-place.
const JUMP = '<span class="task-jump" aria-hidden="true">↓</span>';
// Points forward in reading order; CSS flips it in RTL.
const CHEV_FWD = '<svg class="task-chev chev-fwd" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderPresets() {
  renderTasks();
  if (isResults() && scenarioData) { renderScenarios(); return; }
  $('#presets').innerHTML = startFrom(S.presets.presetsStart, `
    <div class="preset-grid" role="group" aria-label="${esc(S.presets.title)}">
      ${presetOrder().map((k) => `<button type="button" class="preset" data-act="preset" data-id="${k}" data-key="preset-${k}">${esc(S.presets[k])}</button>`).join('')}
    </div>
    <p class="muted small">${esc(S.presets.blocNote)}</p>`);
}

const ltr = (text) => `<bdi dir="ltr">${esc(text)}</bdi>`;

function pillsHtml(a, c, u) {
  return `<span class="pills" dir="ltr" aria-hidden="true"><span class="pill im-ok">✓${a}</span><span class="pill im-clash">✕${c}</span><span class="pill im-unk">?${u}</span></span>`;
}

function renderBuilder() {
  const B = S.builder;
  const { members } = state;
  const chosen = C.selected(state);

  const rows = ctx.parties.filter((p) => ctx.passed(p.id)).map((p) => {
    const id = p.id;
    const role = roleOf(id);
    const on = role !== null;
    // What one tap adds (#10): in polls mode a soft-linked partner comes too, as withRole() adds it.
    const im = !on && members.length ? C.addImpact(ctx, withRole(id, 'member').members.filter((m) => !members.includes(m)), members) : null;
    const sub = [
      showSeats() && (isResults() || p.pollAvg != null) ? S.builder.seatsChip(Math.round(ctx.seatsOf(id))) : '',
      showSeats() && !isResults() && p.threshold === 'borderline' ? B.borderline : '',
      isResults() && p.linkedWith ? B.jointListNote(p.ballotLetters) : '',
    ].filter(Boolean).join(' · ');
    const label = `${p.name}${im ? `. ${B.impactLabel(im.agree, im.clash, im.unknown)}` : ''}`;
    return `<li class="prow${on ? ' is-on' : ''}">
      <button type="button" role="checkbox" aria-checked="${on}" class="prow-main" data-act="toggle" data-id="${id}" data-key="row-${id}" aria-label="${esc(label)}">
        <span class="cb" aria-hidden="true">${on ? '✓' : ''}</span>
        <span class="slip-tag"${lang === 'he' ? '' : ' lang="he"'}>${esc(p.ballotLetters)}</span>
        <span class="prow-text"><span class="prow-name">${esc(p.name)}</span>${sub ? `<span class="prow-sub">${bidi(sub)}</span>` : ''}</span>
        <span class="prow-end">${im ? pillsHtml(im.agree, im.clash, im.unknown) : ''}</span>
      </button>
      ${on ? roleControl(id, role) : ''}
    </li>`;
  }).join('');

  let unityNote = '';
  if (lastPreset === 'unity' && showSeats()) {
    const preset = C.presets(ctx).unity.members;
    if (preset.length === members.length && preset.every((id) => members.includes(id))) {
      unityNote = `<p class="note">${esc(S.seats.unityMissing(C.investiture(ctx, state).missing))}</p>`;
    }
  }

  // One note per soft-linked pair (polls mode), shown even when only one of the two is selected.
  const linkedPairs = new Set(members.filter((id) => ctx.linkedOf(id)).map((id) => ordered([id, ctx.linkedOf(id)]).join('|')));
  const linkedNotes = [...linkedPairs].map((pair) => {
    const [a, b] = pair.split('|');
    return `<p class="note note-soft">${esc(B.linkedNote(name(a), name(b)))}</p>`;
  });

  $('#builder-head').innerHTML = `
    <h2 id="builder-title" tabindex="-1">${esc(B.title)}</h2>
    ${chosen.length ? `<button type="button" class="link-btn" data-act="clear" data-key="clear">${esc(B.clear)}</button>` : ''}`;
  $('#builder').innerHTML = `
    ${seatsBox()}
    ${members.length ? `<p class="muted small">${esc(B.impactHeading)}: <span class="impact-legend"><span class="im-ok" aria-hidden="true">✓</span> ${esc(B.impactAgree)} · <span class="im-clash" aria-hidden="true">✕</span> ${esc(B.impactClash)} · <span class="im-unk" aria-hidden="true">?</span> ${esc(B.impactUnknown)}</span></p>` : ''}
    <ul class="plist" role="group" aria-label="${esc(B.pick)}">${rows}</ul>
    ${belowThreshold()}
    <p class="muted small">${esc(B.hint)}</p>
    ${linkedNotes.join('')}
    ${unityNote}`;
}

// Role of a selected party: a radiogroup under its row. Unselecting the row makes it an opponent (the default).
function roleControl(id, role) {
  const B = S.builder;
  return `<div class="roles" role="radiogroup" aria-label="${esc(B.roleGroup(name(id)))}">${['member', 'supporter', 'abstainer'].map((r) => `
    <button type="button" role="radio" aria-checked="${r === role}" tabindex="${r === role ? 0 : -1}" class="role-btn${r === role ? ' is-on' : ''}" data-act="role" data-id="${id}" data-role="${r}" data-key="role-${id}-${r}">${esc(B.roles[r])}</button>`).join('')}
  </div>`;
}

// Results mode: lists under the threshold. Positions stay viewable; the lists cannot be selected.
function belowThreshold() {
  const below = ctx.parties.filter((p) => !ctx.passed(p.id));
  if (!below.length) return '';
  const E = S.elected;
  return `<details class="below">
    <summary>${esc(E.belowTitle)} (${below.length})</summary>
    <p class="muted small">${esc(E.belowHint)}</p>
    <ul class="below-list">${below.map((p) => `<li><button type="button" class="row-btn below-btn" data-act="party" data-id="${p.id}" data-key="below-${p.id}" aria-label="${esc(E.viewPositions(p.name))}">
      <span class="slip-tag"${lang === 'he' ? '' : ' lang="he"'}>${esc(p.ballotLetters)}</span><span class="prow-name">${esc(p.name)}</span><span class="muted small">${esc(E.belowPct(ctx.listOf(p.id).pct.toFixed(2)))}</span></button></li>`).join('')}</ul>
  </details>`;
}

// ---------- results ----------
function positionBlock(pid, tid, { heading = true } = {}) {
  const p = posOf(pid, tid);
  const T = S.sheet;
  if (!p || p.position == null) {
    return `<div class="pos">
      ${heading ? `<p class="pos-label none">${esc(T.noPositionLabel)}</p>` : ''}
      <p>${esc(p?.summary ?? T.noPosition)}</p>
      ${p ? evidenceHtml(p, pid) : ''}
    </div>`;
  }
  return `<div class="pos">
    ${heading ? `<p class="pos-label">${esc(axisLabel(tid, p.position))}</p>` : ''}
    ${p.redLine || p.componentsDisagree ? `<p>${p.redLine ? `<span class="tag tag-red"><span aria-hidden="true">🚩</span> ${esc(S.redLine)}</span> ` : ''}${p.componentsDisagree ? `<span class="tag tag-split"><span aria-hidden="true">${S.componentsIcon}</span> ${esc(S.componentsDisagree)}</span>` : ''}</p>` : ''}
    <p>${esc(p.summary)}</p>
    ${evidenceHtml(p, pid)}
  </div>`;
}

// The quote with its attribution, and the source line. Shared by placed positions and by null ones, which show what
// was found even though it is not placed on the axis (a null row has no source type, so no type tag).
function evidenceHtml(p, pid) {
  const T = S.sheet;
  return `${p.quote ? `<blockquote>${quoteHtml(p)}<footer class="q-by">${esc(quoteAttribution(p, name(pid), S))}</footer></blockquote>` : ''}
    ${p.sourceUrl ? `<p class="source">
      ${p.sourceType ? `<span class="tag tag-src">${esc(T.sourceTypes[p.sourceType] ?? '')}</span>` : ''}
      ${p.sourceDate ? `<span class="muted">${esc(T.date(fmtDate(p.sourceDate)))}</span>` : ''}
      <a href="${esc(p.sourceUrl)}" rel="noopener" target="_blank">${esc(T.source)}</a>
      ${p.extraSourceUrl ? `· <a href="${esc(p.extraSourceUrl)}" rel="noopener" target="_blank">${esc(T.extraSource)}</a>` : ''}
      ${p.archiveUrl ? `· <a href="${esc(p.archiveUrl)}" rel="noopener" target="_blank">${esc(T.archive)}</a>` : ''}
      ${p.viaUrl ? `· <a href="${esc(p.viaUrl)}" rel="noopener" target="_blank">${esc(T.via)}</a>` : ''}
    </p>` : ''}`;
}

// A quote stays verbatim in its own language. In Hebrew, an Arabic quote carries our Hebrew translation (or an outlet's);
// in English, every quote not in English carries our English translation.
function quoteHtml(p) {
  if (lang === 'he') {
    return `<p class="q-text"${/[\u0600-\u06FF]/.test(p.quote) ? ' lang="ar" dir="rtl"' : ''}>״${esc(p.quote)}״</p>${p.quoteTranslation ? `<p class="q-text q-trans">״${esc(p.quoteTranslation)}״ ${esc(p.quoteTranslatedBy === SITE_TRANSLATOR ? S.sheet.siteTranslation : S.sheet.translationBy(p.quoteTranslatedBy))}</p>` : ''}`;
  }
  const ql = /[\u0600-\u06FF]/.test(p.quote) ? 'ar' : /[\u0590-\u05FF]/.test(p.quote) ? 'he' : 'en';
  // Quote marks follow the quote's language: ״…״ around Hebrew, “…” around English and Arabic.
  const original = ql === 'en' ? `<p class="q-text">“${esc(p.quote)}”</p>` : `<p class="q-text" lang="${ql}" dir="rtl">${ql === 'he' ? `״${esc(p.quote)}״` : `“${esc(p.quote)}”`}</p>`;
  return original + (p.quoteTranslationEn ? `<p class="q-text q-trans">“${esc(p.quoteTranslationEn)}” ${esc(S.sheet.siteTranslation)}</p>` : '');
}

// The official list name is a legal name: in English it stays verbatim in Hebrew, followed by our translation.
function officialNameHtml(p) {
  if (lang === 'he') return esc(p.officialName);
  const he = data.parties.find((x) => x.id === p.id).officialName;
  return `<span lang="he" dir="rtl">${esc(he)}</span> (${esc(p.officialName)})`;
}

// First sentence of a position's summary, shown under its axis label in the pair view.
function pairSentence(pid, tid) {
  const p = posOf(pid, tid);
  if (!p || p.position == null || !p.summary) return '';
  const m = p.summary.match(/^.+?[.!?](?=\s|$)/);
  return `<span class="pair-sum">${esc(m ? m[0] : p.summary)}</span>`;
}

// A placed position the party declared a coalition condition.
const isRedLine = (pid, tid) => posOf(pid, tid)?.position != null && Boolean(posOf(pid, tid).redLine);
const redTag = () => `<span class="tag tag-red"><span aria-hidden="true">🚩</span> ${esc(S.redLine)}</span>`;

// "Why this color" (#30): the badge on its own line, the sentence on the next. The cell sheet and the expanded pair
// rows (pair view, 2-member card) share it.
const whyRow = (level, textHtml) => `<p class="why-row">${levelBadge(level)}<span class="why-text">${textHtml}</span></p>`;
const gapRow = (level, a, b, d) => whyRow(level, d === 0 ? esc(S.sheet.agree(a, b)) : `<strong>${esc(S.sheet.gapTitle(a, b, d))}</strong>`);

function pairHtml(a, b) {
  const s = C.pairSummary(ctx, a, b);
  const rows = s.rows.map((r) => `
    <details class="pair-row">
      <summary>
        <span class="pair-topic">${esc(topic(r.topicId).name)}</span> ${levelBadge(r.level)}
        <span class="pair-labels">
          ${[a, b].map((x) => `<span><strong>${esc(name(x))}:</strong> ${esc(axisLabel(r.topicId, posOf(x, r.topicId)?.position))}${isRedLine(x, r.topicId) ? ` ${redTag()}` : ''}${pairSentence(x, r.topicId)}</span>`).join('')}
        </span>
      </summary>
      <div class="pair-detail">
        ${r.level === 'NONE' ? whyRow('NONE', esc(S.sheet.noneExplainPair)) : gapRow(r.level, name(a), name(b), r.d)}
        ${r.byRedLine ? [a, b].filter((x) => isRedLine(x, r.topicId)).map((x) => `<p>${esc(S.sheet.redByLine(name(x)))}</p>`).join('') : ''}
        <h4>${esc(name(a))}</h4>${positionBlock(a, r.topicId, { heading: false })}
        <h4>${esc(name(b))}</h4>${positionBlock(b, r.topicId, { heading: false })}
      </div>
    </details>`).join('');
  const c = s.counts;
  return `<div class="pair">
    <h3>${esc(name(a))} ↔ ${esc(name(b))}</h3>
    <p class="muted">${esc(S.pair.summary(c.AGREE, c.MINOR, c.MAJOR, c.CLASH, s.n))}</p>
    ${rows}
  </div>`;
}

function profileHtml(pid) {
  return `<div class="profile">${ctx.topics.map((t) => `
    <section class="card">
      <h3>${esc(t.name)}</h3>
      ${positionBlock(pid, t.id)}
    </section>`).join('')}</div>`;
}

// Investiture vote, its outcome, and the members' own seats against 61.
function voteHtml() {
  const v = C.investiture(ctx, state);
  const S2 = S.seats;
  const n = (x) => S2.num(x, isResults());
  return {
    v,
    // Each segment ("בעד 61", "נגד 59", …) stays whole, and the line breaks only between them (#35: larger text, polls' ≈).
    html: `<p class="seats-line vote-line"><strong>${S2.vote(n(v.for), n(v.against), n(v.abstain)).split(' · ').map((x) => `<span class="nw">${esc(x)}</span>`).join(' · ')}</strong></p>
      <p class="verdict ${v.approved ? 'is-yes' : 'is-no'}"><span aria-hidden="true">${v.approved ? '✓' : '✕'}</span> ${esc(v.approved ? S2.approved : S2.rejected)}</p>
      <p class="members-line">${esc(S2.membersLine(n(v.membersSeats), v.missing))}</p>`,
  };
}

// The source line (CEC status, or the legal poll sentence) always comes before the seat numbers, so scrolling down
// reaches it first on any screen.
function seatsLine() {
  if (!showSeats() || !C.selected(state).length) return '';
  return `${seatSourceLine()}${positionsAsOfLine()}${voteHtml().html}${pivotalHtml()}`;
}

// Parties the 61 or the investiture majority depends on (#13): numbers only, right after the vote they change.
function pivotalHtml() {
  const v = C.investiture(ctx, state);
  if (!v.approved) return '';
  const S2 = S.seats;
  const n = (x) => S2.num(x, isResults());
  const rows = C.pivotal(ctx, state).map((p) => {
    const text = S2.pivotalRow(name(p.partyId), p.role, p.breaksMajority ? n(p.vote.membersSeats) : null, n(p.vote.for), n(p.vote.against));
    // Each name and number pair stays whole; a party outside the coalition gets the neutral marker instead.
    const row = p.role === 'member' ? keepWhole(text, [name(p.partyId)]) : keepWhole(text).replace(esc(name(p.partyId)), () => outsideChip(name(p.partyId)));
    return `<li>${row}</li>`;
  }).join('');
  return `<div class="pivotal muted small"><p>${esc(S2.pivotalIntro(v.membersMajority))}</p>${rows ? `<ul>${rows}</ul>` : `<p>${esc(S2.pivotalNone)}</p>`}</div>`;
}

// Results mode: the positions are as documented on election eve, while the seats are the results.
function positionsAsOfLine() {
  return isResults() ? `<p class="positions-asof">${esc(S.elected.positionsAsOf)}</p>` : '';
}

function seatsBox() {
  if (!showSeats()) return '';
  let body = `<p class="seats-line muted">${esc(S.seats.empty)}</p>`;
  if (C.selected(state).length) {
    const { v, html } = voteHtml();
    const pct = Math.min(100, (v.membersSeats / 61) * 100);
    body = `${html}
      <div class="meter" role="img" aria-label="${esc(S.seats.meterLabel(v.membersSeats))}"><span data-pct="${pct}"></span></div>`;
  }
  return `<section class="seats-box" aria-label="${esc(S.seats.boxTitle)}"><h3>${esc(S.seats.boxTitle)}</h3>${seatSourceLine()}${positionsAsOfLine()}${recsLine()}${body}</section>`;
}

// ---------- the factions' recommendations to the President (#4) ----------
// Results mode: one line under the CEC results line and its "positions as of" line (before any number), opening the sheet. The arrow points forward (mirrored in RTL).
function recsLine() {
  if (!isResults() || !recData) return '';
  const R = S.recs;
  return `<p class="recs-line"><button type="button" class="link-btn recs-open" data-act="recs" data-key="recs-open">${esc(R.open(R.range(recData.consultations.from, recData.consultations.to)))} <span aria-hidden="true">›</span></button></p>`;
}

const recLeader = (pid) => (pid ? party(pid).leader : null);
const extLink = (url, text, label = '') => `<a href="${esc(url)}" rel="noopener" target="_blank"${label ? ` aria-label="${esc(label)}"` : ''}>${esc(text)}</a>`;

// The source line first, then the mandate, the office's own tally (verbatim, attributed), and one row per faction in
// party order, each linking its release. One neutral style for every candidate: no colors, no per-faction counts.
function recsSheet() {
  const R = S.recs;
  const m = C.localize(recData.mandate, lang);
  const day = R.date(m.date);
  const q = lang === 'he' ? `״${esc(m.quote)}״` : `“${esc(m.quote)}”`;
  const rows = C.recommendationRows(ctx, recData).map((rec) => {
    const f = C.localize(rec, lang);
    return `<tr data-party="${esc(f.partyId)}"><th scope="row">${esc(name(f.partyId))}</th><td>${esc(recLeader(f.recommended) ?? R.none)}</td>
      <td>${extLink(f.sourceUrl, S.presets.shortDate(f.date), R.rowSource(name(f.partyId), R.date(f.date)))}</td></tr>`;
  }).join('');
  openSheet(`
    <h2>${esc(R.title)}</h2>
    <p class="recs-src">${esc(R.source)} ${extLink(m.sourceUrl, R.office)}, ${esc(day)}</p>
    <p class="recs-mandate">${esc(R.mandate[m.kind](day, recLeader(m.partyId)))}</p>
    <blockquote class="recs-tally"><p class="q-text">${q}</p><footer class="q-by">${esc(R.tallyBy(day))}</footer></blockquote>
    <div class="table-wrap"><table class="coverage recs-table">
      <thead><tr>${R.cols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`);
}

// The party sheet's line: what this faction recommended, with its release.
function recsPartyLine(pid) {
  const rec = recData && ctx.passed(pid) ? C.localize(C.recommendationOf(recData, pid), lang) : null;
  if (!rec) return '';
  const R = S.recs;
  return `<p class="note recs-party">${esc(R.partyLine(R.date(rec.date), recLeader(rec.recommended)))} ${extLink(rec.sourceUrl, R.partySource)}</p>`;
}

// The poll sentence is a legal requirement in Hebrew: in English it is shown verbatim, followed by our translation.
function pollLegalText() {
  const he = esc(HE.seats.pollLegal(HE.fmtDate(meta.pollsAsOf)));
  return lang === 'he' ? he : `<span class="legal-he" lang="he" dir="rtl">${he}</span> ${esc(S.seats.pollLegal(fmtDate(meta.pollsAsOf)))}`;
}

function pollLegalLine() {
  return `<p class="poll-legal">${pollLegalText()}</p>`;
}

// What the seat numbers are, placed before them: the CEC results status, or the legally required poll sentence.
function seatSourceLine() {
  if (!isResults()) return pollNoteBtn();
  return `<p class="seat-src">${esc(meta.resultsStatus)} <a href="${esc(meta.resultsSourceUrl)}" rel="noopener" target="_blank">${esc(S.elected.sourceLink)}</a></p>`;
}

function pollNoteBtn() {
  return `<p class="poll-legal">${pollLegalText()} <button type="button" class="poll-btn" data-act="poll-info" data-key="poll-info" aria-label="${esc(S.seats.sourceInfo)}"><span aria-hidden="true">ⓘ</span></button></p>`;
}

function overallBar(r, { statuses = true } = {}) {
  if (!statuses) {
    const line = seatsLine();
    return line ? `<section class="card overall"><h2 class="card-title">${esc(S.results.summaryTitle)}</h2>${line}</section>` : '';
  }
  const segs = r.statuses.map((s) => {
    const t = topic(s.topicId);
    const lv = s.status;
    return `<li class="seg lv-${lv}" title="${esc(t.name)}: ${esc(S.levels[lv].label)}">
      <span aria-hidden="true">${S.levels[lv].icon}</span><span class="seg-label">${esc(t.short)}</span>
      <span class="sr-only">${esc(t.name)}: ${esc(S.levels[lv].label)}</span></li>`;
  }).join('');
  const b = C.breakdown(r.statuses);
  const parts = S.results.breakdown(b.agree, b.minor, b.major, b.clash, b.nodata).filter(([text, , always]) => always || !text.startsWith('0 '));
  const outside = C.coalitionGroups(state).outside.length > 0;
  return `<section class="card overall">
    <h2 class="card-title">${esc(S.results.summaryTitleScoped(state.members.length))}</h2>
    <ol class="segs">${segs}</ol>
    ${outside ? `<p class="muted small breakdown-label">${esc(S.results.breakdownLabel)}</p>` : ''}
    <ul class="breakdown">${parts.map(([text, cls]) => `<li class="${cls}">${esc(text)}</li>`).join('')}</ul>
    ${redLinesLine()}
    ${outsideBlock()}
    ${seatsLine()}
  </section>`;
}

const expandedTopics = new Set();

function crisesCard(r) {
  const R = S.results;
  const items = r.crises.map((c) => {
    const w = c.worst;
    const open = expandedTopics.has(c.topicId);
    const pairs = r.statuses.find((x) => x.topicId === c.topicId).pairs;
    const tag = R.pairsTag(S.levels[w.level].label, c.morePairs + 1);
    const head = R.pairsInTopic(c.morePairs + 1, R.levelIn[w.level]);
    const list = open ? `<p class="pair-list-head">${esc(head)}</p><ul class="pair-list" id="pairs-${c.topicId}" aria-label="${esc(head)}">${pairs.map((p) => `
      <li><button type="button" class="pair-btn" data-act="pair-sheet" data-a="${p.a}" data-b="${p.b}" data-key="pair-${c.topicId}-${p.a}-${p.b}">
        <span>${esc(name(p.a))} ↔ ${esc(name(p.b))}</span>${levelBadge(p.level)}</button></li>`).join('')}</ul>` : '';
    return `<li class="gap${open ? ' is-open' : ''}">
      <button type="button" class="row-btn gap-head" data-act="expand" data-id="${c.topicId}" data-key="gap-${c.topicId}" aria-expanded="${open}"${open ? ` aria-controls="pairs-${c.topicId}"` : ''} aria-label="${esc(`${topic(c.topicId).name}: ${name(w.a)} ↔ ${name(w.b)}, ${tag}. ${open ? R.collapse : R.expand}`)}">
        <span class="gap-main">
          <span class="row-title">${esc(topic(c.topicId).short)}: ${esc(name(w.a))} ↔ ${esc(name(w.b))}</span>
          <span class="row-meta"><span class="lv lv-${w.level}"><span aria-hidden="true">${S.levels[w.level].icon}</span> ${esc(tag)}</span>${w.byRedLine ? ` <span class="tag tag-red"><span aria-hidden="true">🚩</span> ${esc(S.redLine)}</span>` : ''}</span>
        </span>
        <svg class="chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      ${list}
    </li>`;
  }).join('');
  const heading = C.crisesHeading(r);
  const title = heading.kind === 'crises' ? R.crisesTitle(heading.n) : R.gapsTitle;
  return `<section class="card">
    <h3>${esc(title)}</h3>
    ${r.crises.length ? `<p class="muted small tap-hint">${esc(S.how.tapHint)}</p>` : ''}
    ${r.crises.length ? `<ol class="list">${items}</ol>` : `<p>${esc(heading.kind === 'nodata' ? R.noData : R.noCrises)}</p>`}
  </section>`;
}

function glueCard(r) {
  const R = S.results;
  const agree = r.glue.filter((g) => g.status === 'AGREE');
  const minor = r.glue.filter((g) => g.status === 'MINOR');
  const items = agree.map((g) => `<li>${levelBadge(g.status)} ${esc(topic(g.topicId).name)}
    <span class="muted small block">${esc(R.glueCoverage(g.withPosition, g.total))}</span></li>`).join('');
  const minorLine = minor.length ? `<p class="minor-line">${esc(R.minorOnly(minor.map((g) => topic(g.topicId).short).join(', ')))}</p>` : '';
  let body;
  if (!agree.length && !minor.length) body = `<p>${esc(R.noGlue)}</p>`;
  else body = (agree.length ? `<ul class="list">${items}</ul>` : `<p>${esc(R.noAgree)}</p>`) + minorLine;
  return `<section class="card">
    <h3>${esc(R.glueTitle)}</h3>
    ${body}
  </section>`;
}

function frictionCard(r) {
  if (!r.friction.length) return '';
  const R = S.results;
  const items = r.friction.map((f) => {
    const w = C.without(ctx, state, f.partyId);
    const preview = R.withoutPreview(C.withoutDelta(r.statuses, w.statuses), showSeats() ? w.vote.membersSeats : null, isResults());
    return `<li>
      <p class="row-title">${esc(name(f.partyId))}</p>
      ${preview ? `<p class="muted small">${esc(preview)}</p>` : ''}
      <button type="button" class="btn" data-act="remove-friction" data-id="${f.partyId}" data-key="friction-${f.partyId}">${esc(R.whatIfRemove)}</button>
    </li>`;
  }).join('');
  return `<section class="card">
    <h3>${esc(r.friction.length > 1 ? R.frictionTie : R.frictionTitle)}</h3>
    <ul class="list">${items}</ul>
  </section>`;
}

function coverageFootnote() {
  const low = C.lowCoverage(ctx, state.members);
  if (!low.length) return '';
  return `<div class="footnote">${low.map((x) => `<p>${esc(S.results.coverageLine(S.toParty(name(x.partyId)), x.missing))}</p>`).join('')}
    <p>${esc(S.results.coverageTail)}</p></div>`;
}

// The members as "★ base", "member", …: the results header and the share text.
const memberTags = () => state.members.map((id) => `${id === state.base ? '★ ' : ''}${name(id)}`);

// The results header: one line when every party is a member; otherwise the members, then the parties outside the
// coalition, each with its role in text.
function coalitionHeader() {
  const R = S.results;
  const { outside } = C.coalitionGroups(state);
  if (!outside.length) return `<p class="coalition-line"><span class="muted small">${esc(R.coalitionLabel)}:</span> ${esc(memberTags().join(' · '))}</p>`;
  return `<p class="coalition-line"><span class="muted small">${esc(R.membersLabel(state.members.length))}:</span> ${esc(memberTags().join(' · '))}</p>
    <div class="coalition-line coalition-outside"><span class="muted small">${esc(R.outsideLabel)}:</span>
      <ul class="outside-list" role="list">${outside.map((o) => `<li>${outsideChip(outsideParty(o.partyId))}</li>`).join('')}</ul></div>`;
}

// The undo line (#29): in the page flow above the coalition header, never over the status line or the numbers. The
// text is built at render time, so a language switch re-renders it.
function undoLine() {
  const R = S.results;
  const text = { replaced: () => R.undoReplaced, added: () => R.undoAdded(undo.ids.map(name)), removed: () => R.undoRemoved(name(undo.ids[0])) }[undo.kind]();
  return `<div class="undo-line"><p class="undo-text" id="undo-text">${esc(text)}</p>
    <button type="button" class="link-btn" data-act="undo" data-key="undo" aria-describedby="undo-text">${esc(R.undo)}</button>
    <button type="button" class="undo-close" data-act="undo-close" data-key="undo-close" aria-label="${esc(R.undoClose)}"><span aria-hidden="true">✕</span></button></div>`;
}

// The undo entry for a change about to happen, or null when there is nothing to restore (C.canUndo).
const undoFor = (kind, ids, next) => (C.canUndo(ctx, state, next) ? { prev: structuredClone(state), lastPreset, kind, ids } : null);

// After a change from the results view, undo or close: focus the first heading of the results, so the undo line is one
// Shift+Tab away. Without a heading (no members) the results container itself takes focus.
function focusResultsHeading() {
  const h = $('#results h2');
  if (h) h.tabIndex = -1;
  (h ?? $('#results')).focus({ preventScroll: true });
}

// The restored coalition, spoken: members, then the parties outside it with their roles, as in the header.
function restoredText() {
  const outside = C.coalitionGroups(state).outside.map((o) => `${name(o.partyId)} (${S.results.roleName[o.role]})`);
  return S.results.restored(state.members.map(name), outside);
}

function renderResults() {
  const { members } = state;
  const el = $('#results');
  const chosen = C.selected(state);
  $('#results-undo').innerHTML = undo ? undoLine() : '';
  $('#results-coalition').innerHTML = chosen.length ? coalitionHeader() : '';
  $('#results-bar').innerHTML = `
    <a class="back" href="#build">${esc(S.nav.back)}</a>
    ${chosen.length >= 2 ? `<button type="button" class="btn btn-small" data-act="share" data-key="share">${esc(S.share.button)}</button>` : ''}`;
  syncResbarHeight();
  if (chosen.length === 0) {
    el.innerHTML = `<p class="empty">${esc(S.results.resultsEmpty)} <a href="#build">${esc(S.results.resultsEmptyLink)}</a></p>`;
    return;
  }
  if (members.length === 0) {
    el.innerHTML = `<p class="empty">${esc(S.results.noMembers)} <a href="#build">${esc(S.results.resultsEmptyLink)}</a></p>`;
    return;
  }
  if (members.length === 1) {
    el.innerHTML = `<p class="empty">${esc(S.results.addPartner)} <a href="#build">${esc(S.results.resultsEmptyLink)}</a></p>
      ${chosen.length > 1 ? overallBar(C.analyze(ctx, state), { statuses: false }) + peripheryCard() : ''}
      ${completionsCard()}
      <h2>${esc(name(members[0]))}</h2>${profileHtml(members[0])}`;
    return;
  }
  const r = C.analyze(ctx, state);
  if (members.length === 2) {
    el.innerHTML = overallBar(r) + `<section class="card">${pairHtml(members[0], members[1])}</section>` + peripheryCard() + completionsCard() + coverageFootnote() + shareCard(r);
    return;
  }
  el.innerHTML = overallBar(r) + crisesCard(r) + glueCard(r) + frictionCard(r) + peripheryCard() + completionsCard() + coverageFootnote() + shareCard(r);
}

// ---------- pair view (#pair?p=a,b) ----------
// One picker. It leaves out the party in the other picker, so the same party can never be picked twice. Every party
// can be compared (positions of a list under the threshold stay viewable); in results mode those lists are grouped.
function pairPicker(slot) {
  const other = pair[1 - slot];
  const opt = (p) => `<option value="${p.id}"${p.id === pair[slot] ? ' selected' : ''}>${esc(p.name)}</option>`;
  const list = ctx.parties.filter((p) => p.id !== other);
  const below = list.filter((p) => !ctx.passed(p.id));
  return `<label class="compare">${esc(slot ? S.pair.pickB : S.pair.pickA)}
    <select data-act="pair-pick" data-slot="${slot}" data-key="pair-pick-${slot}">
      <option value="">${esc(S.pair.choose)}</option>${list.filter((p) => ctx.passed(p.id)).map(opt).join('')}
      ${below.length ? `<optgroup label="${esc(S.elected.belowTitle)}">${below.map(opt).join('')}</optgroup>` : ''}
    </select>
  </label>`;
}

const pairSummaryText = (a, b) => {
  const s = C.pairSummary(ctx, a, b);
  const c = s.counts;
  return S.pair.summary(c.AGREE, c.MINOR, c.MAJOR, c.CLASH, s.n);
};
const pairShareText = (a, b) => S.pair.shareText(name(a), name(b), pairSummaryText(a, b));
// The share link carries the pair and the language, never the coalition.
// English links go through the /en/ entry page, so their previews are in English (#21); the fragment keeps l=en too.
const shareBase = () => location.origin + location.pathname.replace(/[^/]*$/, '') + (lang === 'en' ? 'en/' : '');
const pairShareUrl = (a, b) => shareBase()
  + C.locationFor(ctx, { base: null, members: [], supporters: [], abstainers: [] }, 'pair', '', lang, [a, b]);

function renderPair() {
  const [a, b] = pair;
  const P = S.pair;
  // Polls mode: the soft-linked pair that ran as one list gets the same note as in the builder.
  const linked = a && b && ctx.linkedOf(a) === b ? `<p class="note note-soft">${esc(S.builder.linkedNote(...ordered([a, b]).map(name)))}</p>` : '';
  const wa = a && b ? `https://wa.me/?text=${encodeURIComponent(`${pairShareText(a, b)}\n${pairShareUrl(a, b)}`)}` : '';
  $('#pair-view').innerHTML = `
    <p><a class="back" href="#build">${esc(S.nav.back)}</a></p>
    <h1 class="page-title" id="pair-title" tabindex="-1">${esc(P.viewTitle)}</h1>
    <p class="muted">${esc(P.intro(ctx.topics.length))}</p>
    <div class="pair-pickers">${pairPicker(0)}${pairPicker(1)}</div>
    ${a && b ? `${linked}<section class="card">${pairHtml(a, b)}</section>
      <p class="share-row pair-share">
        <button type="button" class="btn" data-act="pair-share" data-key="pair-share">${esc(S.share.button)}</button>
        <a class="btn btn-ghost" href="${esc(wa)}" target="_blank" rel="noopener">${esc(S.share.whatsapp)}</a>
      </p>` : `<p class="empty">${esc(P.pickBoth)}</p>`}`;
}

// "What is missing for 61": minimal sets of parties that would give the members alone a majority. Tap = add them.
function completionsCard() {
  if (!showSeats()) return '';
  const v = C.investiture(ctx, state);
  if (v.membersMajority) return '';
  const { list, total, currentRedLines } = C.completions(ctx, state.members);
  const K = S.completions;
  const n = (x) => S.seats.num(x, isResults());
  const shown = showAllCompletions ? list : list.slice(0, COMPLETIONS_SHOWN);
  const items = shown.map((c) => {
    // A party that is now a supporter or abstainer would become a member.
    const names = c.add.map((id) => (roleOf(id) ? `${name(id)} ${K.nowRole[roleOf(id)]}` : name(id)));
    const meta = [K.seats(n(c.seats), n(c.total)), K.clashes(c.clashTopics, c.newClashTopics)];
    const red = c.newRedLines.length ? K.newRedLines(c.newRedLines.length, redList(c.newRedLines)) : K.noNewRedLines;
    return `<li><button type="button" class="row-btn completion" data-act="complete" data-ids="${c.add.join(',')}" data-key="complete-${c.add.join('-')}"
      aria-label="${esc(K.aria(names.join(', '), meta.join(', '), red))}">
      <span class="row-title">+ ${keepWhole(names.join(' + '), partyNames())}</span>
      <span class="row-meta muted small">${esc(meta.join(' · '))}</span>
      <span class="row-meta small">${c.newRedLines.length ? `<span class="tag tag-red"><span aria-hidden="true">🚩</span> ${keepWhole(red, partyNames())}</span>` : `<span class="muted">${esc(red)}</span>`}</span>
    </button></li>`;
  }).join('');
  const toggle = total > COMPLETIONS_SHOWN
    ? `<button type="button" class="link-btn" data-act="completions-all" data-key="completions-all" aria-expanded="${showAllCompletions}">${esc(showAllCompletions ? K.showFewer : K.showAll(total))}</button>` : '';
  return `<section class="card completions">
    <h3>${esc(K.title)}</h3>
    <p class="note note-soft">${esc(K.note)}</p>
    ${isResults() ? '' : pollLegalLine()}
    <p class="muted small">${esc(K.intro(n(v.membersSeats)))}</p>
    ${currentRedLines.length ? `<p class="small"><span class="tag tag-red tag-box"><span aria-hidden="true">🚩</span> ${keepWhole(K.currentRedLines(currentRedLines.length, redList(currentRedLines)), partyNames())}</span></p>` : ''}
    ${list.length ? `<ul class="list">${items}</ul>${toggle}` : `<p>${esc(K.none)}</p>`}
  </section>`;
}

// The results header is sticky: scroll targets below it keep a matching scroll margin (CSS --resbar-h).
function syncResbarHeight() {
  const h = $('#results-bar').getBoundingClientRect().height;
  if (h) document.documentElement.style.setProperty('--resbar-h', `${Math.ceil(h)}px`);
}

// Red lines crossed among the members, in one line (the completions card's "already crosses" is the same list).
function redLinesLine() {
  const crossed = C.redLinesCrossed(ctx, state.members);
  return crossed.length
    ? `<p class="small redlines-line"><span class="tag tag-red tag-box"><span aria-hidden="true">🚩</span> ${keepWhole(S.results.redLinesCrossed(crossed.length, redList(crossed)), partyNames())}</span></p>`
    : `<p class="muted small redlines-line">${esc(S.results.noRedLinesCrossed)}</p>`;
}

// At the end of the snapshot's members-only lines, set apart: the parties outside the coalition, with a pointer to
// their card (the snapshot does not count their clashes).
function outsideBlock() {
  const n = C.peripheryClashes(ctx, state);
  if (n == null) return '';
  return `<div class="outside-block"><h3>${esc(S.results.outsideHeading)}</h3>
    <p class="periphery-link"><button type="button" class="link-btn" data-act="to-periphery" data-key="to-periphery">${esc(S.results.peripheryLink(n))}</button></p></div>`;
}

// Supporters and abstainers vs the coalition members (never counted in the cards above).
function peripheryCard() {
  const rows = C.periphery(ctx, state);
  if (!rows.length) return '';
  const R = S.results;
  const items = rows.map((row) => `<li class="per-party">
    <p class="row-title">${outsideChip(outsideParty(row.partyId))}</p>
    ${row.items.length ? `<ul class="pair-list">${row.items.map((i) => `
      <li><button type="button" class="pair-btn" data-act="pair-sheet" data-a="${i.a}" data-b="${i.b}" data-key="per-${i.a}-${i.topicId}">
        <span>${esc(topic(i.topicId).short)}: ${esc(R.versus(name(i.b)))}</span>${levelBadge(i.level)}${i.byRedLine ? ` <span class="tag tag-red"><span aria-hidden="true">🚩</span> ${esc(S.redLine)}</span>` : ''}</button></li>`).join('')}</ul>`
    : `<p class="muted small">${esc(R.peripheryNone)}</p>`}
  </li>`).join('');
  return `<section class="card periphery" id="periphery-card">
    <h3 tabindex="-1">${esc(R.peripheryTitle)}</h3>
    <p class="muted small">${esc(R.peripheryIntro)}</p>
    <ul class="list">${items}</ul>
  </section>`;
}

// ---------- matrix ----------
function renderMatrix() {
  const { members, base } = state;
  const el = $('#matrix');
  if (members.length < 2) { el.innerHTML = ''; return; }
  const M = S.matrix;
  const present = new Set();
  let anyRed = false;
  let anySplit = false;
  const rows = (base ? [base, ...members.filter((id) => id !== base)] : members).map((pid) => {
    const cells = ctx.topics.map((t) => {
      const cell = C.matrixCell(ctx, pid, t.id, members, base);
      const p = posOf(pid, t.id);
      const lv = cell.level;
      present.add(lv === 'BASE_NULL' ? 'NONE' : lv);
      anyRed ||= Boolean(p?.redLine);
      anySplit ||= Boolean(p?.componentsDisagree);
      const icon = lv === 'REF' ? '●' : lv === 'BASE_NULL' ? '–' : S.levels[lv].icon;
      const label = lv === 'REF' ? M.reference : lv === 'BASE_NULL' ? M.baseNull : S.levels[lv].label;
      const aria = M.cellLabel(name(pid), t.name, label, cell.ref ? name(cell.ref) : null)
        + (p?.redLine ? `, ${S.redLine}` : '') + (p?.componentsDisagree ? `, ${S.componentsDisagree}` : '');
      return `<td><button type="button" class="cell lv-${lv}" data-act="cell" data-party="${pid}" data-topic="${t.id}" data-key="cell-${pid}-${t.id}" aria-label="${esc(aria)}">
        <span aria-hidden="true">${icon}</span>${p?.redLine ? '<span class="flag" aria-hidden="true">🚩</span>' : ''}${p?.componentsDisagree ? `<span class="split" aria-hidden="true">${S.componentsIcon}</span>` : ''}</button></td>`;
    }).join('');
    return `<tr><th scope="row"><button type="button" class="party-btn" data-act="party" data-id="${pid}" data-key="party-${pid}">${pid === base ? '<span aria-hidden="true">★</span> ' : ''}${esc(name(pid))}</button></th>${cells}</tr>`;
  }).join('');
  const legend = ['AGREE', 'MINOR', 'MAJOR', 'CLASH', 'NONE'].filter((lv) => present.has(lv)).map((lv) => `<li>${levelBadge(lv)}</li>`).join('')
    + (anyRed ? `<li><span class="tag tag-red"><span aria-hidden="true">🚩</span> ${esc(S.redLine)}</span></li>` : '')
    + (anySplit ? `<li><span class="tag tag-split"><span aria-hidden="true">${S.componentsIcon}</span> ${esc(S.componentsDisagree)}</span></li>` : '');
  const colorBy = `<div class="colorby" role="radiogroup" aria-label="${esc(M.colorBy)}">
      <span class="colorby-label">${esc(M.colorBy)}</span>
      ${[['', M.colorByAll], ...members.map((id) => [id, name(id)])].map(([id, label]) => {
    const on = (base ?? '') === id;
    return `<button type="button" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" class="seg-btn${on ? ' is-on' : ''}" data-act="colorby" data-id="${id}" data-key="colorby-${id || 'all'}">${esc(label)}</button>`;
  }).join('')}
    </div>`;
  el.innerHTML = `
    <h2>${esc(M.title)}</h2>
    <p class="muted small tap-hint">${esc(S.how.tapHint)}</p>
    ${colorBy}
    <p class="muted small">${esc(base ? M.relBase(name(base)) : M.relWorst)}</p>
    <div class="table-wrap">
      <table class="matrix">
        <thead><tr><td></td>${ctx.topics.map((t) => `<th scope="col"><button type="button" class="topic-btn" data-act="topic" data-id="${t.id}" data-key="topic-${t.id}" aria-label="${esc(t.name)}">${esc(t.short)}</button></th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <ul class="legend">${legend}</ul>`;
}

// ---------- share & bar ----------
function shareUrl() {
  return shareBase() + C.locationFor(ctx, state, 'results', '', lang);
}

// The members and their head-on clash topics; then, when there are any, the parties outside the coalition with their
// roles and their head-on clashes with the members (the same N as the snapshot's outside block).
const shareText = (r) => S.share.text(memberTags().join(' + '), r.clashTopics, C.peripheryClashes(ctx, state),
  C.coalitionGroups(state).outside.map((o) => [name(o.partyId), S.results.roleName[o.role]]));

function shareCard(r) {
  const text = shareText(r);
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text}\n${shareUrl()}`)}`;
  return `<p class="share-row"><a class="btn btn-ghost" href="${esc(wa)}" target="_blank" rel="noopener">${esc(S.share.whatsapp)}</a></p>`;
}

function renderBar() {
  const bar = $('#bar');
  const n = C.selected(state).length;
  if (view !== 'build' || !n) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = `<span class="bar-count">${esc(S.nav.partyCount(n))}</span>
    <a class="btn" href="#results" data-key="to-results">${esc(S.nav.toResults)}</a>`;
}

function pollInfoSheet() {
  const s = C.investiture(ctx, state);
  openSheet(`
    <h2>${esc(S.seats.infoTitle)}</h2>
    <p>${esc(S.seats.infoBody)}</p>
    ${s.borderline ? `<p>${esc(S.seats.borderlineNote(s.borderline))}</p>` : ''}
    ${pollLegalLine()}
    <ul class="links">
      <li><a href="${esc(meta.pollSourceUrl)}" rel="noopener" target="_blank">${esc(S.seats.infoSource)}</a></li>
      <li><a href="${esc(meta.pollGuidanceUrl)}" rel="noopener" target="_blank">${esc(S.seats.infoGuidance)}</a></li>
    </ul>`);
}

async function share(text = shareText(C.analyze(ctx, state)), url = shareUrl()) {
  if (navigator.share) {
    try { await navigator.share({ title: S.appName, text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast(S.share.copied, 2500);
  } catch {
    prompt(S.share.button, url);
  }
}

// ---------- sheet ----------
// Every sheet has a sticky bar: an optional back link at the start, the close button at the end.
const BACK_CHEV = '<svg class="chev chev-back" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// The visible viewport's height, for the sheet's max height (CSS --vvh, #30). Kept while the sheet is open.
function fitSheet() {
  const vv = window.visualViewport;
  if (vv) $('#sheet').style.setProperty('--vvh', `${Math.floor(vv.height)}px`);
}

function openSheet(html, { back = '' } = {}) {
  const d = $('#sheet');
  fitSheet();
  d.innerHTML = `<div class="sheet-head">${back}
    <button type="button" class="sheet-close" data-act="close-sheet" aria-label="${esc(S.sheet.close)}"><span aria-hidden="true">✕</span></button></div>
    <div class="sheet-inner">${html}</div>`;
  d.querySelector('h2')?.setAttribute('id', 'sheet-title');
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}

function whyHtml(cell, pid, tid) {
  const T = S.sheet;
  if (cell.level === 'REF') return `<p>${esc(T.refExplain)}</p>`;
  if (cell.level === 'BASE_NULL') return `<p>${esc(S.matrix.baseNull)}</p>`;
  if (cell.level === 'NONE' || !cell.ref) return whyRow('NONE', esc(T.noneExplain));
  const a = name(pid);
  const b = name(cell.ref);
  const la = axisLabel(tid, posOf(pid, tid)?.position);
  const lb = axisLabel(tid, posOf(cell.ref, tid)?.position);
  if (cell.d === 0) return gapRow(cell.level, a, b, 0);
  const redParty = cell.byRedLine ? (posOf(pid, tid)?.redLine ? a : b) : null;
  return `${gapRow(cell.level, a, b, cell.d)}
    <ul class="why"><li><strong>${esc(a)}:</strong> ${esc(la)}</li><li><strong>${esc(b)}:</strong> ${esc(lb)}</li></ul>
    ${redParty ? `<p>${esc(T.redByLine(redParty))}</p>` : ''}
    <p class="muted small">${esc(S.method.colorRule)}</p>`;
}

function cellSheet(pid, tid) {
  const cell = C.matrixCell(ctx, pid, tid, state.members, state.base);
  const p = party(pid);
  openSheet(`
    <h2>${esc(p.name)} · ${esc(topic(tid).name)}</h2>
    <p class="muted small">${esc(S.sheet.officialName)}: ${officialNameHtml(p)}</p>
    ${positionBlock(pid, tid)}
    <h3>${esc(S.sheet.why)}</h3>
    ${whyHtml(cell, pid, tid)}
    <p class="correction"><a href="${esc(correctionMailto({ party: p.name, topic: topic(tid).name, url: location.href }, S))}">${esc(S.sheet.correction)}</a></p>`);
}

function topicSheet(tid) {
  const t = topic(tid);
  const ids = C.selected(state).length ? C.selected(state) : ctx.parties.map((p) => p.id);
  const at = (k) => ids.filter((id) => posOf(id, tid)?.position === Number(k)).map(name);
  const nulls = ids.filter((id) => posOf(id, tid)?.position == null).map(name);
  // #15: the members' seats under each label, after the source line. Seats hidden: no numbers, the names stay.
  const seats = showSeats() && state.members.length ? C.seatsByPosition(ctx, state.members, tid) : null;
  const seatsAt = (group) => (group ? `<span class="axis-seats">${esc(S.sheet.membersSeats(Math.round(group.seats), isResults()))}</span>` : '');
  openSheet(`
    <h2>${esc(t.name)}</h2>
    <p class="muted">${esc(t.axisNote)}</p>
    <h3>${esc(S.sheet.axisTitle)}</h3>
    ${seats ? seatSourceLine() : ''}
    <ol class="axis-list">${C.AXIS.map((k, i) => `<li>${esc(t.axis[k])}
      <span class="axis-parties">${esc(at(k).join(' · ') || S.sheet.nobodyHere)}</span>${seatsAt(seats?.byPosition[i])}</li>`).join('')}</ol>
    ${nulls.length ? `<p class="axis-none">${levelBadge('NONE')} ${esc(nulls.join(' · '))}${seatsAt(seats?.noPosition)}</p>` : ''}
    ${seats ? `<p class="muted small members-only">${esc(S.sheet.membersOnly)}</p>` : ''}`);
}

function partyNotes(p) {
  const notes = [];
  if (p.components) notes.push(S.componentsNote(p.components.join(', ')));
  if (p.linkedWith) {
    const [a, b] = ordered([p.id, p.linkedWith]);
    notes.push(S.builder.linkedNote(name(a), name(b)));
  }
  if (isResults()) {
    const l = ctx.listOf(p.id);
    const result = ctx.passed(p.id)
      ? S.elected.partyResult(ctx.seatsOf(p.id), l.pct.toFixed(2), fmtNum(l.votes), l.parties.length > 1)
      : S.elected.partyBelow(l.pct.toFixed(2), electionResults.threshold);
    if (l.splitNote) notes.push(l.splitNote);
    const line = Array.isArray(result) ? result.map((x) => `<span class="nw">${esc(x)}</span>`).join(' · ') : esc(result);
    return seatSourceLine() + `<p class="note votes-line">${line}</p>` + recsPartyLine(p.id) + notes.map((n) => `<p class="note note-soft">${bidi(n)}</p>`).join('');
  }
  const seatNote = p.seatNote && showSeats();
  if (seatNote) notes.push(p.seatNote);
  return notes.map((n) => `<p class="note note-soft">${bidi(n)}</p>`).join('') + (seatNote ? pollLegalLine() : '');
}

// One coalition from closestTo(): every number on the row is a sort key, shown in sort order. The red-line part
// appears only when X declared red lines (otherwise the note above the list says so once).
function closestRow(x, c, hasRedLines) {
  const K = S.closest;
  const partners = c.add.map(name).join(' + ');
  const counts = [K.xClash(c.xClash, name(x)), K.wholeClash(c.wholeClash), K.agree(c.agree), K.seats(c.seats)];
  const red = hasRedLines ? K.redLines(c.redLines.length, c.redLines.map((r) => topic(r.topicId).short).join(', ')) : '';
  const warn = c.low.length ? K.warn(c.low.map((l, i) => K.warnItem(name(l.partyId), l.missing, i === 0)).join(', ')) : '';
  return `<li><button type="button" class="row-btn closest-row" data-act="closest-apply" data-id="${x}" data-ids="${c.add.join(',')}" data-key="closest-${c.add.join('-')}"
    aria-label="${esc(K.aria(partners, [red, ...counts, warn].filter(Boolean).join(', ')))}">
    <span class="closest-main">
      <span class="row-title">+ ${esc(partners)}</span>
      ${red ? `<span class="row-meta small">${c.redLines.length ? `<span class="tag tag-red"><span aria-hidden="true">🚩</span> ${esc(red)}</span>` : `<span class="muted">${esc(red)}</span>`}</span>` : ''}
      <span class="row-meta muted small closest-counts">${counts.map((t) => `<span>${esc(t)}</span>`).join('<span aria-hidden="true">·</span>')}</span>
      ${warn ? `<span class="row-meta small"><span class="tag tag-warn"><span aria-hidden="true">⚠</span> ${esc(warn)}</span></span>` : ''}
    </span>
    <svg class="chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button></li>`;
}

// The party sheet's "closest coalitions" mode. Coalitions with a silent partner sit behind a toggle that names those
// parties (from the data), unless there is nothing else to show.
function closestHtml(x) {
  const K = S.closest;
  const p = party(x);
  const r = C.closestTo(ctx, x);
  const v = closestView;
  const list = (rows, all, act) => `<ol class="list closest-list">${(all ? rows : rows.slice(0, CLOSEST_SHOWN)).map((c) => closestRow(x, c, r.ownRedLines > 0)).join('')}</ol>
    ${rows.length > CLOSEST_SHOWN ? `<button type="button" class="link-btn" data-act="${act}" data-key="${act}" aria-expanded="${all}">${esc(all ? S.completions.showFewer : S.completions.showAll(rows.length))}</button>` : ''}`;
  const silent = K.orList(ordered([...new Set(r.partial.flatMap((c) => c.low.map((l) => l.partyId)))]).map(name));
  const open = v.partialOpen || !r.full.length;
  const partial = !r.partial.length ? '' : `<div class="closest-partial">
    ${r.full.length ? `<button type="button" class="link-btn closest-toggle" data-act="closest-partial" data-key="closest-partial" aria-expanded="${open}" aria-controls="closest-partial-list"><span aria-hidden="true">${open ? '▾' : '▸'}</span> ${esc(open ? K.hidePartial(silent) : K.showPartial(r.partial.length, silent))}</button>`
      : `<p class="closest-only">${esc(K.onlyPartial(silent))}</p>`}
    <p class="muted small">${esc(K.partialNote)}</p>
    <div id="closest-partial-list"${open ? '' : ' hidden'}>${open ? list(r.partial, v.partialAll, 'closest-partial-all') : ''}</div>
  </div>`;
  const notes = [
    r.ownCoverage < ctx.topics.length ? K.ownCoverage(S.toParty(p.name), r.ownCoverage) : '',
    r.ownRedLines === 0 ? K.noRedLines(S.toParty(p.name)) : '',
  ].filter(Boolean);
  return `<h2 tabindex="-1">${esc(K.title(p.name))}</h2>
    ${seatSourceLine()}${positionsAsOfLine()}
    <p class="muted small">${esc(K.intro(p.name))} <a href="#closest-rule" data-act="close-sheet">${esc(K.howLink)}</a></p>
    ${notes.map((n) => `<p class="note note-soft">${esc(n)}</p>`).join('')}
    ${r.total ? (r.full.length ? list(r.full, v.fullAll, 'closest-all') : '') + partial : `<p>${esc(K.none)}</p>`}`;
}

const closestBack = (x) => `<button type="button" class="link-btn sheet-back" data-act="closest-back" data-id="${x}" data-key="closest-back">${BACK_CHEV}<span>${esc(S.closest.back(name(x)))}</span></button>`;

function closestSheet(pid) {
  closestView = { pid, fullAll: false, partialOpen: false, partialAll: false };
  openSheet(closestHtml(pid), { back: closestBack(pid) });
  $('#sheet h2').focus();
}

// Re-renders the closest list in place (a toggle): keeps the scroll position and the focused control.
function refreshClosest(key) {
  const d = $('#sheet');
  const top = d.scrollTop;
  openSheet(closestHtml(closestView.pid), { back: closestBack(closestView.pid) });
  d.scrollTop = top;
  d.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();
}

function partySheet(pid, compareWith = '') {
  const p = party(pid);
  const options = ctx.parties.filter((x) => x.id !== pid)
    .map((x) => `<option value="${x.id}"${x.id === compareWith ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
  openSheet(`
    <h2>${esc(p.name)}</h2>
    <p class="muted small">${esc(S.sheet.officialName)}: ${officialNameHtml(p)}</p>
    ${partyNotes(p)}
    <label class="compare">${esc(S.pair.compareWith)}
      <select data-act="compare" data-id="${pid}"><option value="">${esc(S.pair.choose)}</option>${options}</select>
    </label>
    ${isResults() && ctx.passed(pid) ? `<p><button type="button" class="btn btn-ghost closest-open" data-act="closest" data-id="${pid}" data-key="closest-open">${esc(S.closest.button(p.name))}</button></p>` : ''}
    ${compareWith ? pairHtml(pid, compareWith) : `<h3>${esc(S.sheet.partyProfile)}</h3>${profileHtml(pid)}`}`);
}

// ---------- views & routing ----------
const VIEWS = ['build', 'results', 'pair', 'method'];
let view = 'build';
// The fragment's route: the view, or a method anchor.
let routeToken = 'build';

// In-page sections of the method view that the footer links to.
const METHOD_ANCHORS = ['why', 'privacy', 'accessibility', 'closest-rule'];

function route(initial = false) {
  const loc = C.parseLocation(location, passedIds(), ctx.parties.map((p) => p.id));
  // A fragment with state (a pasted link, back/forward) brings its coalition; one without (a nav link) keeps the current one.
  // A full link also brings its language (none = Hebrew); a nav link keeps the current one.
  if (!initial && loc.hasParams && loc.lang !== lang) {
    setLanguage(loc.lang);
    renderChrome();
  }
  if (!initial && loc.fromFragment) {
    if (C.serializeState(ctx, loc.state) !== C.serializeState(ctx, state)) { lastPreset = null; undo = null; }
    applyState(loc.state);
  }
  // A pair link (or back/forward) brings its pair; the bare entry link `#pair` keeps the last one.
  if (loc.route === 'pair' && loc.hasParams) pair = loc.pair;
  let v = loc.route;
  const anchor = METHOD_ANCHORS.includes(v) ? v : null;
  if (anchor) v = 'method';
  if (!VIEWS.includes(v)) v = initial && C.selected(state).length ? 'results' : 'build';
  const changed = v !== view;
  const from = view;
  view = v;
  routeToken = anchor ?? v;
  if (view !== 'results') { undo = null; focusOnArrival = false; }
  writeUrl();
  for (const id of VIEWS) $(`#view-${id}`).hidden = id !== view;
  document.body.dataset.view = view;
  render();
  if (view === 'method') loadChangelog();
  if (anchor) $(`#${anchor}`)?.scrollIntoView();
  else if (changed || initial) window.scrollTo(0, 0);
  // Coming from the entry link, focus would stay on a hidden element: move it to the view's heading.
  if (view === 'pair' && changed && !initial) $('#pair-title')?.focus({ preventScroll: true });
  // Back from the pair view: focus returns to the card that opened it (it sits on the first screen).
  if (view === 'build' && from === 'pair' && !initial) $('[data-key="home-pair"]')?.focus({ preventScroll: true });
  // Arriving from a closest-coalitions row (#29): the results' first heading, as after any change made there.
  if (view === 'results' && focusOnArrival) { focusOnArrival = false; focusResultsHeading(); }
}

function render() {
  const focusKey = document.activeElement?.dataset?.key;
  if (view === 'build') renderBuilder();
  if (view === 'results') { renderResults(); renderMatrix(); }
  if (view === 'pair') renderPair();
  renderBar();
  // The CSP allows no inline style attributes; set the meters' widths through the CSSOM.
  for (const el of document.querySelectorAll('.meter [data-pct]')) el.style.inlineSize = `${el.dataset.pct}%`;
  if (focusKey) document.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
}

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'SELECT') return;
  const { act, id } = el.dataset;
  switch (act) {
    case 'lang':
      // The view, the coalition and the scroll position stay; only the language changes.
      if ($('#sheet').open) $('#sheet').close();
      setLanguage(S.langSwitch.other);
      renderChrome();
      writeUrl();
      render();
      // The switch was re-rendered: keep focus on it (now the button for the language just left).
      $('#lang-switch button').focus();
      break;
    case 'preset': {
      const p = C.presets(ctx)[id];
      lastPreset = id;
      setState({ base: null, ...p });
      break;
    }
    case 'scenario': {
      const sc = scenarioData.scenarios.find((x) => x.id === id);
      lastPreset = null;
      setState({ base: null, members: sc.members, supporters: sc.supporters, abstainers: sc.abstainers });
      break;
    }
    case 'toggle':
      lastPreset = null;
      setState(withRole(id, roleOf(id) ? null : 'member'), { announceParty: id });
      break;
    case 'role':
      lastPreset = null;
      setState(withRole(id, el.dataset.role));
      announce(S.builder.roleAnnounce(name(id), S.builder.roles[el.dataset.role]));
      break;
    case 'colorby':
      setState({ ...state, base: id || null });
      break;
    case 'expand':
      if (expandedTopics.has(id)) expandedTopics.delete(id); else expandedTopics.add(id);
      render();
      break;
    case 'go-builder': {
      // Card 1 (#26): the builder is in this view, so move there without touching the route.
      const h = $('#builder-title');
      h.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      h.focus({ preventScroll: true });
      break;
    }
    case 'clear':
      lastPreset = null;
      setState({ base: null, members: [], supporters: [], abstainers: [] });
      break;
    case 'remove-friction': {
      const next = C.dropParty(state, id);
      setState(next, { announceParty: id, undo: undoFor('removed', [id], next) });
      focusResultsHeading();
      break;
    }
    case 'complete': {
      const add = el.dataset.ids.split(',');
      const next = { ...add.reduce((st, pid) => C.dropParty(st, pid), state), base: state.base, members: [...state.members, ...add] };
      setState(next, { undo: undoFor('added', add, next) });
      announce(S.completions.applied(add.map(name).join(', ')));
      focusResultsHeading();
      break;
    }
    case 'to-periphery': {
      const h = $('#periphery-card h3');
      h?.scrollIntoView({ block: 'start' });
      h?.focus({ preventScroll: true });
      break;
    }
    case 'completions-all':
      showAllCompletions = !showAllCompletions;
      render();
      break;
    case 'closest':
      closestSheet(id);
      break;
    case 'closest-back':
      partySheet(id);
      $('#sheet [data-act="closest"]').focus();
      break;
    case 'closest-all':
    case 'closest-partial':
    case 'closest-partial-all': {
      const flag = { 'closest-all': 'fullAll', 'closest-partial': 'partialOpen', 'closest-partial-all': 'partialAll' }[act];
      closestView = { ...closestView, [flag]: !closestView[flag] };
      refreshClosest(el.dataset.key);
      break;
    }
    case 'closest-apply': {
      // The coalition replaces the current one, with the party as the base (the map is colored by distance from it).
      const members = [id, ...el.dataset.ids.split(',')];
      const next = { base: id, members, supporters: [], abstainers: [] };
      const u = undoFor('replaced', members, next);
      lastPreset = null;
      $('#sheet').close();
      setState(next, { undo: u });
      // From the build view the route change re-renders asynchronously: focus the heading once it has (route()).
      if (view !== 'results') { focusOnArrival = true; location.hash = 'results'; } else focusResultsHeading();
      const names = ordered(members).map(name).join(' + ');
      announce(S.closest.applied(names));
      break;
    }
    case 'undo': {
      if (!undo) break;
      const { prev, lastPreset: lp } = undo;
      lastPreset = lp;
      setState(prev);
      announce(restoredText());
      focusResultsHeading();
      break;
    }
    case 'undo-close':
      undo = null;
      $('#results-undo').innerHTML = '';
      focusResultsHeading();
      break;
    case 'cell':
      cellSheet(el.dataset.party, el.dataset.topic);
      break;
    case 'topic':
      topicSheet(id);
      break;
    case 'party':
      partySheet(id);
      break;
    case 'pair-sheet':
      partySheet(el.dataset.a, el.dataset.b);
      break;
    case 'close-sheet':
      $('#sheet').close();
      break;
    case 'share':
      share();
      break;
    case 'pair-share':
      share(pairShareText(...pair), pairShareUrl(...pair));
      break;
    case 'poll-info':
      pollInfoSheet();
      break;
    case 'recs':
      recsSheet();
      break;
  }
}

// Radio groups (#11: "צבע לפי", a party's role): one Tab stop, the checked radio. The arrows move to the next or previous
// radio and choose it, as in the ARIA radio group pattern; in RTL the left arrow is "next". Home and End: first, last.
function onRadioKey(e) {
  const radio = e.target.closest?.('[role="radiogroup"] [role="radio"]');
  const steps = { ArrowDown: 1, ArrowUp: -1, ArrowRight: document.dir === 'rtl' ? -1 : 1, ArrowLeft: document.dir === 'rtl' ? 1 : -1 };
  if (!radio || !(e.key in steps || e.key === 'Home' || e.key === 'End')) return;
  e.preventDefault();
  const radios = [...radio.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]')];
  const i = radios.indexOf(radio);
  const next = e.key === 'Home' ? radios[0] : e.key === 'End' ? radios.at(-1) : radios[(i + steps[e.key] + radios.length) % radios.length];
  next.focus();
  if (next !== radio) next.click();
}

function bind() {
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onRadioKey);
  window.addEventListener('hashchange', () => route());
  window.addEventListener('resize', () => { if (view === 'results') syncResbarHeight(); });
  for (const ev of ['resize', 'scroll']) window.visualViewport?.addEventListener(ev, () => { if ($('#sheet').open) fitSheet(); });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('select[data-act="compare"]');
    // The sheet is rebuilt, so focus moves to the new select (#6) instead of dropping inside the modal.
    if (el) { partySheet(el.dataset.id, el.value); $('#sheet select[data-act="compare"]').focus(); }
    const pp = e.target.closest('select[data-act="pair-pick"]');
    if (pp) {
      pair[Number(pp.dataset.slot)] = pp.value || null;
      writeUrl();
      render();
      if (pair[0] && pair[1]) announce(pairSummaryText(...pair));
    }
    const pick = e.target.closest('select[data-act="closest-pick"]');
    if (pick?.value) {
      const id = pick.value;
      pick.value = '';
      closestSheet(id);
    }
  });
  // Close the sheet when tapping the backdrop.
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') e.target.close(); });
}

// Switches the strings, the localized data and the page's lang/dir. The party order never changes with the language.
// Results: seat order. Polls: poll order, or ballot letters with seats hidden (the poll order would reveal standings).
function setLanguage(l) {
  S = STRINGS[l] ?? HE;
  lang = S.lang;
  meta = C.localize(data.meta, lang);
  ctx = C.contextFor(data, lang);
  document.documentElement.lang = S.lang;
  document.documentElement.dir = S.dir;
  document.title = S.pageTitle;
}

// The parts rendered once per language (the views re-render on every state change).
function renderChrome() {
  renderHeader();
  renderPresets();
  renderMethod();
  renderFooter();
}

async function main() {
  // An old link carries the coalition in the query. Move it to the fragment before any request, so no fetch carries it
  // (a fetch's Referer is this URL). The ids are checked once the data has loaded.
  const moved = C.moveLegacyState(location);
  if (moved) history.replaceState(null, '', location.pathname + moved);
  const get = (f) => fetch(`data/${f}.json`).then((r) => {
    if (!r.ok) throw new Error(`${f}: ${r.status}`);
    return r.json();
  });
  // The results file is needed only in results mode; in polls mode a missing file is fine.
  const [parties, topics, positions, m, results, scenarios, recs] = await Promise.all([
    ...['parties', 'topics', 'positions', 'meta'].map(get),
    get('results-26').catch(() => null),
    get('scenarios').catch(() => null),
    get('recommendations').catch(() => null),
  ]);
  data = { meta: m, parties, topics, positions, results };
  electionResults = results;
  scenarioData = m.mode === 'results' ? scenarios : null;
  recData = m.mode === 'results' ? recs : null;
  if (m.mode === 'results' && !results) throw new Error('results-26: missing');
  setLanguage(C.parseLocation(location, []).lang);
  // Lists under the threshold (results mode) cannot be selected, so a link naming them drops them like unknown ids.
  // route(true) then rewrites the link without the dropped ids, so sharing it again does not carry them.
  applyState(C.parseLocation(location, passedIds()).state);
  renderChrome();
  bind();
  route(true);
  countPageview();
}

main().catch((err) => {
  console.error(err);
  $('#results').innerHTML = `<p class="empty">${esc(S.loadError)}</p>`;
});
