// Smoke test: opens each view in headless Chrome at phone (390px) and desktop (1280px) width, saves screenshots,
// and fails on console errors, page overflow, routing mistakes, or a GoatCounter beacon that carries coalition data.
// Zero installs: drives Chrome over the DevTools protocol with Node's built-in WebSocket.
// Usage: node scripts/smoke.mjs [baseUrl]   (default: serves ./site on a local port)
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { ROOT, loadData } from './lib.mjs';
import { makeContext, presets, serializeState } from '../site/js/compat.js';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = join(ROOT, 'smoke');
const SIZES = [{ tag: 'm', width: 390, height: 844, mobile: true, dpr: 2 }, { tag: 'd', width: 1280, height: 900, mobile: false, dpr: 1 }];
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
  ['results-base-likud', serializeState(ctx, { base: 'likud', members: pr.coalition.members, outside: [] }), 'results'],
  ['results-low-coverage', '?m=shas,utj,zehut,likud', 'results'],
  ['method', '#method', 'method'],
];

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
      if (/[?&;]([bmoq])=|likud|shas|yashar|zehut|democrats/i.test(decoded.replace(/^https?:\/\/[^/]+\/count\?/, ''))) {
        errors.push(`[${current}] GoatCounter beacon leaks coalition data: ${decoded}`);
      }
      c.send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, body: '' }).catch(() => {});
    }
  });
  for (const d of ['Page', 'Runtime', 'Log', 'Network']) await c.send(`${d}.enable`);
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*goatcounter.com/count*' }] });
  // Let the page count on preview hosts too, so the beacon can be inspected.
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__GC_ALLOW_PREVIEW__ = true' });

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
      const overflow = await evaluate('document.documentElement.scrollWidth > window.innerWidth + 1');
      if (overflow) errors.push(`[${current}] horizontal page overflow`);
      if (meta.showSeats === false) {
        const seatText = await evaluate("(document.body.innerText.match(/מנ׳|\\d+ מנדטים|מתוך 61|\\(61\\+\\)|סקרים/) || [])[0] || ''");
        if (seatText) errors.push(`[${current}] showSeats is off but seat text is visible: "${seatText}"`);
      } else if (expectView === 'build') {
        const barVisible = await evaluate("!document.querySelector('#bar').hidden && /ממוצע סקרים/.test(document.querySelector('#bar').innerText)");
        if (!barVisible) errors.push(`[${current}] build view must show the bar with the poll disclaimer`);
      }
      if (expectView === 'results' && meta.showSeats !== false) {
        const ok = await evaluate("document.querySelectorAll('#results .seats-line').length === 0 || /ממוצע סקרים/.test(document.querySelector('#results').innerText)");
        if (!ok) errors.push(`[${current}] results show seats without the poll disclaimer`);
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
  await evaluate("document.querySelector('[data-act=\"poll-info\"]').click()");
  await sleep(300);
  await shoot(z, 'interaction-poll-info-m.png', false);
  await evaluate("document.querySelector('#sheet').close(); document.querySelector('#bar a.btn').click()");
  await sleep(400);
  const afterClick = await evaluate('document.body.dataset.view');
  if (afterClick !== 'results') errors.push(`[interaction] "לתוצאות" did not open results (view "${afterClick}")`);
  await evaluate("document.querySelector('.cell')?.click()");
  await sleep(300);
  await shoot(z, 'interaction-cell-sheet-m.png', false);
  await evaluate("document.querySelector('#sheet').close(); document.querySelector('#results-bar .back').click()");
  await sleep(300);
  const backView = await evaluate('document.body.dataset.view');
  if (backView !== 'build') errors.push(`[interaction] "← עריכה" did not return to build (view "${backView}")`);
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

if (errors.length) {
  console.error(`✗ ${errors.length} error(s):\n  ` + errors.join('\n  '));
  exitCode = 1;
} else {
  console.log('✓ no console errors; screenshots in smoke/');
  console.log(`  GoatCounter beacons intercepted: ${beacons.length}${beacons.length ? ' (none carried coalition data)' : ' (none; localhost is not counted)'}`);
}
process.exit(exitCode);
