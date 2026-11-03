// Smoke test: opens each view in headless Chrome at phone (390px) and desktop (1280px) width, saves screenshots,
// and fails on console errors, page overflow, routing mistakes, or a GoatCounter beacon that carries coalition data.
// Beacons: against production every beacon is checked (and never sent); on any other host none may be sent at all.
// Zero installs: drives Chrome over the DevTools protocol with Node's built-in WebSocket.
// Headers: local runs send netlify.toml's headers, so the CSP is enforced; remote runs check the served header matches.
// Usage: node scripts/smoke.mjs [baseUrl] [--no-hud]   (default: serves ./site on a local port)
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { ROOT, loadData } from './lib.mjs';
import { contextFor, presets, serializeState, ballotOrder, completions, parseLocation, stateKeysIn, selected, locationFor, closestTo, redLinesCrossed, pivotal, investiture } from '../site/js/compat.js';
import { PROD_HOST } from '../site/js/stats.js';
import { S } from '../site/js/strings.js';
import { S as EN } from '../site/js/strings.en.js';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = join(ROOT, 'smoke');
const SIZES = [{ tag: 'm', width: 390, height: 844, mobile: true, dpr: 2 }, { tag: 'd', width: 1280, height: 900, mobile: false, dpr: 1 }];
const members_in_url = (qs) => /[?&]m=/.test(qs);
// A URL suffix split like a location; legacy links carry the state in the query, current ones in the fragment.
const splitSuffix = (suffix) => { const i = suffix.indexOf('#'); return i < 0 ? { search: suffix, hash: '' } : { search: suffix.slice(0, i), hash: suffix.slice(i) }; };
const isLegacy = (suffix) => stateKeysIn(splitSuffix(suffix).search);
// The state params a suffix carries: the fragment's, or a legacy query's when the fragment has none.
const stateParams = (suffix) => { const { search, hash } = splitSuffix(suffix); const f = hash.split('?')[1] ?? ''; return new URLSearchParams(stateKeysIn(f) ? f : search); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v; } catch { /* retry */ }
    await sleep(150);
  }
  throw new Error('timeout');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

// The headers Netlify sends for every path (netlify.toml: [[headers]] for = "/*").
function siteHeaders() {
  const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');
  const block = toml.split('[[headers]]').find((b) => /for\s*=\s*"\/\*"/.test(b)) ?? '';
  const values = block.split('[headers.values]')[1] ?? '';
  return Object.fromEntries([...values.matchAll(/^\s*([\w-]+)\s*=\s*"(.*)"\s*$/gm)].map((m) => [m[1], m[2]]));
}

// Netlify's free plan injects a badge script into production pages. It builds a srcdoc iframe with an inline script
// and style, which inherits our CSP. Local runs fetch the live tag and script and serve them on ?smoke-hud.
async function fetchHud() {
  const page = await (await fetch(`https://${PROD_HOST}/`)).text();
  const tag = page.match(/<script[^>]*data-nf-variant[^>]*><\/script>/)?.[0];
  if (!tag) throw new Error(`no badge script on https://${PROD_HOST}/ (run with --no-hud to skip the badge check)`);
  const src = new URL(tag.match(/src="([^"]+)"/)[1].replace(/&amp;/g, '&'), `https://${PROD_HOST}/`);
  return { tag, path: src.pathname, js: await (await fetch(src)).text() };
}

// Minimal static server for ./site (query strings ignored, like Netlify), sending netlify.toml's headers.
async function serve(hud) {
  const dir = join(ROOT, 'site');
  const headers = siteHeaders();
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (hud && url.pathname === hud.path) { res.writeHead(200, { ...headers, 'content-type': 'text/javascript' }); res.end(hud.js); return; }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([.][.][/\\])+/, '');
    let file = join(dir, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(dir) || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { ...headers, 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    const body = readFileSync(file);
    res.end(hud && url.searchParams.has('smoke-hud') && file.endsWith('index.html') ? body.toString().replace('</body>', `${hud.tag}\n</body>`) : body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, stop: () => server.close() };
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
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
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params }));
    }),
    on: (fn) => listeners.push(fn),
    close: () => ws.close(),
  };
}

const { parties, topics, meta, results } = loadData();
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
  return r.length ? `🚩 ${T.results.redLinesCrossed(r.length, r.map((x) => `${c.byId.get(x.partyId).name} · ${c.topics.find((t) => t.id === x.topicId).short}`).join(', '))}` : T.results.noRedLinesCrossed;
}
// The snapshot's top: the scope caption right under the title (only with supporters or abstainers), then the breakdown,
// the pointer to the supporters/abstainers card, and the red-line line, in that order.
const OVERVIEW_JS = `(() => { const o = document.querySelector('#results .overall'); if (!o) return null; const cap = o.querySelector('.overall-scope');
  const bd = o.querySelector('.breakdown'); const a = bd?.nextElementSibling; const b = a?.nextElementSibling;
  return { cap: cap ? cap.innerText.trim() : null, capFirst: !cap || cap.previousElementSibling?.tagName === 'H2', next: [a?.className ?? '', b?.className ?? ''] }; })()`;
function overviewErrors(T, state, ov) {
  const side = state.supporters.length + state.abstainers.length > 0;
  const want = side ? T.results.summaryScope(state.members.length) : null;
  const out = [];
  if (ov.cap !== want) out.push(`scope caption should be ${JSON.stringify(want)}, got ${JSON.stringify(ov.cap)}`);
  if (!ov.capFirst) out.push('scope caption must come right after the title');
  const [a, b] = ov.next;
  if (side ? !(a.includes('periphery-link') && b.includes('redlines-line')) : !a.includes('redlines-line')) out.push(`after the breakdown: expected ${side ? 'pointer, then red-line line' : 'red-line line'}, got ${a} | ${b}`);
  return out;
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
const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--'));
const hud = base || args.includes('--no-hud') ? null : await fetchHud();
const server = base ? null : await serve(hud);
const baseUrl = (base ?? server.url).replace(/\/?$/, '/');
const onProd = new URL(baseUrl).hostname === PROD_HOST;
const profile = mkdtempSync(join(tmpdir(), 'smoke-chrome-'));
const port = 9300 + Math.floor(Math.random() * 100);
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--lang=he', 'about:blank',
], { stdio: 'ignore' });

const errors = [];
const beacons = [];
const siteHost = new URL(baseUrl).host;
const partyIds = new RegExp(parties.map((p) => p.id).join('|'), 'i');
// Set by go() while an old-format link (state in the query) loads.
let legacyNav = false;
let exitCode = 0;
try {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const targets = await waitFor(() => fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()));
  const page = targets.find((t) => t.type === 'page');
  const c = cdp(page.webSocketDebuggerUrl);
  await c.ready;
  let current = '';
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
  // Simulate the host's floating badge (202×64, bottom-right) wherever the real one is absent (local, drafts), so layout
  // checks see what production visitors see. The marker script makes the app reserve room for it, as on production.
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('script[data-nf-variant]')) return;
    const s = document.createElement('script'); s.type = 'text/plain'; s.dataset.nfVariant = 'smoke-sim'; document.head.append(s);
    const b = document.createElement('div'); b.id = 'sim-host-badge';
    b.style.cssText = 'position:fixed;bottom:0;right:0;width:202px;height:64px;z-index:2147483647;background:rgba(20,22,28,.55)';
    document.body.append(b);
  });` });

  // CSP violations, ours or inside the badge's srcdoc iframe, become console errors and fail the run.
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('securitypolicyviolation', (e) =>
    console.error('CSP violation: ' + e.effectiveDirective + ' blocked ' + (e.blockedURI || 'inline') + ' ' + (e.sample || '')));` });

  const evaluate = async (expr) => (await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
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

  const shoot = async (z, file, full = true) => {
    let height = z.height;
    if (full) {
      const { cssContentSize } = await c.send('Page.getLayoutMetrics');
      height = Math.min(Math.ceil(cssContentSize.height), 9000);
      await setSize(z, height);
      await sleep(200);
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

  for (const z of SIZES) {
    await setSize(z);
    for (const [name, suffix, expectView] of cases) {
      current = `${name}@${z.width}`;
      await go(baseUrl + suffix);
      await waitFor(() => evaluate("document.body.dataset.view !== undefined && document.querySelector('#footer')?.children.length > 0"));
      await sleep(250);
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
        if (title !== `${S.appName} · ${S.tagline}`) errors.push(`[${current}] <title> must be "${S.appName} · ${S.tagline}", got "${title}"`);
        const purpose = await evaluate("document.querySelector('#purpose')?.innerText || ''");
        if (!purpose.includes('כל עמדה מגובה במקור. זו לא המלצת הצבעה.')) errors.push(`[${current}] build view is missing the purpose line`);
        if (!purpose.includes('רקורד בפועל (הצעות חוק שהמפלגה יזמה או קידמה)') || purpose.includes('הצבעות')) errors.push(`[${current}] purpose line must name all three source kinds, with record = bills (no votes)`);
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
          // The host badge must not cover the bar's button.
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
          const pointer = await evaluate("document.querySelector('#results .overall [data-act=\"to-periphery\"]')?.innerText || ''");
          if (!/^↓ (ועוד \d+ סתירות חזיתיות|ועוד סתירה חזיתית אחת|אין סתירות חזיתיות) מול התומכות והנמנעות$/.test(pointer)) errors.push(`[${current}] snapshot lacks the pointer to the supporters/abstainers card (${pointer})`);
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
        if (exp.state.members.length >= 2) {
          const ov = await evaluate(OVERVIEW_JS);
          for (const e of ov ? overviewErrors(S, exp.state, ov) : ['no snapshot']) errors.push(`[${current}] ${e}`);
        }
        // #14: one red-line line in the snapshot (also when none is crossed), the same list as the completions card.
        if (exp.state.members.length >= 2) {
          const got = await evaluate(REDLINES_JS);
          const want = redLinesText('he', exp.state.members);
          if (got !== want) errors.push(`[${current}] red-line line should be "${want}", got "${got}"`);
          if (RESULTS && name === 'results-coalition' && !got.startsWith('🚩 2 קווים אדומים נחצים')) errors.push(`[${current}] expected 2 red lines crossed, got "${got}"`);
          if (name === 'results-opposition' && got !== S.results.noRedLinesCrossed) errors.push(`[${current}] expected no red line crossed, got "${got}"`);
          const card = await evaluate(`(() => { const c = document.querySelector('#results .completions'); if (!c) return null;
            const t = [...c.querySelectorAll('.tag-red')].map((e) => e.innerText.replace(/\\s+/g, ' ').trim()).find((x) => x.includes('כבר חוצה')); return t ? t.slice(t.indexOf(': ') + 2) : ''; })()`);
          const list = got.startsWith('🚩') ? got.slice(got.indexOf(': ') + 2) : '';
          if (card !== null && card !== list) errors.push(`[${current}] red-line line and completions card disagree ("${list}" vs "${card}")`);
        }
        // #1: the supporters' and abstainers' head-on clashes, the same N and words as the snapshot pointer; nothing without them.
        if (wa) {
          const text = new URL(wa).searchParams.get('text');
          const pointer = await evaluate("document.querySelector('#results .overall [data-act=\"to-periphery\"]')?.innerText || ''");
          const tail = pointer.replace(/^↓ (ועוד )?/, '');
          if (pointer ? !text.includes(` · ${tail}\n`) : text.includes('מול התומכות')) errors.push(`[${current}] share text and snapshot pointer disagree (${pointer || 'no pointer'}): ${text}`);
        }
      }
      if (expectView === 'method') {
        const secs = await evaluate("(() => { const p = document.querySelector('#privacy'), a = document.querySelector('#accessibility'); const f = [...document.querySelectorAll('#footer a')].map((x) => x.getAttribute('href')); return [p?.innerText.includes('GoatCounter') && p.innerText.includes('lioz.akirav@gmail.com'), a?.innerText.includes('5568') && a.innerText.includes('1.11.2026'), f.includes('#privacy'), f.includes('#accessibility')].join(','); })()");
        if (secs !== 'true,true,true,true') errors.push(`[${current}] privacy/accessibility sections or footer links missing (${secs})`);
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
    console.log(`  ✓ ${z.width}px: ${cases.length} views`);
  }

  // Legal sentence vs seat numbers, with the host badge present: whenever seat totals are visible, the full sentence must
  // be visible too, except for parts already scrolled past the top (reading down, the sentence always comes first).
  // Checked on first load and at every 40px of scroll, on a regular and a short phone.
  if (!SEATS_HIDDEN) {
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
        current = `legal-${name}@${z.width}x${z.height}`;
        await go(baseUrl + suffix);
        await waitFor(() => evaluate("document.body.dataset.view !== undefined && document.querySelector('#footer')?.children.length > 0 && (document.querySelector('script[data-nf-variant]') !== null)"));
        await sleep(400);
        const first = await evaluate(LEGAL_CHECK);
        if (first) errors.push(`[${current}] first load: seat numbers visible without the full legal sentence (${first})`);
        const scrolled = await evaluate(`(() => { const out = []; const max = document.documentElement.scrollHeight - innerHeight;
          for (let y = 0; y <= max; y += 40) { window.scrollTo(0, y); const r = ${LEGAL_CHECK}; if (r) out.push(y + ': ' + r); }
          window.scrollTo(0, 0); return out.slice(0, 3).join(' | '); })()`);
        if (scrolled) errors.push(`[${current}] while scrolling: seat numbers visible without the full legal sentence at ${scrolled}`);
        if (await evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')) errors.push(`[${current}] horizontal page overflow`);
      }
    }
    console.log(`  ✓ legal sentence vs seat numbers: ${legalCases.length} views × 390×844, 375×667 (with host badge)`);
  }

  // The served CSP is netlify.toml's. Netlify's badge (real on production, emulated locally) runs under it: its srcdoc
  // script reports back (data-nl-ready), and its hash is in the policy. (Its inline <style> embeds the viewport size,
  // so it has no stable hash; style-src-elem allows inline <style> instead.)
  const csp = siteHeaders()['Content-Security-Policy'];
  if (base) {
    const served = (await fetch(baseUrl, { method: 'HEAD' })).headers.get('content-security-policy');
    if (served !== csp) errors.push(`[headers] the served CSP differs from netlify.toml:\n    served: ${served}\n    toml:   ${csp}`);
  }
  if (hud || onProd) {
    for (const [z, dark] of [[SIZES[0], false], [SIZES[1], false], [SIZES[0], true]]) {
      current = `badge-csp@${z.width}${dark ? '-dark' : ''}`;
      await setSize(z);
      await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
      await go(`${baseUrl}${hud ? '?smoke-hud=1' : ''}#results?m=likud,yashar`);
      const ran = await waitFor(() => evaluate("document.querySelector('#nl-badge-frame')?.dataset.nlReady === '1'"), 6000).catch(() => false);
      const hashes = await evaluate(`(async () => { const f = document.querySelector('#nl-badge-frame'); if (!f) return null;
        const d = new DOMParser().parseFromString(f.srcdoc, 'text/html');
        const h = async (t) => "'sha256-" + btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))))) + "'";
        return Promise.all([...d.querySelectorAll('script')].map((e) => h(e.textContent))); })()`);
      if (!hashes) errors.push(`[${current}] Netlify's badge iframe did not mount`);
      else if (hashes.some((x) => !csp.includes(x))) errors.push(`[${current}] the badge's inline script changed; its script hash is now ${hashes.join(' ')} (update netlify.toml)`);
      if (!ran) errors.push(`[${current}] Netlify's badge script did not run under the CSP`);
      // The badge can report back before the app has rendered (slower data fetches on production).
      await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelector('#footer')?.children.length > 0"));
      await sleep(250);
      await shoot(z, `badge-csp-${z.tag}${dark ? '-dark' : ''}.png`, false);
    }
    await c.send('Emulation.setEmulatedMedia', { features: [] });
    await setSize(SIZES[0]);
    console.log(`  ✓ Netlify badge under the CSP (${hud ? 'emulated' : 'production'})`);
  }

  // Interactions at phone width: pick a preset on the build view, open the poll note, go to results, open a cell, come back.
  const z = SIZES[0];
  await setSize(z);
  current = 'interaction@390';
  await go(baseUrl);
  await ready();
  if (RESULTS) {
    // Media scenarios replace the bloc presets: up to 4, named by composition, sorted alphabetically, each with a
    // dated, linked source; tapping one fills members, supporters and abstainers.
    const { scenarios } = loadData();
    const scen = await evaluate(`(() => { const sec = document.querySelector('#presets'); return { title: sec.querySelector('h2')?.innerText,
      old: sec.querySelectorAll('[data-act="preset"]').length, items: [...sec.querySelectorAll('.scenario')].map((li) => ({
        id: li.querySelector('[data-act="scenario"]').dataset.id, label: li.querySelector('[data-act="scenario"]').innerText.trim(),
        links: [...li.querySelectorAll('.scen-src a')].map((a) => a.href), src: li.querySelector('.scen-src').innerText })) }; })()`);
    if (scen.title !== S.presets.scenariosTitle(S.presets.shortDate(scenarios.asOf))) errors.push(`[interaction] scenarios heading wrong (${scen.title})`);
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
      const want = `${S.presets.sourcesLabel(sc.sources.length)} ${sc.sources.map((x) => `${x.by ? S.presets.personIn(x.by) : ''}${x.outlet}, ${S.presets.shortDate(x.date)}`).join(' · ')}`;
      if (it.src.replace(/\s+/g, ' ').trim() !== want) errors.push(`[interaction] scenario ${it.id} source line "${it.src}" should read "${want}"`);
    }
    await shoot(z, 'interaction-scenarios-m.png', false);
    if (await evaluate("document.querySelector('#presets .scen-note') !== null")) errors.push('[interaction] scenario notes must not be rendered (they live in decisions.md)');
    const b = scenarios.scenarios.find((x) => x.supporters.length && x.abstainers.length) ?? scenarios.scenarios[0];
    await evaluate(`document.querySelector('[data-act="scenario"][data-id="${b.id}"]').click()`);
    await sleep(300);
    const q = new URLSearchParams(await frag());
    const ids = (k) => (q.get(k) ?? '').split(',').filter(Boolean).sort().join(',');
    if (ids('m') !== [...b.members].sort().join(',') || ids('o') !== [...b.supporters].sort().join(',') || ids('a') !== [...b.abstainers].sort().join(',')) errors.push(`[interaction] scenario tap did not set its roles (${q})`);
  } else {
    await evaluate("document.querySelector('[data-act=\"preset\"][data-id=\"unity\"]').click()");
  }
  await sleep(300);
  await shoot(z, 'interaction-build-unity-m.png', false);
  if (!RESULTS && !SEATS_HIDDEN) {
    await evaluate("document.querySelector('#builder [data-act=\"poll-info\"]').click()");
    await sleep(300);
    const info = await evaluate("document.querySelector('#sheet').innerText.replace(/\\s+/g, ' ')");
    if (!info.includes(legal)) errors.push('[interaction] poll-info sheet lacks the legal sentence');
    await shoot(z, 'interaction-poll-info-m.png', false);
  }
  await evaluate("document.querySelector('#sheet').close(); document.querySelector('#bar a.btn').click()");
  await sleep(400);
  const afterClick = await evaluate('document.body.dataset.view');
  if (afterClick !== 'results') errors.push(`[interaction] "לתוצאות" did not open results (view "${afterClick}")`);
  await evaluate("document.querySelector('.cell')?.click()");
  await sleep(300);
  await shoot(z, 'interaction-cell-sheet-m.png', false);
  const dialogName = await evaluate("(() => { const d = document.querySelector('#sheet'); const t = document.getElementById(d.getAttribute('aria-labelledby') || ''); return t && d.contains(t) ? t.textContent.trim() : ''; })()");
  if (!dialogName) errors.push('[interaction] sheet dialog has no accessible name (aria-labelledby)');
  // The cell sheet offers a corrections mailto with a prefilled subject and the page URL in the body.
  const mailto = await evaluate("document.querySelector('#sheet a[href^=\"mailto:\"]')?.getAttribute('href') || ''");
  const mq = mailto ? new URL(mailto).searchParams : null;
  if (!mq || !/^תיקון: .+ · .+/.test(mq.get('subject') ?? '') || !(mq.get('body') ?? '').includes('http')) errors.push(`[interaction] cell sheet is missing a valid corrections mailto (${mailto})`);
  if (!mailto.startsWith('mailto:lioz.akirav@gmail.com?')) errors.push('[interaction] corrections mailto must go to lioz.akirav@gmail.com');
  await evaluate("document.querySelector('#sheet').close(); document.querySelector('#results-bar .back').click()");
  await sleep(300);
  const backView = await evaluate('document.body.dataset.view');
  if (backView !== 'build') errors.push(`[interaction] "← עריכה" did not return to build (view "${backView}")`);
  // A position with a verified archive snapshot shows the "עותק בארכיון" link in its cell sheet.
  const withArchive = JSON.parse(readFileSync(join(ROOT, 'site', 'data', 'positions.json'), 'utf8')).find((p) => p.archiveUrl);
  if (withArchive) {
    await go(`${baseUrl}#results?m=${withArchive.partyId},together`);
    await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.cell').length > 0"));
    await evaluate(`document.querySelector('.cell[data-party="${withArchive.partyId}"][data-topic="${withArchive.topicId}"]').click()`);
    await sleep(300);
    const href = await evaluate("[...document.querySelectorAll('#sheet a')].find((a) => a.textContent.includes('עותק בארכיון'))?.href || ''");
    if (!/^https:\/\/web\.archive\.org\/web\/\d{14}\//.test(href)) errors.push(`[interaction] cell sheet for ${withArchive.partyId}/${withArchive.topicId} lacks its archive link (${href})`);
    await shoot(z, 'interaction-archive-link-m.png', false);
  }
  // Picker: tap a row to toggle, outside toggle, three-party build screenshot.
  await go(baseUrl);
  await ready();
  for (const id of ['likud', 'shas', 'otzma-yehudit']) await evaluate(`document.querySelector('[data-act="toggle"][data-id="${id}"]').click()`);
  await sleep(300);
  const sel = await evaluate("[...document.querySelectorAll('#builder .prow-main[aria-checked=\"true\"]')].length");
  if (sel !== 3) errors.push(`[interaction] tapping rows should select 3 parties, got ${sel}`);
  await evaluate("document.querySelector('[data-act=\"role\"][data-id=\"shas\"][data-role=\"supporter\"]').click()");
  await sleep(200);
  if (!/o=shas/.test(await frag())) errors.push(`[interaction] supporter role did not set o= (${await frag()})`);
  await evaluate("(() => { const b = document.querySelector('[data-act=\"role\"][data-id=\"shas\"][data-role=\"abstainer\"]'); b.focus(); b.click(); })()");
  await sleep(200);
  const absUrl = await frag();
  if (!/a=shas/.test(absUrl) || /o=shas/.test(absUrl)) errors.push(`[interaction] abstainer role did not move shas to a= (${absUrl})`);
  if ((await evaluate("document.activeElement?.dataset.key")) !== 'role-shas-abstainer') errors.push('[interaction] focus lost after choosing a role');
  await evaluate("document.querySelector('[data-act=\"role\"][data-id=\"shas\"][data-role=\"member\"]').click()");
  await sleep(200);
  // Unselecting a row clears its role (back to opponent).
  await evaluate("document.querySelector('[data-act=\"role\"][data-id=\"shas\"][data-role=\"supporter\"]').click(); document.querySelector('[data-act=\"toggle\"][data-id=\"shas\"]').click()");
  await sleep(200);
  if (/shas/.test(await frag())) errors.push('[interaction] unselecting a supporter did not clear its role');
  await evaluate("document.querySelector('[data-act=\"toggle\"][data-id=\"shas\"]').click()");
  await sleep(200);
  await evaluate('window.scrollTo(0, document.querySelector("#builder .seats-box").getBoundingClientRect().top + scrollY - 10)');
  await sleep(200);
  await shoot(z, 'interaction-build-3-selected-m.png', false);
  // Results: base control, expanding gap card, pair view from an expanded pair.
  await evaluate("document.querySelector('#bar a.btn').click()");
  await sleep(400);
  if ((await evaluate('document.body.dataset.view')) !== 'results') errors.push('[interaction] "לתוצאות" from the picker did not open results');
  await go(`${baseUrl}#results?m=likud,democrats,yashar,shas`);
  await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.colorby').length > 0"));
  const baseBtns = await evaluate("document.querySelectorAll('.colorby [role=\"radio\"]').length");
  if (baseBtns !== 5) errors.push(`[interaction] base control should list הכל + 4 parties, got ${baseBtns}`);
  await evaluate("document.querySelector('.colorby [data-id=\"shas\"]').click()");
  await sleep(300);
  const bq = await frag();
  if (!/b=shas/.test(bq)) errors.push(`[interaction] base control did not set b= (${bq})`);
  const starLine = await evaluate("document.querySelector('#results-coalition').innerText.includes('★')");
  if (!starLine) errors.push('[interaction] coalition line should mark the base with ★');
  const sealed = await evaluate("document.querySelector('.gap-head') ? 'yes' : ''");
  if (!sealed) errors.push('[interaction] results have no gap cards for this coalition');
  else {
    await evaluate("document.querySelector('.gap-head').click()");
    await sleep(300);
    const open = await evaluate("document.querySelector('.gap-head').getAttribute('aria-expanded') === 'true' && document.querySelectorAll('.pair-list .pair-btn').length > 0");
    if (!open) errors.push('[interaction] gap card did not expand to list its pairs');
    const tagOk = await evaluate("/· (זוג מפלגות אחד|\\d+ זוגות מפלגות)/.test(document.querySelector('.gap-head .lv').textContent) && !document.body.innerText.includes('ועוד')");
    if (!tagOk) errors.push('[interaction] gap card tag must carry the pair count and no "ועוד N זוגות" line');
    await evaluate('window.scrollTo(0, document.querySelector(".gap").getBoundingClientRect().top + scrollY - 120)');
    await sleep(200);
    await shoot(z, 'interaction-results-base-gap-expanded-m.png', false);
    await evaluate("document.querySelector('.pair-list .pair-btn').click()");
    await sleep(300);
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
    await sleep(300);
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
    await sleep(200);
    const m = new URLSearchParams(await frag()).get('m') ?? '';
    if (m !== 'religious-zionism') errors.push(`[interaction] results mode: selecting הציונות הדתית should not add זהות (m=${m})`);
    const notes = await evaluate("['religious-zionism', 'zehut'].map((id) => document.querySelector(`[data-act=\"toggle\"][data-id=\"${id}\"] .prow-sub`)?.innerText || '').join('|')");
    if (!notes.split('|').every((t) => t.includes('רצו ברשימה משותפת (ט)'))) errors.push(`[interaction] joint-list note missing on the ט rows (${notes})`);
    // The snapshot's pointer scrolls to the supporters/abstainers card, with its title below the sticky header.
    for (const size of SIZES) {
      await setSize(size);
      await go(`${baseUrl}#results?m=yashar,together,democrats,yisrael-beiteinu&o=joint-list&a=raam,utj`);
      await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelector('[data-act=\"to-periphery\"]') !== null"));
      await sleep(200);
      await evaluate("document.querySelector('[data-act=\"to-periphery\"]').click()");
      await sleep(400);
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
    await sleep(300);
    const card = await evaluate(`(() => { const c = document.querySelector('#results .completions'); if (!c) return null;
      return { title: c.querySelector('h3').innerText, note: c.innerText.includes(${JSON.stringify(S.completions.note)}), rows: [...c.querySelectorAll('[data-act="complete"]')].map((b) => b.dataset.ids) }; })()`);
    const wantRows = completions(ctx, pr.coalition.members).list.slice(0, 6).map((x) => x.add.join(','));
    if (!card) errors.push('[interaction] completions card missing for a coalition short of 61');
    else {
      if (card.title !== S.completions.title || !card.note) errors.push(`[interaction] completions card title/note wrong (${card.title})`);
      if (card.rows.join('|') !== wantRows.join('|')) errors.push(`[interaction] completions rows ${card.rows.join('|')} != ${wantRows.join('|')}`);
      await evaluate('window.scrollTo(0, document.querySelector("#results .completions").getBoundingClientRect().top + scrollY - 70)');
      await sleep(200);
      await shoot(z, 'interaction-completions-m.png', false);
      const before = await frag();
      await evaluate("document.querySelector('#results [data-act=\"complete\"]').click()");
      await sleep(300);
      const after = new URLSearchParams(await frag()).get('m') ?? '';
      if (!wantRows[0].split(',').every((id) => after.split(',').includes(id))) errors.push(`[interaction] tapping a completion did not add it (${after})`);
      if (await evaluate("document.querySelector('#results .completions') !== null")) errors.push('[interaction] completions card should disappear once members reach 61');
      await evaluate("document.querySelector('#toast [data-act=\"undo\"]').click()");
      await sleep(300);
      if ((await frag()) !== before) errors.push('[interaction] undo after a completion did not restore the coalition');
    }
    // The change bloc (48): fewest lists first, so "+ הליכוד" alone leads; 6 rows, then "הציגו את כל N" shows all.
    // With רע״ם supporting, a completion that adds it is tagged "(כיום תומכת)".
    const change = { members: ['yashar', 'together', 'democrats', 'yisrael-beiteinu'], supporters: ['raam'] };
    const all = completions(ctx, change.members);
    await go(`${baseUrl}#results${serializeState(ctx, { base: null, ...change })}`);
    await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelector('#footer')?.children.length > 0"));
    await sleep(300);
    const rowsOf = () => evaluate("[...document.querySelectorAll('#results .completions [data-act=\"complete\"]')].map((b) => b.dataset.ids + '|' + b.querySelector('.row-title').innerText)");
    const first = await rowsOf();
    if (first.length !== Math.min(6, all.total)) errors.push(`[interaction] completions should show 6 rows before "show all", got ${first.length}`);
    if (RESULTS && !first[0]?.startsWith('likud|')) errors.push(`[interaction] change bloc: "+ הליכוד" should come first (${first[0]})`);
    const toggle = await evaluate("(() => { const t = document.querySelector('#results [data-act=\"completions-all\"]'); return t ? t.innerText + '|' + t.getAttribute('aria-expanded') : ''; })()");
    if (all.total > 6 && toggle !== `${S.completions.showAll(all.total)}|false`) errors.push(`[interaction] completions toggle missing or wrong (${toggle})`);
    if (all.total > 6) {
      await evaluate("document.querySelector('#results [data-act=\"completions-all\"]').click()");
      await sleep(300);
      const expanded = await rowsOf();
      if (expanded.length !== all.total) errors.push(`[interaction] "show all" should list ${all.total} completions, got ${expanded.length}`);
      if (expanded.map((r) => r.split('|')[0]).join(';') !== all.list.map((x) => x.add.join(',')).join(';')) errors.push('[interaction] expanded completions are not in the expected order');
      const tagged = expanded.filter((r) => r.split('|')[0].split(',').includes('raam'));
      if (!tagged.length || !tagged.every((r) => r.includes('רע״ם (כיום תומכת)'))) errors.push(`[interaction] completions adding a supporter must tag it "(כיום תומכת)" (${tagged[0]})`);
      if (expanded.some((r) => !r.split('|')[0].split(',').includes('raam') && r.includes('(כיום'))) errors.push('[interaction] only current supporters/abstainers get a "(כיום …)" tag');
      const deltas = await evaluate("[...document.querySelectorAll('#results .completions [data-act=\"complete\"]')].every((b) => /\\((אין חדשים|אחד חדש|\\d+ חדשים)\\)|אין נושא בסתירה חזיתית/.test(b.innerText) && /קווים אדומים חדשים|קו אדום חדש|אין קווים אדומים חדשים/.test(b.innerText))");
      if (!deltas) errors.push('[interaction] each completion must show new clash topics and new red lines');
      await evaluate('window.scrollTo(0, document.querySelector("#results .completions").getBoundingClientRect().top + scrollY - 70)');
      await sleep(200);
      await shoot(z, 'interaction-completions-change-m.png', false);
    }
  }
  // Hebrew text outside an element with lang="he" (an untranslated string on the English page).
  const HEBREW_OUTSIDE = `(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) { if (!/[\\u05D0-\\u05EA]/.test(n.data)) continue; const el = n.parentElement;
      if (el.closest('noscript, script, style') || el.closest('[lang]')?.lang === 'he') continue; out.push(n.data.trim().slice(0, 40)); }
    return out.slice(0, 3).join(' | '); })()`;
  // Closest coalitions to a party (#22, results mode): from the party sheet and the build-view picker, in both languages,
  // on a regular and a short phone. Rows match closestTo() and show every sort key; coalitions with a silent partner are
  // collapsed behind a toggle naming exactly those partners (never X); tapping a row selects it with X as the base.
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
      if (!(await evaluate(`document.querySelector('#closest-rule')?.nextElementSibling?.innerText === ${JSON.stringify(T.method.closestRule)}`))) errors.push(`[closest-${lng}] the method page should state the closest-coalitions rule`);
      for (const size of [SIZES[0], { tag: 's', width: 375, height: 667, mobile: true, dpr: 2 }]) {
        await setSize(size);
        const tag = `closest-${lng}@${size.width}`;
        // Likud, from its party sheet.
        await go(`${baseUrl}#results?m=likud,yashar${sfx}`);
        await waitFor(() => evaluate("document.querySelector('.party-btn[data-id=\"likud\"]') !== null"));
        await evaluate("document.querySelector('.party-btn[data-id=\"likud\"]').click()");
        await sleep(250);
        await evaluate("document.querySelector('#sheet [data-act=\"closest\"]').click()");
        await sleep(300);
        let st = await evaluate(sheetState);
        const want = await check(tag, 'likud', st);
        if (st && !st.focus) errors.push(`[${tag}] focus should move to the list's heading`);
        if (size === SIZES[0]) await shoot(size, `interaction-closest-m${lng === 'he' ? '' : '-en'}.png`, false);
        if (lng === 'en') { const hebrew = await evaluate(HEBREW_OUTSIDE); if (hebrew) errors.push(`[${tag}] Hebrew outside lang="he": ${hebrew}`); }
        // Expand the silent-partner list, then both "show all".
        await evaluate("document.querySelector('#sheet [data-act=\"closest-partial\"]').click()");
        await sleep(200);
        st = await evaluate(sheetState);
        if (!st.partial || st.partial.map((r) => r.ids).join('|') !== want.partial.slice(0, 5).map((c) => c.add.join(',')).join('|')) errors.push(`[${tag}] expanded partial rows ${st.partial?.map((r) => r.ids).join('|')}`);
        if (st.partial && !st.partial.every((r) => r.warn)) errors.push(`[${tag}] every row with a silent partner needs its warning`);
        if (!st.toggle.endsWith('|true')) errors.push(`[${tag}] the toggle should report aria-expanded=true`);
        if (size === SIZES[0]) await shoot(size, `interaction-closest-partial-m${lng === 'he' ? '' : '-en'}.png`, false);
        for (const act of ['closest-all', 'closest-partial-all']) await evaluate(`document.querySelector('#sheet [data-act="${act}"]')?.click()`);
        await sleep(200);
        st = await evaluate(sheetState);
        if (st.full.length !== want.full.length || st.partial?.length !== want.partial.length) errors.push(`[${tag}] "show all" should list ${want.full.length} + ${want.partial.length}, got ${st.full.length} + ${st.partial?.length}`);
        if (st.full.map((r) => r.ids).join('|') !== want.full.map((c) => c.add.join(',')).join('|')) errors.push(`[${tag}] expanded main rows are out of order`);
        if (st.overflow) errors.push(`[${tag}] horizontal overflow with every row shown`);
        // The sheet's bar stays at the top while scrolling: back at the start, close (44px+, round) at the end.
        await evaluate("document.querySelector('#sheet').scrollTop = document.querySelector('#sheet').scrollHeight / 2");
        await sleep(200);
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
        await sleep(400);
        const wantHash = locationFor(ctx, { base: 'likud', members: ['likud', ...want.full[0].add], supporters: [], abstainers: [] }, 'results', '', lng);
        const got = await evaluate("JSON.stringify([location.hash, document.body.dataset.view, document.querySelector('#sheet').open])");
        if (got !== JSON.stringify([wantHash, 'results', false])) errors.push(`[${tag}] tapping a row should select it on #results (${got}, want ${wantHash})`);
        await evaluate("document.querySelector('#toast [data-act=\"undo\"]').click()");
        await sleep(300);
        if ((await frag()) !== before) errors.push(`[${tag}] undo did not restore the coalition`);
        // Shas: its own coverage note above the list, and never in its own toggle.
        await go(`${baseUrl}#results?m=likud,shas${sfx}`);
        await waitFor(() => evaluate("document.querySelector('.party-btn[data-id=\"shas\"]') !== null"));
        await evaluate("document.querySelector('.party-btn[data-id=\"shas\"]').click()");
        await sleep(250);
        await evaluate("document.querySelector('#sheet [data-act=\"closest\"]').click()");
        await sleep(300);
        st = await evaluate(sheetState);
        const shas = await check(`${tag}-shas`, 'shas', st);
        if (st && !st.text.includes(T.closest.ownCoverage(T.toParty(nm('shas')), shas.ownCoverage))) errors.push(`[${tag}-shas] the party's own coverage note is missing`);
        // "How is this calculated?" closes the sheet and lands on the rule on the method page.
        await evaluate(`[...document.querySelectorAll('#sheet a[href="#closest-rule"]')].find((a) => a.innerText === ${JSON.stringify(T.closest.howLink)})?.click()`);
        await sleep(400);
        const how = await evaluate("JSON.stringify([document.querySelector('#sheet').open, document.body.dataset.view, (() => { const r = document.querySelector('#closest-rule')?.getBoundingClientRect(); return Boolean(r) && r.top >= 0 && r.top < innerHeight / 2; })(), document.documentElement.lang])");
        if (how !== JSON.stringify([false, 'method', true, lng])) errors.push(`[${tag}] the method link should close the sheet and show the rule (${how})`);
        // The build-view picker opens the same list (Yisrael Beytenu: its red lines lead the order) and resets.
        await go(`${baseUrl}#build${lng === 'he' ? '' : '?l=en'}`);
        await ready();
        await evaluate("(() => { const s = document.querySelector('[data-act=\"closest-pick\"]'); s.value = 'yisrael-beiteinu'; s.dispatchEvent(new Event('change', { bubbles: true })); })()");
        await sleep(300);
        st = await evaluate(sheetState);
        await check(`${tag}-picker`, 'yisrael-beiteinu', st);
        if ((await evaluate("document.querySelector('[data-act=\"closest-pick\"]').value")) !== '') errors.push(`[${tag}-picker] the picker should reset (no preselected party)`);
        if (size === SIZES[0] && lng === 'he') await shoot(size, 'interaction-closest-picker-m.png', false);
        await evaluate("document.querySelector('#sheet').close()");
      }
    }
    await setSize(z);
    console.log('  ✓ closest coalitions');
  } else {
    await go(`${baseUrl}#results?m=likud,yashar`);
    await waitFor(() => evaluate("document.querySelector('.party-btn[data-id=\"likud\"]') !== null"));
    await evaluate("document.querySelector('.party-btn[data-id=\"likud\"]').click()");
    await sleep(250);
    if (await evaluate("document.querySelector('[data-act=\"closest\"], [data-act=\"closest-pick\"]') !== null")) errors.push('[interaction] closest coalitions must not appear in polls mode');
    await go(`${baseUrl}#method`);
    await waitFor(() => evaluate("document.querySelector('#method h1') !== null"));
    if (await evaluate("document.querySelector('#closest-rule') !== null")) errors.push('[interaction] the closest-coalitions rule must not appear on the method page in polls mode');
    await evaluate("document.querySelector('#sheet').close()");
  }

  // A cell sheet with a quote renders it in quotation marks with an attribution line underneath.
  const withQuote = JSON.parse(readFileSync(join(ROOT, 'site', 'data', 'positions.json'), 'utf8')).find((p) => p.quote && p.quoteBy && p.sourceDate);
  await go(`${baseUrl}#results?m=${withQuote.partyId},together`);
  await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.cell').length > 0"));
  await evaluate(`document.querySelector('.cell[data-party="${withQuote.partyId}"][data-topic="${withQuote.topicId}"]').click()`);
  await sleep(300);
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
    await sleep(300);
    const nr = await evaluate("(() => { const s = document.querySelector('#sheet'); return { label: s.querySelector('.pos-label')?.textContent.trim() ?? '', quote: s.querySelector('blockquote .q-text')?.textContent ?? '', by: s.querySelector('blockquote .q-by')?.textContent.trim() ?? '', src: s.querySelector('.pos .source a')?.href ?? '', tag: s.querySelector('.pos .tag-src') !== null }; })()");
    if (nr.label !== T.sheet.noPositionLabel || !nr.quote.includes('אני כלל לא מרגיש צורך בוועדת חקירה') || nr.by !== by || nr.src !== 'https://www.inn.co.il/news/700562' || nr.tag) {
      errors.push(`[interaction-${lng}] zehut × inquiry sheet should show the label, quote, "${by}" and the source, with no type tag (${JSON.stringify(nr)})`);
    }
    await shoot(z, `interaction-null-quote-m${lng === 'he' ? '' : '-en'}.png`, false);
    await evaluate("document.querySelector('#sheet').close()");
    await go(`${baseUrl}#results?m=raam,likud${l}`);
    await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.cell').length > 0"));
    await evaluate("document.querySelector('.cell[data-party=\"raam\"][data-topic=\"religion\"]').click()");
    await sleep(300);
    const rel = await evaluate("(() => { const p = document.querySelector('#sheet .pos'); return { quote: p?.querySelector('blockquote .q-text')?.textContent ?? '', by: p?.querySelector('blockquote .q-by')?.textContent.trim() ?? '', tag: p?.querySelector('.tag-src') !== null }; })()");
    const relBy = lng === 'he' ? 'מנסור עבאס, פייסבוק, 26.08.2026 (תרגום: כיפה)' : 'Mansour Abbas, Facebook, 26 Aug 2026 (Hebrew translation: Kipa)';
    if (!rel.quote.includes('נאלצו לקבל זאת מבחינה מעשית') || rel.by !== relBy || rel.tag) errors.push(`[interaction-${lng}] רע״ם × דת should show the full quote (with the practical acceptance) and "${relBy}", with no type tag (${JSON.stringify(rel)})`);
    await evaluate("document.querySelector('#sheet').close()");
    await evaluate("document.querySelector('.cell[data-party=\"raam\"][data-topic=\"draft\"]').click()");
    await sleep(300);
    const note = await evaluate("(() => { const p = document.querySelector('#sheet .pos'); return { text: p?.innerText ?? '', links: [...(p?.querySelectorAll('.source a') ?? [])].map((a) => a.href) }; })()");
    const year = lng === 'he' ? "במצע הרשימה מ-1999 נכתב: 'דחיית גיוסם של הערבים בצה״ל'." : "The list's 1999 platform says: 'rejection of the conscription of Arabs into the IDF'.";
    if (!note.text.includes(year) || !note.links.includes('https://www.idi.org.il/media/16883/%D7%A8%D7%A2%D7%9E-1999.pdf')) errors.push(`[interaction-${lng}] רע״ם × גיוס should carry the dated 1999 note and link the IDI copy (${JSON.stringify(note.links)})`);
    await shoot(z, `interaction-dated-note-m${lng === 'he' ? '' : '-en'}.png`, false);
    await evaluate("document.querySelector('#sheet').close()");
  }
  // Arabic quotes keep the original and add a marked Hebrew translation under it.
  await go(`${baseUrl}#results?m=raam,together`);
  await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.cell').length > 0"));
  await evaluate('document.querySelector(\'.cell[data-party="raam"][data-topic="palestinian"]\').click()');
  await sleep(300);
  const ar = await evaluate("(() => { const q = [...document.querySelectorAll('#sheet blockquote .q-text')]; return q.map((e) => e.textContent).join(' | '); })()");
  if (!/[\u0600-\u06FF]/.test(ar) || !ar.includes('(תרגום חופשי של האתר)')) errors.push(`[interaction] Arabic quote must show the original plus a marked translation (${ar})`);
  // The fragment keeps the coalition through nav links and history; a link pasted into the same tab (a fragment-only
  // change, no reload) brings its own coalition.
  const qsOf = (members) => serializeState(ctx, { base: null, members });
  await go(`${baseUrl}#results?m=likud,yashar`);
  await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelector('#footer')?.children.length > 0"));
  await evaluate("window.smokeNoReload = true; document.querySelector('#nav-method').click()");
  await sleep(300);
  if ((await evaluate('location.hash')) !== `#method${qsOf(['likud', 'yashar'])}`) errors.push(`[interaction] the method link should keep the coalition in the fragment (${await evaluate('location.hash')})`);
  await evaluate('history.back()');
  await sleep(400);
  if ((await evaluate('location.hash + "|" + document.body.dataset.view')) !== `#results${qsOf(['likud', 'yashar'])}|results`) errors.push(`[interaction] back should return to the same coalition's results (${await evaluate('location.hash')})`);
  await evaluate("location.hash = '#results?m=together,democrats'");
  await sleep(400);
  const pasted = await evaluate("({ hash: location.hash, line: document.querySelector('#results-coalition').innerText, same: window.smokeNoReload === true })");
  const pastedNames = ['together', 'democrats'].map((id) => ctx.byId.get(id).name);
  if (pasted.hash !== `#results${qsOf(['together', 'democrats'])}` || !pasted.same || !pastedNames.every((n) => pasted.line.includes(n)) || pasted.line.includes(ctx.byId.get('likud').name)) {
    errors.push(`[interaction] a pasted fragment should replace the coalition without a reload (${JSON.stringify(pasted)})`);
  }
  console.log('  ✓ interactions');

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
  for (const z2 of SIZES) {
    await setSize(z2);
    for (const [name, suffix, expectView] of enCases) {
      current = `en-${name}@${z2.width}`;
      await go(baseUrl + suffix);
      await waitFor(() => evaluate("document.body.dataset.view !== undefined && document.querySelector('#footer')?.children.length > 0"));
      await sleep(250);
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
        if (exp.state.members.length >= 2) {
          const ov = await evaluate(OVERVIEW_JS);
          for (const e of ov ? overviewErrors(EN, exp.state, ov) : ['no snapshot']) errors.push(`[${current}] English: ${e}`);
        }
        if (exp.state.members.length >= 2) {
          const got = await evaluate(REDLINES_JS);
          const want = redLinesText('en', exp.state.members);
          if (got !== want) errors.push(`[${current}] English red-line line should be "${want}", got "${got}"`);
        }
        if (wa) {
          const pointer = await evaluate("document.querySelector('#results .overall [data-act=\"to-periphery\"]')?.innerText || ''");
          const tail = pointer.replace(/^↓ /, '').replace(' more ', ' ').replace(/^No /, 'no ');
          if (pointer ? !text.includes(` · ${tail}\n`) : text.includes('supporters and abstainers')) errors.push(`[${current}] English share text and snapshot pointer disagree (${pointer || 'no pointer'}): ${text}`);
        }
      }
      await shoot(z2, `${name}-${z2.tag}-en.png`);
    }
    console.log(`  ✓ English, ${z2.width}px: ${enCases.length} views`);
  }

  // English interactions at phone width: the toggle (both ways, keeping the coalition, the view and focus), a nav link,
  // a pasted English link, and cell sheets with quotes in Hebrew and Arabic.
  await setSize(SIZES[0]);
  current = 'en-interaction@390';
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
  await sleep(300);
  if (await state() !== JSON.stringify(['en', `#results${qsOf(['likud', 'yashar'])}&l=en`, 'lang-switch', true, true])) errors.push(`[${current}] the toggle should switch to English in place, keeping the coalition and focus (${await state()})`);
  await evaluate("document.querySelector('#nav-method').click()");
  await sleep(300);
  if ((await evaluate('location.hash')) !== `#method${qsOf(['likud', 'yashar'])}&l=en`) errors.push(`[${current}] a nav link should keep l=en (${await evaluate('location.hash')})`);
  await evaluate("history.back()");
  await sleep(300);
  await evaluate("document.querySelector('#lang-switch button').click()");
  await sleep(300);
  if ((await evaluate("document.documentElement.lang + location.hash")) !== `he#results${qsOf(['likud', 'yashar'])}`) errors.push(`[${current}] the toggle should switch back to Hebrew and drop l= (${await evaluate('location.hash')})`);
  await evaluate("location.hash = '#results?m=together,democrats&l=en'");
  await sleep(400);
  const pastedEn = await evaluate("JSON.stringify([document.documentElement.lang, document.querySelector('#results-coalition').innerText, window.smokeSameDoc === true])");
  if (!pastedEn.startsWith('["en",') || !pastedEn.includes('Beyachad') || !pastedEn.endsWith('true]')) errors.push(`[${current}] a pasted English link should switch the language and coalition without a reload (${pastedEn})`);
  for (const [m, pid, tid, ql] of [['yashar,likud', 'yashar', 'draft', 'he'], ['likud,raam', 'raam', 'palestinian', 'ar']]) {
    await go(`${baseUrl}#results?m=${m}&l=en`);
    await waitFor(() => evaluate("document.querySelector('[data-act=\"cell\"]') !== null"));
    await evaluate(`document.querySelector('[data-act="cell"][data-party="${pid}"][data-topic="${tid}"]').click()`);
    await sleep(300);
    const sheet = await evaluate(`(() => { const s = document.querySelector('#sheet'); if (!s.open) return 'not open';
      const q = s.querySelector('blockquote .q-text'); const t = s.querySelector('blockquote .q-trans'); const mail = s.querySelector('.correction a')?.href ?? '';
      return JSON.stringify([q?.lang, t?.innerText.endsWith(${JSON.stringify(EN.sheet.siteTranslation)}), new URL(mail).searchParams.get('subject')?.startsWith('Correction: ')]); })()`);
    if (sheet !== JSON.stringify([ql, true, true])) errors.push(`[${current}] ${pid}|${tid} sheet: the quote must stay in its language (${ql}) with the site's translation and an English correction mail (${sheet})`);
    const hebrew = await evaluate(HEBREW_OUTSIDE);
    if (hebrew) errors.push(`[${current}] ${pid}|${tid} sheet: Hebrew text outside lang="he": ${hebrew}`);
  }
  console.log('  ✓ English interactions');

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
  for (const w of [360, 390, 1280]) {
    await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 2, mobile: w < 600 });
    for (const l of ['he', 'en']) {
      current = `layout-${l}@${w}`;
      await go(`${baseUrl}#results?m=likud,yashar,together${l === 'en' ? '&l=en' : ''}`);
      await waitFor(() => evaluate("document.querySelector('#results .seg') !== null && document.querySelector('#matrix .topic-btn') !== null"));
      await sleep(250);
      const bad = await evaluate(LAYOUT_CHECK);
      if (bad) errors.push(`[${current}] ${bad}`);
    }
  }
  await setSize(SIZES[0]);
  console.log('  ✓ phone layout at 360, 390 and 1280 (both languages)');
  c.close();
} catch (e) {
  errors.push(`smoke failed: ${e.message}`);
} finally {
  chrome.kill();
  server?.stop();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
}

if (onProd && beacons.length === 0) errors.push('no GoatCounter beacon seen on production: the privacy check did not run');
if (!onProd && beacons.length > 0) errors.push(`${beacons.length} GoatCounter beacon(s) sent from a non-production host (${new URL(baseUrl).host}); only ${PROD_HOST} may count`);

if (errors.length) {
  console.error(`✗ ${errors.length} error(s):\n  ` + errors.join('\n  '));
  exitCode = 1;
} else {
  console.log('✓ no console errors; screenshots in smoke/');
  console.log(`  GoatCounter beacons intercepted: ${beacons.length}${onProd ? ' (none carried coalition data)' : ' (none expected off production)'}`);
}
process.exit(exitCode);
