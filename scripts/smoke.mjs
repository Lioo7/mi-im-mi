// Smoke test: opens key URLs in headless Chrome at phone width, saves screenshots, fails on any console error.
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
const WIDTH = 360;
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
const cases = [
  ['landing', ''],
  ...Object.entries(pr).map(([k, v]) => [`preset-${k}`, serializeState(ctx, { base: null, ...v })]),
  ['pair-together-democrats', '?m=together,democrats'],
  ['base-likud', serializeState(ctx, { base: 'likud', members: pr.coalition.members, outside: [] })],
  ['linked-zehut-only', '?m=zehut'],
  ['low-coverage', '?m=shas,utj,zehut,likud'],
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
const counterRequests = [];
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
    if (m.method === 'Network.requestWillBeSent' && /goatcounter|zgo\.at/.test(m.params.request.url)) {
      counterRequests.push(m.params.request.url);
      // Privacy: only the pathname may be sent, never the coalition from the query string.
      const decoded = decodeURIComponent(m.params.request.url);
      if (/[?&;]([bmo])=|likud|shas|yashar|zehut|democrats/i.test(decoded.replace(/^https?:\/\/[^/]+\/count[^?]*\?/, ''))) {
        errors.push(`[${current}] GoatCounter request leaks coalition data: ${decoded}`);
      }
    }
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) errors.push(`[${current}] HTTP ${m.params.response.status} ${m.params.response.url}`);
  });
  for (const d of ['Page', 'Runtime', 'Log', 'Network']) await c.send(`${d}.enable`);
  // Intercept GoatCounter beacons: record them for the privacy check, but never send them (no test traffic in the stats).
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*goatcounter.com/count*' }] });
  c.on((m) => {
    if (m.method !== 'Fetch.requestPaused') return;
    const url = m.params.request.url;
    counterRequests.push(url);
    const decoded = decodeURIComponent(url);
    if (/[?&;]([bmo])=|likud|shas|yashar|zehut|democrats/i.test(decoded.replace(/^https?:\/\/[^/]+\/count[^?]*\?/, ''))) {
      errors.push(`[${current}] GoatCounter beacon leaks coalition data: ${decoded}`);
    }
    c.send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, body: '' }).catch(() => {});
  });
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });

  const shoot = async (file) => {
    const { cssContentSize } = await c.send('Page.getLayoutMetrics');
    const height = Math.ceil(cssContentSize.height);
    await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height, deviceScaleFactor: 2, mobile: true });
    await sleep(200);
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, file), Buffer.from(data, 'base64'));
    // Readable segments of the same page: <name>.<n>.png
    const SEG = 900;
    for (let i = 0; i * SEG < height; i++) {
      const clip = { x: 0, y: i * SEG, width: WIDTH, height: Math.min(SEG, height - i * SEG), scale: 1 };
      const seg = await c.send('Page.captureScreenshot', { format: 'png', clip });
      writeFileSync(join(OUT, file.replace('.png', `.${i + 1}.png`)), Buffer.from(seg.data, 'base64'));
    }
    await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 800, deviceScaleFactor: 2, mobile: true });
  };
  const evaluate = async (expr) => (await c.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
  const ready = () => waitFor(() => evaluate("document.querySelector('#builder')?.children.length > 0"));

  await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 800, deviceScaleFactor: 2, mobile: true });
  for (const [name, qs] of cases) {
    current = name;
    await c.send('Page.navigate', { url: baseUrl + qs });
    await ready();
    await sleep(300);
    if (meta.showSeats === false) {
      const seatText = await evaluate("(document.body.innerText.match(/מנ׳|\\d+ מנדטים|מתוך 61|ל-61/) || [])[0] || ''");
      if (seatText) errors.push(`[${name}] showSeats is off but seat text is visible: "${seatText}"`);
    }
    const overflow = await evaluate('document.documentElement.scrollWidth > window.innerWidth');
    if (overflow) errors.push(`[${name}] horizontal page overflow at ${WIDTH}px`);
    await shoot(`${name}.png`);
    console.log(`  ✓ ${name}`);
  }

  // One interaction: open a matrix cell's sheet (viewport screenshot).
  current = 'sheet';
  await c.send('Page.navigate', { url: baseUrl + cases.find(([n]) => n === 'preset-coalition')[1] });
  await ready();
  await evaluate("document.querySelector('.cell.lv-CLASH, .cell.lv-MAJOR, .cell')?.click()");
  await sleep(300);
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, 'sheet.png'), Buffer.from(data, 'base64'));
  console.log('  ✓ sheet');
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
  console.log(`✓ no console errors; screenshots in smoke/`);
  console.log([...new Set(counterRequests)].map((u) => `    ${decodeURIComponent(u)}`).join("\n"));
  console.log(`  GoatCounter requests seen: ${counterRequests.length}${counterRequests.length ? ' (no coalition data in any)' : ' (none; counters ignore localhost)'}`);
}
process.exit(exitCode);
