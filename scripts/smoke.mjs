// Smoke test: opens each view in headless Chrome at phone (390px) and desktop (1280px) width, saves screenshots,
// and fails on console errors, page overflow, routing mistakes, or a GoatCounter beacon that carries coalition data.
// Beacons: against production every beacon is checked (and never sent); on any other host none may be sent at all.
// Zero installs: drives Chrome over the DevTools protocol with Node's built-in WebSocket.
// Usage: node scripts/smoke.mjs [baseUrl]   (default: serves ./site on a local port)
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { ROOT, loadData } from './lib.mjs';
import { makeContext, presets, serializeState, ballotOrder } from '../site/js/compat.js';
import { PROD_HOST } from '../site/js/stats.js';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = join(ROOT, 'smoke');
const SIZES = [{ tag: 'm', width: 390, height: 844, mobile: true, dpr: 2 }, { tag: 'd', width: 1280, height: 900, mobile: false, dpr: 1 }];
const members_in_url = (qs) => /[?&]m=/.test(qs);
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

// Minimal static server for ./site (query strings ignored, like Netlify).
async function serve() {
  const dir = join(ROOT, 'site');
  const server = createServer((req, res) => {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([.][.][/\\])+/, '');
    let file = join(dir, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(dir) || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
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

const { parties, topics, meta } = loadData();
const ctx = makeContext({ parties, topics, positions: [] });
const pr = presets(ctx);
const coalitionQs = serializeState(ctx, { base: null, ...pr.coalition });
const oppositionQs = serializeState(ctx, { base: null, ...pr.opposition });

// name, url suffix, expected view after load
const cases = [
  ['build-empty', '', 'build'],
  ['build-coalition', `${coalitionQs}#build`, 'build'],
  ['build-linked', '?m=zehut#build', 'build'],
  ['results-coalition', coalitionQs, 'results'], // a shared link without a hash opens #results
  ['results-opposition', oppositionQs, 'results'],
  ['results-unity', serializeState(ctx, { base: null, ...pr.unity }), 'results'],
  ['results-opposition-arab', serializeState(ctx, { base: null, ...pr['opposition-arab'] }), 'results'],
  ['results-pair', '?m=together,democrats', 'results'],
  ['results-single', '?m=likud', 'results'],
  ['results-base-likud', serializeState(ctx, { base: 'likud', members: pr.coalition.members, outside: [] }), 'results'],
  ['results-low-coverage', '?m=shas,utj,zehut,likud', 'results'],
  ['method', '#method', 'method'],
  ['privacy', '#privacy', 'method'],
  ['accessibility', '#accessibility', 'method'],
];

// Poll-derived text that must not appear anywhere when showSeats is off.
const POLL_TEXT = /מנדטים|מנ׳|סקר|על הסף|מתוך 61|\(61\+\)|≈\d/;
const leakIds = new RegExp(`[?&;]([bmoq])=|${parties.map((p) => p.id).join('|')}`, 'i');
const legal = `ממוצע סקרים שפורסמו עד ${meta.pollsAsOf.split('-').reverse().join('.')}. הסקרים אינם עדכניים, ואין ללמוד מהם על דפוסי הצבעה או עמדות הציבור כיום.`;
const base = process.argv[2];
const server = base ? null : await serve();
const baseUrl = (base ?? server.url).replace(/\/?$/, '/');
const profile = mkdtempSync(join(tmpdir(), 'smoke-chrome-'));
const port = 9300 + Math.floor(Math.random() * 100);
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--lang=he', 'about:blank',
], { stdio: 'ignore' });

const errors = [];
const beacons = [];
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

  const evaluate = async (expr) => (await c.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
  const ready = () => waitFor(() => evaluate("document.querySelector('#builder')?.children.length > 0"));
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
      await c.send('Page.navigate', { url: 'about:blank' });
      await c.send('Page.navigate', { url: baseUrl + suffix });
      await waitFor(() => evaluate("document.body.dataset.view !== undefined && document.querySelector('#footer')?.children.length > 0"));
      await sleep(250);
      const view = await evaluate('document.body.dataset.view');
      if (view !== expectView) errors.push(`[${current}] expected view "${expectView}", got "${view}"`);
      if (expectView === 'results') {
        const hash = await evaluate('location.hash');
        if (hash !== '#results') errors.push(`[${current}] shared link did not settle on #results (hash "${hash}")`);
      }
      if (expectView === 'build') {
        const purpose = await evaluate("document.querySelector('#purpose')?.innerText || ''");
        if (!purpose.includes('כל עמדה מגובה במקור. זו לא המלצת הצבעה.')) errors.push(`[${current}] build view is missing the purpose line`);
        if (!purpose.includes('רקורד בפועל')) errors.push(`[${current}] purpose line must name all three source kinds`);
        const mix = await evaluate("document.querySelector('#source-mix')?.innerText || ''");
        if (!/\d+ עמדות מתועדות: \d+ לפי מצע, \d+ לפי הצהרות, \d+ לפי רקורד/.test(mix)) errors.push(`[${current}] source-mix line missing (${mix})`);
        const voter = await evaluate("(() => { const e = document.querySelector('#voter-info'); const a = e?.querySelector('a'); return e && a ? e.innerText + ' | ' + a.href : ''; })()");
        if (!/27\.10/.test(voter) || !/7:00–22:00/.test(voter) || !voter.endsWith('| https://www.gov.il/apps/moin/bocharim/')) errors.push(`[${current}] voter-info line missing or wrong (${voter})`);
        const outHint = await evaluate("document.querySelector('#builder').innerText.includes('תמיכה מבחוץ: מפלגה שתומכת בממשלה בלי לשבת בה')");
        if (!outHint) errors.push(`[${current}] outside-support explanation missing in the picker`);
      }
      const overflow = await evaluate('document.documentElement.scrollWidth > window.innerWidth + 1');
      if (overflow) errors.push(`[${current}] horizontal page overflow`);
      if (meta.showSeats === false) {
        const seatText = await evaluate(`(document.body.innerText.match(${POLL_TEXT}) || [])[0] || ''`);
        if (seatText) errors.push(`[${current}] showSeats is off but poll-derived text is visible: "${seatText}"`);
        if (expectView === 'build') {
          const order = await evaluate("[...document.querySelectorAll('#builder [data-act=\"toggle\"]')].map((b) => b.dataset.id).join(',')");
          if (order !== ballotOrder(parties).map((p) => p.id).join(',')) errors.push(`[${current}] showSeats is off but parties are not in ballot-letter order: ${order}`);
        }
      } else if (expectView === 'build') {
        // The seats box above the chips carries the full legal sentence (also with no party selected, since chips show seats).
        const box = await evaluate(`(() => { const b = document.querySelector('#builder .seats-box'); if (!b) return 'missing box'; if (!b.innerText.replace(/\\s+/g, ' ').includes(${JSON.stringify(legal)})) return 'sentence missing';
          const l = b.querySelector('.poll-legal'), sl = b.querySelector('.seats-line'); const a = getComputedStyle(l), c = getComputedStyle(sl);
          if (a.fontSize !== c.fontSize || a.color !== getComputedStyle(document.body).color) return 'style ' + a.fontSize + '/' + c.fontSize + ' ' + a.color;
          const r = l.getBoundingClientRect(); const pts = []; for (const fx of [0.05, 0.3, 0.5, 0.7, 0.95]) for (const fy of [0.15, 0.5, 0.85]) pts.push([r.left + r.width * fx, r.top + r.height * fy]);
          const inView = pts.every(([x, y]) => y >= 0 && y < innerHeight);
          const bad = inView ? pts.filter(([x, y]) => { const e = document.elementFromPoint(x, y); return !e || !b.contains(e); }) : [];
          return bad.length ? 'obscured at ' + bad.length + ' points by ' + (document.elementFromPoint(bad[0][0], bad[0][1])?.id || document.elementFromPoint(bad[0][0], bad[0][1])?.tagName) : 'ok'; })()`);
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
        const pick = await evaluate(`(() => { const rows = [...document.querySelectorAll('#builder .prow-main')]; if (rows.length !== ${parties.length}) return 'rows ' + rows.length;
          if (rows.some((r) => r.getAttribute('role') !== 'checkbox' || !['true', 'false'].includes(r.getAttribute('aria-checked')))) return 'role/aria-checked';
          if (rows.some((r) => r.querySelector('button, a, input'))) return 'nested control in a checkbox row';
          if (rows.some((r) => r.getBoundingClientRect().height < 44)) return 'row under 44px';
          if (document.querySelector('#builder .mini, #builder [data-act="base"]')) return 'star/remove buttons still in the picker';
          const xs = [...document.querySelectorAll('#builder .pills')].map((e) => Math.round(e.getBoundingClientRect().left)); if (new Set(xs).size > 1) return 'pills not aligned: ' + [...new Set(xs)].join(',');
          return 'ok'; })()`);
        if (pick !== 'ok') errors.push(`[${current}] party picker: ${pick}`);
      }
      if (expectView === 'results' && meta.showSeats !== false) {
        const ok = await evaluate(`document.querySelectorAll('#results .seats-line').length === 0 || document.querySelector('#results').innerText.replace(/\\s+/g, ' ').includes(${JSON.stringify(legal)})`);
        if (!ok) errors.push(`[${current}] results show seats without the full legal poll sentence`);
        if (expectView === 'results' && members_in_url(suffix) && name !== 'results-single' && !(await evaluate("document.querySelector('#matrix .tap-hint')?.innerText.includes('לחצו על כל תא או נושא')"))) errors.push(`[${current}] matrix tap hint missing`);
        const line = await evaluate("document.querySelector('#results-coalition')?.innerText || ''");
        if (!line.trim()) errors.push(`[${current}] results are missing the coalition line`);
      }
      if (expectView === 'results') {
        const share = await evaluate("document.querySelectorAll('#results-bar [data-act=\"share\"]').length");
        const want = name === 'results-single' ? 0 : 1;
        if (share !== want) errors.push(`[${current}] share button count ${share}, expected ${want}`);
      }
      if (expectView === 'method') {
        const secs = await evaluate("(() => { const p = document.querySelector('#privacy'), a = document.querySelector('#accessibility'); const f = [...document.querySelectorAll('#footer a')].map((x) => x.getAttribute('href')); return [p?.innerText.includes('GoatCounter') && p.innerText.includes('lioz.akirav@gmail.com'), a?.innerText.includes('5568') && a.innerText.includes('26.10.2026'), f.includes('#privacy'), f.includes('#accessibility')].join(','); })()");
        if (secs !== 'true,true,true,true') errors.push(`[${current}] privacy/accessibility sections or footer links missing (${secs})`);
        if (name !== 'method') {
          const top = await evaluate(`Math.round(document.querySelector('#${name}').getBoundingClientRect().top)`);
          if (top < 0 || top > z.height - 120) errors.push(`[${current}] #${name} did not scroll into view (top ${top})`);
        }
      }
      if (expectView === 'method' && meta.showSeats !== false) {
        const joint = await evaluate("(() => { const h = [...document.querySelectorAll('#method h3')].find((x) => x.textContent.includes('רשימות משותפות')); const ul = h?.nextElementSibling; const p = ul?.nextElementSibling; return ul && /כ-7/.test(ul.innerText) && p?.classList.contains('poll-legal') ? p.innerText : 'missing'; })()");
        if (joint.replace(/\s+/g, ' ').trim() !== legal) errors.push(`[${current}] joint-list seat numbers lack the legal sentence right after them (${joint})`);
      }
      await shoot(z, `${name}-${z.tag}.png`);
    }
    console.log(`  ✓ ${z.width}px: ${cases.length} views`);
  }

  // Interactions at phone width: pick a preset on the build view, open the poll note, go to results, open a cell, come back.
  const z = SIZES[0];
  await setSize(z);
  current = 'interaction@390';
  await c.send('Page.navigate', { url: baseUrl });
  await ready();
  await evaluate("document.querySelector('[data-act=\"preset\"][data-id=\"unity\"]').click()");
  await sleep(300);
  await shoot(z, 'interaction-build-unity-m.png', false);
  if (meta.showSeats !== false) {
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
    await c.send('Page.navigate', { url: `${baseUrl}?m=${withArchive.partyId},together#results` });
    await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.cell').length > 0"));
    await evaluate(`document.querySelector('.cell[data-party="${withArchive.partyId}"][data-topic="${withArchive.topicId}"]').click()`);
    await sleep(300);
    const href = await evaluate("[...document.querySelectorAll('#sheet a')].find((a) => a.textContent.includes('עותק בארכיון'))?.href || ''");
    if (!/^https:\/\/web\.archive\.org\/web\/\d{14}\//.test(href)) errors.push(`[interaction] cell sheet for ${withArchive.partyId}/${withArchive.topicId} lacks its archive link (${href})`);
    await shoot(z, 'interaction-archive-link-m.png', false);
  }
  // Picker: tap a row to toggle, outside toggle, three-party build screenshot.
  await c.send('Page.navigate', { url: baseUrl });
  await ready();
  for (const id of ['likud', 'shas', 'otzma-yehudit']) await evaluate(`document.querySelector('[data-act="toggle"][data-id="${id}"]').click()`);
  await sleep(300);
  const sel = await evaluate("[...document.querySelectorAll('#builder .prow-main[aria-checked=\"true\"]')].length");
  if (sel !== 3) errors.push(`[interaction] tapping rows should select 3 parties, got ${sel}`);
  await evaluate("document.querySelector('[data-act=\"outside\"][data-id=\"shas\"]').click()");
  await sleep(200);
  const outUrl = await evaluate('location.search');
  if (!/o=shas/.test(outUrl)) errors.push(`[interaction] outside toggle did not set o= (${outUrl})`);
  await evaluate("document.querySelector('[data-act=\"outside\"][data-id=\"shas\"]').click()");
  await sleep(200);
  await evaluate('window.scrollTo(0, document.querySelector("#builder .seats-box").getBoundingClientRect().top + scrollY - 10)');
  await sleep(200);
  await shoot(z, 'interaction-build-3-selected-m.png', false);
  // Results: base control, expanding gap card, pair view from an expanded pair.
  await evaluate("document.querySelector('#bar a.btn').click()");
  await sleep(400);
  if ((await evaluate('document.body.dataset.view')) !== 'results') errors.push('[interaction] "לתוצאות" from the picker did not open results');
  await c.send('Page.navigate', { url: `${baseUrl}?m=likud,democrats,yashar,shas#results` });
  await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.colorby').length > 0"));
  const baseBtns = await evaluate("document.querySelectorAll('.colorby [role=\"radio\"]').length");
  if (baseBtns !== 5) errors.push(`[interaction] base control should list הכל + 4 parties, got ${baseBtns}`);
  await evaluate("document.querySelector('.colorby [data-id=\"shas\"]').click()");
  await sleep(300);
  const bq = await evaluate('location.search');
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
  // Party sheets: the joint-list seat note carries the legal sentence; with seats hidden, no poll-derived text at all.
  for (const pid of ['religious-zionism', 'zehut', 'kalkalit']) {
    await c.send('Page.navigate', { url: `${baseUrl}?m=likud,${pid}#results` });
    await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.party-btn').length > 0"));
    await evaluate(`document.querySelector('.party-btn[data-id="${pid}"]').click()`);
    await sleep(300);
    const text = await evaluate("document.querySelector('#sheet').innerText.replace(/\\s+/g, ' ')");
    if (meta.showSeats === false) {
      const hit = text.match(POLL_TEXT);
      if (hit) errors.push(`[interaction] ${pid} party sheet shows poll-derived text with seats hidden: "${hit[0]}"`);
    } else if (/\(7\)/.test(text) && !text.includes(legal)) errors.push(`[interaction] ${pid} party sheet shows seat figures without the legal sentence`);
    if (pid === 'religious-zionism') await shoot(z, 'interaction-party-sheet-m.png', false);
    await evaluate("document.querySelector('#sheet').close()");
  }
  // A cell sheet with a quote renders it in quotation marks with an attribution line underneath.
  const withQuote = JSON.parse(readFileSync(join(ROOT, 'site', 'data', 'positions.json'), 'utf8')).find((p) => p.quote && p.quoteBy && p.sourceDate);
  await c.send('Page.navigate', { url: `${baseUrl}?m=${withQuote.partyId},together#results` });
  await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.cell').length > 0"));
  await evaluate(`document.querySelector('.cell[data-party="${withQuote.partyId}"][data-topic="${withQuote.topicId}"]').click()`);
  await sleep(300);
  const q = await evaluate("(() => { const b = document.querySelector('#sheet blockquote'); return b ? { text: b.querySelector('.q-text')?.textContent, by: b.querySelector('.q-by')?.textContent } : null; })()");
  if (!q || !/^״.+״$/.test(q.text ?? '')) errors.push(`[interaction] quote must be wrapped in quotation marks (${JSON.stringify(q)})`);
  if (!q || !q.by.startsWith(withQuote.quoteBy) || !/\d{2}\.\d{2}\.\d{4}$/.test(q.by)) errors.push(`[interaction] quote attribution should read "<speaker>, <channel>, <date>" (${q?.by})`);
  await shoot(z, 'interaction-cell-quote-m.png', false);
  // Arabic quotes keep the original and add a marked Hebrew translation under it.
  await c.send('Page.navigate', { url: `${baseUrl}?m=raam,together#results` });
  await waitFor(() => evaluate("document.body.dataset.view === 'results' && document.querySelectorAll('.cell').length > 0"));
  await evaluate('document.querySelector(\'.cell[data-party="raam"][data-topic="palestinian"]\').click()');
  await sleep(300);
  const ar = await evaluate("(() => { const q = [...document.querySelectorAll('#sheet blockquote .q-text')]; return q.map((e) => e.textContent).join(' | '); })()");
  if (!/[\u0600-\u06FF]/.test(ar) || !ar.includes('(תרגום חופשי של האתר)')) errors.push(`[interaction] Arabic quote must show the original plus a marked translation (${ar})`);
  console.log('  ✓ interactions');
  c.close();
} catch (e) {
  errors.push(`smoke failed: ${e.message}`);
} finally {
  chrome.kill();
  server?.stop();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
}

const onProd = new URL(baseUrl).hostname === PROD_HOST;
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
