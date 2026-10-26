import { S } from './strings.js';
import * as C from './compat.js';
import { countPageview } from './stats.js';
import { correctionMailto, quoteAttribution, SITE_TRANSLATOR } from './links.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let ctx;
let meta;
let state = { base: null, members: [], outside: [] };
let lastPreset = null;
let undoState = null;
let toastTimer;

// ---------- data helpers ----------
const party = (id) => ctx.byId.get(id);
const name = (id) => party(id)?.name ?? id;
const topic = (id) => ctx.topics.find((t) => t.id === id);
const posOf = (pid, tid) => ctx.idx.get(`${pid}|${tid}`);
const axisLabel = (tid, position) => (position == null ? S.sheet.noPositionLabel : topic(tid).axis[String(position)]);
const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '');
const ordered = (ids) => [...ids].sort((a, b) => ctx.order.get(a) - ctx.order.get(b));
const showSeats = () => meta.showSeats !== false;

function levelBadge(level, extraClass = '') {
  const l = S.levels[level] ?? S.levels.NONE;
  return `<span class="lv lv-${level} ${extraClass}"><span aria-hidden="true">${l.icon}</span> ${esc(l.label)}</span>`;
}

// ---------- state ----------
function setState(next, { announceParty } = {}) {
  state = { base: next.base ?? null, members: ordered(next.members), outside: next.outside ?? [] };
  if (state.base && !state.members.includes(state.base)) state.base = null;
  state.outside = state.outside.filter((id) => state.members.includes(id));
  history.replaceState(null, '', location.pathname + C.serializeState(ctx, state) + location.hash);
  render();
  if (announceParty) {
    const r = C.analyze(ctx, state);
    announce(S.results.live(name(announceParty), r.clashTopics));
  }
}

function announce(text) {
  const live = $('#live');
  live.textContent = '';
  setTimeout(() => { live.textContent = text; }, 50);
}

function toast(html, ms = 5000) {
  const el = $('#toast');
  el.innerHTML = html;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------- static sections ----------
function renderHeader() {
  $('#brand-name').textContent = S.appName;
  $('#nav-method').textContent = S.nav.method;
  $('#intro').textContent = S.buildIntro;
  $('#purpose').textContent = S.buildPurpose;
  $('#voter-info').innerHTML = `${esc(S.voterInfo)} <a href="${esc(S.voterInfoUrl)}" rel="noopener" target="_blank">${esc(S.voterInfoLink)}</a>`;
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
    <p class="f-by"><a href="https://lioz.dev" rel="noopener">${esc(F.by)}</a></p>
    <p class="f-icons">
      <a href="https://github.com/Lioo7/mi-im-mi" rel="noopener" aria-label="${esc(F.githubLabel)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 .5A11.5 11.5 0 0 0 .5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z"/></svg></a>
      <a href="mailto:lioz.akirav@gmail.com" aria-label="${esc(F.emailLabel)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1.3 2 7.7 5.9L19.7 7H4.3ZM4 17h16V9.1l-8 6.1-8-6.1V17Z"/></svg></a>
    </p>
    <p class="f-links"><a href="#why">${esc(F.why)}</a><a href="#method">${esc(F.how)}</a><a href="https://github.com/Lioo7/mi-im-mi/tree/main/site/data" rel="noopener">${esc(F.openData)}</a></p>
    <p class="f-meta">${esc(S.updated(fmtDate(meta.dataUpdated)))} · ${esc(F.notAdvice)}</p>`;
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
  $('#method').innerHTML = `
    <section id="why" class="why-box" tabindex="-1">
      <h2>${esc(W.title)}</h2>
      <p>${esc(W.p1)}</p>
      <p>${esc(W.p2)} <a href="mailto:lioz.akirav@gmail.com">${esc(W.writeMe)}</a> · <a href="https://github.com/Lioo7/mi-im-mi" rel="noopener"><bdi>GitHub</bdi></a></p>
    </section>
    <h1 class="page-title">${esc(M.title)}</h1>
    <p>${esc(M.intro(ctx.parties.length))}</p>
    <ol>${S.how.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
    <p>${esc(S.how.outside(showSeats()))}</p>
    <p class="disclaimer"><strong>${esc(M.disclaimer)}</strong> ${esc(M.independent)}</p>

    <h3>${esc(M.levelsTitle)}</h3>
    <ul class="level-rules">${M.levelRules.map(([lv, txt]) => `<li>${levelBadge(lv)} ${esc(txt)}</li>`).join('')}</ul>
    <p>${esc(M.colorRule)}</p>
    <p>${esc(M.matrixRule)}</p>
    <p>${esc(M.resultsRule(showSeats()))}</p>
    <p>${esc(M.impactRule)}</p>
    <p>${esc(M.breakdownRule)}</p>

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
    <p>${esc(M.nullRule)}</p>
    <p>${esc(M.bakalpi)} <a href="https://www.bakalpi.co.il/he" rel="noopener"><bdi>bakalpi.co.il</bdi></a></p>
    <p>${esc(M.names)} <a href="${esc(meta.partyNamesSourceUrl)}" rel="noopener">gov.il</a></p>

    <h3>${esc(M.jointTitle)}</h3>
    <ul>${(showSeats() ? [M.jointRules[0], M.jointSeats, ...M.jointRules.slice(1)] : M.jointRules).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    ${showSeats() ? pollLegalLine() : ''}
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
    <ul>${M.orderRules(showSeats(), name(C.presets(ctx).unity.members[1])).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>

    ${examples ? `<h3>${esc(M.examplesTitle)}</h3><ul>${examples}</ul>` : ''}

    ${showSeats() ? `<h3>${esc(M.pollsTitle)}</h3><p>${esc(M.pollsText)}</p><p><strong>${esc(meta.pollNote)}</strong></p>
    <p>${esc(M.pollsGuidance)} <a href="${esc(meta.pollGuidanceUrl)}" rel="noopener">${esc(M.pollsGuidanceLink)}</a></p>` : ''}
    <h3>${esc(M.researchDocs)}</h3>
    <p>${esc(M.researchDocsNote)} <a href="https://github.com/Lioo7/mi-im-mi/tree/main/docs/research" rel="noopener">${esc(M.researchDocs)}</a></p>
    <h3>${esc(M.privacyTitle)}</h3>
    <p>${esc(M.privacy)} ${esc(M.privacyStats)}</p>
    <p><strong>${esc(M.corrections)}</strong> <a href="mailto:lioz.akirav@gmail.com"><bdi>lioz.akirav@gmail.com</bdi></a></p>
    <p class="muted">${esc(M.updated(fmtDate(meta.dataUpdated)))}</p>`;
}

// ---------- presets & builder ----------
function presetOrder() {
  const keys = ['opposition-arab', 'unity', 'opposition', 'coalition'];
  return keys.sort((a, b) => S.presets[a].localeCompare(S.presets[b], 'he'));
}

function renderPresets() {
  $('#presets').innerHTML = `
    <h2>${esc(S.presets.title)}</h2>
    <div class="preset-grid" role="group" aria-label="${esc(S.presets.title)}">
      ${presetOrder().map((k) => `<button type="button" class="preset" data-act="preset" data-id="${k}" data-key="preset-${k}">${esc(S.presets[k])}</button>`).join('')}
    </div>
    <p class="muted small">${esc(S.presets.blocNote)}</p>`;
}

const ltr = (text) => `<bdi dir="ltr">${esc(text)}</bdi>`;

function pillsHtml(a, c, u) {
  return `<span class="pills" dir="ltr" aria-hidden="true"><span class="pill im-ok">✓${a}</span><span class="pill im-clash">✕${c}</span><span class="pill im-unk">?${u}</span></span>`;
}

function renderBuilder() {
  const B = S.builder;
  const { members, outside } = state;

  const rows = ctx.parties.map((p) => {
    const id = p.id;
    const on = members.includes(id);
    const out = outside.includes(id);
    const im = !on && members.length ? C.addImpact(ctx, id, members) : null;
    const sub = [
      showSeats() && p.pollAvg != null ? S.builder.seatsChip(Math.round(p.pollAvg)) : '',
      showSeats() && p.threshold === 'borderline' ? B.borderline : '',
    ].filter(Boolean).join(' · ');
    const label = `${p.name}${im ? `. ${B.impactLabel(im.agree, im.clash, im.unknown)}` : ''}`;
    return `<li class="prow${on ? ' is-on' : ''}">
      <button type="button" role="checkbox" aria-checked="${on}" class="prow-main" data-act="toggle" data-id="${id}" data-key="row-${id}" aria-label="${esc(label)}">
        <span class="cb" aria-hidden="true">${on ? '✓' : ''}</span>
        <span class="slip-tag">${esc(p.ballotLetters)}</span>
        <span class="prow-text"><span class="prow-name">${esc(p.name)}</span>${sub ? `<span class="prow-sub">${esc(sub)}</span>` : ''}</span>
        <span class="prow-end">${on ? `<span class="in-coalition">${esc(B.inCoalition)}</span>` : im ? pillsHtml(im.agree, im.clash, im.unknown) : ''}</span>
      </button>
      ${on ? `<button type="button" class="out-toggle" data-act="outside" data-id="${id}" data-key="out-${id}" aria-pressed="${out}" aria-label="${esc(B.outsideLabel(p.name))}">${esc(B.outsideToggle)}</button>` : ''}
    </li>`;
  }).join('');

  let unityNote = '';
  if (lastPreset === 'unity' && showSeats()) {
    const preset = C.presets(ctx).unity.members;
    if (preset.length === members.length && preset.every((id) => members.includes(id))) {
      unityNote = `<p class="note">${esc(S.seats.unityMissing(C.seats(ctx, members, outside).missing))}</p>`;
    }
  }

  // One note per soft-linked pair, shown even when only one of the two is selected.
  const linkedPairs = new Set(members.filter((id) => party(id).linkedWith).map((id) => ordered([id, party(id).linkedWith]).join('|')));
  const linkedNotes = [...linkedPairs].map((pair) => {
    const [a, b] = pair.split('|');
    return `<p class="note note-soft">${esc(B.linkedNote(name(a), name(b)))}</p>`;
  });

  $('#builder').innerHTML = `
    <div class="tray-head">
      <h2>${esc(B.pick)}</h2>
      ${members.length ? `<button type="button" class="link-btn" data-act="clear" data-key="clear">${esc(B.clear)}</button>` : ''}
    </div>
    ${seatsBox()}
    ${members.length ? `<p class="muted small">${esc(B.impactHeading)}: <span class="impact-legend"><span class="im-ok" aria-hidden="true">✓</span> ${esc(B.impactAgree)} · <span class="im-clash" aria-hidden="true">✕</span> ${esc(B.impactClash)} · <span class="im-unk" aria-hidden="true">?</span> ${esc(B.impactUnknown)}</span></p>` : ''}
    <ul class="plist" role="group" aria-label="${esc(B.pick)}">${rows}</ul>
    <p class="muted small">${esc(B.hint(showSeats()))}</p>
    ${linkedNotes.join('')}
    ${unityNote}`;
}

// ---------- results ----------
function positionBlock(pid, tid, { heading = true } = {}) {
  const p = posOf(pid, tid);
  const T = S.sheet;
  if (!p || p.position == null) {
    return `<div class="pos">
      ${heading ? `<p class="pos-label none">${esc(T.noPositionLabel)}</p>` : ''}
      <p>${esc(p?.summary ?? T.noPosition)}</p>
    </div>`;
  }
  return `<div class="pos">
    ${heading ? `<p class="pos-label">${esc(axisLabel(tid, p.position))}</p>` : ''}
    ${p.redLine || p.componentsDisagree ? `<p>${p.redLine ? `<span class="tag tag-red"><span aria-hidden="true">🚩</span> ${esc(S.redLine)}</span> ` : ''}${p.componentsDisagree ? `<span class="tag tag-split"><span aria-hidden="true">${S.componentsIcon}</span> ${esc(S.componentsDisagree)}</span>` : ''}</p>` : ''}
    <p>${esc(p.summary)}</p>
    ${p.quote ? `<blockquote><p class="q-text"${/[\u0600-\u06FF]/.test(p.quote) ? ' lang="ar" dir="rtl"' : ''}>״${esc(p.quote)}״</p>${p.quoteTranslation ? `<p class="q-text q-trans">״${esc(p.quoteTranslation)}״ ${esc(p.quoteTranslatedBy === SITE_TRANSLATOR ? S.sheet.siteTranslation : S.sheet.translationBy(p.quoteTranslatedBy))}</p>` : ''}<footer class="q-by">${esc(quoteAttribution(p, name(pid)))}</footer></blockquote>` : ''}
    <p class="source">
      <span class="tag tag-src">${esc(T.sourceTypes[p.sourceType] ?? '')}</span>
      ${p.sourceDate ? `<span class="muted">${esc(T.date(fmtDate(p.sourceDate)))}</span>` : ''}
      <a href="${esc(p.sourceUrl)}" rel="noopener" target="_blank">${esc(T.source)}</a>
      ${p.archiveUrl ? `· <a href="${esc(p.archiveUrl)}" rel="noopener" target="_blank">${esc(T.archive)}</a>` : ''}
      ${p.viaUrl ? `· <a href="${esc(p.viaUrl)}" rel="noopener" target="_blank">${esc(T.via)}</a>` : ''}
    </p>
  </div>`;
}

// First sentence of a position's summary, shown under its axis label in the pair view.
function pairSentence(pid, tid) {
  const p = posOf(pid, tid);
  if (!p || p.position == null || !p.summary) return '';
  const m = p.summary.match(/^.+?[.!?](?=\s|$)/);
  return `<span class="pair-sum">${esc(m ? m[0] : p.summary)}</span>`;
}

function pairHtml(a, b) {
  const s = C.pairSummary(ctx, a, b);
  const rows = s.rows.map((r) => `
    <details class="pair-row">
      <summary>
        <span class="pair-topic">${esc(topic(r.topicId).name)}</span> ${levelBadge(r.level)}
        <span class="pair-labels">
          ${[a, b].map((x) => `<span><strong>${esc(name(x))}:</strong> ${esc(axisLabel(r.topicId, posOf(x, r.topicId)?.position))}${pairSentence(x, r.topicId)}</span>`).join('')}
        </span>
      </summary>
      <div class="pair-detail">
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

function seatsText() {
  const { members, outside } = state;
  const s = C.seats(ctx, members, outside);
  const S2 = S.seats;
  const head = outside.length ? S2.totalWithOutside(s.total, s.inside, s.outside) : S2.total2(s.inside);
  return { s, html: `<strong><bdi dir="ltr">${esc(head)}</bdi></strong> · ${esc(s.missing ? S2.short(s.missing) : S2.majority)}` };
}

function seatsLine() {
  if (!showSeats() || !state.members.length) return '';
  return `<p class="seats-line">${seatsText().html}</p>${pollNoteBtn()}`;
}

function seatsBox() {
  if (!showSeats()) return '';
  const { members } = state;
  let body = `<p class="seats-line muted">${esc(S.seats.empty)}</p>`;
  if (members.length) {
    const { s, html } = seatsText();
    const pct = Math.min(100, (s.total / 61) * 100);
    body = `<p class="seats-line">${html}</p>
      <div class="meter" role="img" aria-label="${esc(`${s.total} / 61`)}"><span style="inline-size:${pct}%"></span></div>`;
  }
  return `<section class="seats-box" aria-label="${esc(S.seats.boxTitle)}"><h3>${esc(S.seats.boxTitle)}</h3>${body}${pollNoteBtn()}</section>`;
}

function pollLegalLine() {
  return `<p class="poll-legal">${esc(S.seats.pollLegal(fmtDate(meta.pollsAsOf)))}</p>`;
}

function pollNoteBtn() {
  return `<p class="poll-legal">${esc(S.seats.pollLegal(fmtDate(meta.pollsAsOf)))} <button type="button" class="poll-btn" data-act="poll-info" data-key="poll-info" aria-label="${esc(S.seats.sourceInfo)}"><span aria-hidden="true">ⓘ</span></button></p>`;
}

function overallBar(r) {
  const segs = r.statuses.map((s) => {
    const t = topic(s.topicId);
    const lv = s.status;
    return `<li class="seg lv-${lv}" title="${esc(t.name)}: ${esc(S.levels[lv].label)}">
      <span aria-hidden="true">${S.levels[lv].icon}</span><span class="seg-label">${esc(t.short)}</span>
      <span class="sr-only">${esc(t.name)}: ${esc(S.levels[lv].label)}</span></li>`;
  }).join('');
  const b = C.breakdown(r.statuses);
  const parts = S.results.breakdown(b.agree, b.minor, b.major, b.clash, b.nodata).filter(([text, , always]) => always || !text.startsWith('0 '));
  return `<section class="card overall">
    <h2 class="card-title">${esc(S.results.summaryTitle)}</h2>
    <ol class="segs">${segs}</ol>
    <ul class="breakdown">${parts.map(([text, cls]) => `<li class="${cls}">${esc(text)}</li>`).join('')}</ul>
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
      <button type="button" class="row-btn gap-head" data-act="expand" data-id="${c.topicId}" data-key="gap-${c.topicId}" aria-expanded="${open}" aria-controls="pairs-${c.topicId}" aria-label="${esc(`${topic(c.topicId).name}: ${esc(name(w.a))} ↔ ${esc(name(w.b))}, ${tag}. ${open ? R.collapse : R.expand}`)}">
        <span class="gap-main">
          <span class="row-title">${esc(topic(c.topicId).short)}: ${esc(name(w.a))} ↔ ${esc(name(w.b))}</span>
          <span class="row-meta"><span class="lv lv-${w.level}"><span aria-hidden="true">${S.levels[w.level].icon}</span> ${esc(tag)}</span>${w.byRedLine ? ` <span class="tag tag-red"><span aria-hidden="true">🚩</span> ${esc(S.redLine)}</span>` : ''}</span>
        </span>
        <svg class="chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      ${list}
    </li>`;
  }).join('');
  const title = r.clashTopics > 0 ? R.crisesTitle(Math.max(r.crises.length, 1)) : R.gapsTitle;
  return `<section class="card">
    <h3>${esc(title)}</h3>
    ${r.crises.length ? `<p class="muted small tap-hint">${esc(S.how.tapHint)}</p>` : ''}
    ${r.crises.length ? `<ol class="list">${items}</ol>` : `<p>${esc(R.noCrises)}</p>`}
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
    const preview = R.withoutPreview(C.withoutDelta(r.statuses, w.statuses), showSeats() ? w.seats.total : null);
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

function renderResults() {
  const { members } = state;
  const el = $('#results');
  const tags = members.map((id) => `${id === state.base ? '★ ' : ''}${name(id)}${state.outside.includes(id) ? ` ${S.results.outsideTag}` : ''}`);
  $('#results-coalition').innerHTML = members.length
    ? `<p class="coalition-line"><span class="muted small">${esc(S.results.coalitionLabel)}:</span> ${esc(tags.join(' · '))}</p>` : '';
  $('#results-bar').innerHTML = `
    <a class="back" href="#build">${esc(S.nav.back)}</a>
    ${members.length >= 2 ? `<button type="button" class="btn btn-small" data-act="share" data-key="share">${esc(S.share.button)}</button>` : ''}`;
  if (members.length === 0) {
    el.innerHTML = `<p class="empty">${esc(S.results.resultsEmpty)} <a href="#build">${esc(S.results.resultsEmptyLink)}</a></p>`;
    return;
  }
  if (members.length === 1) {
    el.innerHTML = `<p class="empty">${esc(S.results.addPartner)} <a href="#build">${esc(S.results.resultsEmptyLink)}</a></p>
      <h2>${esc(name(members[0]))}</h2>${profileHtml(members[0])}`;
    return;
  }
  const r = C.analyze(ctx, state);
  if (members.length === 2) {
    el.innerHTML = overallBar(r) + `<section class="card">${pairHtml(members[0], members[1])}</section>` + coverageFootnote() + shareCard(r);
    return;
  }
  el.innerHTML = overallBar(r) + crisesCard(r) + glueCard(r) + frictionCard(r) + coverageFootnote() + shareCard(r);
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
    return `<button type="button" role="radio" aria-checked="${on}" class="seg-btn${on ? ' is-on' : ''}" data-act="colorby" data-id="${id}" data-key="colorby-${id || 'all'}">${esc(label)}</button>`;
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
  return location.origin + location.pathname + C.serializeState(ctx, state);
}

function shareCard(r) {
  const names = state.members.map(name).join(' + ');
  const text = S.share.text(names, r.clashTopics);
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text}\n${shareUrl()}`)}`;
  return `<p class="share-row"><a class="btn btn-ghost" href="${esc(wa)}" target="_blank" rel="noopener">${esc(S.share.whatsapp)}</a></p>`;
}

function renderBar() {
  const bar = $('#bar');
  const { members } = state;
  if (view !== 'build' || !members.length) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = `<span class="bar-count">${esc(S.nav.partyCount(members.length))}</span>
    <a class="btn" href="#results" data-key="to-results">${esc(S.nav.toResults)}</a>`;
}

function pollInfoSheet() {
  const s = C.seats(ctx, state.members, state.outside);
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

async function share() {
  const r = C.analyze(ctx, state);
  const text = S.share.text(state.members.map(name).join(' + '), r.clashTopics);
  const url = shareUrl();
  if (navigator.share) {
    try { await navigator.share({ title: S.appName, text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast(esc(S.share.copied), 2500);
  } catch {
    prompt(S.share.button, url);
  }
}

// ---------- sheet ----------
function openSheet(html) {
  const d = $('#sheet');
  d.innerHTML = `<div class="sheet-inner">
    <button type="button" class="icon-btn sheet-close" data-act="close-sheet" aria-label="${esc(S.sheet.close)}"><span aria-hidden="true">✕</span></button>
    ${html}</div>`;
  d.querySelector('h2')?.setAttribute('id', 'sheet-title');
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}

function whyHtml(cell, pid, tid) {
  const T = S.sheet;
  if (cell.level === 'REF') return `<p>${esc(T.refExplain)}</p>`;
  if (cell.level === 'BASE_NULL') return `<p>${esc(S.matrix.baseNull)}</p>`;
  if (cell.level === 'NONE' || !cell.ref) return `<p>${levelBadge('NONE')} ${esc(T.noneExplain)}</p>`;
  const a = name(pid);
  const b = name(cell.ref);
  const la = axisLabel(tid, posOf(pid, tid)?.position);
  const lb = axisLabel(tid, posOf(cell.ref, tid)?.position);
  if (cell.d === 0) return `<p>${levelBadge(cell.level)} ${esc(T.agree(a, b))}</p>`;
  const redParty = cell.byRedLine ? (posOf(pid, tid)?.redLine ? a : b) : null;
  return `<p>${levelBadge(cell.level)} <strong>${esc(T.gapTitle(a, b, cell.d))}</strong></p>
    <ul class="why"><li><strong>${esc(a)}:</strong> ${esc(la)}</li><li><strong>${esc(b)}:</strong> ${esc(lb)}</li></ul>
    ${redParty ? `<p>${esc(T.redByLine(redParty))}</p>` : ''}
    <p class="muted small">${esc(S.method.colorRule)}</p>`;
}

function cellSheet(pid, tid) {
  const cell = C.matrixCell(ctx, pid, tid, state.members, state.base);
  const p = party(pid);
  openSheet(`
    <h2>${esc(p.name)} · ${esc(topic(tid).name)}</h2>
    <p class="muted small">${esc(S.sheet.officialName)}: ${esc(p.officialName)}</p>
    ${positionBlock(pid, tid)}
    <h3>${esc(S.sheet.why)}</h3>
    ${whyHtml(cell, pid, tid)}
    <p class="correction"><a href="${esc(correctionMailto({ party: p.name, topic: topic(tid).name, url: location.href, bodyIntro: S.sheet.correctionBody }))}">${esc(S.sheet.correction)}</a></p>`);
}

function topicSheet(tid) {
  const t = topic(tid);
  const ids = state.members.length ? state.members : ctx.parties.map((p) => p.id);
  const at = (k) => ids.filter((id) => posOf(id, tid)?.position === Number(k)).map(name);
  const nulls = ids.filter((id) => posOf(id, tid)?.position == null).map(name);
  openSheet(`
    <h2>${esc(t.name)}</h2>
    <p class="muted">${esc(t.axisNote)}</p>
    <h3>${esc(S.sheet.axisTitle)}</h3>
    <ol class="axis-list">${['-2', '-1', '0', '1', '2'].map((k) => `<li>${esc(t.axis[k])}
      <span class="axis-parties">${esc(at(k).join(' · ') || S.sheet.nobodyHere)}</span></li>`).join('')}</ol>
    ${nulls.length ? `<p>${levelBadge('NONE')} ${esc(nulls.join(' · '))}</p>` : ''}`);
}

function partyNotes(p) {
  const notes = [];
  if (p.components) notes.push(S.componentsNote(p.components.join(', ')));
  if (p.linkedWith) {
    const [a, b] = ordered([p.id, p.linkedWith]);
    notes.push(S.builder.linkedNote(name(a), name(b)));
  }
  const seatNote = p.seatNote && showSeats();
  if (seatNote) notes.push(p.seatNote);
  return notes.map((n) => `<p class="note note-soft">${esc(n)}</p>`).join('') + (seatNote ? pollLegalLine() : '');
}

function partySheet(pid, compareWith = '') {
  const p = party(pid);
  const options = ctx.parties.filter((x) => x.id !== pid)
    .map((x) => `<option value="${x.id}"${x.id === compareWith ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
  openSheet(`
    <h2>${esc(p.name)}</h2>
    <p class="muted small">${esc(S.sheet.officialName)}: ${esc(p.officialName)}</p>
    ${partyNotes(p)}
    <label class="compare">${esc(S.pair.compareWith)}
      <select data-act="compare" data-id="${pid}"><option value="">${esc(S.pair.choose)}</option>${options}</select>
    </label>
    ${compareWith ? pairHtml(pid, compareWith) : `<h3>${esc(S.sheet.partyProfile)}</h3>${profileHtml(pid)}`}`);
}

// ---------- views & routing ----------
const VIEWS = ['build', 'results', 'method'];
let view = 'build';

function route(initial = false) {
  let v = location.hash.slice(1);
  const toWhy = v === 'why';
  if (toWhy) v = 'method';
  if (!VIEWS.includes(v)) v = initial && state.members.length ? 'results' : 'build';
  const changed = v !== view;
  view = v;
  if (initial && !VIEWS.includes(location.hash.slice(1)) && v === 'results') {
    history.replaceState(null, '', location.pathname + location.search + '#results');
  }
  for (const id of VIEWS) $(`#view-${id}`).hidden = id !== view;
  document.body.dataset.view = view;
  render();
  if (toWhy) $('#why')?.scrollIntoView();
  else if (changed || initial) window.scrollTo(0, 0);
}

function render() {
  const focusKey = document.activeElement?.dataset?.key;
  if (view === 'build') renderBuilder();
  if (view === 'results') { renderResults(); renderMatrix(); }
  renderBar();
  if (focusKey) document.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
}

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'SELECT') return;
  const { act, id } = el.dataset;
  const { members, base, outside } = state;
  switch (act) {
    case 'preset': {
      const p = C.presets(ctx)[id];
      lastPreset = id;
      setState({ base: null, members: p.members, outside: p.outside });
      break;
    }
    case 'add':
      lastPreset = null;
      setState({ base, members: C.withLinked(ctx, members, id), outside }, { announceParty: id });
      break;
    case 'remove':
      lastPreset = null;
      setState({ base: base === id ? null : base, members: members.filter((m) => m !== id), outside: outside.filter((m) => m !== id) }, { announceParty: id });
      break;
    case 'toggle':
      lastPreset = null;
      if (members.includes(id)) setState({ base: base === id ? null : base, members: members.filter((m) => m !== id), outside: outside.filter((m) => m !== id) }, { announceParty: id });
      else setState({ base, members: C.withLinked(ctx, members, id), outside }, { announceParty: id });
      break;
    case 'outside':
      setState({ base, members, outside: outside.includes(id) ? outside.filter((m) => m !== id) : [...outside, id] });
      break;
    case 'colorby':
      setState({ base: id || null, members, outside });
      break;
    case 'expand':
      if (expandedTopics.has(id)) expandedTopics.delete(id); else expandedTopics.add(id);
      render();
      break;
    case 'clear':
      lastPreset = null;
      setState({ base: null, members: [], outside: [] });
      break;
    case 'remove-friction':
      undoState = { ...state };
      setState({ base: base === id ? null : base, members: members.filter((m) => m !== id), outside: outside.filter((m) => m !== id) }, { announceParty: id });
      toast(`${esc(S.results.removed(name(id)))} <button type="button" class="link-btn" data-act="undo">${esc(S.results.undo)}</button>`, 8000);
      break;
    case 'undo':
      if (undoState) setState(undoState);
      undoState = null;
      $('#toast').hidden = true;
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
    case 'poll-info':
      pollInfoSheet();
      break;
  }
}

function bind() {
  document.addEventListener('click', onClick);
  window.addEventListener('hashchange', () => route());
  document.addEventListener('change', (e) => {
    const el = e.target.closest('select[data-act="compare"]');
    if (el) partySheet(el.dataset.id, el.value);
  });
  // Close the sheet when tapping the backdrop.
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') e.target.close(); });
}

async function main() {
  const get = (f) => fetch(`data/${f}.json`).then((r) => {
    if (!r.ok) throw new Error(`${f}: ${r.status}`);
    return r.json();
  });
  const [parties, topics, positions, m] = await Promise.all(['parties', 'topics', 'positions', 'meta'].map(get));
  meta = m;
  // With seats hidden, the poll order itself would reveal standings: order by ballot letters instead.
  ctx = showSeats()
    ? C.makeContext({ parties, topics, positions })
    : C.makeContext({ parties: C.ballotOrder(parties), topics, positions, rankBySeats: false });
  const parsed = C.parseState(location.search, parties.map((p) => p.id));
  state = { ...parsed, members: ordered(parsed.members) };
  renderHeader();
  renderPresets();
  renderMethod();
  renderFooter();
  // The host's free plan floats a badge (202×64px) at the bottom-right. Reserve room under the bar and page
  // so it never covers the required poll sentence.
  if (document.querySelector('script[data-nf-variant]')) document.body.classList.add('host-badge');
  bind();
  route(true);
  countPageview();
}

main().catch((err) => {
  console.error(err);
  $('#results').innerHTML = `<p class="empty">${esc(S.loadError)}</p>`;
});
