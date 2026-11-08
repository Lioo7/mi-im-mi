// Smoke test: opens each view in headless Chrome at phone (390px) and desktop (1280px) width (screenshots with --shots),
// and fails on console errors, page overflow, routing mistakes, or a GoatCounter beacon that carries coalition data.
// Beacons: against production every beacon is checked (and never sent); on any other host none may be sent at all.
// Zero installs: drives Chrome over the DevTools protocol with Node's built-in WebSocket.
// Headers: local runs send netlify.toml's headers, so the CSP is enforced; remote runs check the served header matches.
// Usage: node scripts/smoke.mjs [baseUrl] [options]   (default: serves ./site on a local port; options below, #37)
// --light (a deploy, #37): every file in site/ served byte for byte, every netlify.toml header, and the views at phone
// width in both languages, so a production run still checks every beacon. The full suite runs locally before the draft.
// Bounded (#27): every CDP call times out (SMOKE_STEP_MS, default 15s) with the step's name, an overall watchdog
// (SMOKE_WATCHDOG_MS, default 20 min) ends a stuck run, and Chrome (its own process group) is killed on any exit.
// Leftover smoke Chromes (--user-data-dir=…/smoke-chrome-<owner pid>-*) are killed before a run when their owning run has
// ended, so runs can overlap (--mode=all runs the three modes at once, each with its own server, Chrome and folder).
// Progress is written synchronously, and to smoke/progress.log. SMOKE_SIMULATE_HANG=1 forces a CDP call that never answers.
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, statSync, writeSync, appendFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { ROOT, loadData, PRESIDENT_HE, PRESIDENT_EN } from './lib.mjs';
import { recommendationRows, sourceReply, groupRedLines, contextFor, presets, serializeState, parseState, ballotOrder, completions, parseLocation, stateKeysIn, selected, locationFor, closestTo, redLinesCrossed, pivotal, investiture, coalitionGroups, analyze, peripheryClashes, pairSummary, matrixCell, addImpact } from '../site/js/compat.js';
import { PROD_HOST } from '../site/js/stats.js';
import { S } from '../site/js/strings.js';
import { S as EN } from '../site/js/strings.en.js';

// A scenario's source line in one language: "מקורות: <outlet>, <d.m> · <person> ב<outlet>, <d.m> · הכחשת <party>: …" (#34).
function wantSourceLine(T, sc, lc) {
  const line = (x) => {
    const reply = sourceReply(x);
    return `${reply ? T.presets.replyBy[reply.kind](lc.byId.get(reply.party).name) : ''}${x.by ? T.presets.personIn(x.by, x.outlet) : ''}${x.outlet}, ${T.presets.shortDate(x.date)}`;
  };
  return `${T.presets.sourcesLabel(sc.sources.length)} ${sc.sources.map((x) => (T === S ? x : { ...x, ...x.en })).map(line).join(' · ')}`;
}

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// smoke/<mode>/ for a local run, smoke/remote/ for a remote one (set once the options are read).
const SMOKE = join(ROOT, 'smoke');
let OUT = SMOKE;
const SIZES = [{ tag: 'm', width: 390, height: 844, mobile: true, dpr: 2 }, { tag: 'd', width: 1280, height: 900, mobile: false, dpr: 1 }];
const members_in_url = (qs) => /[?&]m=/.test(qs);
// A URL suffix split like a location; legacy links carry the state in the query, current ones in the fragment.
const splitSuffix = (suffix) => { const i = suffix.indexOf('#'); return i < 0 ? { search: suffix, hash: '' } : { search: suffix.slice(0, i), hash: suffix.slice(i) }; };
const isLegacy = (suffix) => stateKeysIn(splitSuffix(suffix).search);
// The state params a suffix carries: the fragment's, or a legacy query's when the fragment has none.
const stateParams = (suffix) => { const { search, hash } = splitSuffix(suffix); const f = hash.split('?')[1] ?? ''; return new URLSearchParams(stateKeysIn(f) ? f : search); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STEP_MS = Number(process.env.SMOKE_STEP_MS ?? 15000);
const WATCHDOG_MS = Number(process.env.SMOKE_WATCHDOG_MS ?? 20 * 60 * 1000);
// The case being run; timeouts and the watchdog name it.
let current = '';
// Everything (progress, results, every error) goes to smoke/<mode>/smoke.log; stdout gets the summary lines only.
let LOG = join(OUT, 'smoke.log');
const toLog = (text) => { try { appendFileSync(LOG, text + '\n'); } catch { /* the run's folder is not created yet */ } };
const write = (fd, line) => { writeSync(fd, line + '\n'); toLog(line); };
const log = (line) => write(1, line);
const logErr = (line) => write(2, line);
const step = (name) => { current = name; toLog(`… ${name}`); };

// Rejects when the promise takes longer than ms (the promise itself is left to settle or not).
function within(promise, ms, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms)}ms [${current}]`)), Math.max(ms, 0)); })])
    .finally(() => clearTimeout(timer));
}

// Each attempt races the time left, so one attempt that never returns cannot block past the deadline.
async function waitFor(fn, ms = 10000) {
  const end = Date.now() + ms;
  let last = null;
  while (Date.now() < end) {
    try { const v = await within(Promise.resolve().then(fn), end - Date.now(), 'waitFor attempt'); if (v) return v; } catch (e) { last = e; }
    await sleep(50);
  }
  throw new Error(`timeout after ${ms}ms [${current}]${last ? ` (last error: ${last.message})` : ''}`);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.csv': 'text/csv; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

// The headers Netlify sends for every path (netlify.toml: [[headers]] for = "/*").
function siteHeaders() {
  const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');
  const block = toml.split('[[headers]]').find((b) => /for\s*=\s*"\/\*"/.test(b)) ?? '';
  const values = block.split('[headers.values]')[1] ?? '';
  return Object.fromEntries([...values.matchAll(/^\s*([\w-]+)\s*=\s*"(.*)"\s*$/gm)].map((m) => [m[1], m[2]]));
}

// Minimal static server for ./site (query strings ignored, like Netlify), sending netlify.toml's headers. meta.json is
// served with the tested mode (--mode) applied.
async function serve() {
  const dir = join(ROOT, 'site');
  const headers = siteHeaders();
  const metaFile = join(dir, 'data', 'meta.json');
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([.][.][/\\])+/, '');
    let file = join(dir, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(dir) || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { ...headers, 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    const body = file === metaFile ? JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), ...MODES[MODE] }) : readFileSync(file);
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, stop: () => server.close() };
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  let closed = false;
  // A closed socket rejects every pending call, and every later one.
  ws.onclose = () => {
    closed = true;
    for (const { reject } of pending.values()) reject(new Error(`CDP socket closed [${current}]`));
    pending.clear();
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) listeners.forEach((l) => l(msg));
  };
  return {
    ready: new Promise((r) => { ws.onopen = r; }),
    // Every call has a timeout that names the method and the case (screenshots get longer).
    send: (method, params = {}, ms = method === 'Page.captureScreenshot' ? 4 * STEP_MS : STEP_MS) => new Promise((resolve, reject) => {
      if (closed) { reject(new Error(`CDP ${method}: socket closed [${current}]`)); return; }
      const i = ++id;
      const timer = setTimeout(() => { pending.delete(i); reject(new Error(`CDP ${method} got no answer in ${ms / 1000}s [${current}]`)); }, ms);
      pending.set(i, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      ws.send(JSON.stringify({ id: i, method, params }));
    }),
    on: (fn) => listeners.push(fn),
    close: () => ws.close(),
  };
}

// Options (#37). --mode: which data mode to test (all: the three in parallel); a local run serves site/ with meta.json's mode overridden, so no
// scratch copies are needed (a remote run tests the deployed mode). --only: a comma-separated list of SECTIONS.
// --shots: save screenshots (otherwise only a failing first-load legal check saves one).
const SECTIONS = ['views', 'legal', 'narrow', 'headers', 'files', 'interaction', 'closest', 'cells', 'fragment', 'en-views', 'en-interaction',
  'pair', 'tasks', 'undo', 'layout', 'party-sheet', 'fit', 'nobreak', 'recs'];
const LIGHT_SECTIONS = ['files', 'headers', 'views', 'en-views'];
const MODES = { results: { mode: 'results' }, polls: { mode: 'polls', showSeats: true }, hidden: { mode: 'polls', showSeats: false } };
const args = process.argv.slice(2);
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const base = args.find((a) => !a.startsWith('--'));
const usage = (msg) => { logErr(`✗ ${msg}\n  usage: node scripts/smoke.mjs [baseUrl] [--mode=${Object.keys(MODES).join('|')}|all] [--only=<section,…> | --light] [--shots]\n  sections: ${SECTIONS.join(', ')}`); process.exit(2); };
for (const a of args.filter((x) => x.startsWith('--'))) if (!/^--(mode|only)=.|^--(shots|light)$/.test(a)) usage(`unknown option ${a}`);
const dataMeta = loadData().meta;
const dataMode = dataMeta.mode === 'results' ? 'results' : dataMeta.showSeats === false ? 'hidden' : 'polls';
const MODE = opt('mode') ?? dataMode;
if (!MODES[MODE] && MODE !== 'all') usage(`unknown mode "${MODE}"`);
if (base && MODE !== dataMode) usage(`a remote run tests the deployed mode (${dataMode}), not --mode=${MODE}`);
const SHOTS = args.includes('--shots');
const LIGHT = args.includes('--light');
if (LIGHT && opt('only')) usage('--light runs its own sections; leave out --only');
const ONLY = new Set(LIGHT ? LIGHT_SECTIONS : opt('only')?.split(',') ?? SECTIONS);
// The view sections run at phone width only in a light run.
const VIEW_SIZES = LIGHT ? [SIZES[0]] : SIZES;
for (const s of ONLY) if (!SECTIONS.includes(s)) usage(`unknown section "${s}"`);
OUT = join(SMOKE, base ? 'remote' : MODE);
LOG = join(OUT, 'smoke.log');
const rel = (p) => p.slice(ROOT.length + 1);

// --mode=all: one child run per mode, at the same time. Each prints its own errors and rerun command; this prints a line
// per mode and passes those on.
if (MODE === 'all') {
  rmSync(SMOKE, { recursive: true, force: true });
  const rest = args.filter((a) => !a.startsWith('--mode='));
  const kids = [];
  const runs = Object.keys(MODES).map((m) => new Promise((resolve) => {
    const t = Date.now();
    const p = spawn(process.execPath, [process.argv[1], `--mode=${m}`, ...rest], { stdio: ['ignore', 'pipe', 'pipe'] });
    kids.push(p);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => resolve({ m, ok: code === 0, out, err, s: Math.round((Date.now() - t) / 1000) }));
  }));
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { for (const p of kids) p.kill('SIGTERM'); });
  const done = await Promise.all(runs);
  for (const r of done) {
    const timing = r.out.split('\n').map((l) => l.trim()).find((l) => l.startsWith(`${r.m}: `)) ?? `${r.m}: ${r.s}s`;
    writeSync(r.ok ? 1 : 2, `${r.ok ? '✓' : '✗'} ${timing}\n${r.ok ? '' : r.err}`);
  }
  process.exit(done.every((r) => r.ok) ? 0 : 1);
}

const { parties, topics, meta, results } = loadData();
Object.assign(meta, MODES[MODE]);
const ctx = contextFor({ meta, parties, topics, positions: [], results });
// Results mode: official CEC seats, introduced by the results status line. Polls mode: poll averages, introduced by the
// legally required sentence, and hidden entirely with showSeats=false.
const RESULTS = meta.mode === 'results';
const SEATS_HIDDEN = !RESULTS && meta.showSeats === false;
const passedIds = ctx.parties.filter((p) => ctx.passed(p.id)).map((p) => p.id);
const pr = presets(ctx);
const coalitionQs = serializeState(ctx, { base: null, ...pr.coalition });
// The snapshot's red-line line (#14) as each language should render it, from contexts that carry the positions.
const posCtx = Object.fromEntries(['he', 'en'].map((l) => [l, contextFor({ meta, parties, topics, positions: loadData().positions, results }, l)]));
function redLinesText(lng, members) {
  const c = posCtx[lng];
  const T = lng === 'he' ? S : EN;
  const r = redLinesCrossed(c, members);
  const list = groupRedLines(c, r).map((g) => `${c.topics.find((t) => t.id === g.topicId).short}: ${g.partyIds.map((id) => c.byId.get(id).name).join(', ')}`).join(' · ');
  return r.length ? `🚩 ${T.results.redLinesCrossed(r.length, list)}` : T.results.noRedLinesCrossed;
}
// The results card, scoped: the header (one line when all are members; else the members, then the parties outside the
// coalition, each in the neutral marker with its role in text), the snapshot (members-only title, the counts label only
// with outside parties, the red-line line right after the counts, then the separate outside block), and the same marker
// in the supporters/abstainers card and the pivotal rows. Members never get the marker.
// The method page's data download (#18): both links resolve from the page (same origin, under the CSP) to the files in
// site/download/, byte for byte in size, with the position note and the CC BY 4.0 notice in the page's language.
const DOWNLOAD_JS = `(async () => { const s = document.querySelector('#download'); if (!s) return null;
  const links = [...s.querySelectorAll('a[data-download]')];
  const files = await Promise.all(links.map(async (a) => { const r = await fetch(a.href); return { f: a.dataset.download, href: a.getAttribute('href'), download: a.hasAttribute('download'),
    status: r.status, type: r.headers.get('content-type'), size: (await r.arrayBuffer()).byteLength }; }));
  return { files, license: s.querySelector('a[rel~="license"]')?.href ?? null, text: s.innerText.replace(/\\s+/g, ' ').trim() }; })()`;
function downloadErrors(lng, got) {
  const D = (lng === 'he' ? S : EN).method.download;
  if (!got) return ['the download section is missing'];
  const errs = [];
  const want = { csv: 'text/csv', json: 'application/json' };
  if (got.files.map((x) => x.f).join() !== 'csv,json') errs.push(`expected the CSV and JSON links, got ${got.files.map((x) => x.f).join() || 'none'}`);
  for (const x of got.files) {
    const local = join(ROOT, 'site', x.href);
    if (x.href !== `download/mi-im-mi-positions.${x.f}` || !x.download) errs.push(`${x.f}: link should be download/mi-im-mi-positions.${x.f} with the download attribute (${x.href})`);
    if (x.status !== 200 || !x.type?.startsWith(want[x.f])) errs.push(`${x.f}: HTTP ${x.status}, ${x.type}`);
    else if (!existsSync(local) || x.size !== statSync(local).size) errs.push(`${x.f}: ${x.size} bytes served, not the size of site/${x.href}`);
  }
  const norm = (v) => v.replace(/\u200E/g, '').replace(/\s+/g, ' ').trim();
  for (const t of [D.title, D.line(loadData().positions.length), D.positionNote, D.license]) if (!norm(got.text).includes(norm(t))) errs.push(`missing text: "${t}"`);
  if (got.license !== D.licenseUrl) errs.push(`the ${D.licenseName} link should go to ${D.licenseUrl} (${got.license})`);
  return errs;
}
const CARD_JS = `(() => { const h = document.querySelector('#results-coalition'); const t = (e) => e ? e.innerText.replace(/\\s+/g, ' ').trim() : null;
  const lines = [...h.querySelectorAll(':scope > .coalition-line')]; const o = document.querySelector('#results .overall');
  const bd = o?.querySelector('.breakdown'); const ob = o?.querySelector('.outside-block');
  const after = []; for (let e = bd?.nextElementSibling; e && after.length < 2; e = e.nextElementSibling) after.push(e.className);
  return { lines: lines.map((l) => l.classList.contains('coalition-outside') ? t(l.querySelector(':scope > .muted')) : t(l)),
    memberChips: lines[0]?.querySelectorAll('.outside').length ?? 0, chips: [...h.querySelectorAll('.outside')].map(t),
    chipsListed: h.querySelectorAll('.outside-list[role="list"] > li > .outside').length,
    perChips: [...document.querySelectorAll('#results .periphery .per-party .row-title .outside')].map(t),
    pivotalChips: [...document.querySelectorAll('#results .pivotal li .outside')].map(t),
    title: o && bd ? t(o.querySelector('h2')) : null, scope: document.querySelectorAll('.overall-scope').length,
    label: t(o?.querySelector('.breakdown-label')), labelBefore: !o?.querySelector('.breakdown-label') || o.querySelector('.breakdown-label').nextElementSibling === bd,
    after, block: ob ? { heading: t(ob.querySelector('h3')), link: t(ob.querySelector('[data-act="to-periphery"]')) } : null }; })()`;
const sortP = (c, ids) => [...ids].sort((a, b) => c.order.get(a) - c.order.get(b));
function cardErrors(lng, state, got) {
  const c = posCtx[lng];
  const T = lng === 'he' ? S : EN;
  const R = T.results;
  const nm = (id) => c.byId.get(id).name;
  const st = { ...state, members: sortP(c, state.members), supporters: sortP(c, state.supporters), abstainers: sortP(c, state.abstainers) };
  const { outside } = coalitionGroups(st);
  const side = outside.length > 0;
  const members = st.members.map((id) => `${id === st.base ? '★ ' : ''}${nm(id)}`).join(' · ');
  const chips = outside.map((o) => R.outsideParty(nm(o.partyId), R.roleName[o.role]));
  const want = {
    lines: side ? [`${R.membersLabel(st.members.length)}: ${members}`, `${R.outsideLabel}:`] : [`${R.coalitionLabel}: ${members}`],
    memberChips: 0, chips, chipsListed: chips.length,
    perChips: st.members.length ? chips : [],
    pivotalChips: SEATS_HIDDEN ? [] : pivotal(c, st).filter((p) => p.role !== 'member').map((p) => nm(p.partyId)),
    scope: 0,
  };
  if (st.members.length >= 2) {
    Object.assign(want, {
      title: R.summaryTitleScoped(st.members.length), label: side ? R.breakdownLabel : null, labelBefore: true,
      after: side ? ['small redlines-line', 'outside-block'] : ['small redlines-line'],
      block: side ? { heading: R.outsideHeading, link: R.peripheryLink(peripheryClashes(c, st)) } : null,
    });
  }
  const out = [];
  for (const [k, v] of Object.entries(want)) {
    let g = got[k];
    // The red-line line is muted when none is crossed; only its own class matters here.
    if (k === 'after') g = g.map((x) => (x.includes('redlines-line') ? 'small redlines-line' : x)).slice(0, v.length);
    if (JSON.stringify(g) !== JSON.stringify(v)) out.push(`results card ${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(g)}`);
  }
  return out;
}
// The share text, exactly: the members, then (only with outside parties) those parties with roles and their clashes.
function shareTextFor(lng, state) {
  const c = posCtx[lng];
  const T = lng === 'he' ? S : EN;
  const nm = (id) => c.byId.get(id).name;
  const st = { ...state, members: sortP(c, state.members), supporters: sortP(c, state.supporters), abstainers: sortP(c, state.abstainers) };
  return T.share.text(st.members.map((id) => `${id === st.base ? '★ ' : ''}${nm(id)}`).join(' + '), analyze(c, st).clashTopics, peripheryClashes(c, st),
    coalitionGroups(st).outside.map((o) => [nm(o.partyId), T.results.roleName[o.role]]));
}
const REDLINES_JS = "[...document.querySelectorAll('#results .overall .redlines-line')].map((e) => e.innerText.replace(/\\s+/g, ' ').trim()).join('|')";
const oppositionQs = serializeState(ctx, { base: null, ...pr.opposition });

// name, url suffix, expected view after load. The coalition lives in the fragment: `#<view>?m=…`.
const at = (route, qs) => `#${route}${qs}`;
const cases = [
  ['build-empty', '', 'build'],
  ['build-coalition', at('build', coalitionQs), 'build'],
  ['build-linked', '#build?m=zehut', 'build'],
  ['results-coalition', at('results', coalitionQs), 'results'],
  ['results-opposition', at('results', oppositionQs), 'results'],
  ['results-unity', at('results', serializeState(ctx, { base: null, ...pr.unity })), 'results'],
  ['results-opposition-arab', at('results', serializeState(ctx, { base: null, ...pr['opposition-arab'] })), 'results'],
  ['results-pair', '#results?m=together,democrats', 'results'],
  ['results-single', '#results?m=likud', 'results'],
  ['results-base-likud', at('results', serializeState(ctx, { base: 'likud', members: pr.coalition.members, outside: [] })), 'results'],
  ['results-low-coverage', '#results?m=shas,utj,zehut,likud', 'results'],
  // Roles: an old link with o= (outside support, now "תומכת", still in the query), and supporters plus abstainers.
  ['results-old-outside', '?m=yashar,together,democrats,yisrael-beiteinu&o=raam', 'results'],
  ['results-roles', '#results?m=yashar,together,democrats,yisrael-beiteinu&o=joint-list&a=raam,utj', 'results'],
  ['build-roles', '#build?m=yashar,together,democrats,yisrael-beiteinu&o=joint-list&a=raam,utj', 'build'],
  // Pivotal parties (#13): the media scenarios with an abstainer that matters (רע״ם) and with 3 of 5 members pivotal.
  ['results-scenario-arab', '#results?m=yashar,together,democrats,yisrael-beiteinu&o=joint-list&a=raam', 'results'],
  ['results-pivotal-partial', '#results?m=likud,yashar,together,religious-zionism,zehut', 'results'],
  ['method', '#method', 'method'],
  ['privacy', '#privacy', 'method'],
  ['accessibility', '#accessibility', 'method'],
  ['privacy-with-state', '#privacy?m=likud,yashar', 'method'],
  // Links from before the move: the query is read, then moved to the fragment; other params (?s=wa) stay.
  ['legacy-results', coalitionQs, 'results'], // a shared link without a hash opens #results
  ['legacy-build', `${coalitionQs}#build`, 'build'],
  ['legacy-s-wa', `?s=wa&${coalitionQs.slice(1)}`, 'results'],
  ['legacy-below-threshold', '?m=likud,yashar,kalkalit#results', 'results'],
];

// Poll-derived text that must not appear anywhere when showSeats is off.
const POLL_TEXT = /מנדטים|מנ׳|סקר|על הסף|מתוך 61|\(61\+\)|≈\d/;
const leakIds = new RegExp(`[?&;]([bmoqa])=|${parties.map((p) => p.id).join('|')}`, 'i');
const legal = `ממוצע סקרים שפורסמו עד ${meta.pollsAsOf.split('-').reverse().join('.')}. הסקרים אינם עדכניים, ואין ללמוד מהם על דפוסי הצבעה או עמדות הציבור כיום.`;
// The line that must precede any seat number, and its element.
const SRC_TEXT = RESULTS ? meta.resultsStatus : legal;
const SRC_SEL = RESULTS ? '.seat-src' : '.poll-legal';
// The pivotal rows (#13) as each language should render them: only when the vote passes, after the source line.
function pivotalText(lng, state) {
  const c = posCtx[lng];
  const T = lng === 'he' ? S : EN;
  const n = (x) => T.seats.num(x, RESULTS);
  const rows = pivotal(c, state).map((p) => T.seats.pivotalRow(c.byId.get(p.partyId).name, p.role, p.breaksMajority ? n(p.vote.membersSeats) : null, n(p.vote.for), n(p.vote.against)));
  return [T.seats.pivotalIntro(investiture(c, state).membersMajority), ...(rows.length ? rows : [T.seats.pivotalNone])];
}
const PIVOTAL_JS = `(() => { const o = document.querySelector('#results .overall'); const p = o?.querySelector('.pivotal'); if (!p) return null;
  const src = o.querySelector('${SRC_SEL}'); if (!src || !(src.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING)) return ['source line must come before the pivotal rows'];
  return [...p.querySelectorAll('p, li')].map((e) => e.innerText.replace(/\\s+/g, ' ').trim()); })()`;
const server = base ? null : await serve();
const baseUrl = (base ?? server.url).replace(/\/?$/, '/');
const onProd = new URL(baseUrl).hostname === PROD_HOST;
// Leftover smoke Chromes only (matched by their profile, smoke-chrome-<owner pid>-…), never the user's browser, and only
// when the run that started them has ended (a profile from before the owner pid counts as stale). Only processes running
// from Chrome's own bundle: any other command line may mention such a profile (a shell running a test of this).
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const stale = (name) => { const owner = Number(/^smoke-chrome-(\d+)-/.exec(name)?.[1] ?? 0); return !owner || !alive(owner); };
const CHROME_HOME = CHROME.includes('.app/') ? CHROME.slice(0, CHROME.indexOf('.app/') + 5) : CHROME;
try {
  for (const line of execFileSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8' }).split('\n')) {
    const [, pid, command] = /^\s*(\d+)\s+(.*)$/.exec(line) ?? [];
    const profileName = command?.startsWith(CHROME_HOME) && /--user-data-dir=\S*\/(smoke-chrome-[^\s/]+)/.exec(command)?.[1];
    if (profileName && stale(profileName)) try { process.kill(Number(pid), 'SIGKILL'); } catch { /* already gone */ }
  }
} catch { /* no ps */ }
for (const d of readdirSync(tmpdir()).filter((n) => n.startsWith('smoke-chrome-') && stale(n))) removeDir(join(tmpdir(), d));
const profile = mkdtempSync(join(tmpdir(), `smoke-chrome-${process.pid}-`));
// Its own process group (detached), so killing the group takes its helper processes too. Port 0: Chrome picks a free
// port and writes it to DevToolsActivePort in the profile.
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--lang=he', 'about:blank',
], { stdio: 'ignore', detached: true });
// Chrome may still be exiting after SIGKILL: retry briefly (synchronously, so 'exit' handlers can use it).
function removeDir(dir) {
  for (let i = 0; i < 20 && existsSync(dir); i++) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); }
  }
}
let cleaned = false;
// Synchronous, so it also runs from the 'exit' handler.
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch { /* already gone */ }
  try { chrome.kill('SIGKILL'); } catch { /* already gone */ }
  try { server?.stop(); } catch { /* ignore */ }
  removeDir(profile);
}
process.on('exit', cleanup);
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  process.on(sig, () => { logErr(`✗ smoke interrupted (${sig}) during: ${current || '(start)'}`); cleanup(); process.exit(code); });
}
const watchdog = setTimeout(() => {
  logErr(`✗ smoke watchdog: the run did not finish in ${WATCHDOG_MS >= 60000 ? `${WATCHDOG_MS / 60000} min` : `${WATCHDOG_MS / 1000}s`}; last step: ${current || '(start)'}`);
  cleanup();
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref();

const errors = [];
// The sections with errors, for the rerun command ('*': an error outside any section).
const failedSections = new Set();
const pushError = errors.push.bind(errors);
errors.push = (...e) => { failedSections.add(section || '*'); return pushError(...e); };
const beacons = [];
const siteHost = new URL(baseUrl).host;
const partyIds = new RegExp(parties.map((p) => p.id).join('|'), 'i');
// Set by go() while an old-format link (state in the query) loads.
let legacyNav = false;
let exitCode = 0;
// The section being run (--only), and how long each one took.
let section = '';
let sectionStart = 0;
const sectionTimes = [];
const endSection = () => { if (section) sectionTimes.push(`${section} ${Math.round((Date.now() - sectionStart) / 1000)}s`); section = ''; };
const sec = (name) => { endSection(); if (!ONLY.has(name)) return false; section = name; sectionStart = Date.now(); return true; };
const t0 = Date.now();
try {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  // Files from before the per-mode folders (smoke/*.png, progress.log).
  for (const f of readdirSync(SMOKE)) try { if (!statSync(join(SMOKE, f)).isDirectory()) rmSync(join(SMOKE, f), { force: true }); } catch { /* another run removed it */ }
  step('start');
  const port = await waitFor(() => Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]));
  const targets = await waitFor(() => fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()));
  const page = targets.find((t) => t.type === 'page');
  const c = cdp(page.webSocketDebuggerUrl);
  await c.ready;
  c.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(`[${current}] exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(`[${current}] console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`[${current}] ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
    if (m.method === 'Network.loadingFailed' && !m.params.canceled) errors.push(`[${current}] request failed: ${m.params.errorText}`);
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) errors.push(`[${current}] HTTP ${m.params.response.status} ${m.params.response.url}`);
    // The coalition never reaches the site's server: no request URL or Referer to it may carry state. Only an old-format
    // link's own load (the document and what the parser starts before the app runs) may, and never a data fetch.
    if (m.method === 'Network.requestWillBeSent' && new URL(m.params.request.url).host === siteHost) {
      const { url, headers } = m.params.request;
      const carries = (u) => { try { const q = new URL(u).search; return stateKeysIn(q) || partyIds.test(q); } catch { return false; } };
      const leaked = [url, headers.Referer ?? headers.referer].filter((u) => u && carries(u));
      const parserLoad = ['Document', 'Stylesheet', 'Script', 'Image'].includes(m.params.type);
      if (leaked.length && !(legacyNav && parserLoad)) errors.push(`[${current}] a ${m.params.type} request to the site carries coalition state: ${leaked.join(' | ')}`);
    }
    if (m.method === 'Fetch.requestPaused') {
      // GoatCounter beacons are recorded for the privacy check but never sent (no test traffic in the stats).
      const url = m.params.request.url;
      beacons.push(url);
      const decoded = decodeURIComponent(url);
      const q = new URL(url).searchParams;
      if (leakIds.test(decoded.replace(/^https?:\/\/[^/]+\/count\?/, ''))) {
        errors.push(`[${current}] GoatCounter beacon leaks coalition data: ${decoded}`);
      }
      if ([...q.keys()].some((k) => !['p', 't', 's', 'r', 'rnd'].includes(k)) || !/^\/(index\.html)?$/.test(q.get('p') ?? '')) {
        errors.push(`[${current}] GoatCounter beacon carries unexpected fields or path: ${decoded}`);
      }
      c.send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, body: '' }).catch(() => {});
    }
  });
  for (const d of ['Page', 'Runtime', 'Log', 'Network']) await c.send(`${d}.enable`);
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*goatcounter.com/count*' }] });
  // CSP violations become console errors and fail the run.
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('securitypolicyviolation', (e) =>
    console.error('CSP violation: ' + e.effectiveDirective + ' blocked ' + (e.blockedURI || 'inline') + ' ' + (e.sample || '')));` });
  // For settle(): the page counts its pending short timers (up to 500 ms, e.g. the live region's 50 ms; not the toast's
  // seconds) and its fetches.
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const w = window; const st = w.setTimeout, ct = w.clearTimeout, f = w.fetch;
    const pending = new Set(); const n = w.__smoke = { timers: 0, fetches: 0, setTimeout: st.bind(w) };
    w.setTimeout = function (fn, ms, ...a) { if (typeof fn !== 'function' || !((ms ?? 0) <= 500)) return st.call(w, fn, ms, ...a);
      const id = st.call(w, () => { if (pending.delete(id)) n.timers--; fn(...a); }, ms); pending.add(id); n.timers++; return id; };
    w.clearTimeout = function (id) { if (pending.delete(id)) n.timers--; return ct.call(w, id); };
    w.fetch = function (...a) { n.fetches++; return f.apply(this, a).finally(() => { n.fetches--; }); }; })();` });

  if (process.env.SMOKE_SIMULATE_HANG) {
    step('simulated-hang');
    await c.send('Runtime.evaluate', { expression: 'new Promise(() => {})', awaitPromise: true });
  }
  const evaluate = async (expr) => (await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  // Waits until the page is still: two frames in a row with no running animation or transition, no pending short timer
  // or fetch, and no scroll or viewport change. At most ms, the fixed sleep it replaces (#37).
  const SETTLE_JS = (ms) => `new Promise((done) => { const w = window.__smoke; const end = performance.now() + ${ms}; let calm = 0, last = null;
    const snap = () => { const s = document.querySelector('#sheet'); return [scrollX, scrollY, s ? s.scrollTop : 0, innerWidth, innerHeight, visualViewport?.offsetTop ?? 0].join(); };
    const idle = () => !w || (w.timers === 0 && w.fetches === 0 && !document.getAnimations().some((a) => a.playState === 'running'));
    (w ? w.setTimeout : setTimeout)(() => done(false), ${ms} + 50);
    const tick = () => { const s = snap(); calm = idle() && s === last ? calm + 1 : 0; last = s;
      if (calm >= 2) done(true); else if (performance.now() < end) requestAnimationFrame(tick); else done(false); };
    requestAnimationFrame(tick); })`;
  const settles = { n: 0, capped: 0 };
  const settle = async (ms) => {
    settles.n++;
    try { if (!(await c.send('Runtime.evaluate', { expression: SETTLE_JS(ms), returnByValue: true, awaitPromise: true })).result.value) settles.capped++; } catch { await sleep(ms); }
  };
  const ready = () => waitFor(() => evaluate("document.querySelector('#builder')?.children.length > 0"));
  // A fresh load (a URL that differs only in its fragment would otherwise be a same-document navigation).
  const go = async (url) => {
    await c.send('Page.navigate', { url: 'about:blank' });
    legacyNav = isLegacy(url.slice(baseUrl.length));
    await c.send('Page.navigate', { url });
  };
  // The fragment's state params, as a string.
  const frag = () => evaluate("location.hash.split('?')[1] ?? ''");
  const setSize = (z, height = z.height) => c.send('Emulation.setDeviceMetricsOverride', { width: z.width, height, deviceScaleFactor: z.dpr, mobile: z.mobile });

  const shoot = async (z, file, full = true, always = false) => {
    if (!SHOTS && !always) return;
    let height = z.height;
    if (full) {
      const { cssContentSize } = await c.send('Page.getLayoutMetrics');
      height = Math.min(Math.ceil(cssContentSize.height), 9000);
      await setSize(z, height);
      await settle(200);
    }
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, file), Buffer.from(data, 'base64'));
    // Readable segments of the same page: <name>.<n>.png (CSS px, 900 tall)
    if (full) {
      const SEG = 900;
      for (let i = 0; i * SEG < height; i++) {
        const clip = { x: 0, y: i * SEG, width: z.width, height: Math.min(SEG, height - i * SEG), scale: 1 };
        const seg = await c.send('Page.captureScreenshot', { format: 'png', clip });
        writeFileSync(join(OUT, file.replace('.png', `.${i + 1}.png`)), Buffer.from(seg.data, 'base64'));
      }
    }
    await setSize(z);
  };

  if (sec('views')) for (const z of VIEW_SIZES) {
    await setSize(z);
    for (const [name, suffix, expectView] of cases) {
      step(`${name}@${z.width}`);
      await go(baseUrl + suffix);
      await waitFor(() => evaluate("document.body.dataset.view !== undefined && document.querySelector('#footer')?.children.length > 0"));
      await settle(250);
      const view = await evaluate('document.body.dataset.view');
      if (view !== expectView) errors.push(`[${current}] expected view "${expectView}", got "${view}"`);
      // The URL settles as <other query params>#<route>?<normalized state>: an old link's state has moved to the
      // fragment, ids that can't be selected are gone, and a link without a view opens #results.
      const exp = parseLocation(splitSuffix(suffix), passedIds);
      const token = exp.route && ['build', 'results', 'method', 'why', 'privacy', 'accessibility'].includes(exp.route) ? exp.route : expectView;
      const wantUrl = exp.search + (selected(exp.state).length || exp.route ? `#${token}${serializeState(ctx, exp.state)}` : '');
      const gotUrl = await evaluate('location.search + location.hash');
      if (gotUrl !== wantUrl) errors.push(`[${current}] URL should settle on "${wantUrl}", got "${gotUrl}"`);
      if (expectView === 'build') {
        const title = await evaluate('document.title');
        if (title !== S.pageTitle) errors.push(`[${current}] <title> must be "${S.pageTitle}", got "${title}"`);
        const purpose = await evaluate("document.querySelector('#purpose')?.innerText || ''");
        if (!purpose.endsWith('זו לא המלצת הצבעה.')) errors.push(`[${current}] build view is missing the purpose line`);
        if (!/ממצעים, מהצהרות רשמיות ומהצעות חוק שהמפלגות יזמו או קידמו/.test(purpose) || purpose.includes('הצבעות')) errors.push(`[${current}] purpose line must name all three source kinds, with record = bills (no votes)`);
        const mix = await evaluate("document.querySelector('#source-mix')?.innerText || ''");
        if (!/\d+ עמדות מתועדות: \d+ לפי מצע, \d+ לפי הצהרות, \d+ לפי רקורד/.test(mix)) errors.push(`[${current}] source-mix line missing (${mix})`);
        if (RESULTS) {
          if (await evaluate("document.querySelector('#voter-info') !== null")) errors.push(`[${current}] election-day voter-info line still shown in results mode`);
        } else {
          const voter = await evaluate("(() => { const e = document.querySelector('#voter-info'); const a = e?.querySelector('a'); return e && a ? e.innerText + ' | ' + a.href : ''; })()");
          if (!/27\.10/.test(voter) || !/7:00–22:00/.test(voter) || !voter.endsWith('| https://www.gov.il/apps/moin/bocharim/')) errors.push(`[${current}] voter-info line missing or wrong (${voter})`);
        }
        const roleHint = await evaluate(`document.querySelector('#builder').innerText.includes(${JSON.stringify(S.builder.hint)})`);
        if (!roleHint) errors.push(`[${current}] role explanation missing in the picker`);
        // Each selected row has a 3-way role radiogroup with exactly one checked option, matching the URL.
        const roles = await evaluate(`(() => { const out = {}; for (const g of document.querySelectorAll('#builder .roles[role="radiogroup"]')) {
          if (!g.getAttribute('aria-label')) return 'unlabeled group'; const on = g.querySelectorAll('[role="radio"][aria-checked="true"]'); if (on.length !== 1) return 'checked ' + on.length;
          // Tap target >= 44px tall: the segment (or its ::after) must answer hits 4px above and below its box.
          for (const b of g.querySelectorAll('[role="radio"]')) { b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); const x = r.left + r.width / 2;
            if (r.height < 36 || ![r.top - 4, r.bottom + 4].every((y) => y < 0 || y >= innerHeight || b.contains(document.elementFromPoint(x, y)))) return 'segment tap target under 44px (' + b.dataset.key + ': h' + Math.round(r.height) + ', above ' + (document.elementFromPoint(x, r.top - 4)?.className || '-') + ', below ' + (document.elementFromPoint(x, r.bottom + 4)?.className || '-') + ')'; }
          out[on[0].dataset.id] = on[0].dataset.role; } window.scrollTo(0, 0); return JSON.stringify(out); })()`);
        const q = stateParams(suffix);
        const want = {};
        for (const [k, role] of [['b', 'member'], ['m', 'member'], ['o', 'supporter'], ['a', 'abstainer']]) for (const id of (q.get(k) ?? '').split(',').filter((x) => passedIds.includes(x))) want[id] ??= role;
        const got = roles.startsWith('{') ? JSON.parse(roles) : roles;
        if (typeof got === 'string' || Object.keys(want).some((id) => got[id] !== want[id]) || Object.keys(got).length !== Object.keys(want).length) errors.push(`[${current}] role controls ${roles} do not match the link ${JSON.stringify(want)}`);
      }
      const overflow = await evaluate('document.documentElement.scrollWidth > window.innerWidth + 1');
      if (overflow) errors.push(`[${current}] horizontal page overflow`);
      // Results mode: a grey "positions as of election eve" line right after the source line in every seats box.
      if (RESULTS && (expectView === 'build' || (expectView === 'results' && members_in_url(suffix) && name !== 'results-single'))) {
        const asOf = await evaluate(`(() => { const box = document.querySelector('${expectView === 'build' ? '#builder .seats-box' : '#results .overall'}'); const src = box?.querySelector('.seat-src');
          const l = src?.nextElementSibling; return l?.classList.contains('positions-asof') ? l.innerText.trim() : 'missing'; })()`);
        if (asOf !== S.elected.positionsAsOf) errors.push(`[${current}] positions-as-of line missing after the source line (${asOf})`);
      }
      // Results mode: no poll disclaimer anywhere, and no poll figures outside the method page's comparison table.
      if (RESULTS && (expectView === 'method' ? /הסקרים אינם עדכניים/ : /הסקרים אינם עדכניים|ממוצע סקרים/).test(await evaluate('document.body.innerText'))) errors.push(`[${current}] poll disclaimer or poll figures shown in results mode`);
      if (RESULTS && name === 'method') {
        const vs = await evaluate(`(() => { const t = document.querySelector('#method .vs-table'); if (!t) return 'missing';
          const rows = [...t.querySelectorAll('tbody tr')]; const seats = rows.reduce((n, r) => n + Number(r.cells[2].innerText), 0); // cells: name, poll average, seats
          return rows.length + ',' + seats; })()`);
        if (vs !== `${parties.length},120`) errors.push(`[${current}] polls-vs-results table: expected ${parties.length} rows summing to 120 seats (${vs})`);
      }
      if (SEATS_HIDDEN) {
        const seatText = await evaluate(`(document.body.innerText.match(${POLL_TEXT}) || [])[0] || ''`);
        if (await evaluate("document.querySelector('.pivotal') !== null")) errors.push(`[${current}] showSeats is off but the pivotal rows are shown`);
        if (seatText) errors.push(`[${current}] showSeats is off but poll-derived text is visible: "${seatText}"`);
        if (expectView === 'build') {
          const order = await evaluate("[...document.querySelectorAll('#builder [data-act=\"toggle\"]')].map((b) => b.dataset.id).join(',')");
          if (order !== ballotOrder(parties).map((p) => p.id).join(',')) errors.push(`[${current}] showSeats is off but parties are not in ballot-letter order: ${order}`);
        }
      } else if (expectView === 'build') {
        // The seats box above the chips carries the full source line (also with no party selected, since chips show seats).
        const box = await evaluate(`(() => { const b = document.querySelector('#builder .seats-box'); if (!b) return 'missing box'; if (!b.innerText.replace(/\\s+/g, ' ').includes(${JSON.stringify(SRC_TEXT)})) return 'sentence missing';
          const l = b.querySelector('${SRC_SEL}'), sl = b.querySelector('.seats-line'); const a = getComputedStyle(l), c = getComputedStyle(sl);
          if (a.fontSize !== c.fontSize || a.color !== getComputedStyle(document.body).color) return 'style ' + a.fontSize + '/' + c.fontSize + ' ' + a.color;
          if (!(l.compareDocumentPosition(sl) & Node.DOCUMENT_POSITION_FOLLOWING)) return 'sentence must come before the numbers';
          return 'ok'; })()`);
        if (box !== 'ok') errors.push(`[${current}] seats box: ${box}`);
        const line = await evaluate("(() => { const e = document.querySelector('#builder .seats-box .seats-line'); const lh = parseFloat(getComputedStyle(e).lineHeight); return e.getBoundingClientRect().height > lh * 1.5 ? 'wraps' : 'ok'; })()");
        if (line !== 'ok') errors.push(`[${current}] seat line wraps onto two lines`);
        const chipsBelow = await evaluate("(() => { const b = document.querySelector('#builder .seats-box'); const c = document.querySelector('#builder .plist'); return b.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING ? 'ok' : 'chips before box'; })()");
        if (chipsBelow !== 'ok') errors.push(`[${current}] seats box must sit directly above the chips`);
        // The sticky bar holds only the party count and the button: no seats, no poll text.
        const barInfo = await evaluate("(() => { const b = document.querySelector('#bar'); return b.hidden ? 'hidden' : b.innerText.replace(/\\s+/g, ' ').trim(); })()");
        if (members_in_url(suffix)) {
          if (!/^\d+ מפלגות נבחרו|^מפלגה אחת נבחרה/.test(barInfo) || /מנדט|סקר|≈|\d{2,}/.test(barInfo.replace(/^\d+ מפלגות נבחרו/, ''))) errors.push(`[${current}] sticky bar must hold only the party count and button, got "${barInfo}"`);
          // Nothing may cover the bar's button.
          const btn = await evaluate(`(() => { const a = document.querySelector('#bar a.btn'); if (!a) return 'missing'; const r = a.getBoundingClientRect(); const pts = []; for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.2, 0.5, 0.8]) pts.push([r.left + r.width * fx, r.top + r.height * fy]);
            const bad = pts.filter(([x, y]) => { const e = document.elementFromPoint(x, y); return !e || !(a === e || a.contains(e)); }); return bad.length ? 'covered by ' + (document.elementFromPoint(bad[0][0], bad[0][1])?.id || document.elementFromPoint(bad[0][0], bad[0][1])?.tagName) : 'ok'; })()`);
          if (btn !== 'ok') errors.push(`[${current}] bar button obscured: ${btn}`);
        } else if (barInfo !== 'hidden') errors.push(`[${current}] sticky bar should be hidden with no party selected`);
      }
      if (expectView === 'build') {
        // Party picker: one checkbox row per party, no nested controls inside a checkbox, rows >= 44px, aligned pill column.
        const pick = await evaluate(`(() => { const rows = [...document.querySelectorAll('#builder .prow-main')]; if (rows.length !== ${passedIds.length}) return 'rows ' + rows.length;
          if (rows.map((r) => r.dataset.id).join(',') !== ${JSON.stringify(passedIds.join(','))}) return 'order ' + rows.map((r) => r.dataset.id).join(',');
          if (rows.some((r) => r.getAttribute('role') !== 'checkbox' || !['true', 'false'].includes(r.getAttribute('aria-checked')))) return 'role/aria-checked';
          if (rows.some((r) => r.querySelector('button, a, input'))) return 'nested control in a checkbox row';
          if (rows.some((r) => r.getBoundingClientRect().height < 44)) return 'row under 44px';
          if (document.querySelector('#builder .mini, #builder [data-act="base"]')) return 'star/remove buttons still in the picker';
          const xs = [...document.querySelectorAll('#builder .pills')].map((e) => Math.round(e.getBoundingClientRect().left)); if (new Set(xs).size > 1) return 'pills not aligned: ' + [...new Set(xs)].join(',');
          return 'ok'; })()`);
        if (pick !== 'ok') errors.push(`[${current}] party picker: ${pick}`);
        if (RESULTS) {
          // Lists under the threshold: one collapsed section, viewable, not selectable.
          const below = await evaluate(`(() => { const d = document.querySelector('#builder details.below'); if (!d) return 'missing'; if (d.open) return 'open by default';
            if (d.querySelector('[role="checkbox"], input')) return 'selectable';
            const ids = [...d.querySelectorAll('[data-act="party"]')].map((b) => b.dataset.id).join(','); return ids === ${JSON.stringify(ctx.parties.filter((p) => !ctx.passed(p.id)).map((p) => p.id).join(','))} ? 'ok' : 'ids ' + ids; })()`);
          if (below !== 'ok') errors.push(`[${current}] below-threshold section: ${below}`);
        }
      }
      if (expectView === 'results' && !SEATS_HIDDEN) {
        const ok = await evaluate(`document.querySelectorAll('#results .seats-line').length === 0 || document.querySelector('#results').innerText.replace(/\\s+/g, ' ').includes(${JSON.stringify(SRC_TEXT)})`);
        if (!ok) errors.push(`[${current}] results show seats without the full source line`);
        {
          const st = parseLocation(splitSuffix(suffix), passedIds).state;
          const got = await evaluate(PIVOTAL_JS);
          const want = st.members.length && investiture(posCtx.he, st).approved ? pivotalText('he', st) : null;
          if (JSON.stringify(got) !== JSON.stringify(want)) errors.push(`[${current}] pivotal rows: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
          if (RESULTS && name === 'results-scenario-arab' && !(got?.length === 7 && got.includes('אם רע״ם תצביע נגד: 59 מול 61'))) errors.push(`[${current}] expected 6 pivotal rows with רע״ם voting against (59 מול 61)`);
          if (RESULTS && name === 'results-pivotal-partial' && got?.slice(1).map((t) => t.split(':')[0]).join('|') !== 'בלי הליכוד|בלי ישר!|בלי ביחד') errors.push(`[${current}] expected הליכוד, ישר!, ביחד as pivotal, got ${JSON.stringify(got)}`);
          if (RESULTS && name === 'results-coalition' && got !== null) errors.push(`[${current}] the vote fails, so no pivotal rows`);
        }
        if (expectView === 'results' && members_in_url(suffix) && name !== 'results-single' && !(await evaluate("document.querySelector('#matrix .tap-hint')?.innerText.includes('לחצו על כל תא או נושא')"))) errors.push(`[${current}] matrix tap hint missing`);
        const line = await evaluate("document.querySelector('#results-coalition')?.innerText || ''");
        if (!line.trim()) errors.push(`[${current}] results are missing the coalition line`);
        // Investiture: "בעד X · נגד Y · נמנעות Z", an icon+text verdict, and the members' own seats.
        if (members_in_url(suffix) && name !== 'results-single') {
          const vote = await evaluate(`(() => { const o = document.querySelector('#results .overall'); if (!o) return 'no summary'; const t = o.innerText.replace(/\\s+/g, ' ');
            const m = t.match(/בעד ≈?(\\d+) · נגד ≈?(\\d+) · נמנעות ≈?(\\d+)/); if (!m) return 'vote line missing';
            const v = o.querySelector('.verdict'); if (!v || !/^[✓✕] הממשלה (הייתה|לא הייתה) זוכה באמון/.test(v.innerText.trim())) return 'verdict missing';
            if (!/חברות הקואליציה לבדן: ≈?\\d+/.test(t)) return 'members line missing'; return m.slice(1).join(','); })()`);
          if (!/^\d+,\d+,\d+$/.test(vote)) errors.push(`[${current}] investiture: ${vote}`);
          else if (RESULTS && vote.split(',').reduce((a, b) => a + Number(b), 0) !== 120) errors.push(`[${current}] investiture numbers must sum to 120 (${vote})`);
          if (RESULTS && name === 'results-roles' && vote !== '59,46,15') errors.push(`[${current}] expected בעד 59 · נגד 46 · נמנעות 15, got ${vote}`);
          if (RESULTS && name === 'results-old-outside' && vote !== '56,64,0') errors.push(`[${current}] expected בעד 56 · נגד 64 · נמנעות 0, got ${vote}`);
        }
        // Supporters and abstainers: own card, listed with their role; never inside the coalition cards.
        const q = stateParams(suffix);
        const side = [...(q.get('o') ?? '').split(','), ...(q.get('a') ?? '').split(',')].filter(Boolean);
        if (side.length) {
          const per = await evaluate(`(() => { const c = document.querySelector('#results .periphery'); if (!c) return 'missing';
            const names = [...c.querySelectorAll('.per-party .row-title')].map((e) => e.innerText); return names.join('|'); })()`);
          const wantNames = side.map((id) => parties.find((p) => p.id === id).name);
          if (per === 'missing' || !wantNames.every((n) => per.includes(n))) errors.push(`[${current}] supporters/abstainers card missing or incomplete (${per})`);
          const leak = await evaluate(`[...document.querySelectorAll('#results .gap-head, #results .card:not(.periphery) .pair-btn, #matrix .party-btn')].map((e) => e.innerText).join('|')`);
          const leaked = wantNames.filter((n) => leak.includes(n));
          if (leaked.length) errors.push(`[${current}] supporters/abstainers counted in the coalition analysis: ${leaked.join(', ')}`);
        }
      }
      if (expectView === 'results') {
        const share = await evaluate("document.querySelectorAll('#results-bar [data-act=\"share\"]').length");
        const want = name === 'results-single' ? 0 : 1;
        if (share !== want) errors.push(`[${current}] share button count ${share}, expected ${want}`);
        // Shared links carry the coalition in the fragment only, with no other query params.
        const wa = await evaluate("document.querySelector('#results a[href^=\"https://wa.me/\"]')?.href || ''");
        const wantShare = `${baseUrl}#results${serializeState(ctx, parseLocation(splitSuffix(suffix), passedIds).state)}`;
        if (wa && !new URL(wa).searchParams.get('text').endsWith(`\n${wantShare}`)) errors.push(`[${current}] WhatsApp link should end with ${wantShare} (${new URL(wa).searchParams.get('text')})`);
        if (exp.state.members.length) for (const e of cardErrors('he', exp.state, await evaluate(CARD_JS))) errors.push(`[${current}] ${e}`);
        // #14: one red-line line in the snapshot (also when none is crossed), the same list as the completions card.
        if (exp.state.members.length >= 2) {
          const got = await evaluate(REDLINES_JS);
          const want = redLinesText('he', exp.state.members);
          if (got !== want) errors.push(`[${current}] red-line line should be "${want}", got "${got}"`);
          if (RESULTS && name === 'results-coalition' && !got.startsWith('🚩 2 קווים אדומים נחצו')) errors.push(`[${current}] expected 2 red lines crossed, got "${got}"`);
          if (name === 'results-opposition' && got !== S.results.noRedLinesCrossed) errors.push(`[${current}] expected no red line crossed, got "${got}"`);
          // #31: grouped by topic (the coalition bloc: Haredi parties' draft red lines), and a box with a small radius, not a pill.
          if (RESULTS && name === 'results-coalition' && got !== `🚩 ${S.results.redLinesCrossed(2, 'גיוס: יהדות התורה, ש״ס')}`) errors.push(`[${current}] red lines should be grouped by topic, got "${got}"`);
          const radius = await evaluate("(() => { const t = document.querySelector('#results .overall .redlines-line .tag'); return t ? parseFloat(getComputedStyle(t).borderTopLeftRadius) : null; })()");
          if (radius !== null && radius > 8) errors.push(`[${current}] the red-line line is a pill (radius ${radius}px), want a box with a small radius`);
          const card = await evaluate(`(() => { const c = document.querySelector('#results .completions'); if (!c) return null;
            const t = [...c.querySelectorAll('.tag-red')].map((e) => e.innerText.replace(/\\s+/g, ' ').trim()).find((x) => x.includes('כבר חוצה')); return t ? t.slice(t.indexOf(': ') + 2) : ''; })()`);
          const list = got.startsWith('🚩') ? got.slice(got.indexOf(': ') + 2) : '';
          if (card !== null && card !== list) errors.push(`[${current}] red-line line and completions card disagree ("${list}" vs "${card}")`);
        }
        // #1: the supporters' and abstainers' head-on clashes, the same N and words as the snapshot pointer; nothing without them.
        if (wa) {
          const text = new URL(wa).searchParams.get('text');
          const want = shareTextFor('he', exp.state);
          if (!text.startsWith(`${want}\n`)) errors.push(`[${current}] share text should be "${want}", got "${text}"`);
        }
      }
      if (expectView === 'method') {
        const secs = await evaluate("(() => { const p = document.querySelector('#privacy'), a = document.querySelector('#accessibility'); const f = [...document.querySelectorAll('#footer a')].map((x) => x.getAttribute('href')); return [p?.innerText.includes('GoatCounter') && p.innerText.includes('lioz.akirav@gmail.com'), a?.innerText.includes('5568') && a.innerText.includes('1.11.2026'), f.includes('#privacy'), f.includes('#accessibility')].join(','); })()");
        if (secs !== 'true,true,true,true') errors.push(`[${current}] privacy/accessibility sections or footer links missing (${secs})`);
        for (const e of downloadErrors('he', await evaluate(DOWNLOAD_JS))) errors.push(`[${current}] download: ${e}`);
        if (name !== 'method') {
          const top = await evaluate(`Math.round(document.querySelector('#${name}').getBoundingClientRect().top)`);
          if (top < 0 || top > z.height - 120) errors.push(`[${current}] #${name} did not scroll into view (top ${top})`);
        }
      }
      if (expectView === 'method' && RESULTS) {
        const joint = await evaluate("(() => { const h = [...document.querySelectorAll('#method h3')].find((x) => x.textContent.includes('רשימות משותפות')); const src = h?.nextElementSibling; const ul = src?.nextElementSibling; return src?.classList.contains('seat-src') && /5 להציונות הדתית ו-1 לזהות/.test(ul?.innerText ?? '') ? 'ok' : 'missing'; })()");
        if (joint !== 'ok') errors.push(`[${current}] joint-list seat split must follow the results source line`);
      }
      if (expectView === 'method' && !RESULTS && !SEATS_HIDDEN) {
        const joint = await evaluate("(() => { const h = [...document.querySelectorAll('#method h3')].find((x) => x.textContent.includes('רשימות משותפות')); const ul = h?.nextElementSibling; const p = ul?.nextElementSibling; return ul && /כ-7/.test(ul.innerText) && p?.classList.contains('poll-legal') ? p.innerText : 'missing'; })()");
        if (joint.replace(/\s+/g, ' ').trim() !== legal) errors.push(`[${current}] joint-list seat numbers lack the legal sentence right after them (${joint})`);
      }
      await shoot(z, `${name}-${z.tag}.png`);
    }
    log(`  ✓ ${z.width}px: ${cases.length} views`);
  }

  // Legal sentence vs seat numbers: whenever seat totals are visible, the full sentence must
  // be visible too, except for parts already scrolled past the top (reading down, the sentence always comes first).
  // Checked on first load and at every 40px of scroll, on a regular and a short phone.
  if (!SEATS_HIDDEN && sec('legal')) {
    const LEGAL_CHECK = `(() => {
      const pts = (el, fxs, fys) => { const r = el.getBoundingClientRect(); return fxs.flatMap((fx) => fys.map((fy) => [r.left + r.width * fx, r.top + r.height * fy])); };
      const hit = (el, [x, y]) => y >= 0 && y < innerHeight && x >= 0 && x < innerWidth && el.contains(document.elementFromPoint(x, y));
      // Content under the sticky results bar at the top has been scrolled past, like content above the viewport.
      const bar = [...document.querySelectorAll('.resbar')].find((e) => e.getClientRects().length);
      const top = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
      const bad = [];
      for (const box of document.querySelectorAll('.seats-box, .overall')) {
        const n = box.querySelector('.seats-line:not(.muted)'); const l = box.querySelector('${SRC_SEL}');
        if (!n || !n.getClientRects().length) continue;
        if (!pts(n, [0.05, 0.5, 0.95], [0.25, 0.75]).some((p) => p[1] >= top && hit(n, p))) continue; // numbers not visible
        const shown = l && pts(l, [0.05, 0.3, 0.5, 0.7, 0.95], [0.15, 0.5, 0.85]).every((p) => p[1] < top || hit(l, p));
        if (!shown) bad.push(box.classList.contains('overall') ? 'results summary' : 'seats box');
      }
      return bad.join(', ');
    })()`;
    const legalCases = cases.filter(([n, suffix, v]) => members_in_url(suffix) && n !== 'results-single' && (v === 'build' || v === 'results'));
    for (const z of [{ ...SIZES[0] }, { tag: 's', width: 375, height: 667, mobile: true, dpr: 2 }]) {
      await setSize(z);
      for (const [name, suffix] of legalCases) {
        step(`legal-${name}@${z.width}x${z.height}`);
        await go(baseUrl + suffix);
        await waitFor(() => evaluate("document.body.dataset.view !== undefined && document.querySelector('#footer')?.children.length > 0"));
        await settle(400);
        const first = await evaluate(LEGAL_CHECK);
        if (first) { errors.push(`[${current}] first load: seat numbers visible without the full legal sentence (${first})`); await shoot(z, `legal-fail-${name}-${z.tag}.png`, false, true); }
        const scrolled = await evaluate(`(() => { const out = []; const max = document.documentElement.scrollHeight - innerHeight;
          for (let y = 0; y <= max; y += 40) { window.scrollTo(0, y); const r = ${LEGAL_CHECK}; if (r) out.push(y + ': ' + r); }
          window.scrollTo(0, 0); return out.slice(0, 3).join(' | '); })()`);
        if (scrolled) errors.push(`[${current}] while scrolling: seat numbers visible without the full legal sentence at ${scrolled}`);
        if (await evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')) errors.push(`[${current}] horizontal page overflow`);
      }
    }
    log(`  ✓ legal sentence vs seat numbers: ${legalCases.length} views × 390×844, 375×667`);
  }

  // The narrowest supported phone (360px): the outside-party markers wrap inside the page, in both languages.
  if (sec('narrow')) {
    const z = { tag: 'n', width: 360, height: 740, mobile: true, dpr: 2 };
    await setSize(z);
    const narrow = ['results-roles', 'results-scenario-arab', 'results-pair'].map((n) => cases.find((c) => c[0] === n));
    for (const [name, suffix] of narrow) {
      for (const l of ['he', 'en']) {
        step(`narrow-${name}-${l}@360`);
        await go(baseUrl + suffix + (l === 'en' ? '&l=en' : '')); // these suffixes all carry a fragment query
        await waitFor(() => evaluate("document.body.dataset.view !== undefined && document.querySelector('#footer')?.children.length > 0"));
        await settle(250);
        const bad = await evaluate(`(() => { const out = []; if (document.documentElement.scrollWidth > innerWidth + 1) out.push('horizontal page overflow');
          for (const e of document.querySelectorAll('.outside')) { const r = e.getBoundingClientRect(); if (r.width && (r.left < -1 || r.right > innerWidth + 1)) out.push('marker outside the page: ' + e.innerText); }
          return out.join(' | '); })()`);
        if (bad) errors.push(`[${current}] ${bad}`);
        await shoot(z, `${name}-n${l === 'en' ? '-en' : ''}.png`);
      }
    }
    log(`  ✓ 360px: ${narrow.length} views × he, en (outside-party markers inside the page)`);
  }

  // The served headers are netlify.toml's, every one of them (Netlify drops the space after a comma). Netlify's "Powered by
  // Netlify" badge is off (a project setting in the dashboard, #26): if it is ever turned back on, its injected script
  // would need CSP exceptions we removed, so fail loudly.
  if (base && sec('headers')) {
    step('headers');
    const res = await fetch(baseUrl);
    const norm = (v) => v?.replace(/,\s+/g, ',');
    for (const [k, v] of Object.entries(siteHeaders())) {
      const served = res.headers.get(k);
      if (norm(served) !== norm(v)) errors.push(`[headers] the served ${k} differs from netlify.toml:\n    served: ${served}\n    toml:   ${v}`);
    }
    if (/\/\.netlify\/scripts\/hud|data-nf-variant/.test(await res.text())) errors.push('[headers] Netlify injects its badge script again: turn the badge off in Project configuration > General > Powered by Netlify badge');
    log(`  ✓ served headers match netlify.toml (${Object.keys(siteHeaders()).length}); no injected badge script`);
  }
  // The deploy serves exactly site/: every file, byte for byte (so the tested draft is what goes live).
  if (base && sec('files')) {
    step('files');
    const dir = join(ROOT, 'site');
    const files = readdirSync(dir, { recursive: true }).filter((f) => !f.split(/[\\/]/).some((x) => x.startsWith('.')) && statSync(join(dir, f)).isFile());
    // Netlify adds a hosting comment to HTML at its edge (seen 8.11.2026; not a script, so the CSP is unaffected). That
    // exact comment is left out of the comparison and reported; anything else that differs fails.
    const NETLIFY_COMMENT = /<!-- This site is hosted on Netlify\.[^]*?-->\n?/;
    const differ = [];
    const commented = [];
    await Promise.all(files.map(async (f) => {
      const r = await fetch(new URL(f.split(/[\\/]/).map(encodeURIComponent).join('/'), baseUrl));
      let got = Buffer.from(await r.arrayBuffer());
      if (f.endsWith('.html') && NETLIFY_COMMENT.test(got.toString('utf8'))) { commented.push(f); got = Buffer.from(got.toString('utf8').replace(NETLIFY_COMMENT, '')); }
      if (!r.ok || !got.equals(readFileSync(join(dir, f)))) differ.push(`${f} (HTTP ${r.status}, ${got.length} bytes served, ${statSync(join(dir, f)).size} in site/)`);
    }));
    if (differ.length) errors.push(`[files] the deploy differs from site/: ${differ.sort().join(', ')}`);
    log(`  ✓ ${files.length} files served exactly as in site/${commented.length ? ` (Netlify's hosting comment left out of ${commented.join(', ')})` : ''}`);
  }

  // Interactions at phone width: pick a preset on the build view, open the poll note, go to results, open a cell, come back.
  const z = SIZES[0];
  if (sec('interaction')) {
    await setSize(z);
    step('interaction@390');
    await go(baseUrl);
    await ready();
    if (RESULTS) {
      // Media scenarios replace the bloc presets: up to 4, named by composition, sorted alphabetically, each with a
      // dated, linked source; tapping one fills members, supporters and abstainers.
      const { scenarios } = loadData();
      const closedAtFirst = await evaluate("document.querySelector('#presets details')?.open === false");
      await evaluate("document.querySelector('#presets details').open = true");
      const scen = await evaluate(`(() => { const sec = document.querySelector('#presets'); return { title: sec.querySelector('summary')?.innerText.trim(), open: ${!closedAtFirst},
        old: sec.querySelectorAll('[data-act="preset"]').length, items: [...sec.querySelectorAll('.scenario')].map((li) => ({
          id: li.querySelector('[data-act="scenario"]').dataset.id, label: li.querySelector('[data-act="scenario"]').innerText.trim(),
          links: [...li.querySelectorAll('.scen-src a')].map((a) => a.href), src: li.querySelector('.scen-src').innerText })) }; })()`);
      // #26: the scenarios sit in the builder section, collapsed, behind "או התחילו מתרחיש שעלה בתקשורת (n) · נכון ל-…".
      if (scen.title !== S.presets.scenariosStart(scenarios.scenarios.length, S.presets.shortDate(scenarios.asOf))) errors.push(`[interaction] scenarios summary wrong (${scen.title})`);
      if (scen.open) errors.push('[interaction] the scenarios disclosure should start collapsed');
      if (scen.old) errors.push('[interaction] bloc presets still shown in results mode');
      if (scen.items.length !== scenarios.scenarios.length || scen.items.length > 4) errors.push(`[interaction] expected ${scenarios.scenarios.length} scenarios, got ${scen.items.length}`);
      const labels = scen.items.map((x) => x.label);
      if (labels.join('|') !== [...labels].sort((a, b) => a.localeCompare(b, 'he')).join('|')) errors.push('[interaction] scenarios are not sorted alphabetically');
      if (labels.some((l) => /אחדות|ימין|שמאל|שינוי|ממשלת/.test(l))) errors.push(`[interaction] scenario names must be compositions only (${labels.join(' | ')})`);
      for (const it of scen.items) {
        const sc = scenarios.scenarios.find((x) => x.id === it.id);
        if (it.links.join() !== sc.sources.map((x) => x.url).join() && it.links.join() !== sc.sources.map((x) => new URL(x.url).href).join()) errors.push(`[interaction] scenario ${it.id} source links wrong`);
        if (!/\d{1,2}\.\d{1,2}/.test(it.src)) errors.push(`[interaction] scenario ${it.id} source line lacks a date`);
      }
      // One source-line format: "מקור: <outlet>, <d.m>" / "מקורות: <a> · <b>", a person's statement as "<person> ב<outlet>".
      for (const it of scen.items) {
        const sc = scenarios.scenarios.find((x) => x.id === it.id);
        const want = wantSourceLine(S, sc, posCtx.he);
        if (it.src.replace(/\s+/g, ' ').trim() !== want) errors.push(`[interaction] scenario ${it.id} source line "${it.src}" should read "${want}"`);
      }
      await evaluate("(() => { const d = document.querySelector('#presets details'); d.open = true; d.scrollIntoView(); })()");
      await settle(150);
      await shoot(z, 'interaction-scenarios-m.png', false);
      if (await evaluate("document.querySelector('#presets .scen-note') !== null")) errors.push('[interaction] scenario notes must not be rendered (they live in decisions.md)');
      const b = scenarios.scenarios.find((x) => x.supporters.length && x.abstainers.length) ?? scenarios.scenarios[0];
      await evaluate(`document.querySelector('[data-act="scenario"][data-id="${b.id}"]').click()`);
      await settle(300);
      const q = new URLSearchParams(await frag());
      const ids = (k) => (q.get(k) ?? '').split(',').filter(Boolean).sort().join(',');
      if (ids('m') !== [...b.members].sort().join(',') || ids('o') !== [...b.supporters].sort().join(',') || ids('a') !== [...b.abstainers].sort().join(',')) errors.push(`[interaction] scenario tap did not set its roles (${q})`);
    } else {
      const pre = await evaluate("JSON.stringify([document.querySelector('#presets summary')?.innerText.trim(), document.querySelector('#presets details')?.open])");
      if (pre !== JSON.stringify([S.presets.presetsStart, false])) errors.push(`[interaction] presets disclosure: expected "${S.presets.presetsStart}", collapsed; got ${pre}`);
      await evaluate("document.querySelector('#presets details').open = true; document.querySelector('[data-act=\"preset\"][data-id=\"unity\"]').click()");
    }
    await settle(300);
    await shoot(z, 'interaction-build-unity-m.png', false);
    if (!RESULTS && !SEATS_HIDDEN) {
      await evaluate("document.querySelector('#builder [data-act=\"poll-info\"]').click()");
      await settle(300);
      const info = await evaluate("document.querySelector('#sheet').innerText.replace(/\\s+/g, ' ')");
      if (!info.includes(legal)) errors.push('[interaction] poll-info sheet lacks the legal sentence');
      await shoot(z, 'interaction-poll-info-m.png', false);
    }
    await evaluate("document.querySelector('#sheet').close(); document.querySelector('#bar a.btn').click()");
    await settle(400);
    const afterClick = await evaluate('document.body.dataset.view');
    if (afterClick !== 'results') errors.push(`[interaction] "לתוצאות" did not open results (view "${afterClick}")`);
    await evaluate("document.querySelector('.cell')?.click()");
    await settle(300);
    await shoot(z, 'interaction-cell-sheet-m.png', false);
    const dialogName = await evaluate("(() => { const d = document.querySelector('#sheet'); const t = document.getElementById(d.getAttribute('aria-labelledby') || ''); return t && d.contains(t) ? t.textContent.trim() : ''; })()");
    if (!dialogName) errors.push('[interaction] sheet dialog has no accessible name (aria-labelledby)');
    // The cell sheet offers a corrections mailto with a prefilled subject and the page URL in the body.
    const mailto = await evaluate("document.querySelector('#sheet a[href^=\"mailto:\"]')?.getAttribute('href') || ''");
    const mq = mailto ? new URL(mailto).searchParams : null;
    if (!mq || !/^תיקון: .+ · .+/.test(mq.get('subject') ?? '') || !(mq.get('body') ?? '').includes('http')) errors.push(`[interaction] cell sheet is missing a valid corrections mailto (${mailto})`);
    if (!mailto.startsWith('mailto:lioz.akirav@gmail.com?')) errors.push('[interaction] corrections mailto must go to lioz.akirav@gmail.com');
    await evaluate("document.querySelector('#sheet').close(); document.querySelector('#results-bar .back').click()");
    await settle(300);
    const backView = await evaluate('document.body.dataset.view');
    if (backView !== 'build') errors.push(`[interaction] "← עריכה" did not return to build (view "${backView}")`);
    // A position with a verified archive snapshot shows the "עותק בארכיון" link in its cell sheet.
    const withArchive = JSON.parse(readFileSync(join(ROOT, 'site', 'data', 'positions.json'), 'utf8')).find((p) => p.archiveUrl);
    if (withArchive) {
      await go(`${baseUrl}#results?m=${withArchive.partyId},together`);
      await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.cell').length > 0"));
      await evaluate(`document.querySelector('.cell[data-party="${withArchive.partyId}"][data-topic="${withArchive.topicId}"]').click()`);
      await settle(300);
      const href = await evaluate("[...document.querySelectorAll('#sheet a')].find((a) => a.textContent.includes('עותק בארכיון'))?.href || ''");
      if (!/^https:\/\/web\.archive\.org\/web\/\d{14}\//.test(href)) errors.push(`[interaction] cell sheet for ${withArchive.partyId}/${withArchive.topicId} lacks its archive link (${href})`);
      await shoot(z, 'interaction-archive-link-m.png', false);
    }
    // Picker: tap a row to toggle, outside toggle, three-party build screenshot.
    await go(baseUrl);
    await ready();
    for (const id of ['likud', 'shas', 'otzma-yehudit']) await evaluate(`document.querySelector('[data-act="toggle"][data-id="${id}"]').click()`);
    await settle(300);
    const sel = await evaluate("[...document.querySelectorAll('#builder .prow-main[aria-checked=\"true\"]')].length");
    if (sel !== 3) errors.push(`[interaction] tapping rows should select 3 parties, got ${sel}`);
    // The ✓/✕/? pills (#10): what one tap adds. In polls mode הציונות הדתית brings זהות, so the pills count both.
    {
      const rz = 'religious-zionism';
      const add = RESULTS ? [rz] : [rz, posCtx.he.linkedOf(rz)];
      const im = addImpact(posCtx.he, add, ['likud', 'shas', 'otzma-yehudit']);
      const want = `✓${im.agree}✕${im.clash}?${im.unknown}`;
      const got = await evaluate(`document.querySelector('[data-act="toggle"][data-id="${rz}"] .pills')?.textContent ?? ''`);
      if (got !== want) errors.push(`[interaction] ${rz} pills should count ${add.join(' + ')}: want ${want}, got ${got}`);
    }
    // The live region (#7): toggling a party off says it was removed, toggling it back on gives the added line.
    {
      const nm = posCtx.he.byId.get('otzma-yehudit').name;
      const liveAfter = async () => { await evaluate(`document.querySelector('[data-act="toggle"][data-id="otzma-yehudit"]').click()`); await settle(200); return evaluate("document.querySelector('#live').textContent"); };
      const off = await liveAfter();
      if (!off.startsWith(`${nm} הוסרה. `)) errors.push(`[interaction] toggling ${nm} off should announce its removal, got "${off}"`);
      const on = await liveAfter();
      if (!on.startsWith(`${nm}: `) || on.includes('הוסרה')) errors.push(`[interaction] toggling ${nm} back on should announce the added line, got "${on}"`);
    }
    await evaluate("document.querySelector('[data-act=\"role\"][data-id=\"shas\"][data-role=\"supporter\"]').click()");
    await settle(200);
    if (!/o=shas/.test(await frag())) errors.push(`[interaction] supporter role did not set o= (${await frag()})`);
    await evaluate("(() => { const b = document.querySelector('[data-act=\"role\"][data-id=\"shas\"][data-role=\"abstainer\"]'); b.focus(); b.click(); })()");
    await settle(200);
    const absUrl = await frag();
    if (!/a=shas/.test(absUrl) || /o=shas/.test(absUrl)) errors.push(`[interaction] abstainer role did not move shas to a= (${absUrl})`);
    if ((await evaluate("document.activeElement?.dataset.key")) !== 'role-shas-abstainer') errors.push('[interaction] focus lost after choosing a role');
    await evaluate("document.querySelector('[data-act=\"role\"][data-id=\"shas\"][data-role=\"member\"]').click()");
    await settle(200);
    // Radio groups (#11): one Tab stop per group (the checked radio), and the arrow keys choose. RTL: ← is next.
    const RADIO_KEYS = { ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35 };
    const press = async (k) => { for (const type of ['keyDown', 'keyUp']) await c.send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: RADIO_KEYS[k] }); await settle(200); };
    const ONE_STOP = `[...document.querySelectorAll('[role="radiogroup"]')].every((g) => { const z = [...g.querySelectorAll('[role="radio"]')].filter((r) => r.tabIndex === 0); return z.length === 1 && z[0].getAttribute('aria-checked') === 'true'; })`;
    if (!(await evaluate(ONE_STOP))) errors.push('[interaction] each role group should have one Tab stop, its checked radio');
    await evaluate("document.querySelector('[data-key=\"role-shas-member\"]').focus()");
    for (const [k, role, q] of [['ArrowLeft', 'supporter', /o=shas/], ['End', 'abstainer', /a=shas/], ['Home', 'member', /m=[^&]*shas/], ['ArrowRight', 'abstainer', /a=shas/]]) {
      await press(k);
      const [f, focus] = [await frag(), await evaluate('document.activeElement?.dataset.key')];
      if (!q.test(f) || focus !== `role-shas-${role}`) errors.push(`[interaction] ${k} in shas's role group should choose ${role} and keep focus on it (${f}, focus ${focus})`);
    }
    await press('Home');
    if (await evaluate("document.querySelectorAll('#view-build h1').length") !== 1) errors.push('[interaction] the build view should have one h1');
    const by = await evaluate("[...document.querySelectorAll('#footer .f-by bdi')].map((b) => b.textContent).join('|')");
    if (by !== 'Lioz Akirav') errors.push(`[interaction] the footer's Latin name should be in a <bdi>, got "${by}"`);
    // Unselecting a row clears its role (back to opponent).
    await evaluate("document.querySelector('[data-act=\"role\"][data-id=\"shas\"][data-role=\"supporter\"]').click(); document.querySelector('[data-act=\"toggle\"][data-id=\"shas\"]').click()");
    await settle(200);
    if (/shas/.test(await frag())) errors.push('[interaction] unselecting a supporter did not clear its role');
    await evaluate("document.querySelector('[data-act=\"toggle\"][data-id=\"shas\"]').click()");
    await settle(200);
    await evaluate('window.scrollTo(0, document.querySelector("#builder .seats-box").getBoundingClientRect().top + scrollY - 10)');
    await settle(200);
    await shoot(z, 'interaction-build-3-selected-m.png', false);
    // Results: base control, expanding gap card, pair view from an expanded pair.
    await evaluate("document.querySelector('#bar a.btn').click()");
    await settle(400);
    if ((await evaluate('document.body.dataset.view')) !== 'results') errors.push('[interaction] "לתוצאות" from the picker did not open results');
    await go(`${baseUrl}#results?m=likud,democrats,yashar,shas`);
    await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.colorby').length > 0"));
    const baseBtns = await evaluate("document.querySelectorAll('.colorby [role=\"radio\"]').length");
    if (baseBtns !== 5) errors.push(`[interaction] base control should list הכל + 4 parties, got ${baseBtns}`);
    await evaluate("document.querySelector('.colorby [data-id=\"shas\"]').click()");
    await settle(300);
    const bq = await frag();
    if (!/b=shas/.test(bq)) errors.push(`[interaction] base control did not set b= (${bq})`);
    // The results view's h1 (#11), for screen readers; and "צבע לפי" by keyboard: Home is הכל, ← (RTL) the next party.
    const h1 = await evaluate("[...document.querySelectorAll('#view-results h1')].map((h) => h.textContent).join('|')");
    if (h1 !== S.results.viewTitle) errors.push(`[interaction] the results view should have one h1 "${S.results.viewTitle}", got "${h1}"`);
    if (!(await evaluate(ONE_STOP))) errors.push('[interaction] "צבע לפי" should have one Tab stop, its checked radio');
    await evaluate("document.querySelector('[data-key=\"colorby-shas\"]').focus()");
    await press('Home');
    const allQ = await frag();
    if (/b=/.test(allQ) || (await evaluate('document.activeElement?.dataset.key')) !== 'colorby-all') errors.push(`[interaction] Home in "צבע לפי" should choose הכל (${allQ})`);
    const second = await evaluate("document.querySelectorAll('.colorby [role=\"radio\"]')[1].dataset.id");
    await press('ArrowLeft');
    if (!new RegExp(`b=${second}`).test(await frag()) || (await evaluate('document.activeElement?.dataset.key')) !== `colorby-${second}`) errors.push(`[interaction] ← in "צבע לפי" should choose ${second} (${await frag()})`);
    await evaluate("document.querySelector('.colorby [data-id=\"shas\"]').click()");
    await settle(300);
    const starLine = await evaluate("document.querySelector('#results-coalition').innerText.includes('★')");
    if (!starLine) errors.push('[interaction] coalition line should mark the base with ★');
    const sealed = await evaluate("document.querySelector('.gap-head') ? 'yes' : ''");
    if (!sealed) errors.push('[interaction] results have no gap cards for this coalition');
    else {
      // aria-controls only while the list it names exists (#11).
      if (await evaluate("document.querySelector('.gap-head').hasAttribute('aria-controls')")) errors.push('[interaction] a closed gap card must not point aria-controls at a list that does not exist');
      await evaluate("document.querySelector('.gap-head').click()");
      await settle(300);
      const open = await evaluate("document.querySelector('.gap-head').getAttribute('aria-expanded') === 'true' && document.querySelectorAll('.pair-list .pair-btn').length > 0");
      if (!open) errors.push('[interaction] gap card did not expand to list its pairs');
      if (!(await evaluate("document.getElementById(document.querySelector('.gap-head').getAttribute('aria-controls'))?.matches('.pair-list') === true"))) errors.push('[interaction] an open gap card should point aria-controls at its list');
      const tagOk = await evaluate("/· (זוג מפלגות אחד|\\d+ זוגות מפלגות)/.test(document.querySelector('.gap-head .lv').textContent) && !document.body.innerText.includes('ועוד')");
      if (!tagOk) errors.push('[interaction] gap card tag must carry the pair count and no "ועוד N זוגות" line');
      await evaluate('window.scrollTo(0, document.querySelector(".gap").getBoundingClientRect().top + scrollY - 120)');
      await settle(200);
      await shoot(z, 'interaction-results-base-gap-expanded-m.png', false);
      await evaluate("document.querySelector('.pair-list .pair-btn').click()");
      await settle(300);
      const pairOpen = await evaluate("document.querySelector('#sheet').open && document.querySelector('#sheet .pair') !== null");
      if (!pairOpen) errors.push('[interaction] tapping a pair did not open the pair view');
      await evaluate("document.querySelector('#sheet').close()");
    }
    // Party sheets: the joint-list seat note carries the source line; with seats hidden, no poll-derived text at all.
    // In results mode a list under the threshold is opened from its section on the build view.
    for (const pid of ['religious-zionism', 'zehut', 'kalkalit']) {
      if (ctx.passed(pid)) {
        await go(`${baseUrl}#results?m=likud,${pid}`);
        await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.party-btn').length > 0"));
        await evaluate(`document.querySelector('.party-btn[data-id="${pid}"]').click()`);
      } else {
        await go(`${baseUrl}#build?m=likud,${pid}`);
        await ready();
        if (await evaluate(`location.href.includes('${pid}') || document.querySelector('[data-act="toggle"][data-id="${pid}"]') !== null`)) errors.push(`[interaction] ${pid} is under the threshold but still selectable or kept in the URL`);
        await evaluate(`document.querySelector('details.below').open = true; document.querySelector('details.below [data-id="${pid}"]').click()`);
      }
      await settle(300);
      const text = await evaluate("document.querySelector('#sheet').innerText.replace(/\\s+/g, ' ')");
      if (RESULTS) {
        if (!text.includes(meta.resultsStatus)) errors.push(`[interaction] ${pid} party sheet lacks the results source line`);
        if (!ctx.passed(pid) && !text.includes('לא עברה את אחוז החסימה')) errors.push(`[interaction] ${pid} party sheet should say it did not pass the threshold`);
        if (!topics.every((t) => text.includes(t.name))) errors.push(`[interaction] ${pid} party sheet should list its positions on all topics`);
      } else if (SEATS_HIDDEN) {
        const hit = text.match(POLL_TEXT);
        if (hit) errors.push(`[interaction] ${pid} party sheet shows poll-derived text with seats hidden: "${hit[0]}"`);
      } else if (/\(7\)/.test(text) && !text.includes(legal)) errors.push(`[interaction] ${pid} party sheet shows seat figures without the legal sentence`);
      if (pid === 'religious-zionism') await shoot(z, 'interaction-party-sheet-m.png', false);
      await evaluate("document.querySelector('#sheet').close()");
    }
    // Results mode: הציונות הדתית and זהות are chosen independently, each row noting the joint list.
    if (RESULTS) {
      await go(baseUrl);
      await ready();
      await evaluate("document.querySelector('[data-act=\"toggle\"][data-id=\"religious-zionism\"]').click()");
      await settle(200);
      const m = new URLSearchParams(await frag()).get('m') ?? '';
      if (m !== 'religious-zionism') errors.push(`[interaction] results mode: selecting הציונות הדתית should not add זהות (m=${m})`);
      const notes = await evaluate("['religious-zionism', 'zehut'].map((id) => document.querySelector(`[data-act=\"toggle\"][data-id=\"${id}\"] .prow-sub`)?.innerText || '').join('|')");
      if (!notes.split('|').every((t) => t.includes('רצו ברשימה משותפת (ט)'))) errors.push(`[interaction] joint-list note missing on the ט rows (${notes})`);
      // The snapshot's pointer scrolls to the supporters/abstainers card, with its title below the sticky header.
      for (const size of SIZES) {
        await setSize(size);
        await go(`${baseUrl}#results?m=yashar,together,democrats,yisrael-beiteinu&o=joint-list&a=raam,utj`);
        await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelector('[data-act=\"to-periphery\"]') !== null"));
        await settle(200);
        await evaluate("document.querySelector('[data-act=\"to-periphery\"]').click()");
        await settle(400);
        const pos = await evaluate("(() => { const t = document.querySelector('#periphery-card h3').getBoundingClientRect(); const bar = document.querySelector('#results-bar').getBoundingClientRect(); return { top: Math.round(t.top), barBottom: Math.round(bar.bottom) }; })()");
        if (pos.top < pos.barBottom || pos.top > pos.barBottom + 60) errors.push(`[interaction@${size.width}] after the pointer jump the card title must sit just below the sticky header (title top ${pos.top}, header bottom ${pos.barBottom})`);
        if (await evaluate('document.activeElement?.closest("#periphery-card") === null')) errors.push(`[interaction@${size.width}] focus did not move to the supporters/abstainers card`);
        if ((await evaluate('document.body.dataset.view')) !== 'results') errors.push(`[interaction@${size.width}] pointer must not change the view`);
        if (size === SIZES[0]) await shoot(size, 'interaction-periphery-jump-m.png', false);
      }
      await setSize(z);
    }
    // "מה חסר לרוב של 61": the coalition bloc is short; each row is minimal, tapping one adds it, undo restores.
    if (!SEATS_HIDDEN) {
      const blocQs = serializeState(ctx, { base: null, ...pr.coalition });
      await go(`${baseUrl}#results${blocQs}`);
      await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelector('#footer')?.children.length > 0"));
      await settle(300);
      const card = await evaluate(`(() => { const c = document.querySelector('#results .completions'); if (!c) return null;
        return { title: c.querySelector('h3').innerText, note: c.innerText.includes(${JSON.stringify(S.completions.note)}), rows: [...c.querySelectorAll('[data-act="complete"]')].map((b) => b.dataset.ids) }; })()`);
      const wantRows = completions(ctx, pr.coalition.members).list.slice(0, 6).map((x) => x.add.join(','));
      if (!card) errors.push('[interaction] completions card missing for a coalition short of 61');
      else {
        if (card.title !== S.completions.title || !card.note) errors.push(`[interaction] completions card title/note wrong (${card.title})`);
        if (card.rows.join('|') !== wantRows.join('|')) errors.push(`[interaction] completions rows ${card.rows.join('|')} != ${wantRows.join('|')}`);
        await evaluate('window.scrollTo(0, document.querySelector("#results .completions").getBoundingClientRect().top + scrollY - 70)');
        await settle(200);
        await shoot(z, 'interaction-completions-m.png', false);
        const before = await frag();
        await evaluate("document.querySelector('#results [data-act=\"complete\"]').click()");
        await settle(300);
        const after = new URLSearchParams(await frag()).get('m') ?? '';
        if (!wantRows[0].split(',').every((id) => after.split(',').includes(id))) errors.push(`[interaction] tapping a completion did not add it (${after})`);
        if (await evaluate("document.querySelector('#results .completions') !== null")) errors.push('[interaction] completions card should disappear once members reach 61');
        await evaluate("document.querySelector('#results-undo [data-act=\"undo\"]').click()");
        await settle(300);
        if ((await frag()) !== before) errors.push('[interaction] undo after a completion did not restore the coalition');
      }
      // The change bloc (48): fewest lists first, so "+ הליכוד" alone leads; 6 rows, then "הציגו את כל N" shows all.
      // With רע״ם supporting, a completion that adds it is tagged "(כיום תומכת)".
      const change = { members: ['yashar', 'together', 'democrats', 'yisrael-beiteinu'], supporters: ['raam'] };
      const all = completions(ctx, change.members);
      await go(`${baseUrl}#results${serializeState(ctx, { base: null, ...change })}`);
      await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelector('#footer')?.children.length > 0"));
      await settle(300);
      const rowsOf = () => evaluate("[...document.querySelectorAll('#results .completions [data-act=\"complete\"]')].map((b) => b.dataset.ids + '|' + b.querySelector('.row-title').innerText)");
      const first = await rowsOf();
      if (first.length !== Math.min(6, all.total)) errors.push(`[interaction] completions should show 6 rows before "show all", got ${first.length}`);
      if (RESULTS && !first[0]?.startsWith('likud|')) errors.push(`[interaction] change bloc: "+ הליכוד" should come first (${first[0]})`);
      const toggle = await evaluate("(() => { const t = document.querySelector('#results [data-act=\"completions-all\"]'); return t ? t.innerText + '|' + t.getAttribute('aria-expanded') : ''; })()");
      if (all.total > 6 && toggle !== `${S.completions.showAll(all.total)}|false`) errors.push(`[interaction] completions toggle missing or wrong (${toggle})`);
      if (all.total > 6) {
        await evaluate("document.querySelector('#results [data-act=\"completions-all\"]').click()");
        await settle(300);
        const expanded = await rowsOf();
        if (expanded.length !== all.total) errors.push(`[interaction] "show all" should list ${all.total} completions, got ${expanded.length}`);
        if (expanded.map((r) => r.split('|')[0]).join(';') !== all.list.map((x) => x.add.join(',')).join(';')) errors.push('[interaction] expanded completions are not in the expected order');
        const tagged = expanded.filter((r) => r.split('|')[0].split(',').includes('raam'));
        if (!tagged.length || !tagged.every((r) => r.includes('רע״ם (כיום תומכת)'))) errors.push(`[interaction] completions adding a supporter must tag it "(כיום תומכת)" (${tagged[0]})`);
        if (expanded.some((r) => !r.split('|')[0].split(',').includes('raam') && r.includes('(כיום'))) errors.push('[interaction] only current supporters/abstainers get a "(כיום …)" tag');
        const deltas = await evaluate("[...document.querySelectorAll('#results .completions [data-act=\"complete\"]')].every((b) => /\\((אין חדשים|אחד חדש|\\d+ חדשים)\\)|אין נושא בסתירה חזיתית/.test(b.innerText) && /קווים אדומים חדשים|קו אדום חדש|אין קווים אדומים חדשים/.test(b.innerText))");
        if (!deltas) errors.push('[interaction] each completion must show new clash topics and new red lines');
        await evaluate('window.scrollTo(0, document.querySelector("#results .completions").getBoundingClientRect().top + scrollY - 70)');
        await settle(200);
        await shoot(z, 'interaction-completions-change-m.png', false);
      }
    }
    log('  ✓ interactions');
  }
  // Hebrew text outside an element with lang="he" (an untranslated string on the English page).
  const HEBREW_OUTSIDE = `(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) { if (!/[\\u05D0-\\u05EA]/.test(n.data)) continue; const el = n.parentElement;
      if (el.closest('noscript, script, style') || el.closest('[lang]')?.lang === 'he') continue; out.push(n.data.trim().slice(0, 40)); }
    return out.slice(0, 3).join(' | '); })()`;
  // Closest coalitions to a party (#22, results mode): from the party sheet and the build-view picker, in both languages,
  // on a regular and a short phone. Rows match closestTo() and show every sort key; coalitions with a silent partner are
  // collapsed behind a toggle naming exactly those partners (never X); tapping a row selects it with X as the base.
  if (sec('closest')) {
    await setSize(z);
    if (RESULTS) {
      const { positions } = loadData();
      for (const lng of ['he', 'en']) {
        const T = lng === 'he' ? S : EN;
        const lc = contextFor({ meta, parties, topics, positions, results }, lng);
        const nm = (id) => lc.byId.get(id).name;
        const sfx = lng === 'he' ? '' : '&l=en';
        // The row's numbers in sort order; the red-line part only when the party declared red lines.
        const rowText = (x, c, own) => [
          own ? T.closest.redLines(c.redLines.length, c.redLines.map((r) => lc.topics.find((t) => t.id === r.topicId).short).join(', ')) : null,
          T.closest.xClash(c.xClash, nm(x)), T.closest.wholeClash(c.wholeClash), T.closest.agree(c.agree), T.closest.seats(c.seats)].filter(Boolean);
        const sheetState = `(() => { const s = document.querySelector('#sheet'); if (!s.open) return null;
          const rows = (root) => [...(root?.querySelectorAll('[data-act="closest-apply"]') ?? [])].map((b) => ({ ids: b.dataset.ids, text: b.innerText.replace(/\\s+/g, ' '), warn: b.querySelector('.tag-warn') !== null }));
          const src = s.querySelector('.seat-src'); const first = s.querySelector('[data-act="closest-apply"]'); const part = s.querySelector('#closest-partial-list');
          const toggle = s.querySelector('[data-act="closest-partial"]');
          return { title: s.querySelector('h2')?.innerText, focus: document.activeElement === s.querySelector('h2'),
            src: src?.innerText ?? '', srcFirst: Boolean(src && first && (src.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING)),
            srcVisible: Boolean(src) && src.getBoundingClientRect().top >= 0 && src.getBoundingClientRect().bottom <= innerHeight,
            full: rows(s.querySelector('.sheet-inner > .closest-list')), partial: part && !part.hidden ? rows(part) : null,
            toggle: toggle ? toggle.innerText.replace(/^[▸▾]\\s*/, '') + '|' + toggle.getAttribute('aria-expanded') : '',
            note: s.innerText.includes(${JSON.stringify(T.closest.partialNote)}), text: s.innerText.replace(/\\s+/g, ' '),
            overflow: s.scrollWidth > s.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1 }; })()`;
        const check = async (tag, x, st) => {
          const want = closestTo(lc, x);
          const silent = [...new Set(want.partial.flatMap((c) => c.low.map((l) => l.partyId)))].sort((a, b) => lc.order.get(a) - lc.order.get(b)).map(nm);
          if (!st) { errors.push(`[${tag}] the closest-coalitions sheet did not open`); return want; }
          if (st.title !== T.closest.title(nm(x))) errors.push(`[${tag}] title "${st.title}"`);
          if (!st.src.includes(lng === 'he' ? meta.resultsStatus : meta.en.resultsStatus) || !st.srcFirst || !st.srcVisible) errors.push(`[${tag}] the results status line must come first and be visible`);
          if (st.full.map((r) => r.ids).join('|') !== want.full.slice(0, 5).map((c) => c.add.join(',')).join('|')) errors.push(`[${tag}] main rows ${st.full.map((r) => r.ids).join('|')}`);
          st.full.forEach((r, i) => {
            let at = 0;
            for (const t of rowText(x, want.full[i], want.ownRedLines > 0)) {
              const k = r.text.indexOf(t, at);
              if (k < 0) { errors.push(`[${tag}] row ${r.ids}: "${t}" missing or out of sort order in "${r.text}"`); break; }
              at = k + t.length;
            }
            if (!want.ownRedLines && r.text.includes(T.closest.redLines(0, ''))) errors.push(`[${tag}] row ${r.ids} shows red lines for a party that declared none`);
            if (r.warn) errors.push(`[${tag}] main-list row ${r.ids} has a missing-data warning`);
          });
          if (want.partial.length) {
            if (st.partial !== null) errors.push(`[${tag}] the list with silent partners should be collapsed on load`);
            if (st.toggle !== `${T.closest.showPartial(want.partial.length, T.closest.orList(silent))}|false`) errors.push(`[${tag}] toggle "${st.toggle}"`);
            if (silent.includes(nm(x)) || st.toggle.includes(nm(x))) errors.push(`[${tag}] the toggle must not name the party itself`);
            if (!st.note) errors.push(`[${tag}] the partial-comparison sentence is missing`);
          }
          if (st.overflow) errors.push(`[${tag}] horizontal overflow in the sheet`);
          return want;
        };
        // The method page states the rule.
        await go(`${baseUrl}#method${lng === 'he' ? '' : '?l=en'}`);
        await waitFor(() => evaluate("document.querySelector('#method h1') !== null"));
        // #32: an intro, then a real <ul> of what is included and a real <ol> of the sort order, then the closing rules.
        const rule = await evaluate(`(() => { const b = document.querySelector('#closest-rule')?.nextElementSibling; if (!b || b.id !== 'closest-rule-body') return null; const t = (e) => e.innerText.replace(/\\s+/g, ' ').trim();
          return { kids: [...b.children].map((e) => e.tagName.toLowerCase()), intro: t(b.querySelector('.rule-intro')), heads: [...b.querySelectorAll('h4')].map(t),
            ul: [...b.querySelectorAll('ul.rule-list > li')].map(t), ol: [...b.querySelectorAll('ol.rule-steps > li')].map(t), after: [...b.querySelectorAll('.rule-after')].map(t),
            inline: b.querySelectorAll('[style]').length }; })()`);
        const R = T.method.closestRule;
        const wantRule = { kids: ['p', 'h4', 'ul', 'h4', 'p', 'ol', ...R.after.map(() => 'p')], intro: R.intro, heads: [R.includedTitle, R.orderTitle], ul: R.included,
          ol: R.order, after: R.after, inline: 0 };
        if (R.included.length !== 4 || R.order.length !== 6) errors.push(`[closest-${lng}] the rule should have 4 bullets and 6 steps`);
        if (JSON.stringify(rule) !== JSON.stringify(wantRule)) errors.push(`[closest-${lng}] the method page's closest-coalitions rule: ${JSON.stringify(rule)}`);
        for (const size of [SIZES[0], { tag: 's', width: 375, height: 667, mobile: true, dpr: 2 }]) {
          await setSize(size);
          const tag = `closest-${lng}@${size.width}`;
          // Likud, from its party sheet.
          await go(`${baseUrl}#results?m=likud,yashar${sfx}`);
          await waitFor(() => evaluate("document.querySelector('.party-btn[data-id=\"likud\"]') !== null"));
          await evaluate("document.querySelector('.party-btn[data-id=\"likud\"]').click()");
          await settle(250);
          await evaluate("document.querySelector('#sheet [data-act=\"closest\"]').click()");
          await settle(300);
          let st = await evaluate(sheetState);
          const want = await check(tag, 'likud', st);
          if (st && !st.focus) errors.push(`[${tag}] focus should move to the list's heading`);
          if (size === SIZES[0]) await shoot(size, `interaction-closest-m${lng === 'he' ? '' : '-en'}.png`, false);
          if (lng === 'en') { const hebrew = await evaluate(HEBREW_OUTSIDE); if (hebrew) errors.push(`[${tag}] Hebrew outside lang="he": ${hebrew}`); }
          // Expand the silent-partner list, then both "show all".
          await evaluate("document.querySelector('#sheet [data-act=\"closest-partial\"]').click()");
          await settle(200);
          st = await evaluate(sheetState);
          if (!st.partial || st.partial.map((r) => r.ids).join('|') !== want.partial.slice(0, 5).map((c) => c.add.join(',')).join('|')) errors.push(`[${tag}] expanded partial rows ${st.partial?.map((r) => r.ids).join('|')}`);
          if (st.partial && !st.partial.every((r) => r.warn)) errors.push(`[${tag}] every row with a silent partner needs its warning`);
          if (!st.toggle.endsWith('|true')) errors.push(`[${tag}] the toggle should report aria-expanded=true`);
          if (size === SIZES[0]) await shoot(size, `interaction-closest-partial-m${lng === 'he' ? '' : '-en'}.png`, false);
          for (const act of ['closest-all', 'closest-partial-all']) await evaluate(`document.querySelector('#sheet [data-act="${act}"]')?.click()`);
          await settle(200);
          st = await evaluate(sheetState);
          if (st.full.length !== want.full.length || st.partial?.length !== want.partial.length) errors.push(`[${tag}] "show all" should list ${want.full.length} + ${want.partial.length}, got ${st.full.length} + ${st.partial?.length}`);
          if (st.full.map((r) => r.ids).join('|') !== want.full.map((c) => c.add.join(',')).join('|')) errors.push(`[${tag}] expanded main rows are out of order`);
          if (st.overflow) errors.push(`[${tag}] horizontal overflow with every row shown`);
          // The sheet's bar stays at the top while scrolling: back at the start, close (44px+, round) at the end.
          await evaluate("document.querySelector('#sheet').scrollTop = document.querySelector('#sheet').scrollHeight / 2");
          await settle(200);
          const bar = await evaluate(`(() => { const s = document.querySelector('#sheet').getBoundingClientRect(); const h = document.querySelector('#sheet .sheet-head');
            const back = h?.querySelector('[data-act="closest-back"]')?.getBoundingClientRect(); const x = h?.querySelector('.sheet-close')?.getBoundingClientRect();
            if (!h || !back || !x) return 'missing';
            if (document.querySelector('#sheet').scrollTop < 200) return 'did not scroll';
            if (Math.abs(h.getBoundingClientRect().top - s.top) > 1) return 'bar not at the top: ' + Math.round(h.getBoundingClientRect().top - s.top);
            if (x.width < 44 || x.height < 44) return 'close ' + x.width + 'x' + x.height;
            const rtl = document.dir === 'rtl'; if (rtl ? !(back.left > x.right) : !(back.right < x.left)) return 'back and close on the wrong sides';
            return 'ok'; })()`);
          if (bar !== 'ok') errors.push(`[${tag}] sticky sheet bar: ${bar}`);
          if (size === SIZES[0]) await shoot(size, `interaction-closest-scrolled-m${lng === 'he' ? '' : '-en'}.png`, false);
          // Tapping the first row selects it, with Likud as the base, on the results view; undo restores.
          const before = await frag();
          await evaluate("document.querySelector('#sheet [data-act=\"closest-apply\"]').click()");
          await settle(400);
          const wantHash = locationFor(ctx, { base: 'likud', members: ['likud', ...want.full[0].add], supporters: [], abstainers: [] }, 'results', '', lng);
          const got = await evaluate("JSON.stringify([location.hash, document.body.dataset.view, document.querySelector('#sheet').open])");
          if (got !== JSON.stringify([wantHash, 'results', false])) errors.push(`[${tag}] tapping a row should select it on #results (${got}, want ${wantHash})`);
          await evaluate("document.querySelector('#results-undo [data-act=\"undo\"]').click()");
          await settle(300);
          if ((await frag()) !== before) errors.push(`[${tag}] undo did not restore the coalition`);
          // Shas: its own coverage note above the list, and never in its own toggle.
          await go(`${baseUrl}#results?m=likud,shas${sfx}`);
          await waitFor(() => evaluate("document.querySelector('.party-btn[data-id=\"shas\"]') !== null"));
          await evaluate("document.querySelector('.party-btn[data-id=\"shas\"]').click()");
          await settle(250);
          await evaluate("document.querySelector('#sheet [data-act=\"closest\"]').click()");
          await settle(300);
          st = await evaluate(sheetState);
          const shas = await check(`${tag}-shas`, 'shas', st);
          if (st && !st.text.includes(T.closest.ownCoverage(T.toParty(nm('shas')), shas.ownCoverage))) errors.push(`[${tag}-shas] the party's own coverage note is missing`);
          // "How is this calculated?" closes the sheet and lands on the rule on the method page.
          await evaluate(`[...document.querySelectorAll('#sheet a[href="#closest-rule"]')].find((a) => a.innerText === ${JSON.stringify(T.closest.howLink)})?.click()`);
          await settle(400);
          const how = await evaluate("JSON.stringify([document.querySelector('#sheet').open, document.body.dataset.view, (() => { const r = document.querySelector('#closest-rule')?.getBoundingClientRect(); return Boolean(r) && r.top >= 0 && r.top < innerHeight / 2; })(), document.documentElement.lang])");
          if (how !== JSON.stringify([false, 'method', true, lng])) errors.push(`[${tag}] the method link should close the sheet and show the rule (${how})`);
          // The build-view picker opens the same list (Yisrael Beytenu: its red lines lead the order) and resets.
          await go(`${baseUrl}#build${lng === 'he' ? '' : '?l=en'}`);
          await ready();
          await evaluate("(() => { const s = document.querySelector('[data-act=\"closest-pick\"]'); s.value = 'yisrael-beiteinu'; s.dispatchEvent(new Event('change', { bubbles: true })); })()");
          await settle(300);
          st = await evaluate(sheetState);
          await check(`${tag}-picker`, 'yisrael-beiteinu', st);
          if ((await evaluate("document.querySelector('[data-act=\"closest-pick\"]').value")) !== '') errors.push(`[${tag}-picker] the picker should reset (no preselected party)`);
          if (size === SIZES[0] && lng === 'he') await shoot(size, 'interaction-closest-picker-m.png', false);
          await evaluate("document.querySelector('#sheet').close()");
        }
      }
      await setSize(z);
      log('  ✓ closest coalitions');
    } else {
      await go(`${baseUrl}#results?m=likud,yashar`);
      await waitFor(() => evaluate("document.querySelector('.party-btn[data-id=\"likud\"]') !== null"));
      await evaluate("document.querySelector('.party-btn[data-id=\"likud\"]').click()");
      await settle(250);
      if (await evaluate("document.querySelector('[data-act=\"closest\"], [data-act=\"closest-pick\"]') !== null")) errors.push('[interaction] closest coalitions must not appear in polls mode');
      await go(`${baseUrl}#method`);
      await waitFor(() => evaluate("document.querySelector('#method h1') !== null"));
      if (await evaluate("document.querySelector('#closest-rule') !== null")) errors.push('[interaction] the closest-coalitions rule must not appear on the method page in polls mode');
      await evaluate("document.querySelector('#sheet').close()");
    }
  }

  const qsOf = (members) => serializeState(ctx, { base: null, members });
  if (sec('cells')) {
    await setSize(z);
    // A cell sheet with a quote renders it in quotation marks with an attribution line underneath.
    const withQuote = JSON.parse(readFileSync(join(ROOT, 'site', 'data', 'positions.json'), 'utf8')).find((p) => p.quote && p.quoteBy && p.sourceDate);
    await go(`${baseUrl}#results?m=${withQuote.partyId},together`);
    await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.cell').length > 0"));
    await evaluate(`document.querySelector('.cell[data-party="${withQuote.partyId}"][data-topic="${withQuote.topicId}"]').click()`);
    await settle(300);
    const q = await evaluate("(() => { const b = document.querySelector('#sheet blockquote'); return b ? { text: b.querySelector('.q-text')?.textContent, by: b.querySelector('.q-by')?.textContent } : null; })()");
    if (!q || !/^״.+״$/.test(q.text ?? '')) errors.push(`[interaction] quote must be wrapped in quotation marks (${JSON.stringify(q)})`);
    if (!q || !q.by.startsWith(withQuote.quoteBy) || !/\d{2}\.\d{2}\.\d{4}$/.test(q.by)) errors.push(`[interaction] quote attribution should read "<speaker>, <channel>, <date>" (${q?.by})`);
    await shoot(z, 'interaction-cell-quote-m.png', false);
    // Null rows show what was found: the "no stated position" label, the quote with its attribution, and the source; a dated
    // note from an older platform links its source as the additional source.
    for (const [lng, T, by] of [['he', S, 'משה פייגלין, ערוץ 7, 02.07.2026'], ['en', EN, 'Moshe Feiglin, Arutz Sheva (Israel National News), 2 Jul 2026']]) {
      const l = lng === 'he' ? '' : '&l=en';
      await go(`${baseUrl}#results?m=likud,zehut${l}`);
      await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.cell').length > 0"));
      await evaluate("document.querySelector('.cell[data-party=\"zehut\"][data-topic=\"inquiry\"]').click()");
      await settle(300);
      const nr = await evaluate("(() => { const s = document.querySelector('#sheet'); return { label: s.querySelector('.pos-label')?.textContent.trim() ?? '', quote: s.querySelector('blockquote .q-text')?.textContent ?? '', by: s.querySelector('blockquote .q-by')?.textContent.trim() ?? '', src: s.querySelector('.pos .source a')?.href ?? '', tag: s.querySelector('.pos .tag-src') !== null }; })()");
      if (nr.label !== T.sheet.noPositionLabel || !nr.quote.includes('אני כלל לא מרגיש צורך בוועדת חקירה') || nr.by !== by || nr.src !== 'https://www.inn.co.il/news/700562' || nr.tag) {
        errors.push(`[interaction-${lng}] zehut × inquiry sheet should show the label, quote, "${by}" and the source, with no type tag (${JSON.stringify(nr)})`);
      }
      await shoot(z, `interaction-null-quote-m${lng === 'he' ? '' : '-en'}.png`, false);
      await evaluate("document.querySelector('#sheet').close()");
      await go(`${baseUrl}#results?m=raam,likud${l}`);
      await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.cell').length > 0"));
      await evaluate("document.querySelector('.cell[data-party=\"raam\"][data-topic=\"religion\"]').click()");
      await settle(300);
      const rel = await evaluate("(() => { const p = document.querySelector('#sheet .pos'); return { quote: p?.querySelector('blockquote .q-text')?.textContent ?? '', by: p?.querySelector('blockquote .q-by')?.textContent.trim() ?? '', tag: p?.querySelector('.tag-src') !== null }; })()");
      const relBy = lng === 'he' ? 'מנסור עבאס, פייסבוק, 26.08.2026 (תרגום: כיפה)' : 'Mansour Abbas, Facebook, 26 Aug 2026 (Hebrew translation: Kipa)';
      if (!rel.quote.includes('נאלצו לקבל זאת מבחינה מעשית') || rel.by !== relBy || rel.tag) errors.push(`[interaction-${lng}] רע״ם × דת should show the full quote (with the practical acceptance) and "${relBy}", with no type tag (${JSON.stringify(rel)})`);
      await evaluate("document.querySelector('#sheet').close()");
      await evaluate("document.querySelector('.cell[data-party=\"raam\"][data-topic=\"draft\"]').click()");
      await settle(300);
      const note = await evaluate("(() => { const p = document.querySelector('#sheet .pos'); return { text: p?.innerText ?? '', links: [...(p?.querySelectorAll('.source a') ?? [])].map((a) => a.href) }; })()");
      const year = lng === 'he' ? "במצע הרשימה מ-1999 נכתב: 'דחיית גיוסם של הערבים בצה״ל'." : "The list's 1999 platform says: 'rejection of the conscription of Arabs into the IDF'.";
      if (!note.text.includes(year) || !note.links.includes('https://www.idi.org.il/media/16883/%D7%A8%D7%A2%D7%9E-1999.pdf')) errors.push(`[interaction-${lng}] רע״ם × גיוס should carry the dated 1999 note and link the IDI copy (${JSON.stringify(note.links)})`);
      await shoot(z, `interaction-dated-note-m${lng === 'he' ? '' : '-en'}.png`, false);
      await evaluate("document.querySelector('#sheet').close()");
      // The four dated notes from older platforms (approved 3.11): the year and document type, and the IDI copy linked.
      // Cells with no current source take the IDI copy as their source, dated by the year alone.
      const IDI = { otzma: 'https://www.idi.org.il/media/13907/', utj: 'https://www.idi.org.il/media/16889/', shas: 'https://www.idi.org.il/media/6856/' };
      for (const [pid, tid, he, en, idi, year] of [
        ['otzma-yehudit', 'religion', 'במסמך העקרונות של עוצמה יהודית מ-2020 נכתב:', "Otzma Yehudit's 2020 statement of principles says:", IDI.otzma, null],
        ['utj', 'palestinian', 'במצע יהדות התורה מ-1999 נכתב:', "United Torah Judaism's 1999 platform says:", IDI.utj, '1999'],
        ['shas', 'economy', 'במסמך העקרונות של ש״ס מ-2006 נכתב:', "Shas's 2006 statement of principles says:", IDI.shas, '2006'],
        ['utj', 'economy', 'במצע יהדות התורה מ-1999 נכתב:', "United Torah Judaism's 1999 platform says:", IDI.utj, '1999'],
      ]) {
        await go(`${baseUrl}#results?m=${pid},likud${l}`);
        await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.cell').length > 0"));
        await evaluate(`document.querySelector('.cell[data-party="${pid}"][data-topic="${tid}"]').click()`);
        await settle(300);
        const d = await evaluate("(() => { const p = document.querySelector('#sheet .pos'); return { label: p?.querySelector('.pos-label')?.textContent.trim() ?? '', text: p?.innerText ?? '', links: [...(p?.querySelectorAll('.source a') ?? [])].map((a) => a.href), date: p?.querySelector('.source .muted')?.textContent.trim() ?? '' }; })()");
        const wantDate = year ? (lng === 'he' ? `משנת ${year}` : `from ${year}`) : '';
        if (d.label !== T.sheet.noPositionLabel || !d.text.includes(lng === 'he' ? he : en) || !d.links.some((h) => h.startsWith(idi)) || (year && d.date !== wantDate)) {
          errors.push(`[interaction-${lng}] ${pid} × ${tid}: expected the dated note, the IDI link${year ? ` and "${wantDate}"` : ''} (${JSON.stringify({ ...d, text: d.text.slice(-160) })})`);
        }
        if (pid === 'utj' && tid === 'palestinian') await shoot(z, `interaction-dated-platform-m${lng === 'he' ? '' : '-en'}.png`, false);
        await evaluate("document.querySelector('#sheet').close()");
      }
    }
    // Arabic quotes keep the original and add a marked Hebrew translation under it.
    await go(`${baseUrl}#results?m=raam,together`);
    await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.cell').length > 0"));
    await evaluate('document.querySelector(\'.cell[data-party="raam"][data-topic="palestinian"]\').click()');
    await settle(300);
    const ar = await evaluate("(() => { const q = [...document.querySelectorAll('#sheet blockquote .q-text')]; return q.map((e) => e.textContent).join(' | '); })()");
    if (!/[\u0600-\u06FF]/.test(ar) || !ar.includes('(תרגום חופשי של האתר)')) errors.push(`[interaction] Arabic quote must show the original plus a marked translation (${ar})`);
    log('  ✓ cell sheets: quotes, null rows, dated notes, Arabic');
  }
  if (sec('fragment')) {
    await setSize(z);
    // The fragment keeps the coalition through nav links and history; a link pasted into the same tab (a fragment-only
    // change, no reload) brings its own coalition.
    await go(`${baseUrl}#results?m=likud,yashar`);
    await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelector('#footer')?.children.length > 0"));
    await evaluate("window.smokeNoReload = true; document.querySelector('#nav-method').click()");
    await settle(300);
    if ((await evaluate('location.hash')) !== `#method${qsOf(['likud', 'yashar'])}`) errors.push(`[interaction] the method link should keep the coalition in the fragment (${await evaluate('location.hash')})`);
    await evaluate('history.back()');
    await settle(400);
    if ((await evaluate('location.hash + "|" + document.body.dataset.view')) !== `#results${qsOf(['likud', 'yashar'])}|results`) errors.push(`[interaction] back should return to the same coalition's results (${await evaluate('location.hash')})`);
    await evaluate("location.hash = '#results?m=together,democrats'");
    await settle(400);
    const pasted = await evaluate("({ hash: location.hash, line: document.querySelector('#results-coalition').innerText, same: window.smokeNoReload === true })");
    const pastedNames = ['together', 'democrats'].map((id) => ctx.byId.get(id).name);
    if (pasted.hash !== `#results${qsOf(['together', 'democrats'])}` || !pasted.same || !pastedNames.every((n) => pasted.line.includes(n)) || pasted.line.includes(ctx.byId.get('likud').name)) {
      errors.push(`[interaction] a pasted fragment should replace the coalition without a reload (${JSON.stringify(pasted)})`);
    }
    log('  ✓ fragment state: nav links, history, a pasted link');
  }

  // English (#3): every case again with l=en (old-format links are Hebrew-only). The Hebrew pass covers the logic; this
  // one checks the language: lang/dir and title, the translation notice, no Hebrew outside lang="he", the source line
  // before the seats, the same investiture numbers, and links that keep l=en.
  const withLang = (suffix) => { const { search, hash } = splitSuffix(suffix); const h = hash || '#build'; return `${search}${h}${h.includes('?') ? '&' : '?'}l=en`; };
  const enCases = cases.filter(([, suffix]) => !isLegacy(suffix)).map(([name, suffix, v]) => [name, withLang(suffix), v]);
  const EN_SRC = RESULTS ? meta.en.resultsStatus : legal;
  // The language switch: both names, the current one first as plain text (aria-current), the other a button, each with
  // its own lang; set off from the nav; and the header (logo, nav link, switch) on one line (up to 56px tall with the
  // links' tap padding; a wrapped line is 60px or more).
  const SWITCH_CHECK = (cur) => `(() => { const sw = document.querySelector('#lang-switch'); const items = [...sw.querySelectorAll('strong, button')];
    const got = items.map((e) => e.tagName + ':' + e.lang + ':' + (e.getAttribute('aria-current') || '')).join(' ');
    const want = ${JSON.stringify(cur === 'en' ? 'STRONG:en:true BUTTON:he:' : 'STRONG:he:true BUTTON:en:')};
    if (got !== want) return 'items ' + got;
    if (parseFloat(getComputedStyle(sw).borderInlineStartWidth) < 1) return 'no divider from the nav';
    const rows = ['#brand-name', '#nav-method', '#lang-switch'].map((q) => document.querySelector(q).getBoundingClientRect());
    const mid = (r) => r.top + r.height / 2;
    if (rows.some((r) => Math.abs(mid(r) - mid(rows[0])) > 8 || r.height > 56)) return 'header wraps: ' + rows.map((r) => Math.round(r.top) + '/' + Math.round(r.height)).join(' ');
    return 'ok'; })()`;
  const EN_POLL_TEXT = /\bseats?\b|\bpolls?\b|at the threshold|of 61|\(61\+\)|≈\d/i;
  if (sec('en-views')) for (const z2 of VIEW_SIZES) {
    await setSize(z2);
    for (const [name, suffix, expectView] of enCases) {
      step(`en-${name}@${z2.width}`);
      await go(baseUrl + suffix);
      await waitFor(() => evaluate("document.body.dataset.view !== undefined && document.querySelector('#footer')?.children.length > 0"));
      await settle(250);
      const page = await evaluate(`JSON.stringify({ view: document.body.dataset.view, lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.title,
        note: document.querySelector('#lang-note').hidden ? '' : document.querySelector('#lang-note').innerText.trim(), url: location.search + location.hash,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1 })`).then(JSON.parse);
      if (page.view !== expectView) errors.push(`[${current}] expected view "${expectView}", got "${page.view}"`);
      if (page.lang !== 'en' || page.dir !== 'ltr') errors.push(`[${current}] expected lang=en dir=ltr, got ${page.lang}/${page.dir}`);
      if (page.title !== EN.pageTitle) errors.push(`[${current}] <title> should be "${EN.pageTitle}", got "${page.title}"`);
      if (page.note !== EN.translatedNote) errors.push(`[${current}] the translation notice is missing (${page.note})`);
      if (page.overflow) errors.push(`[${current}] horizontal page overflow`);
      const exp = parseLocation(splitSuffix(suffix), passedIds);
      const token = ['build', 'results', 'method', 'why', 'privacy', 'accessibility'].includes(exp.route) ? exp.route : expectView;
      const wantUrl = locationFor(ctx, exp.state, token, exp.search, 'en');
      if (page.url !== wantUrl) errors.push(`[${current}] URL should settle on "${wantUrl}", got "${page.url}"`);
      const hebrew = await evaluate(HEBREW_OUTSIDE);
      if (hebrew) errors.push(`[${current}] Hebrew text outside lang="he" (untranslated?): ${hebrew}`);
      const sw = await evaluate(SWITCH_CHECK('en'));
      if (sw !== 'ok') errors.push(`[${current}] language switch: ${sw}`);
      if (expectView === 'method') for (const e of downloadErrors('en', await evaluate(DOWNLOAD_JS))) errors.push(`[${current}] download: ${e}`);
      if (SEATS_HIDDEN) {
        const seatText = await evaluate(`(document.body.innerText.match(${EN_POLL_TEXT}) || [])[0] || ''`);
        if (seatText) errors.push(`[${current}] showSeats is off but poll-derived text is visible: "${seatText}"`);
      } else if (expectView === 'build') {
        const box = await evaluate(`(() => { const b = document.querySelector('#builder .seats-box'); if (!b) return 'missing box'; if (!b.innerText.replace(/\\s+/g, ' ').includes(${JSON.stringify(EN_SRC)})) return 'source line missing';
          const l = b.querySelector('${SRC_SEL}'), sl = b.querySelector('.seats-line'); return l.compareDocumentPosition(sl) & Node.DOCUMENT_POSITION_FOLLOWING ? 'ok' : 'source line must come before the numbers'; })()`);
        if (box !== 'ok') errors.push(`[${current}] seats box: ${box}`);
      }
      if (expectView === 'results' && !SEATS_HIDDEN && members_in_url(suffix) && name !== 'results-single') {
        const vote = await evaluate(`(() => { const o = document.querySelector('#results .overall'); if (!o) return 'no summary'; const t = o.innerText.replace(/\\s+/g, ' ');
          if (!t.includes(${JSON.stringify(EN_SRC)})) return 'source line missing';
          const m = t.match(/For ≈?(\\d+) · Against ≈?(\\d+) · Abstaining ≈?(\\d+)/); return m ? m.slice(1).join(',') : 'vote line missing'; })()`);
        if (!/^\d+,\d+,\d+$/.test(vote)) errors.push(`[${current}] investiture: ${vote}`);
        if (RESULTS && name === 'results-roles' && vote !== '59,46,15') errors.push(`[${current}] expected For 59 · Against 46 · Abstaining 15, got ${vote}`);
      }
      if (expectView === 'results') {
        const wa = await evaluate("document.querySelector('#results a[href^=\"https://wa.me/\"]')?.href || ''");
        const wantShare = baseUrl + locationFor(ctx, exp.state, 'results', '', 'en');
        const text = wa ? new URL(wa).searchParams.get('text') : '';
        if (wa && (!text.endsWith(`\n${wantShare}`) || !text.startsWith('The coalition I built: '))) errors.push(`[${current}] English WhatsApp text should start "The coalition I built:" and end with ${wantShare} (${text})`);
        if (!SEATS_HIDDEN) {
          const got = await evaluate(PIVOTAL_JS);
          const want = exp.state.members.length && investiture(posCtx.en, exp.state).approved ? pivotalText('en', exp.state) : null;
          if (JSON.stringify(got) !== JSON.stringify(want)) errors.push(`[${current}] English pivotal rows: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
          if (RESULTS && name === 'results-scenario-arab' && !got?.includes("If Ra'am votes against: 59 vs 61")) errors.push(`[${current}] expected "If Ra'am votes against: 59 vs 61"`);
        } else if (await evaluate("document.querySelector('.pivotal') !== null")) errors.push(`[${current}] showSeats is off but the pivotal rows are shown`);
        if (exp.state.members.length) for (const e of cardErrors('en', exp.state, await evaluate(CARD_JS))) errors.push(`[${current}] English: ${e}`);
        if (exp.state.members.length >= 2) {
          const got = await evaluate(REDLINES_JS);
          const want = redLinesText('en', exp.state.members);
          if (got !== want) errors.push(`[${current}] English red-line line should be "${want}", got "${got}"`);
        }
        if (wa) {
          const want = shareTextFor('en', exp.state);
          if (!text.startsWith(`${want}\n`)) errors.push(`[${current}] English share text should be "${want}", got "${text}"`);
        }
      }
      await shoot(z2, `${name}-${z2.tag}-en.png`);
    }
    log(`  ✓ English, ${z2.width}px: ${enCases.length} views`);
  }

  // English interactions at phone width: the toggle (both ways, keeping the coalition, the view and focus), a nav link,
  // a pasted English link, and cell sheets with quotes in Hebrew and Arabic.
  if (sec('en-interaction')) {
    await setSize(SIZES[0]);
    step('en-interaction@390');
    await go(`${baseUrl}#results?m=likud,yashar`);
    await waitFor(() => evaluate("document.body.dataset.view === 'results'"));
    await evaluate('window.smokeSameDoc = true');
    const state = () => evaluate("JSON.stringify([document.documentElement.lang, location.hash, document.activeElement?.dataset?.key || '', document.querySelector('#results-coalition').innerText.includes(" + JSON.stringify(parties.find((p) => p.id === 'likud').en.name) + "), window.smokeSameDoc === true])");
    for (const z3 of SIZES) {
      await setSize(z3);
      const sw = await evaluate(SWITCH_CHECK('he'));
      if (sw !== 'ok') errors.push(`[${current}] Hebrew language switch at ${z3.width}: ${sw}`);
    }
    await setSize(SIZES[0]);
    await evaluate("document.querySelector('#lang-switch button').focus(); document.querySelector('#lang-switch button').click()");
    await settle(300);
    if (await state() !== JSON.stringify(['en', `#results${qsOf(['likud', 'yashar'])}&l=en`, 'lang-switch', true, true])) errors.push(`[${current}] the toggle should switch to English in place, keeping the coalition and focus (${await state()})`);
    await evaluate("document.querySelector('#nav-method').click()");
    await settle(300);
    if ((await evaluate('location.hash')) !== `#method${qsOf(['likud', 'yashar'])}&l=en`) errors.push(`[${current}] a nav link should keep l=en (${await evaluate('location.hash')})`);
    await evaluate("history.back()");
    await settle(300);
    await evaluate("document.querySelector('#lang-switch button').click()");
    await settle(300);
    if ((await evaluate("document.documentElement.lang + location.hash")) !== `he#results${qsOf(['likud', 'yashar'])}`) errors.push(`[${current}] the toggle should switch back to Hebrew and drop l= (${await evaluate('location.hash')})`);
    await evaluate("location.hash = '#results?m=together,democrats&l=en'");
    await settle(400);
    const pastedEn = await evaluate("JSON.stringify([document.documentElement.lang, document.querySelector('#results-coalition').innerText, window.smokeSameDoc === true])");
    if (!pastedEn.startsWith('["en",') || !pastedEn.includes('Beyachad') || !pastedEn.endsWith('true]')) errors.push(`[${current}] a pasted English link should switch the language and coalition without a reload (${pastedEn})`);
    for (const [m, pid, tid, ql] of [['yashar,likud', 'yashar', 'draft', 'he'], ['likud,raam', 'raam', 'palestinian', 'ar']]) {
      await go(`${baseUrl}#results?m=${m}&l=en`);
      await waitFor(() => evaluate("document.querySelector('[data-act=\"cell\"]') !== null"));
      await evaluate(`document.querySelector('[data-act="cell"][data-party="${pid}"][data-topic="${tid}"]').click()`);
      await settle(300);
      const sheet = await evaluate(`(() => { const s = document.querySelector('#sheet'); if (!s.open) return 'not open';
        const q = s.querySelector('blockquote .q-text'); const t = s.querySelector('blockquote .q-trans'); const mail = s.querySelector('.correction a')?.href ?? '';
        return JSON.stringify([q?.lang, t?.innerText.endsWith(${JSON.stringify(EN.sheet.siteTranslation)}), new URL(mail).searchParams.get('subject')?.startsWith('Correction: ')]); })()`);
      if (sheet !== JSON.stringify([ql, true, true])) errors.push(`[${current}] ${pid}|${tid} sheet: the quote must stay in its language (${ql}) with the site's translation and an English correction mail (${sheet})`);
      const hebrew = await evaluate(HEBREW_OUTSIDE);
      if (hebrew) errors.push(`[${current}] ${pid}|${tid} sheet: Hebrew text outside lang="he": ${hebrew}`);
    }
    log('  ✓ English interactions');
  }

  // Pair view (#23), every mode, both languages, at 360, 375 and 390: the build view's entry opens #pair with focus on its
  // heading; two pickers that never offer the same party twice; all topics in topic order with the summary, the 🚩 tags
  // and a null cell's dated note; no seat numbers; no horizontal scroll with every row open; a share link carrying the
  // pair and the language only. Then: a fresh load of that link, p=x,x, the coalition kept around the view, the
  // toggle, lists under the threshold (results) and the soft-linked note (polls only).
  if (sec('pair')) {
    const nameIn = (lng, id) => posCtx[lng].byId.get(id).name;
    const pairWant = (lng, a, b) => {
      const T = lng === 'he' ? S : EN;
      const s = pairSummary(posCtx[lng], a, b);
      const sum = T.pair.summary(s.counts.AGREE, s.counts.MINOR, s.counts.MAJOR, s.counts.CLASH, s.n);
      return { sum, share: T.pair.shareText(nameIn(lng, a), nameIn(lng, b), sum) };
    };
    const pick = (slot, id) => evaluate(`(() => { const s = document.querySelector('#pair-view [data-act="pair-pick"][data-slot="${slot}"]');
      s.focus(); s.value = ${JSON.stringify(id)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const options = (slot) => evaluate(`[...document.querySelectorAll('#pair-view [data-slot="${slot}"] option')].map((o) => o.value).filter(Boolean)`);
    const allIds = ctx.parties.map((p) => p.id);
    const orderedIds = [...passedIds, ...allIds.filter((id) => !passedIds.includes(id))];
    const [A, B] = ['utj', 'yisrael-beiteinu'];
    const draftIdx = topics.findIndex((t) => t.id === 'draft');
    const nullTopics = topics.filter((t) => loadData().positions.find((p) => p.partyId === A && p.topicId === t.id)?.position == null).map((t) => t.id);
    let n = 0;
    for (const w of [360, 375, 390]) {
      const zp = { tag: `p${w}`, width: w, height: w === 375 ? 667 : 800, mobile: true, dpr: 2 };
      await setSize(zp);
      for (const lng of ['he', 'en']) {
        const T = lng === 'he' ? S : EN;
        const L = lng === 'en' ? 'l=en' : '';
        step(`pair-${lng}@${w}`);
        await go(`${baseUrl}${L ? `#build?${L}` : ''}`);
        await ready();
        const entry = await evaluate(`(() => { const a = document.querySelector('#tasks a[href="#pair"]'); if (!a) return 'missing';
          const r = a.closest('.task').getBoundingClientRect(); return r.height >= 44 ? a.innerText.trim() : 'under 44px'; })()`);
        if (entry !== T.home.pair) errors.push(`[${current}] entry on the build view: expected "${T.home.pair}", got "${entry}"`);
        await evaluate("document.querySelector('#tasks a[href=\"#pair\"]').click()");
        await waitFor(() => evaluate("document.body.dataset.view === 'pair'"));
        await settle(200);
        const opened = await evaluate("JSON.stringify([location.hash, document.activeElement?.id, document.querySelector('#pair-view .empty')?.innerText.trim()])");
        if (opened !== JSON.stringify([`#pair${L ? `?${L}` : ''}`, 'pair-title', T.pair.pickBoth])) errors.push(`[${current}] opening the pair view: ${opened}`);
        if (JSON.stringify(await options(0)) !== JSON.stringify(orderedIds)) errors.push(`[${current}] picker order: ${await options(0)}`);
        await pick(0, A);
        await settle(150);
        await pick(1, B);
        await settle(250);
        const want = pairWant(lng, A, B);
        const got = await evaluate(`JSON.stringify({ hash: location.hash, focus: document.activeElement?.dataset?.key, rows: document.querySelectorAll('#pair-view .pair-row').length,
          topicsInOrder: [...document.querySelectorAll('#pair-view .pair-topic')].map((e) => e.innerText.trim()),
          sum: document.querySelector('#pair-view .pair > .muted')?.innerText.trim(),
          redTags: document.querySelectorAll('#pair-view .pair-row')[${draftIdx}]?.querySelectorAll('summary .tag-red').length })`).then(JSON.parse);
        const wantGot = { hash: `#pair?p=${A},${B}${L ? `&${L}` : ''}`, focus: 'pair-pick-1', rows: topics.length, topicsInOrder: posCtx[lng].topics.map((t) => t.name), sum: want.sum, redTags: 2 };
        if (JSON.stringify(got) !== JSON.stringify(wantGot)) errors.push(`[${current}] pair view: expected ${JSON.stringify(wantGot)}, got ${JSON.stringify(got)}`);
        if ((await options(0)).includes(B) || (await options(1)).includes(A)) errors.push(`[${current}] a picker offers the party already picked in the other one`);
        // Every row open: the null cells say so and show their dated note; nothing overflows the page.
        await evaluate("document.querySelectorAll('#pair-view details').forEach((d) => { d.open = true; })");
        await settle(150);
        for (const tid of nullTopics) {
          const i = topics.findIndex((t) => t.id === tid);
          const p = posCtx[lng].idx.get(`${A}|${tid}`);
          const row = await evaluate(`(() => { const r = document.querySelectorAll('#pair-view .pair-row')[${i}]; return JSON.stringify([r.querySelector('summary .lv-NONE') !== null, r.querySelector('.pair-detail').innerText.replace(/\\s+/g, ' ').includes(${JSON.stringify(p.summary.replace(/\s+/g, ' ').slice(-60))})]); })()`);
          if (row !== '[true,true]') errors.push(`[${current}] ${A}|${tid}: the null cell must read "${T.levels.NONE.label}" and show what was found (${row})`);
        }
        if (lng === 'he' && !(await evaluate("document.querySelector('#pair-view').innerText.includes('במצע יהדות התורה מ-1999 נכתב')"))) errors.push(`[${current}] the dated note from the 1999 platform is missing`);
        const view = await evaluate(`(() => { const v = document.querySelector('#view-pair').cloneNode(true); v.querySelectorAll('.pair-detail, .pair-sum').forEach((e) => e.remove());
          const t = v.textContent; return JSON.stringify([document.documentElement.scrollWidth > innerWidth + 1, /מנדט|\\bseats?\\b/i.test(t), document.querySelector('#bar').hidden]); })()`);
        if (view !== '[false,false,true]') errors.push(`[${current}] [overflow, seat text, bar shown] should be [false,false,true]: ${view}`);
        if (lng === 'en') { const he = await evaluate(HEBREW_OUTSIDE); if (he) errors.push(`[${current}] Hebrew text outside lang="he": ${he}`); }
        const shareUrl = `${baseUrl}#pair?p=${A},${B}${L ? `&${L}` : ''}`;
        const wa = await evaluate("document.querySelector('#pair-view a[href^=\"https://wa.me/\"]')?.href || ''");
        const waText = wa ? new URL(wa).searchParams.get('text') : '';
        if (waText !== `${want.share}\n${shareUrl}`) errors.push(`[${current}] WhatsApp text should be "${want.share}\\n${shareUrl}", got "${waText}"`);
        await shoot(zp, `pair-${zp.tag}${lng === 'en' ? '-en' : ''}.png`);
        // A fresh load of the shared link shows the same pair.
        await go(shareUrl);
        await waitFor(() => evaluate("document.querySelectorAll('#pair-view .pair-row').length > 0"));
        const fresh = await evaluate("JSON.stringify([document.documentElement.lang, location.hash, [...document.querySelectorAll('#pair-view select')].map((s) => s.value), document.querySelector('#pair-view .pair > .muted')?.innerText.trim()])");
        if (fresh !== JSON.stringify([lng, `#pair?p=${A},${B}${L ? `&${L}` : ''}`, [A, B], want.sum])) errors.push(`[${current}] the shared link should open the same pair: ${fresh}`);
        n++;
      }
    }
    await setSize(SIZES[0]);
    step('pair-edges@390');
    // The same party twice is one; the second picker is empty and does not offer it.
    await go(`${baseUrl}#pair?p=likud,likud`);
    await waitFor(() => evaluate("document.body.dataset.view === 'pair' && document.querySelector('#pair-view select') !== null"));
    const twice = await evaluate("JSON.stringify([location.hash, [...document.querySelectorAll('#pair-view select')].map((s) => s.value), document.querySelector('#pair-view .pair-row') === null])");
    if (twice !== JSON.stringify(['#pair?p=likud', ['likud', ''], true]) || (await options(1)).includes('likud')) errors.push(`[${current}] p=likud,likud should settle on one party: ${twice}`);
    // The coalition stays in the fragment around the view, but never rides in the share link.
    await go(`${baseUrl}#build?m=likud,yashar`);
    await ready();
    await evaluate("document.querySelector('#tasks a[href=\"#pair\"]').click()");
    await waitFor(() => evaluate("document.body.dataset.view === 'pair'"));
    await pick(0, A);
    await pick(1, B);
    await settle(200);
    const kept = await evaluate("JSON.stringify([location.hash, new URL(document.querySelector('#pair-view a[href^=\"https://wa.me/\"]').href).searchParams.get('text').split('\\n')[1]])");
    if (kept !== JSON.stringify([`#pair${serializeState(ctx, { base: null, members: ['likud', 'yashar'] })}&p=${A},${B}`, `${baseUrl}#pair?p=${A},${B}`])) errors.push(`[${current}] coalition around the pair view: ${kept}`);
    // The toggle keeps the view and the pair; the back link returns to the builder with the coalition.
    await evaluate("document.querySelector('#lang-switch button').click()");
    await settle(300);
    const toggled = await evaluate("JSON.stringify([document.documentElement.lang, location.hash, document.querySelectorAll('#pair-view .pair-row').length])");
    if (toggled !== JSON.stringify(['en', `#pair${serializeState(ctx, { base: null, members: ['likud', 'yashar'] })}&p=${A},${B}&l=en`, topics.length])) errors.push(`[${current}] the toggle on the pair view: ${toggled}`);
    await evaluate("document.querySelector('#pair-view a.back').click()");
    await settle(300);
    const backTo = await evaluate("JSON.stringify([document.body.dataset.view, location.hash, document.querySelectorAll('#builder .prow.is-on').length])");
    if (backTo !== JSON.stringify(['build', `#build${serializeState(ctx, { base: null, members: ['likud', 'yashar'] })}&l=en`, 2])) errors.push(`[${current}] back to the builder: ${backTo}`);
    // Lists under the threshold: their own labelled group (results); a clash made by a red line explains itself.
    const below = allIds.filter((id) => !passedIds.includes(id));
    for (const lng of ['he', 'en']) {
      const T = lng === 'he' ? S : EN;
      step(`pair-edges-${lng}@390`);
      await go(`${baseUrl}#pair?p=amcha-yisrael,likud${lng === 'en' ? '&l=en' : ''}`);
      await waitFor(() => evaluate("document.querySelectorAll('#pair-view .pair-row').length > 0"));
      const group = await evaluate("JSON.stringify([...document.querySelectorAll('#pair-view [data-slot=\"1\"] optgroup')].map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.value)]))");
      const wantGroup = below.filter((id) => id !== 'amcha-yisrael').length ? [[T.elected.belowTitle, below.filter((id) => id !== 'amcha-yisrael')]] : [];
      if (group !== JSON.stringify(wantGroup)) errors.push(`[${current}] below-threshold group: expected ${JSON.stringify(wantGroup)}, got ${group}`);
      const note = await evaluate(`document.querySelectorAll('#pair-view .pair-row')[${draftIdx}].querySelector('.pair-detail').textContent.replace(/\\s+/g, ' ').includes(${JSON.stringify(T.sheet.redByLine(nameIn(lng, 'amcha-yisrael')))})`);
      if (!note) errors.push(`[${current}] the red-line note is missing from the draft row`);
      // הציונות הדתית / זהות: the soft-link note in polls mode only (with results they are separate parties).
      await go(`${baseUrl}#pair?p=religious-zionism,zehut${lng === 'en' ? '&l=en' : ''}`);
      await waitFor(() => evaluate("document.querySelectorAll('#pair-view .pair-row').length > 0"));
      const linked = await evaluate("document.querySelector('#pair-view .note-soft')?.innerText.trim() ?? null");
      const wantLinked = RESULTS ? null : T.builder.linkedNote(...['religious-zionism', 'zehut'].sort((a, b) => ctx.order.get(a) - ctx.order.get(b)).map((id) => nameIn(lng, id)));
      if (linked !== wantLinked) errors.push(`[${current}] soft-link note: expected ${JSON.stringify(wantLinked)}, got ${JSON.stringify(linked)}`);
    }
    log(`  ✓ pair view: ${n} runs (360/375/390 × he, en), edge cases`);
  }

  // Task cards (#26): right after the intro, in a fixed order, each title its control (cards 1 and 3 tappable as a whole).
  // First-screen fit (#26), with the purpose line's disclaimer always on screen:
  // - Hebrew: every card fully on screen at 375×667, 375×600 (a phone with real browser chrome) and 390×844.
  // - English: every card at 390×844; at 375×667 the last card's title fully on screen; at 375×600 the first two cards
  //   (English has more fixed text above the cards: the translation notice and longer intro and purpose lines).
  if (sec('tasks')) {
    await c.send('Accessibility.enable');
    const ax = async (sel) => {
      const { root } = await c.send('DOM.getDocument', { depth: 0 });
      const { nodeId } = await c.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
      if (!nodeId) return null;
      const { nodes } = await c.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
      return { name: nodes[0]?.name?.value ?? '', desc: nodes[0]?.description?.value ?? '' };
    };
    const tap = async (sel) => {
      const pt = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      for (const type of ['mousePressed', 'mouseReleased']) await c.send('Input.dispatchMouseEvent', { type, x: pt[0], y: pt[1], button: 'left', clickCount: 1 });
    };
    const key = async (k, code) => { for (const type of ['keyDown', 'keyUp']) await c.send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: code }); };
    const nameIn = (lng, id) => posCtx[lng].byId.get(id).name;
    const nTopics = topics.length;
    const layouts = [
      { w: 375, h: 667, lng: 'he', fit: 'all' }, { w: 375, h: 600, lng: 'he', fit: 'all' }, { w: 390, h: 844, lng: 'he', fit: 'all' }, { w: 360, h: 740, lng: 'he' },
      { w: 390, h: 844, lng: 'en', fit: 'all' }, { w: 375, h: 667, lng: 'en', fit: 'last-title' }, { w: 375, h: 600, lng: 'en', fit: 'first-two' }, { w: 360, h: 740, lng: 'en' },
    ];
    for (const { w, h, lng, fit } of layouts) {
      const T = lng === 'he' ? S : EN;
      const zt = { tag: `t${w}x${h}`, width: w, height: h, mobile: true, dpr: 2 };
      await setSize(zt);
      step(`tasks-${lng}@${w}x${h}`);
      await go(`${baseUrl}${lng === 'en' ? '#build?l=en' : ''}`);
      await ready();
      await settle(250);
      const want = [[T.home.build, T.home.buildLine(nTopics)], ...(RESULTS ? [[T.home.closest, T.home.closestLine]] : []), [T.home.pair, T.home.pairLine(nTopics)]];
      const got = await evaluate(`JSON.stringify({ h2: document.querySelector('#tasks h2')?.innerText.trim(), intro: [document.querySelector('#intro').tagName, document.querySelector('#intro').innerText.trim()],
        cards: [...document.querySelectorAll('#tasks .task')].map((t) => [t.querySelector('.task-title').innerText.trim(), t.querySelector('.task-line').innerText.trim()]),
        after: document.querySelector('#purpose').compareDocumentPosition(document.querySelector('#tasks')) & Node.DOCUMENT_POSITION_FOLLOWING,
        jump: [document.querySelector('[data-key="home-build"] .task-jump')?.textContent, document.querySelector('[data-key="home-build"] svg') === null],
        order: [...(document.querySelector('#task-closest-pick')?.closest('.task').children ?? [])].map((e) => e.tagName + (e.classList.contains('task-line') ? '.line' : '')),
        contrast: [document.querySelector('#purpose'), ...document.querySelectorAll('#tasks .task-line')].map((e) => {
          const rgb = (c) => c.match(/[\\d.]+/g).slice(0, 3).map(Number); const lum = (c) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
          let bgEl = e; while (bgEl && getComputedStyle(bgEl).backgroundColor.match(/[\\d.]+/g)?.[3] === '0') bgEl = bgEl.parentElement;
          const a = lum(getComputedStyle(e).color); const b = lum(getComputedStyle(bgEl ?? document.body).backgroundColor);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5; }).every(Boolean),
        overflow: document.documentElement.scrollWidth > innerWidth + 1 })`).then(JSON.parse);
      const wantGot = { h2: T.home.title, intro: ['H1', T.buildIntro(nTopics)], cards: want, after: 4, jump: ['↓', true],
        order: RESULTS ? ['LABEL', 'P.line', 'SELECT'] : [], contrast: true, overflow: false };
      if (JSON.stringify(got) !== JSON.stringify(wantGot)) errors.push(`[${current}] cards: expected ${JSON.stringify(wantGot)}, got ${JSON.stringify(got)}`);
      if (fit) {
        const pos = await evaluate(`JSON.stringify({ h: innerHeight, scrollY, cards: [...document.querySelectorAll('#tasks .task')].map((t) => { const r = t.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; }),
          lastTitle: (() => { const r = document.querySelector('#tasks .task:last-child .task-title').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; })(),
          purpose: Math.round(document.querySelector('#purpose').getBoundingClientRect().bottom), disclaimer: document.querySelector('#purpose').innerText.trim().endsWith(${JSON.stringify(lng === 'he' ? 'זו לא המלצת הצבעה.' : 'This is not a voting recommendation.')}) })`).then(JSON.parse);
        if (pos.scrollY !== 0) errors.push(`[${current}] first load should be at the top (scrollY ${pos.scrollY})`);
        const on = ([t, b]) => t >= 0 && b <= pos.h;
        const ok = { all: () => pos.cards.every(on), 'first-two': () => pos.cards.slice(0, 2).every(on), 'last-title': () => on(pos.lastTitle) }[fit]();
        if (!ok) errors.push(`[${current}] first screen (${pos.h}px), rule "${fit}": cards ${JSON.stringify(pos.cards)}, last title ${JSON.stringify(pos.lastTitle)}`);
        if (!pos.disclaimer || pos.purpose > pos.h) errors.push(`[${current}] the purpose line with its disclaimer must be on the first screen (ends ${pos.purpose}, disclaimer ${pos.disclaimer})`);
        await shoot(zt, `tasks-${w}x${h}${lng === 'en' ? '-en' : ''}.png`, false);
      }
      if (lng === 'en') { const he = await evaluate(HEBREW_OUTSIDE); if (he) errors.push(`[${current}] Hebrew text outside lang="he": ${he}`); }
      // One accessible name per card control: the title alone; the line is its description.
      for (const [sel, i] of [['#tasks [data-key="home-build"]', 0], ...(RESULTS ? [['#tasks [data-key="closest-pick"]', 1]] : []), ['#tasks [data-key="home-pair"]', want.length - 1]]) {
        const a = await ax(sel);
        if (!a || a.name !== want[i][0] || a.desc !== want[i][1]) errors.push(`[${current}] ${sel}: accessible name/description should be "${want[i][0]}" / "${want[i][1]}", got ${JSON.stringify(a)}`);
      }
      // Cards 1 and 3: the whole card is the target (its line answers a hit), with a visible focus ring around the card.
      for (const k of ['home-build', 'home-pair']) {
        await key('Shift', 16); // a key press first, so focus set by script counts as keyboard focus (:focus-visible)
        const r = await evaluate(`(() => { const el = document.querySelector('[data-key="${k}"]'); const card = el.closest('.task'); const line = card.querySelector('.task-line');
          card.scrollIntoView({ block: 'center' }); const lr = line.getBoundingClientRect(); const hit = document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2);
          el.focus(); const st = getComputedStyle(el, '::after'); const cr = card.getBoundingClientRect(); const ok = [el.matches(':focus-visible'), st.outlineStyle, st.outlineWidth, st.position, st.content];
          el.blur(); window.scrollTo(0, 0); return JSON.stringify([hit === el || el.contains(hit), ...ok, cr.height >= 44]); })()`);
        if (r !== JSON.stringify([true, true, 'solid', '3px', 'absolute', '""', true])) errors.push(`[${current}] ${k}: whole-card target and focus ring [hit, focus-visible, outline, width, ::after position, content, ≥44px]: ${r}`);
      }
      // Targets and focus moves, once per language at phone width.
      if (w === 390) {
        const L = lng === 'en' ? '?l=en' : '';
        await go(`${baseUrl}#build${L}`);
        await ready();
        await settle(200);
        const h0 = await evaluate('location.hash');
        await tap('#tasks [data-key="home-build"] + .task-line');
        // A smooth scroll: let it end (settle waits for the scroll to stop), so the check sees where it lands and nothing
        // is still moving when the test scrolls back to the top.
        await settle(1500);
        const reached = await waitFor(() => evaluate("(() => { const r = document.querySelector('#builder-title').getBoundingClientRect(); return document.activeElement?.id === 'builder-title' && r.top >= 0 && r.top < 80; })()"), 3000).catch(() => false);
        const hb = await evaluate('JSON.stringify([location.hash, document.querySelector("#builder-title").innerText.trim(), document.body.dataset.view])');
        if (!reached || hb !== JSON.stringify([h0, T.builder.title, 'build'])) errors.push(`[${current}] card 1 should focus the builder heading at the top, URL unchanged (${reached}, ${hb})`);
        if (lng === 'he') await shoot(zt, 'tasks-card1-target-m.png', false);
        await evaluate('window.scrollTo(0, 0)');
        if (RESULTS) {
          await evaluate("(() => { const s = document.querySelector('#tasks [data-act=\"closest-pick\"]'); s.focus(); s.value = 'likud'; s.dispatchEvent(new Event('change', { bubbles: true })); })()");
          await settle(300);
          const sheet = await evaluate("JSON.stringify([document.querySelector('#sheet').open, document.querySelector('#sheet h2')?.innerText.trim()])");
          if (sheet !== JSON.stringify([true, T.closest.title(nameIn(lng, 'likud'))])) errors.push(`[${current}] card 2 should open the closest-coalitions sheet: ${sheet}`);
          await key('Escape', 27);
          await settle(250);
          const back = await evaluate("JSON.stringify([document.querySelector('#sheet').open, document.activeElement?.dataset?.key, document.querySelector('#tasks [data-act=\"closest-pick\"]').value])");
          if (back !== JSON.stringify([false, 'closest-pick', ''])) errors.push(`[${current}] closing the sheet should return focus to the card 2 picker, reset: ${back}`);
        }
        await tap('#tasks [data-key="home-pair"] + .task-line');
        await waitFor(() => evaluate("document.body.dataset.view === 'pair'"));
        await settle(200);
        const pv = await evaluate('JSON.stringify([location.hash, document.activeElement?.id])');
        if (pv !== JSON.stringify([`#pair${L}`, 'pair-title'])) errors.push(`[${current}] card 3 should open #pair${L} with focus on its heading: ${pv}`);
        await evaluate('history.back()');
        await waitFor(() => evaluate("document.body.dataset.view === 'build'"));
        // Focus returns once the view has rendered and restored its scroll: wait for that state (up to 3s), not a fixed time.
        const BK = 'JSON.stringify([location.hash, document.activeElement?.dataset?.key, scrollY])';
        const wantBk = JSON.stringify([`#build${L}`, 'home-pair', 0]);
        const bk = await waitFor(async () => ((await evaluate(BK)) === wantBk ? wantBk : null), 3000).catch(() => evaluate(BK));
        if (bk !== wantBk) errors.push(`[${current}] back from the pair view should focus card 3: ${bk}`);
        // The disclosure: collapsed, labelled, opens to the scenarios (results) or presets (polls).
        const disc = await evaluate(`(() => { const d = document.querySelector('#presets details'); const was = d.open; d.querySelector('summary').click();
          return JSON.stringify([was, d.open, d.querySelector('summary').innerText.trim(), d.querySelectorAll('[data-act="scenario"], [data-act="preset"]').length > 0, document.querySelector('#builder-title').compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING]); })()`);
        const sumWant = RESULTS ? T.presets.scenariosStart(loadData().scenarios.scenarios.length, T.presets.shortDate(loadData().scenarios.asOf)) : T.presets.presetsStart;
        if (disc !== JSON.stringify([false, true, sumWant, true, 4])) errors.push(`[${current}] start-from disclosure [was open, opens, summary, has items, after the builder heading]: ${disc}`);
        // Each scenario's source line in this language (a denial carries its party's name, #34).
        if (RESULTS) {
          const lc = posCtx[T === S ? 'he' : 'en'];
          const srcs = await evaluate("Object.fromEntries([...document.querySelectorAll('#presets .scenario')].map((li) => [li.querySelector('[data-act=\"scenario\"]').dataset.id, li.querySelector('.scen-src').innerText.replace(/\\s+/g, ' ').trim()]))");
          for (const sc of loadData().scenarios.scenarios) {
            const want = wantSourceLine(T, sc, lc);
            if (srcs[sc.id] !== want) errors.push(`[${current}] scenario ${sc.id} source line "${srcs[sc.id]}" should read "${want}"`);
          }
        }
      }
    }
    await setSize(SIZES[0]);
    log('  ✓ task cards: he all cards at 375×667/375×600/390×844; en all at 390×844, card 3 title at 375×667, cards 1-2 at 375×600; names, targets, focus, contrast');
  }

  // The undo line (#29): a closest coalition (results mode), a completion (with seats) and removing the friction party each
  // show an in-flow line at the top of the results view, never a toast with a button. It names the change; "undo" restores
  // the exact previous state (route stays #results) and announces it, members then the parties outside with their roles;
  // × only hides it. Focus goes to the results' first heading after the change, undo and ×. Starting from an empty
  // coalition shows no line; leaving the view clears it; a language switch keeps it. At 375×667 and 360×740, both languages.
  if (sec('undo')) {
    const UNDO_STATE = `JSON.stringify((() => { const l = document.querySelector('#results-undo .undo-line'); const a = document.activeElement;
      return { line: l ? l.querySelector('.undo-text').innerText : null, focus: a && a === document.querySelector('#results h2') ? 'heading' : (a?.dataset?.key || a?.id || a?.tagName),
        btn: l ? (() => { const b = l.querySelector('[data-act="undo"]'); return [b.innerText.trim(), document.getElementById(b.getAttribute('aria-describedby'))?.innerText ?? null]; })() : null,
        live: document.querySelector('#live').textContent, toastAction: document.querySelectorAll('#toast button, #toast a, #toast [data-act]').length,
        hash: location.hash.split('?')[0] }; })())`;
    const LINE_LAYOUT = `(() => { const bad = []; const l = document.querySelector('#results-undo .undo-line'); if (!l) return 'no line';
      if (getComputedStyle(l).position !== 'static') bad.push('not in the flow');
      const r = l.getBoundingClientRect(), bar = document.querySelector('#results-bar').getBoundingClientRect(); const rtl = document.dir === 'rtl';
      if (r.top < bar.bottom - 0.5) bad.push('under the sticky bar');
      for (const sel of ['#results-coalition .coalition-line', '#results ${SRC_SEL}', '#results .seats-line']) for (const e of document.querySelectorAll(sel)) {
        const b = e.getBoundingClientRect(); if (b.height && b.top < r.bottom - 0.5 && b.bottom > r.top + 0.5) bad.push('overlaps ' + sel); }
      if (document.documentElement.scrollWidth > innerWidth) bad.push('horizontal scroll');
      const [u, x] = l.querySelectorAll('button');
      for (const b of [u, x]) { const q = b.getBoundingClientRect(); if (q.width < 44 || q.height < 44) bad.push('target ' + Math.round(q.width) + 'x' + Math.round(q.height));
        if (q.left < r.left - 0.5 || q.right > r.right + 0.5) bad.push('button outside the line'); }
      const ub = u.getBoundingClientRect(), xb = x.getBoundingClientRect();
      if (rtl ? !(xb.right <= ub.left + 0.5 && xb.left - r.left < 6) : !(xb.left >= ub.right - 0.5 && r.right - xb.right < 6)) bad.push('close is not at the line end');
      if (x.getAttribute('aria-label') === null || u.getAttribute('aria-describedby') !== 'undo-text') bad.push('names');
      const src = document.querySelector('#results ${SRC_SEL}'), num = document.querySelector('#results .seats-line');
      if (src && num && !(src.compareDocumentPosition(num) & Node.DOCUMENT_POSITION_FOLLOWING)) bad.push('source line after the numbers');
      return bad.join('; '); })()`;
    const ids = parties.map((p) => p.id);
    // A preset with a friction party, preferably one with supporters (the global ctx has no positions; posCtx does).
    const hasFriction = (p) => analyze(posCtx.he, { base: null, ...p }).friction.length > 0;
    const fric = Object.values(pr).find((p) => p.supporters.length && hasFriction(p)) ?? Object.values(pr).find(hasFriction);
    if (!fric) throw new Error('undo line: no preset with a friction party');
    const pick = (party) => evaluate(`(() => { const s = document.querySelector('[data-act="closest-pick"]'); s.value = ${JSON.stringify(party)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    let cases = 0;
    const loaded = () => waitFor(() => evaluate("document.querySelector('#footer')?.children.length > 0"));
    for (const size of [{ width: 375, height: 667, mobile: true, dpr: 2 }, { width: 360, height: 740, mobile: true, dpr: 2 }]) {
      await setSize(size);
      for (const lng of ['he', 'en']) {
        const T = lng === 'he' ? S : EN;
        const nm = (id) => posCtx[lng].byId.get(id).name;
        const sfx = lng === 'he' ? '' : '&l=en';
        const restoredFor = (qs) => { const st = parseState(qs, ids);
          return T.results.restored(st.members.map(nm), coalitionGroups(st).outside.map((o) => `${nm(o.partyId)} (${T.results.roleName[o.role]})`)); };
        const tagOf = (k) => `undo-${k}-${lng}@${size.width}`;
        const runCase = async (k, start, act, wantText) => {
          for (const mode of ['undo', 'close']) {
            const tag = `${tagOf(k)}-${mode}`;
            await go(`${baseUrl}${start}`);
            await loaded();
            await settle(250);
            const before = await frag();
            const text = await act();
            await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelector('#results h2') !== null"));
            await settle(350);
            const after = await frag();
            let st = JSON.parse(await evaluate(UNDO_STATE));
            if (after === before) errors.push(`[${tag}] the change did not happen`);
            if (st.line !== (text ?? wantText)) errors.push(`[${tag}] line "${st.line}", want "${text ?? wantText}"`);
            if (JSON.stringify(st.btn) !== JSON.stringify([T.results.undo, text ?? wantText])) errors.push(`[${tag}] restore button [name, description] ${JSON.stringify(st.btn)}, want ${JSON.stringify([T.results.undo, text ?? wantText])}`);
            if (st.focus !== 'heading') errors.push(`[${tag}] after the change focus should be on the results heading (${st.focus})`);
            if (st.toastAction) errors.push(`[${tag}] the toast holds an action`);
            if (mode === 'undo') {
              const lay = await evaluate(LINE_LAYOUT);
              if (lay) errors.push(`[${tag}] layout: ${lay}`);
              if (size.width === 375) await shoot(size, `undo-${k}-m${lng === 'he' ? '' : '-en'}.png`, false);
              await evaluate("document.querySelector('#results-undo [data-act=\"undo\"]').click()");
              await settle(350);
              st = JSON.parse(await evaluate(UNDO_STATE));
              if ((await frag()) !== before || st.hash !== '#results') errors.push(`[${tag}] undo should restore ${before} on #results, got ${await frag()} on ${st.hash}`);
              if (st.line !== null) errors.push(`[${tag}] the line should go after undo`);
              if (st.live !== restoredFor(before)) errors.push(`[${tag}] announced "${st.live}", want "${restoredFor(before)}"`);
            } else {
              await evaluate("document.querySelector('#results-undo [data-act=\"undo-close\"]').click()");
              await settle(250);
              st = JSON.parse(await evaluate(UNDO_STATE));
              if ((await frag()) !== after) errors.push(`[${tag}] × must not change the coalition`);
              if (st.line !== null) errors.push(`[${tag}] × should hide the line`);
            }
            if (st.focus !== 'heading') errors.push(`[${tag}] after ${mode} focus should be on the results heading (${st.focus})`);
            cases++;
          }
        };
        // 1. A closest coalition, from the build-view picker with a coalition already chosen (arrives on #results).
        if (RESULTS) {
          await runCase('replaced', `#build?m=likud,yashar${sfx}`, async () => {
            await pick('likud'); await settle(300);
            await evaluate("document.querySelector('#sheet [data-act=\"closest-apply\"]').click()");
            return null;
          }, T.results.undoReplaced);
          // From an empty coalition (the home card): nothing to restore, so no line; focus still on the results heading.
          const tag = tagOf('empty');
          await go(`${baseUrl}#build${lng === 'he' ? '' : '?l=en'}`);
          await loaded();
          await pick('likud'); await settle(300);
          await evaluate("document.querySelector('#sheet [data-act=\"closest-apply\"]').click()");
          await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelector('#results h2') !== null"));
          await settle(350);
          const st = JSON.parse(await evaluate(UNDO_STATE));
          if (st.line !== null) errors.push(`[${tag}] no undo line when starting from an empty coalition`);
          if (st.focus !== 'heading') errors.push(`[${tag}] focus should be on the results heading (${st.focus})`);
        }
        // 2. A completion ("מה חסר לרוב"), when seats are shown.
        if (!SEATS_HIDDEN) {
          await runCase('added', `#results${serializeState(ctx, { base: null, ...pr.coalition })}${sfx}`, async () => {
            const add = await evaluate("(() => { const b = document.querySelector('#results [data-act=\"complete\"]'); b.click(); return b.dataset.ids; })()");
            return T.results.undoAdded(add.split(',').map(nm));
          });
        }
        // 3. Removing the friction party, from a state with supporters (the announcement names them with their role).
        await runCase('removed', `#results${serializeState(ctx, { base: null, ...fric })}${sfx}`, async () => {
          const id = await evaluate("(() => { const b = document.querySelector('#results [data-act=\"remove-friction\"]'); b.click(); return b.dataset.id; })()");
          return T.results.undoRemoved(nm(id));
        });
        // The line survives a language switch (re-rendered in the other language) and is cleared by leaving the view.
        const tag = tagOf('lifetime');
        await go(`${baseUrl}#results${serializeState(ctx, { base: null, ...fric })}${sfx}`);
        await loaded();
        await settle(250);
        const id = await evaluate("(() => { const b = document.querySelector('#results [data-act=\"remove-friction\"]'); b.click(); return b.dataset.id; })()");
        await settle(300);
        await evaluate("document.querySelector('#lang-switch button').click()");
        await settle(300);
        const O = lng === 'he' ? EN : S;
        const other = (await evaluate("document.querySelector('#results-undo .undo-text')?.innerText ?? null"));
        if (other !== O.results.undoRemoved(posCtx[lng === 'he' ? 'en' : 'he'].byId.get(id).name)) errors.push(`[${tag}] after a language switch the line should read in the other language (${other})`);
        await evaluate("location.hash = '#build'");
        await waitFor(() => evaluate("document.body.dataset.view === 'build'"));
        await evaluate("location.hash = '#results'");
        await waitFor(() => evaluate("document.body.dataset.view === 'results'"));
        await settle(250);
        if (await evaluate("document.querySelector('#results-undo .undo-line') !== null")) errors.push(`[${tag}] leaving the results view should clear the line`);
      }
    }
    await setSize(SIZES[0]);
    log(`  ✓ undo line: ${cases} runs (${RESULTS ? 'closest, ' : ''}${SEATS_HIDDEN ? '' : 'completion, '}friction × undo/close × he/en × 375/360)${RESULTS ? ', empty start' : ''}, lifetime; no toast action`);
  }

  // Phone layout, both languages, also at 360 (a common Android width): at least 16px between the brand and the nav, a
  // header that doesn't overflow, overview topics on one line each (no hyphenation) in a 4×2 grid on phones and one row
  // on wide screens, Hebrew matrix headers visibly apart, and the English translation line on one line on phones.
  const LAYOUT_CHECK = `(() => { const bad = []; const rtl = document.documentElement.dir === 'rtl';
    const brand = document.querySelector('.brand').getBoundingClientRect(), nav = document.querySelector('.topnav').getBoundingClientRect();
    const gap = rtl ? brand.left - nav.right : nav.left - brand.right; if (gap < 16) bad.push('brand–nav gap ' + Math.round(gap) + 'px');
    const bar = document.querySelector('.topbar-in'); if (bar.scrollWidth > bar.clientWidth + 1) bad.push('header overflows');
    const lines = (e) => { const r = document.createRange(); r.selectNodeContents(e); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; };
    const segs = [...document.querySelectorAll('#results .seg-label')];
    if (segs.some((e) => lines(e) > 1)) bad.push('overview topic label wraps or hyphenates: ' + segs.filter((e) => lines(e) > 1).map((e) => e.textContent).join(', '));
    const rows = new Set([...document.querySelectorAll('#results .seg')].map((e) => Math.round(e.getBoundingClientRect().top))).size;
    if (rows !== (innerWidth <= 600 ? 2 : 1)) bad.push('overview has ' + rows + ' rows');
    if (rtl) { const tx = [...document.querySelectorAll('#matrix .topic-btn')].map((b) => { const r = document.createRange(); r.selectNodeContents(b); return r.getBoundingClientRect(); });
      const sep = Math.min(...tx.slice(1).map((r, i) => tx[i].left - r.right)); if (sep < 4) bad.push('matrix headers ' + sep.toFixed(1) + 'px apart'); }
    const note = document.querySelector('#lang-note'); if (!note.hidden && innerWidth <= 400 && lines(note) > 1) bad.push('translation line wraps');
    return bad.join('; '); })()`;
  if (sec('layout')) {
    for (const w of [360, 390, 1280]) {
      await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 2, mobile: w < 600 });
      for (const l of ['he', 'en']) {
        step(`layout-${l}@${w}`);
        await go(`${baseUrl}#results?m=likud,yashar,together${l === 'en' ? '&l=en' : ''}`);
        await waitFor(() => evaluate("document.querySelector('#results .seg') !== null && document.querySelector('#matrix .topic-btn') !== null"));
        await settle(250);
        const bad = await evaluate(LAYOUT_CHECK);
        if (bad) errors.push(`[${current}] ${bad}`);
      }
    }
    await setSize(SIZES[0]);
    log('  ✓ phone layout at 360, 390 and 1280 (both languages)');
  }

  const ENLARGE = (pct) => `(() => { document.documentElement.style.setProperty('font-size', '${pct}%'); document.body.style.setProperty('font-size', '${16 * pct / 100}px'); return true; })()`;
  // Party sheet (#30): the sticky bar and its 44px close button stay fully inside the visible viewport at rest, mid-
  // scroll, at the end, after the viewport grows (the browser's bars hide: the sheet "expands") and after it shrinks
  // back (the bars return). Headless Chrome has no address bar, so resizing the viewport stands in for it. Also: the
  // "why this color" rows (badge line, then the sentence) in the cell sheet and in expanded pair rows (pair view and
  // the 2-member card), and the votes line's segments, each on one line, at normal and enlarged text.
  const SHEET_X = `(() => { const vv = visualViewport; const d = document.querySelector('#sheet'); if (!d?.open) return 'sheet not open';
    const h = d.querySelector('.sheet-head').getBoundingClientRect(); const x = d.querySelector('.sheet-close').getBoundingClientRect(); const s = d.getBoundingClientRect();
    const top = vv.offsetTop, bottom = vv.offsetTop + vv.height, left = vv.offsetLeft, right = vv.offsetLeft + vv.width;
    if (x.width < 44 || x.height < 44) return 'close is ' + x.width + 'x' + x.height;
    if (x.top < top - .5 || x.bottom > bottom + .5 || x.left < left - .5 || x.right > right + .5) return 'close outside the visible viewport (top ' + Math.round(x.top) + ', viewport top ' + Math.round(top) + ')';
    if (h.top < top - .5) return 'sheet bar starts above the visible viewport (' + Math.round(h.top) + ')';
    if (x.top < h.top - .5 || x.bottom > h.bottom + .5) return 'close does not fit in the bar (bar ' + Math.round(h.height) + 'px)';
    if (s.top < top + 8 - .5) return 'sheet leaves no room above it (' + Math.round(s.top - top) + 'px)';
    if (s.bottom > bottom + .5) return 'sheet runs below the visible viewport';
    return 'ok'; })()`;
  const lineCount = (sel) => `[...document.querySelectorAll('${sel}')].map((e) => { const r = document.createRange(); r.selectNodeContents(e); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; })`;
  const WHY_JS = (scope) => `(() => { const w = document.querySelector('${scope} .why-row'); if (!w) return null; const b = w.querySelector('.lv'), t = w.querySelector('.why-text');
    if (!b || !t || w.firstElementChild !== b) return { bad: 'badge must come first' };
    return { below: b.getBoundingClientRect().bottom <= t.getBoundingClientRect().top + 1, text: t.innerText.trim() }; })()`;
  if (sec('party-sheet')) {
    let sheetRuns = 0;
    for (const w of [360, 375, 390]) {
      for (const l of ['he', 'en']) {
        const T = l === 'he' ? S : EN;
        const nmL = (id) => posCtx[l].byId.get(id).name;
        const sfx = l === 'en' ? '&l=en' : '';
        step(`sheet-${l}@${w}`);
        sheetRuns++;
        const metrics = (height) => c.send('Emulation.setDeviceMetricsOverride', { width: w, height, deviceScaleFactor: 2, mobile: true });
        await metrics(700);
        await go(`${baseUrl}#results?m=likud,yashar,together,otzma-yehudit,shas,utj${sfx}`);
        await waitFor(() => evaluate("document.querySelector('.party-btn[data-id=\"likud\"]') !== null"));
        await evaluate("document.querySelector('.party-btn[data-id=\"likud\"]').click()");
        await settle(300);
        const sheetCheck = async (what) => { const r = await evaluate(SHEET_X); if (r !== 'ok') errors.push(`[${current}] ${what}: ${r}`); };
        await sheetCheck('at rest');
        await evaluate("(() => { const d = document.querySelector('#sheet'); d.scrollTop = 120; return true; })()");
        await settle(150);
        await sheetCheck('after a short scroll');
        await metrics(800); // the bars hide
        await settle(250);
        await sheetCheck('after the viewport grows');
        await evaluate("(() => { const d = document.querySelector('#sheet'); d.scrollTop = d.scrollHeight / 2; return true; })()");
        await settle(150);
        await sheetCheck('mid-scroll');
        await metrics(744); // the address bar returns
        await settle(250);
        await sheetCheck('after the viewport shrinks back');
        await metrics(632); // and a bottom bar too (Brave)
        await settle(250);
        await sheetCheck('after the viewport shrinks by both bars');
        await evaluate("(() => { const d = document.querySelector('#sheet'); d.scrollTop = d.scrollHeight; return true; })()");
        await settle(150);
        await sheetCheck('at the end');
        if (w === 375) await shoot({ width: w, height: 632, dpr: 2, mobile: true }, `sheet-party-scrolled-${l}.png`, false);
        // The votes line: three segments, none broken across lines, also with enlarged text.
        for (const pct of [100, 125]) {
          await evaluate(ENLARGE(pct));
          await settle(150);
          const segs = await evaluate(lineCount('#sheet .votes-line .nw'));
          if (RESULTS && (segs.length !== 3 || segs.some((n) => n > 1))) errors.push(`[${current}] votes line at ${pct}%: segments ${JSON.stringify(segs)} (want 3, one line each)`);
        }
        await evaluate(ENLARGE(100));
        // "Compare with…" (#6): choosing a party re-renders the sheet, and keyboard focus stays on the select.
        const cmp = await evaluate(`(() => { const s = document.querySelector('#sheet select[data-act="compare"]'); s.focus(); s.value = 'yashar';
          s.dispatchEvent(new Event('change', { bubbles: true })); const a = document.activeElement;
          return a?.matches('#sheet select[data-act="compare"]') && a.value === 'yashar' ? 'ok' : 'focus on ' + (a?.dataset?.act || a?.tagName) + ', value ' + a?.value; })()`);
        if (cmp !== 'ok') errors.push(`[${current}] party sheet "compare with": ${cmp}`);
        await evaluate("document.querySelector('#sheet').close()");
        await metrics(800);
        // Cell sheet: the why row.
        const cell = matrixCell(posCtx[l], 'yashar', 'draft', ['likud', 'yashar', 'together', 'otzma-yehudit', 'shas', 'utj'], null);
        await evaluate("document.querySelector('.cell[data-party=\"yashar\"][data-topic=\"draft\"]').click()");
        await settle(250);
        const why = await evaluate(WHY_JS('#sheet'));
        const wantWhy = cell.d === 0 ? T.sheet.agree(nmL('yashar'), nmL(cell.ref)) : T.sheet.gapTitle(nmL('yashar'), nmL(cell.ref), cell.d);
        if (!why || !why.below || why.text !== wantWhy) errors.push(`[${current}] cell sheet why row: ${JSON.stringify(why)}, want "${wantWhy}" under the badge`);
        await evaluate("document.querySelector('#sheet').close()");
        // 2-member card and pair view: the first expanded row starts with the why row.
        const pr2 = pairSummary(posCtx[l], 'together', 'democrats').rows;
        const placed = pr2.findIndex((r) => r.level !== 'NONE');
        for (const [where, url, scope] of [['2-member card', `#results?m=together,democrats${sfx}`, '#results'], ['pair view', `#pair?p=together,democrats${sfx}`, '#pair-view']]) {
          await go(`${baseUrl}${url}`);
          await waitFor(() => evaluate(`document.querySelectorAll('${scope} .pair-row').length === 8`));
          await evaluate(`(() => { document.querySelectorAll('${scope} .pair-row')[${placed}].open = true; return true; })()`);
          await settle(150);
          const got = await evaluate(WHY_JS(`${scope} .pair-row[open] .pair-detail`));
          const r = pr2[placed];
          // The card lists its members in party order (by ballot letters when seats are hidden); the pair view keeps p=.
          const [x1, x2] = where === '2-member card' ? sortP(posCtx[l], ['together', 'democrats']) : ['together', 'democrats'];
          const want = r.d === 0 ? T.sheet.agree(nmL(x1), nmL(x2)) : T.sheet.gapTitle(nmL(x1), nmL(x2), r.d);
          if (!got || !got.below || got.text !== want) errors.push(`[${current}] ${where} why row: ${JSON.stringify(got)}, want "${want}" under the badge`);
          const first = await evaluate(`document.querySelector('${scope} .pair-row[open] .pair-detail').firstElementChild?.className`);
          if (first !== 'why-row') errors.push(`[${current}] ${where}: the why row must open the expanded row (first: ${first})`);
        }
      }
    }
    await setSize(SIZES[0]);
    log(`  ✓ party sheet: ${sheetRuns} runs (360/375/390 × he/en): close inside the visible viewport at rest, scrolled, grown and shrunk; why rows; votes line; compare-with focus`);
  }

  // Fit (#35): at phone widths, with normal and enlarged text (root and body at 125%, standing in for a wider device
  // font such as Samsung's Hebrew one, or user text scaling): every matrix header's text stays inside its column and the
  // viewport, is vertical with its text next to the cells, the matrix and the page never scroll sideways, the overview
  // labels stay inside their tiles, the vote line breaks only between its segments, the header bar neither overflows nor
  // overlaps, and the task cards hold their content.
  const FIT_COMMON = `const bad = []; const vw = document.documentElement.clientWidth;
    const textBox = (e) => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect(); };
    const out = (t, c) => t.left < c.left - .5 || t.right > c.right + .5;
    if (document.documentElement.scrollWidth > vw + 1) bad.push('the page scrolls sideways by ' + (document.documentElement.scrollWidth - vw) + 'px');
    const bar = document.querySelector('.topbar-in'); if (bar.scrollWidth > bar.clientWidth + 1) bad.push('header bar overflows');
    const parts = [document.querySelector('.brand'), document.querySelector('.navlink'), document.querySelector('.langswitch')].map((e) => e.getBoundingClientRect());
    if (parts.some((a, i) => parts.some((b, j) => j > i && a.left < b.right - .5 && b.left < a.right - .5 && a.top < b.bottom - .5 && b.top < a.bottom - .5))) bad.push('header items overlap');
    if (parts.some((p) => p.left < -.5 || p.right > vw + .5)) bad.push('a header item leaves the viewport');`;
  const FIT_RESULTS = `(() => { ${FIT_COMMON}
    const wrap = document.querySelector('#matrix .table-wrap'); const wr = wrap.getBoundingClientRect();
    if (wrap.scrollWidth > wrap.clientWidth + 1) bad.push('the matrix scrolls sideways by ' + (wrap.scrollWidth - wrap.clientWidth) + 'px');
    document.querySelectorAll('#matrix thead th').forEach((th) => { const b = th.querySelector('.topic-btn'); const t = textBox(b); const c = th.getBoundingClientRect();
      if (out(t, c) || t.top < c.top - .5 || t.bottom > c.bottom + .5) bad.push('matrix header "' + b.textContent + '" leaves its column');
      if (t.left < Math.max(wr.left, 0) - .5 || t.right > Math.min(wr.right, vw) + .5) bad.push('matrix header "' + b.textContent + '" leaves the viewport');
      if (vw <= 480) { if (!getComputedStyle(b).writingMode.startsWith('vertical')) bad.push('matrix header "' + b.textContent + '" is not vertical');
        else if (c.bottom - t.bottom > 12) bad.push('matrix header "' + b.textContent + '" is not next to the cells (' + Math.round(c.bottom - t.bottom) + 'px above)'); } });
    document.querySelectorAll('#results .seg').forEach((g) => { const l = g.querySelector('.seg-label'); if (out(textBox(l), g.getBoundingClientRect())) bad.push('overview label "' + l.textContent + '" leaves its tile'); });
    // One card per column (#35): the header's box sits within its column, with a visible gap to the next one.
    const hb = [...document.querySelectorAll('#matrix thead th')].map((th) => [th.getBoundingClientRect(), th.querySelector('.topic-btn').getBoundingClientRect(), th.querySelector('.topic-btn').textContent]);
    for (const [c, b, name] of hb) if (b.left < c.left - .5 || b.right > c.right + .5) bad.push('matrix header card "' + name + '" is wider than its column');
    const xs = hb.map(([, b]) => b).sort((p, q) => p.left - q.left);
    // The same gap as the cells under them (the first row's cells), and at least 2px.
    const cs = [...document.querySelectorAll('#matrix tbody tr:first-child .cell')].map((e) => e.getBoundingClientRect()).sort((p, q) => p.left - q.left);
    const cellGap = Math.min(...cs.slice(1).map((r, i) => r.left - cs[i].right));
    for (let i = 1; i < xs.length; i++) { const g = xs[i].left - xs[i - 1].right; if (g < Math.max(2, cellGap - 1)) bad.push('matrix header cards ' + g.toFixed(1) + 'px apart (cells: ' + cellGap.toFixed(1) + 'px)'); }
    // The confidence-vote line: each segment on one line (it wraps only between them).
    document.querySelectorAll('#results .vote-line .nw').forEach((e) => { const r = document.createRange(); r.selectNodeContents(e); if (new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1) bad.push('vote segment "' + e.textContent + '" breaks across lines'); });
    return bad; })()`;
  const FIT_BUILD = `(() => { ${FIT_COMMON}
    document.querySelectorAll('.task').forEach((t, i) => { const c = t.getBoundingClientRect();
      if ([...t.querySelectorAll('*')].some((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && out(r, c); })) bad.push('task card ' + (i + 1) + ' content leaves the card'); });
    return bad; })()`;
  const FIT_MEMBERS = 'm=likud,yashar,together,otzma-yehudit,shas,utj';
  if (sec('fit')) {
    let fitRuns = 0;
    for (const w of [360, 375, 390, 412]) {
      await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 2, mobile: true });
      for (const l of ['he', 'en']) {
        for (const pct of [100, 125]) {
          step(`fit-${l}@${w}-${pct}%`);
          fitRuns++;
          await go(`${baseUrl}#results?${FIT_MEMBERS}${l === 'en' ? '&l=en' : ''}`);
          await waitFor(() => evaluate("document.querySelectorAll('#matrix .topic-btn').length === 8 && document.querySelector('#results .seg') !== null"));
          await evaluate(ENLARGE(pct));
          await settle(250);
          for (const b of await evaluate(FIT_RESULTS)) errors.push(`[${current}] ${b}`);
          // The header on one line at normal text size (#35), also with a wider device font (simulated: +0.08em letter
          // spacing, about 15% wider), which the CSS-only tightening absorbs (#36, no fit script). It may wrap only with enlarged text.
          if (pct === 100) {
            const oneLine = async (ls) => evaluate(`(() => { const bar = document.querySelector('.topbar-in'); bar.style.setProperty('letter-spacing', '${ls}em'); dispatchEvent(new Event('resize'));
              const [a, b] = [bar.querySelector('.brand'), bar.querySelector('.topnav')].map((e) => e.getBoundingClientRect()); const one = !(b.top >= a.bottom - 1 || a.top >= b.bottom - 1);
              const fits = bar.scrollWidth <= bar.clientWidth + 1; bar.style.removeProperty('letter-spacing'); dispatchEvent(new Event('resize')); return one && fits; })()`);
            if (!(await oneLine(0))) errors.push(`[${current}] the header bar wraps at normal text size`);
            if (!(await oneLine(0.08))) errors.push(`[${current}] the header bar wraps with a slightly wider font (the header's tightening should absorb it)`);
          }
          if (SHOTS && w === 375 && pct === 100) {
            // The matrix at 375 in each language, for the report (smoke/matrix-<lang>-375.png).
            const clip = await evaluate("(() => { const t = document.querySelector('#matrix .table-wrap'); const r = t.getBoundingClientRect(); return { x: 0, y: r.top + scrollY - 8, width: innerWidth, height: Math.ceil(r.height) + 16, scale: 1 }; })()");
            const shot = await c.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
            writeFileSync(join(OUT, `matrix-${l}-375.png`), Buffer.from(shot.data, 'base64'));
          }
          await go(`${baseUrl}#build${l === 'en' ? '?l=en' : ''}`);
          await waitFor(() => evaluate("document.querySelectorAll('.task').length > 0"));
          await evaluate(ENLARGE(pct));
          await settle(250);
          for (const b of await evaluate(FIT_BUILD)) errors.push(`[${current} build] ${b}`);
        }
      }
    }
    await setSize(SIZES[0]);
    log(`  ✓ fit: ${fitRuns} runs (360/375/390/412 × he/en × text 100%/125%): matrix headers (one card per column), overview, header bar (one line at 100%, also with a wider font), task cards`);
  }

  // Never broken inside (#30/#31/#34): a party name, an outlet or person's name, or a number pair ("53 מול 67", "53 מתוך
  // 61", "59 vs 61") stays on one line in the red-line lines, the "בלי X" rows, the completions card and the scenario
  // sources, at 360/375 in both languages with normal and enlarged text. The pattern is built here and passed as JSON.
  const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const NOBREAK_JS = (sels, names) => {
    const src = [...[...new Set(names)].sort((a, b) => b.length - a.length).map(reEsc), '≈?\\d[\\d,.]*(?: (?:מול|מתוך|vs|of) ≈?\\d[\\d,.]*)'].join('|');
    return `(() => { const bad = []; let seen = 0; const re = new RegExp(${JSON.stringify(src)}, 'g');
      for (const root of document.querySelectorAll(${JSON.stringify(sels.join(', '))})) {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) for (const m of n.data.matchAll(re)) {
          if (!m[0].includes(' ')) continue;
          seen++;
          const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
          if (new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size > 1) bad.push('"' + m[0] + '" breaks across lines');
        }
      }
      return { bad, seen }; })()`;
  };
  let nbRuns = 0;
  let nbSeen = 0;
  if (RESULTS && sec('nobreak')) {
    const { scenarios } = loadData();
    for (const w of [360, 375]) {
      await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 2, mobile: true });
      for (const l of ['he', 'en']) {
        const loc = (x) => (l === 'en' ? { ...x, ...x.en } : x);
        const T = l === 'en' ? EN : S;
        // A party's reply prefix stays whole up to its colon ("תגובת יהדות התורה:").
        const replyPrefix = (x) => { const r = sourceReply(x); return r && T.presets.replyBy[r.kind](posCtx[l].byId.get(r.party).name).trim(); };
        const names = [...posCtx[l].parties.map((p) => p.name), ...scenarios.scenarios.flatMap((sc) => sc.sources.map(loc)).flatMap((x) => [x.outlet, x.by, replyPrefix(x)]).filter(Boolean)];
        const L = l === 'en' ? '&l=en' : '';
        for (const pct of [100, 125]) {
          step(`nobreak-${l}@${w}-${pct}%`);
          nbRuns++;
          for (const [url, sels, ready] of [
            [`#results?m=yashar,together,democrats,yisrael-beiteinu,utj,shas${L}`, ['#results .redlines-line', '#results .pivotal'], "document.querySelector('#results .pivotal li') !== null"],
            [`#results?m=yashar,together,democrats,yisrael-beiteinu${L}`, ['#results .completions'], "document.querySelector('#results .completions li') !== null"],
            [`#build${l === 'en' ? '?l=en' : ''}`, ['#presets .scen-src'], "document.querySelector('#presets .scen-src') !== null"],
          ]) {
            await go(`${baseUrl}${url}`);
            await waitFor(() => evaluate(ready));
            await evaluate("(() => { const d = document.querySelector('#presets details'); if (d) d.open = true; return true; })()");
            await evaluate(ENLARGE(pct));
            await settle(250);
            const r = await evaluate(NOBREAK_JS(sels, names));
            nbSeen += r.seen;
            for (const b of r.bad) errors.push(`[${current} ${url.split('?')[0]}] ${b}`);
          }
          // Each scenario source's "<ב/ב-><outlet>, <d.m>" (several text nodes, so checked as an element) is on one line.
          const split = await evaluate("[...document.querySelectorAll('#presets .scen-src .nw')].filter((e) => new Set([...e.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size > 1).map((e) => e.innerText)");
          for (const t of split) errors.push(`[${current} #build] "${t}" breaks across lines`);
        }
      }
    }
    if (!nbSeen) errors.push('[nobreak] the check found no names or number pairs to check');
    await setSize(SIZES[0]);
    log(`  ✓ never broken inside: ${nbRuns} runs (360/375 × he/en × 100%/125%), ${nbSeen} names and number pairs checked`);
  }
  // The factions' recommendations to the President (#4). Results mode: in the build section's seats box, the line comes
  // right after the CEC results line and its positions-as-of line (before any number) and opens the sheet. The sheet: the source line first, then the mandate sentence,
  // the office's tally (verbatim, attributed), then one row per list in the Knesset in party order, each with its own
  // president.gov.il release (the /en/ page in English), no candidate colors, no Hebrew in English, the ✕ in view (#30),
  // focus back on the line after closing. Each party sheet carries its faction's line; a list outside the Knesset has
  // none. Polls modes: nothing of this anywhere.
  if (sec('recs')) {
    const { recommendations: recs } = loadData();
    let recRuns = 0;
    const SHEET_RECS = `(() => { const s = document.querySelector('#sheet'); if (!s.open) return null; const t = (e) => e ? e.innerText.replace(/\\s+/g, ' ').trim() : null;
      const src = s.querySelector('.recs-src'), tally = s.querySelector('.recs-tally'), table = s.querySelector('.recs-table'), mandate = s.querySelector('.recs-mandate');
      const before = (a, b) => Boolean(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
      const inner = s.querySelector('.sheet-inner');
      return { title: t(s.querySelector('h2')), src: t(src), srcHref: src?.querySelector('a')?.getAttribute('href'), mandate: t(mandate),
        quote: t(tally?.querySelector('.q-text')), by: t(tally?.querySelector('.q-by')),
        order: before(src, mandate) && before(mandate, tally) && before(tally, table) && inner.firstElementChild?.tagName === 'H2' && inner.children[1] === src,
        rows: [...(table?.querySelectorAll('tbody tr') ?? [])].map((r) => ({ id: r.dataset.party, cells: [...r.children].map(t), href: r.querySelector('a')?.getAttribute('href'),
          ext: r.querySelector('a')?.target === '_blank' && /noopener/.test(r.querySelector('a')?.rel ?? ''), label: r.querySelector('a')?.getAttribute('aria-label') })),
        // One neutral style for every candidate: no class at all inside the rows.
        styled: [...(table?.querySelectorAll('tbody *') ?? [])].filter((e) => e.className || e.getAttribute('style')).length,
        hebrew: /[\\u0590-\\u05FF]/.test([...s.querySelectorAll('.sheet-inner *')].filter((e) => !e.closest('[lang="he"]') && !e.children.length).map((e) => e.innerText).join(' ')),
        overflow: s.scrollWidth > s.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1 }; })()`;
    const LINE_JS = `(() => { const box = document.querySelector('#builder .seats-box'); const line = box?.querySelector('.recs-line'); const b = line?.querySelector('button');
      return { box: Boolean(box), line: Boolean(line), any: document.querySelectorAll('.recs-line, .recs-party').length, afterSrc: (line?.previousElementSibling?.classList.contains('positions-asof') && line.previousElementSibling.previousElementSibling?.classList.contains('seat-src')) ?? false,
        text: b ? b.innerText.replace(/\\s+/g, ' ').trim() : null, h: b ? b.getBoundingClientRect().height : 0, overflow: document.documentElement.scrollWidth > innerWidth + 1 }; })()`;
    for (const w of RESULTS ? [360, 390] : [390]) {
      await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 2, mobile: true });
      for (const l of ['he', 'en']) {
        step(`recs-${l}@${w}`);
        recRuns++;
        const T = l === 'en' ? EN : S;
        const R = T.recs;
        const lc = posCtx[l];
        const nm = (id) => lc.byId.get(id).name;
        const leader = (id) => (id ? lc.byId.get(id).leader : null);
        const loc = (x) => (l === 'en' ? { ...x, ...x.en } : x);
        await go(`${baseUrl}#build${l === 'en' ? '?l=en' : ''}`);
        await waitFor(() => evaluate("document.querySelector('#builder .plist') !== null"));
        const line = await evaluate(LINE_JS);
        if (!RESULTS) {
          if (line.any) errors.push(`[${current}] polls mode must show no recommendations line`);
          continue;
        }
        const want = `${R.open(R.range(recs.consultations.from, recs.consultations.to))} ›`;
        if (!line.line || line.text !== want) errors.push(`[${current}] seats box line: ${JSON.stringify(line.text)}, want ${JSON.stringify(want)}`);
        if (!line.afterSrc) errors.push(`[${current}] the recommendations line must come right after the CEC results line and its positions-as-of line`);
        if (line.h < 44) errors.push(`[${current}] the recommendations line is ${line.h}px tall (want a 44px target)`);
        if (line.overflow) errors.push(`[${current}] horizontal overflow on the build view`);
        await evaluate("document.querySelector('[data-act=\"recs\"]').focus(), document.querySelector('[data-act=\"recs\"]').click()");
        await settle(250);
        const got = await evaluate(SHEET_RECS);
        if (!got) { errors.push(`[${current}] the recommendations sheet did not open`); continue; }
        const m = loc(recs.mandate);
        const day = R.date(m.date);
        const wantRows = recommendationRows(lc, recs).map((x) => loc(x)).map((f) => ({ id: f.partyId, cells: [nm(f.partyId), leader(f.recommended) ?? R.none, T.presets.shortDate(f.date)], href: f.sourceUrl, ext: true, label: R.rowSource(nm(f.partyId), R.date(f.date)) }));
        if (got.title !== R.title) errors.push(`[${current}] sheet title ${JSON.stringify(got.title)}`);
        if (!got.order) errors.push(`[${current}] the sheet must open with the source line, then the mandate, the tally, the table`);
        if (got.src !== `${R.source} ${R.office}, ${day}` || got.srcHref !== m.sourceUrl) errors.push(`[${current}] source line ${JSON.stringify(got.src)} → ${got.srcHref}`);
        if (got.mandate !== R.mandate[m.kind](day, leader(m.partyId))) errors.push(`[${current}] mandate sentence ${JSON.stringify(got.mandate)}`);
        const q = l === 'he' ? `״${m.quote}״` : `“${m.quote}”`;
        if (got.quote !== q || got.by !== R.tallyBy(day)) errors.push(`[${current}] tally ${JSON.stringify(got.quote)} / ${JSON.stringify(got.by)}`);
        if (JSON.stringify(got.rows) !== JSON.stringify(wantRows)) errors.push(`[${current}] rows ${JSON.stringify(got.rows)}, want ${JSON.stringify(wantRows)}`);
        // Only the President's office's own pages: Hebrew ones on the Hebrew page, /en/ ones in English.
        const page = l === 'en' ? PRESIDENT_EN : PRESIDENT_HE;
        for (const href of [got.srcHref, ...got.rows.map((r) => r.href)]) if (!page.test(href ?? '')) errors.push(`[${current}] source ${href} is not a ${l === 'en' ? 'president.gov.il/en/' : 'Hebrew president.gov.il'} page`);
        if (got.styled) errors.push(`[${current}] ${got.styled} styled element(s) in the table rows: every candidate gets the same neutral look`);
        if (l === 'en' && got.hebrew) errors.push(`[${current}] Hebrew in the English sheet`);
        if (got.overflow) errors.push(`[${current}] the sheet overflows horizontally`);
        const x = await evaluate(SHEET_X);
        if (x !== 'ok') errors.push(`[${current}] sheet ✕: ${x}`);
        await evaluate("document.querySelector('#sheet .sheet-close').click()");
        await settle(200);
        const back = await evaluate("({ open: document.querySelector('#sheet').open, focus: document.activeElement?.dataset?.act ?? null })");
        if (back.open || back.focus !== 'recs') errors.push(`[${current}] after ✕: ${JSON.stringify(back)} (want closed, focus on the line)`);
        // Party sheets: each list in the Knesset carries its line, a list outside it none.
        // The matrix lists the members only: all the lists in the Knesset at once, so every party sheet opens from it.
        await go(`${baseUrl}#results?m=${passedIds.join(',')}${l === 'en' ? '&l=en' : ''}`);
        await waitFor(() => evaluate(`document.querySelectorAll('.party-btn').length === ${passedIds.length}`));
        for (const f of recs.factions.map(loc)) {
          await evaluate("(() => { const d = document.querySelector('#sheet'); if (d.open) d.close(); return true; })()");
          await evaluate(`document.querySelector('.party-btn[data-id="${f.partyId}"]').click()`);
          await settle(150);
          const p = await evaluate("(() => { const e = document.querySelector('#sheet .recs-party'); return e && { text: e.innerText.replace(/\\s+/g, ' ').trim(), href: e.querySelector('a')?.getAttribute('href'), afterVotes: e.previousElementSibling?.classList.contains('votes-line') }; })()");
          const wantText = `${R.partyLine(R.date(f.date), leader(f.recommended))} ${R.partySource}`;
          if (!p || p.text !== wantText || p.href !== f.sourceUrl || !p.afterVotes) errors.push(`[${current}] party sheet ${f.partyId}: ${JSON.stringify(p)}, want "${wantText}" → ${f.sourceUrl}, after the votes line`);
        }
        await evaluate("(() => { const d = document.querySelector('#sheet'); if (d.open) d.close(); return true; })()");
        for (const id of ctx.parties.filter((p) => !ctx.passed(p.id)).map((p) => p.id)) {
          await go(`${baseUrl}#build${l === 'en' ? '?l=en' : ''}`);
          await waitFor(() => evaluate(`document.querySelector('[data-act="party"][data-id="${id}"]') !== null`));
          await evaluate(`document.querySelector('[data-act="party"][data-id="${id}"]').click()`);
          await settle(150);
          if (await evaluate("document.querySelector('#sheet').open && document.querySelector('#sheet .recs-party') !== null")) errors.push(`[${current}] ${id} is not in the Knesset but its sheet shows a recommendation`);
          await evaluate("(() => { const d = document.querySelector('#sheet'); if (d.open) d.close(); return true; })()");
        }
        if (w === 390) {
          await go(`${baseUrl}#build${l === 'en' ? '?l=en' : ''}`);
          await waitFor(() => evaluate("document.querySelector('[data-act=\"recs\"]') !== null"));
          await evaluate("document.querySelector('[data-act=\"recs\"]').click()");
          await settle(250);
          await shoot({ width: w, height: 800, dpr: 2, mobile: true }, `sheet-recs-${l}.png`, false);
          await evaluate("document.querySelector('#sheet').close()");
        }
      }
    }
    await setSize(SIZES[0]);
    log(`  ✓ recommendations: ${recRuns} runs${RESULTS ? ` (360/390 × he/en), ${recs.factions.length} party sheets each` : ' (absent in this mode)'}`);
  }
  endSection();
  log(`  ${MODE}: ${Math.round((Date.now() - t0) / 1000)}s (${sectionTimes.join(', ')})`);
  toLog(`  settle: ${settles.n} waits, ${settles.capped} reached their cap`);
  c.close();
} catch (e) {
  errors.push(`smoke failed: ${e.message}`);
} finally {
  cleanup();
}

if (onProd && beacons.length === 0) errors.push('no GoatCounter beacon seen on production: the privacy check did not run');
if (!onProd && beacons.length > 0) errors.push(`${beacons.length} GoatCounter beacon(s) sent from a non-production host (${new URL(baseUrl).host}); only ${PROD_HOST} may count`);

if (errors.length) {
  // stdout: the first 10 errors, each cut at 400 characters; the log has them all in full.
  toLog(`✗ ${errors.length} error(s):\n  ` + errors.join('\n  '));
  const cut = (e) => (e.length > 400 ? `${e.slice(0, 400)}…` : e);
  writeSync(2, `✗ ${errors.length} error(s) [${MODE}]:\n  ${errors.slice(0, 10).map(cut).join('\n  ')}\n`
    + `  ${errors.length > 10 ? `… ${errors.length - 10} more; ` : ''}all of them in ${rel(LOG)}\n`);
  const again = failedSections.has('*') ? [...ONLY] : SECTIONS.filter((x) => failedSections.has(x));
  const rerun = ['node scripts/smoke.mjs', base, `--mode=${MODE}`, again.length < SECTIONS.length ? `--only=${again.join(',')}` : null, '--shots'].filter(Boolean).join(' ');
  logErr(`  rerun: ${rerun}`);
  exitCode = 1;
} else {
  log(`✓ no console errors (log: ${rel(LOG)}${SHOTS ? `, screenshots in ${rel(OUT)}/` : ''})`);
  log(`  GoatCounter beacons intercepted: ${beacons.length}${onProd ? ' (none carried coalition data)' : ' (none expected off production)'}`);
}
process.exit(exitCode);
