// Headless Chrome over the DevTools protocol with Node built-ins only (no dependency): the static server for ./site, the
// Chrome launch with its cleanup, the CDP client, and the waits. Shared by smoke.mjs and readme-media.mjs (#28).
// `where()` names the current step in timeout messages (smoke passes its case name).
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { ROOT } from './lib.mjs';

export const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const none = () => '';

// Rejects when the promise takes longer than ms (the promise itself is left to settle or not).
export function within(promise, ms, label, where = none) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms)}ms [${where()}]`)), Math.max(ms, 0)); })])
    .finally(() => clearTimeout(timer));
}

// Each attempt races the time left, so one attempt that never returns cannot block past the deadline.
export async function waitFor(fn, ms = 10000, where = none) {
  const end = Date.now() + ms;
  /** @type {any} */
  let last = null;
  while (Date.now() < end) {
    try { const v = await within(Promise.resolve().then(fn), end - Date.now(), 'waitFor attempt', where); if (v) return v; } catch (e) { last = e; }
    await sleep(50);
  }
  throw new Error(`timeout after ${ms}ms [${where()}]${last ? ` (last error: ${last.message})` : ''}`);
}

export const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.csv': 'text/csv; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };

// The headers Netlify sends for every path (netlify.toml: [[headers]] for = "/*").
export function siteHeaders() {
  const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');
  const block = toml.split('[[headers]]').find((b) => /for\s*=\s*"\/\*"/.test(b)) ?? '';
  const values = block.split('[headers.values]')[1] ?? '';
  return Object.fromEntries([...values.matchAll(/^\s*([\w-]+)\s*=\s*"(.*)"\s*$/gm)].map((m) => [m[1], m[2]]));
}

// Minimal static server for ./site (query strings ignored, like Netlify), sending netlify.toml's headers. `metaOverride`
// (smoke's --mode) is applied to meta.json as it is served.
export async function serve(metaOverride = null) {
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
    const body = file === metaFile && metaOverride ? JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), ...metaOverride }) : readFileSync(file);
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
  return { url: `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}/`, stop: () => server.close() };
}

export function cdp(wsUrl, { stepMs = 15000, where = none } = {}) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  let closed = false;
  // A closed socket rejects every pending call, and every later one.
  ws.onclose = () => {
    closed = true;
    for (const { reject } of pending.values()) reject(new Error(`CDP socket closed [${where()}]`));
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
    send: (method, params = {}, ms = method === 'Page.captureScreenshot' ? 4 * stepMs : stepMs) => new Promise((resolve, reject) => {
      if (closed) { reject(new Error(`CDP ${method}: socket closed [${where()}]`)); return; }
      const i = ++id;
      const timer = setTimeout(() => { pending.delete(i); reject(new Error(`CDP ${method} got no answer in ${ms / 1000}s [${where()}]`)); }, ms);
      pending.set(i, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      ws.send(JSON.stringify({ id: i, method, params }));
    }),
    on: (fn) => listeners.push(fn),
    close: () => ws.close(),
  };
}

// Chrome may still be exiting after SIGKILL: retry briefly (synchronously, so 'exit' handlers can use it).
export function removeDir(dir) {
  for (let i = 0; i < 20 && existsSync(dir); i++) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); }
  }
}

// Starts headless Chrome on a fresh profile (smoke-chrome-<pid>-…). Leftover smoke Chromes only (matched by their profile),
// never the user's browser, and only when the run that started them has ended (a profile from before the owner pid counts
// as stale). Only processes running from Chrome's own bundle: any other command line may mention such a profile (a shell
// running a test of this). Its own process group (detached), so killing the group takes its helper processes too. Port 0:
// Chrome picks a free port and writes it to DevToolsActivePort in the profile. kill() is synchronous (for 'exit' handlers).
export function launchChrome() {
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return /** @type {NodeJS.ErrnoException} */ (e).code === 'EPERM'; } };
  const stale = (name) => { const owner = Number(/^smoke-chrome-(\d+)-/.exec(name)?.[1] ?? 0); return !owner || !alive(owner); };
  const home = CHROME.includes('.app/') ? CHROME.slice(0, CHROME.indexOf('.app/') + 5) : CHROME;
  try {
    for (const line of execFileSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8' }).split('\n')) {
      const [, pid, command] = /^\s*(\d+)\s+(.*)$/.exec(line) ?? [];
      const profileName = command?.startsWith(home) && /--user-data-dir=\S*\/(smoke-chrome-[^\s/]+)/.exec(command)?.[1];
      if (profileName && stale(profileName)) try { process.kill(Number(pid), 'SIGKILL'); } catch { /* already gone */ }
    }
  } catch { /* no ps */ }
  for (const d of readdirSync(tmpdir()).filter((n) => n.startsWith('smoke-chrome-') && stale(n))) removeDir(join(tmpdir(), d));
  const profile = mkdtempSync(join(tmpdir(), `smoke-chrome-${process.pid}-`));
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--lang=he', 'about:blank',
  ], { stdio: 'ignore', detached: true });
  const kill = () => {
    try { process.kill(-chrome.pid, 'SIGKILL'); } catch { /* already gone */ }
    try { chrome.kill('SIGKILL'); } catch { /* already gone */ }
    removeDir(profile);
  };
  return { chrome, profile, kill };
}

// The CDP client of the launched Chrome's first page.
export async function pageClient(profile, opts = {}) {
  const port = await waitFor(() => Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]), 10000, opts.where);
  const targets = await waitFor(() => fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()), 10000, opts.where);
  const c = cdp(targets.find((t) => t.type === 'page').webSocketDebuggerUrl, opts);
  await c.ready;
  return c;
}

// The page is still: two frames in a row with no running animation or transition, no pending short timer or fetch (the
// counters a smoke init script installs as window.__smoke, when present), and no scroll or viewport change. At most ms.
export const SETTLE_JS = (ms) => `new Promise((done) => { const w = window.__smoke; const end = performance.now() + ${ms}; let calm = 0, last = null;
    const snap = () => { const s = document.querySelector('#sheet'); return [scrollX, scrollY, s ? s.scrollTop : 0, innerWidth, innerHeight, visualViewport?.offsetTop ?? 0].join(); };
    const idle = () => !w || (w.timers === 0 && w.fetches === 0 && !document.getAnimations().some((a) => a.playState === 'running'));
    (w ? w.setTimeout : setTimeout)(() => done(false), ${ms} + 50);
    const tick = () => { const s = snap(); calm = idle() && s === last ? calm + 1 : 0; last = s;
      if (calm >= 2) done(true); else if (performance.now() < end) requestAnimationFrame(tick); else done(false); };
    requestAnimationFrame(tick); })`;
