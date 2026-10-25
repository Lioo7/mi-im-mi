import { S } from './strings.js';
import * as C from './compat.js';

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
  $('#header').innerHTML = `
    <h1>${esc(S.appName)}</h1>
    <p class="tagline">${esc(S.tagline)}</p>
    <p class="updated">${esc(S.updated(fmtDate(meta.dataUpdated)))}</p>`;
  $('#skip').textContent = S.skip;
  $('#how').innerHTML = `
    <h2>${esc(S.how.title)}</h2>
    <ol>${S.how.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
    <a href="#method">${esc(S.how.more)}</a>`;
  if (meta.stub) {
    const b = $('#banner');
    b.textContent = S.stubBanner;
    b.hidden = false;
  }
}

function renderFooter() {
  $('#footer').innerHTML = `
    <p>${esc(S.footer.by)} · <a href="https://github.com/Lioo7" rel="noopener"><bdi>${esc(S.footer.github)}</bdi></a></p>
    <p>${esc(S.footer.corrections)} <a href="mailto:lioz.akirav@gmail.com"><bdi>lioz.akirav@gmail.com</bdi></a></p>
    <p><a href="https://github.com/Lioo7/mi-im-mi/tree/main/site/data" rel="noopener">${esc(S.footer.openData)}</a></p>`;
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

  $('#method').innerHTML = `
    <h2>${esc(M.title)}</h2>
    <p>${esc(M.intro(ctx.parties.length))}</p>
    <p class="disclaimer"><strong>${esc(M.disclaimer)}</strong> ${esc(M.independent)}</p>

    <h3>${esc(M.levelsTitle)}</h3>
    <ul class="level-rules">${M.levelRules.map(([lv, txt]) => `<li>${levelBadge(lv)} ${esc(txt)}</li>`).join('')}</ul>
    <p>${esc(M.colorRule)}</p>
    <p>${esc(M.matrixRule)}</p>
    <p>${esc(M.resultsRule)}</p>

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
    <ul>${M.jointRules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
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
    <ul>${M.orderRules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>

    ${examples ? `<h3>${esc(M.examplesTitle)}</h3><ul>${examples}</ul>` : ''}

    ${showSeats() ? `<h3>${esc(M.pollsTitle)}</h3><p>${esc(M.pollsText)} <strong>${esc(meta.pollNote)}</strong></p>` : ''}
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
    <div class="scroller" role="group" aria-label="${esc(S.presets.title)}">
      ${presetOrder().map((k) => `<button type="button" class="preset" data-act="preset" data-id="${k}" data-key="preset-${k}">${esc(S.presets[k])}</button>`).join('')}
    </div>
    <p class="muted small">${esc(S.presets.blocNote)}</p>`;
}

function seatsText(id) {
  const p = party(id);
  return showSeats() && p.pollAvg != null ? `<span class="chip-seats">${esc(S.builder.seatsChip(Math.round(p.pollAvg)))}</span>` : '';
}

function renderBuilder() {
  const B = S.builder;
  const { members, base, outside } = state;
  const trayIds = base ? [base, ...members.filter((id) => id !== base)] : members;
  const tray = trayIds.length
    ? trayIds.map((id) => {
        const isBase = id === base;
        const isOut = outside.includes(id);
        return `<li class="tray-chip${isBase ? ' is-base' : ''}">
          <span class="tray-name">${isBase ? '<span aria-hidden="true">★</span> ' : ''}${esc(name(id))}
            ${isBase ? `<span class="tag">${esc(B.base)}</span>` : ''}${isOut ? `<span class="tag">${esc(B.outside)}</span>` : ''}
          </span>
          <span class="tray-meta">${esc(B.coverage(C.coverage(ctx, id)))}</span>
          <button type="button" class="icon-btn" data-act="base" data-id="${id}" data-key="base-${id}" aria-pressed="${isBase}"
            aria-label="${esc(isBase ? B.unsetBase(name(id)) : B.setBase(name(id)))}"><span aria-hidden="true">${isBase ? '★' : '☆'}</span></button>
          <button type="button" class="icon-btn" data-act="remove" data-id="${id}" data-key="remove-${id}" aria-label="${esc(B.remove(name(id)))}"><span aria-hidden="true">✕</span></button>
        </li>`;
      }).join('')
    : `<li class="muted">${esc(B.empty)}</li>`;

  const available = ctx.parties.filter((p) => !members.includes(p.id));
  const addChips = available.map((p) => {
    const n = members.length ? C.newClashTopics(ctx, p.id, members) : null;
    return `<button type="button" class="chip" data-act="add" data-id="${p.id}" data-key="add-${p.id}" aria-label="${esc(B.addParty(p.name))}${n != null ? '. ' + esc(B.clashChipLabel(n)) : ''}">
      <span class="chip-name">${esc(p.name)}</span>
      ${seatsText(p.id)}
      ${p.threshold === 'borderline' ? `<span class="tag tag-border">${esc(B.borderline)}</span>` : ''}
      ${n != null ? `<span class="chip-clash${n ? ' has' : ''}" dir="ltr" aria-hidden="true">${esc(B.clashChip(n))}</span>` : ''}
    </button>`;
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
      <h2>${esc(B.yours)}</h2>
      ${members.length ? `<button type="button" class="link-btn" data-act="clear" data-key="clear">${esc(B.clear)}</button>` : ''}
    </div>
    <ul class="tray">${tray}</ul>
    ${linkedNotes.join('')}
    ${unityNote}
    ${available.length ? `<h3>${esc(B.add)}</h3><div class="chips">${addChips}</div>` : ''}`;
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
    ${p.quote ? `<blockquote>${esc(p.quote)}</blockquote>` : ''}
    <p class="source">
      <span class="tag tag-src">${esc(T.sourceTypes[p.sourceType] ?? '')}</span>
      ${p.sourceDate ? `<span class="muted">${esc(T.date(fmtDate(p.sourceDate)))}</span>` : ''}
      <a href="${esc(p.sourceUrl)}" rel="noopener" target="_blank">${esc(T.source)}</a>
      ${p.viaUrl ? `· <a href="${esc(p.viaUrl)}" rel="noopener" target="_blank">${esc(T.via)}</a>` : ''}
    </p>
  </div>`;
}

function pairHtml(a, b) {
  const s = C.pairSummary(ctx, a, b);
  const rows = s.rows.map((r) => `
    <details class="pair-row">
      <summary>
        <span class="pair-topic">${esc(topic(r.topicId).name)}</span> ${levelBadge(r.level)}
        <span class="pair-labels">
          <span><strong>${esc(name(a))}:</strong> ${esc(axisLabel(r.topicId, posOf(a, r.topicId)?.position))}</span>
          <span><strong>${esc(name(b))}:</strong> ${esc(axisLabel(r.topicId, posOf(b, r.topicId)?.position))}</span>
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

function overallBar(r) {
  const segs = r.statuses.map((s) => {
    const t = topic(s.topicId);
    const lv = s.status;
    return `<li class="seg lv-${lv}" title="${esc(t.name)}: ${esc(S.levels[lv].label)}">
      <span aria-hidden="true">${S.levels[lv].icon}</span><span class="seg-label">${esc(t.short)}</span>
      <span class="sr-only">${esc(t.name)}: ${esc(S.levels[lv].label)}</span></li>`;
  }).join('');
  return `<section class="card overall">
    <p class="big">${esc(S.results.overall(r.overall.clashFree, r.overall.of))}</p>
    <ol class="segs">${segs}</ol>
  </section>`;
}

function crisesCard(r) {
  const R = S.results;
  const items = r.crises.map((c) => {
    const w = c.worst;
    return `<li>
      <button type="button" class="row-btn" data-act="pair-sheet" data-a="${w.a}" data-b="${w.b}" data-key="crisis-${c.topicId}">
        <span class="row-title">${esc(topic(c.topicId).short)}: ${esc(name(w.a))} ↔ ${esc(name(w.b))}</span>
        ${levelBadge(w.level)}${w.byRedLine ? ` <span class="tag tag-red"><span aria-hidden="true">🚩</span> ${esc(S.redLine)}</span>` : ''}
        ${c.morePairs > 0 ? `<span class="muted small">${esc(R.morePairs(c.morePairs))}</span>` : ''}
      </button>
    </li>`;
  }).join('');
  return `<section class="card">
    <h3>${esc(R.crisesTitle(Math.max(r.crises.length, 1)))}</h3>
    ${r.crises.length ? `<ol class="list">${items}</ol>` : `<p>${esc(R.noCrises)}</p>`}
  </section>`;
}

function glueCard(r) {
  const R = S.results;
  const items = r.glue.map((g) => `<li>${levelBadge(g.status)} ${esc(topic(g.topicId).name)}
    <span class="muted small block">${esc(R.glueCoverage(g.withPosition, g.total))}</span></li>`).join('');
  return `<section class="card">
    <h3>${esc(R.glueTitle)}</h3>
    ${r.glue.length ? `<ul class="list">${items}</ul>` : `<p>${esc(R.noGlue)}</p>`}
  </section>`;
}

function frictionCard(r) {
  if (!r.friction.length) return '';
  const R = S.results;
  const items = r.friction.map((f) => {
    const w = C.without(ctx, state, f.partyId);
    const preview = R.withoutPreview(w.clashTopics, r.clashTopics, showSeats() ? w.seats.total : null);
    return `<li>
      <p class="row-title">${esc(name(f.partyId))}</p>
      <p class="muted small">${esc(preview)}</p>
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
  if (members.length === 0) {
    el.innerHTML = `<p class="empty">${esc(S.results.pickOne)}</p>`;
    return;
  }
  if (members.length === 1) {
    el.innerHTML = `<p class="empty">${esc(S.results.addPartner)}</p>
      <h2>${esc(name(members[0]))}</h2>${profileHtml(members[0])}`;
    return;
  }
  const r = C.analyze(ctx, state);
  if (members.length === 2) {
    el.innerHTML = overallBar(r) + `<section class="card">${pairHtml(members[0], members[1])}</section>` + coverageFootnote() + shareCard(r);
    return;
  }
  el.innerHTML = crisesCard(r) + glueCard(r) + frictionCard(r) + overallBar(r) + coverageFootnote() + shareCard(r);
}

// ---------- matrix ----------
function renderMatrix() {
  const { members, base } = state;
  const el = $('#matrix');
  if (members.length < 2) { el.innerHTML = ''; return; }
  const M = S.matrix;
  const rows = (base ? [base, ...members.filter((id) => id !== base)] : members).map((pid) => {
    const cells = ctx.topics.map((t) => {
      const cell = C.matrixCell(ctx, pid, t.id, members, base);
      const p = posOf(pid, t.id);
      const lv = cell.level;
      const icon = lv === 'REF' ? '●' : lv === 'BASE_NULL' ? '–' : S.levels[lv].icon;
      const label = lv === 'REF' ? M.reference : lv === 'BASE_NULL' ? M.baseNull : S.levels[lv].label;
      const aria = M.cellLabel(name(pid), t.name, label, cell.ref ? name(cell.ref) : null)
        + (p?.redLine ? `, ${S.redLine}` : '') + (p?.componentsDisagree ? `, ${S.componentsDisagree}` : '');
      return `<td><button type="button" class="cell lv-${lv}" data-act="cell" data-party="${pid}" data-topic="${t.id}" data-key="cell-${pid}-${t.id}" aria-label="${esc(aria)}">
        <span aria-hidden="true">${icon}</span>${p?.redLine ? '<span class="flag" aria-hidden="true">🚩</span>' : ''}${p?.componentsDisagree ? `<span class="split" aria-hidden="true">${S.componentsIcon}</span>` : ''}</button></td>`;
    }).join('');
    return `<tr><th scope="row"><button type="button" class="party-btn" data-act="party" data-id="${pid}" data-key="party-${pid}">${pid === base ? '<span aria-hidden="true">★</span> ' : ''}${esc(name(pid))}</button></th>${cells}</tr>`;
  }).join('');
  const legend = ['AGREE', 'MINOR', 'MAJOR', 'CLASH', 'NONE'].map((lv) => `<li>${levelBadge(lv)}</li>`).join('');
  el.innerHTML = `
    <h2>${esc(M.title)}</h2>
    ${base ? '' : `<p class="note note-soft">${esc(M.baseHint)}</p>`}
    <p class="muted small">${esc(base ? M.relBase(name(base)) : M.relWorst)}</p>
    <div class="table-wrap">
      <table class="matrix">
        <thead><tr><td></td>${ctx.topics.map((t) => `<th scope="col"><button type="button" class="topic-btn" data-act="topic" data-id="${t.id}" data-key="topic-${t.id}" aria-label="${esc(t.name)}">${esc(t.short)}</button></th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <ul class="legend">${legend}<li><span class="tag tag-red"><span aria-hidden="true">🚩</span> ${esc(S.redLine)}</span></li><li><span class="tag tag-split"><span aria-hidden="true">${S.componentsIcon}</span> ${esc(S.componentsDisagree)}</span></li></ul>`;
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
  const { members, outside } = state;
  if (!members.length) { bar.hidden = true; return; }
  bar.hidden = false;
  let seatsHtml = '';
  if (showSeats()) {
    const s = C.seats(ctx, members, outside);
    const main = outside.length ? S.seats.withOutside(s.inside, s.outside) : S.seats.counter(s.total);
    const pct = Math.min(100, (s.total / 61) * 100);
    seatsHtml = `<div class="seats">
      <p><strong>${esc(main)}</strong>${outside.length ? ` <span class="muted">${esc(S.seats.total(s.total))}</span>` : ''} · ${esc(s.missing ? S.seats.missing(s.missing) : S.seats.reached)}</p>
      <div class="meter" role="img" aria-label="${esc(S.seats.counter(s.total))}"><span style="inline-size:${pct}%"></span></div>
      <p class="poll-note">${esc(meta.pollNote)}${s.borderline ? ` · ${esc(S.seats.borderlineNote(s.borderline))}` : ''}</p>
    </div>`;
  }
  bar.innerHTML = `${seatsHtml}<button type="button" class="btn" data-act="share" data-key="share">${esc(S.share.button)}</button>`;
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
    ${whyHtml(cell, pid, tid)}`);
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
  if (p.seatNote && showSeats()) notes.push(p.seatNote);
  return notes.map((n) => `<p class="note note-soft">${esc(n)}</p>`).join('');
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

// ---------- render & events ----------
function render() {
  const focusKey = document.activeElement?.dataset?.key;
  renderBuilder();
  renderResults();
  renderMatrix();
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
    case 'base':
      setState({ base: base === id ? null : id, members, outside });
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
  }
}

function bind() {
  document.addEventListener('click', onClick);
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
  ctx = C.makeContext({ parties, topics, positions });
  const parsed = C.parseState(location.search, parties.map((p) => p.id));
  state = { ...parsed, members: ordered(parsed.members) };
  renderHeader();
  renderPresets();
  renderMethod();
  renderFooter();
  render();
  bind();
}

main().catch((err) => {
  console.error(err);
  $('#results').innerHTML = `<p class="empty">${esc(S.loadError)}</p>`;
});
