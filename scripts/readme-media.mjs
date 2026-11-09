// README media (#28): the screenshots in docs/screenshots/ and the demo GIF in docs/media/demo.gif, captured the same way
// every run from a local server (or a URL), with the browser helpers smoke.mjs uses (scripts/browser.mjs, no dependency).
// Usage: node scripts/readme-media.mjs [baseUrl] [--only=<name,…>] [--no-gif] [--out=<dir>]
//   names: the shots below (home, build, …) and "gif". --out writes everything to one folder instead (for a dry run).
// Deterministic: fixed viewports (phone 390×844 at 2×, desktop 1280×800), fixed URL fragments, reduced motion, fonts and
// data loaded and the page still before each frame. The app shows no run date and nothing random.
// The coalition (neutrality): a scenario from site/data/scenarios.json, chosen because it is the only one with all three
// roles (members, a supporter and an abstainer), never by outcome. Every other choice is mechanical: the pair is its first
// two members in the site's order, the closest list is for its first member, and the cell is the first gap with a quote.
// The GIF: frames captured step by step (not a timed screencast, so every run gives the same frames), joined by ffmpeg
// with a palette. Without ffmpeg the GIF is skipped with a message.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { ROOT, loadData } from './lib.mjs';
import { serve, launchChrome, pageClient, waitFor, sleep, SETTLE_JS } from './browser.mjs';
import { contextFor, serializeState, matrixCell } from '../site/js/compat.js';

const SCENARIO = 'change-arab-not-opposing';
const PHONE = { width: 390, height: 844, dpr: 2, mobile: true };
const DESKTOP = { width: 1280, height: 800, dpr: 1, mobile: false };

const args = process.argv.slice(2);
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const base = args.find((a) => !a.startsWith('--'));
const OUT = opt('out');
const SHOT_DIR = OUT ?? join(ROOT, 'docs', 'screenshots');
const GIF_FILE = join(OUT ?? join(ROOT, 'docs', 'media'), 'demo.gif');

const data = loadData();
const ctx = contextFor(data);
const sc = JSON.parse(JSON.stringify(data.scenarios.scenarios.find((s) => s.id === SCENARIO) ?? {}));
if (!sc.members) { console.error(`✗ scenario "${SCENARIO}" is not in site/data/scenarios.json`); process.exit(2); }
const order = (ids) => [...ids].sort((a, b) => ctx.order.get(a) - ctx.order.get(b));
const members = order(sc.members);
const qs = serializeState(ctx, { base: null, members, supporters: sc.supporters, abstainers: sc.abstainers }); // "?m=…&o=…&a=…"
const [pairA, pairB] = members;
// The first cell (topic order, then the matrix's party order) at a gap level (not agreement) whose position has a quote.
const GAPS = ['MINOR', 'MAJOR', 'CLASH'];
const gapCell = (() => {
  for (const t of ctx.topics) for (const pid of members) {
    const p = data.positions.find((x) => x.partyId === pid && x.topicId === t.id);
    if (p?.quote && GAPS.includes(matrixCell(ctx, pid, t.id, members, null).level)) return { pid, tid: t.id };
  }
  return null;
})();
if (!gapCell) { console.error('✗ no gap cell with a quote in this coalition'); process.exit(2); }

const SHOTS = {
  home: { url: '#build', size: PHONE, alt: 'task cards' },
  build: { url: `#build${qs}`, size: PHONE, top: '#builder .plist', alt: 'roles' },
  results: { url: `#results${qs}`, size: PHONE, alt: 'results with outside parties' },
  closest: { url: `#results${qs}`, size: PHONE, act: 'closest', alt: 'closest coalitions' },
  matrix: { url: `#results${qs}`, size: PHONE, top: '#matrix', alt: 'matrix' },
  'cell-sheet': { url: `#results${qs}`, size: PHONE, act: 'cell', alt: 'cell sheet' },
  'pair-view': { url: `#pair?p=${pairA},${pairB}`, size: PHONE, alt: 'pair' },
  recommendations: { url: `#build${qs}`, size: PHONE, act: 'recs', alt: 'recommendations' },
  method: { url: '#method', size: PHONE, alt: 'why I built this, and the start of the method' },
  'results-en': { url: `en/#results${qs}`, size: PHONE, en: true, alt: 'results in English via /en/' },
  desktop: { url: `#results${qs}`, size: DESKTOP, alt: 'results at 1280px' },
};
const only = opt('only')?.split(',');
for (const n of only ?? []) if (n !== 'gif' && !SHOTS[n]) { console.error(`✗ unknown name "${n}"; names: ${Object.keys(SHOTS).join(', ')}, gif`); process.exit(2); }
const wanted = (n) => !only || only.includes(n);

let ffmpeg = null;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); ffmpeg = 'ffmpeg'; } catch { /* checked below */ }

const server = base ? null : await serve();
const baseUrl = (base ?? server.url).replace(/\/?$/, '/');
const chrome = launchChrome();
let current = '';
const where = () => current;
const cleanup = () => { try { server?.stop(); } catch { /* ignore */ } chrome.kill(); };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

const errors = [];
const report = [];
try {
  const c = await pageClient(chrome.profile, { where });
  c.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(`[${current}] exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(`[${current}] console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    // The page-view beacon is never sent from a capture run.
    if (m.method === 'Fetch.requestPaused') c.send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, body: '' }).catch(() => {});
  });
  for (const d of ['Page', 'Runtime']) await c.send(`${d}.enable`);
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*goatcounter.com/count*' }] });
  // Light theme, reduced motion (the app then scrolls without smooth behavior and the sheet opens without animation).
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'light' }] });
  const evaluate = async (expr) => (await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  const setSize = (z) => c.send('Emulation.setDeviceMetricsOverride', { width: z.width, height: z.height, deviceScaleFactor: z.dpr, mobile: z.mobile });
  // Fonts loaded, the view rendered (the footer is filled after the data), no animation left, the page still.
  const still = async () => {
    await waitFor(() => evaluate("document.fonts.status === 'loaded' && document.body.dataset.view !== undefined && document.querySelector('#footer')?.children.length > 0"), 15000, where);
    await evaluate("document.fonts.ready.then(() => { document.getAnimations().forEach((a) => a.finish()); return true; })");
    await evaluate(SETTLE_JS(1500));
  };
  const go = async (suffix, z) => {
    await setSize(z);
    await c.send('Page.navigate', { url: 'about:blank' });
    await c.send('Page.navigate', { url: baseUrl + suffix });
    await still();
    await evaluate('window.scrollTo(0, 0), true');
  };
  // Scrolls an element to the top of the viewport, below any sticky bar.
  const toTop = async (sel) => {
    const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false;
      const sticky = [...document.querySelectorAll('body *')].filter((e) => ['sticky', 'fixed'].includes(getComputedStyle(e).position) && e.getBoundingClientRect().top <= 1 && e.offsetHeight < innerHeight / 3 && e.offsetHeight > 0 && !e.closest('dialog'))
        .reduce((h, e) => Math.max(h, e.getBoundingClientRect().bottom), 0);
      window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + scrollY - sticky - 8)); return true; })()`);
    if (!ok) throw new Error(`${sel} not found`);
    await evaluate(SETTLE_JS(800));
  };
  const click = async (sel) => {
    const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
    if (!ok) throw new Error(`${sel} not found`);
    await still();
  };
  const ACTS = {
    // The closest-coalitions list from the first member's party sheet.
    closest: async () => { await click(`.party-btn[data-id="${pairA}"]`); await click('#sheet [data-act="closest"]'); },
    cell: async () => { await click(`.cell[data-party="${gapCell.pid}"][data-topic="${gapCell.tid}"]`); },
    recs: async () => { await click('[data-act="recs"]'); },
  };
  const capture = async (z, format = 'png') => Buffer.from((await c.send('Page.captureScreenshot', { format, ...(format === 'jpeg' ? { quality: 92 } : {}) })).data, 'base64');

  mkdirSync(SHOT_DIR, { recursive: true });
  for (const [name, s] of Object.entries(SHOTS)) {
    if (!wanted(name)) continue;
    current = name;
    await go(s.url, s.size);
    if (s.en) {
      const lang = await evaluate('document.documentElement.lang');
      if (lang !== 'en') errors.push(`[${name}] expected an English page after /en/, got lang="${lang}"`);
    }
    if (s.top) await toTop(s.top);
    if (s.act) await ACTS[s.act]();
    const file = join(SHOT_DIR, `${name}.png`);
    writeFileSync(file, await capture(s.size));
    const frag = await evaluate('location.hash');
    report.push({ file: relative(ROOT, file), url: s.url, frag, size: statSync(file).size });
    console.log(`  ✓ ${name}.png  ${s.url}`);
  }

  if (wanted('gif') && !args.includes('--no-gif')) {
    if (!ffmpeg) {
      console.error('✗ ffmpeg not found: the GIF was not made. Install it (e.g. brew install ffmpeg) and run with --only=gif.');
    } else {
      current = 'gif';
      const dir = mkdtempSync(join(tmpdir(), 'readme-gif-'));
      const frames = [];
      const z = PHONE;
      const frame = async (hold) => { const f = join(dir, `${String(frames.length).padStart(4, '0')}.jpg`); writeFileSync(f, await capture(z, 'jpeg')); frames.push({ f, hold }); };
      // A dot where the tap lands (no style attribute: the CSP allows CSSOM styles only).
      const DOT = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect();
        const d = document.createElement('div'); d.id = 'tap-dot'; const st = d.style; st.position = 'fixed'; st.zIndex = 2147483647; st.width = st.height = '34px'; st.borderRadius = '50%';
        st.background = 'rgba(30,90,200,.28)'; st.border = '2px solid rgba(30,90,200,.75)'; st.left = (r.left + r.width / 2 - 17) + 'px'; st.top = (r.top + r.height / 2 - 17) + 'px'; st.pointerEvents = 'none';
        document.body.append(d); return true; })()`;
      const tap = async (sel, holdBefore = 0.7) => {
        if (!(await evaluate(DOT(sel)))) throw new Error(`gif: ${sel} not found`);
        await evaluate(SETTLE_JS(400));
        await frame(holdBefore);
        await evaluate(`(() => { document.querySelector('#tap-dot')?.remove(); document.querySelector(${JSON.stringify(sel)}).click(); return true; })()`);
        await still();
      };
      const choose = async (sel, value) => {
        if (!(await evaluate(DOT(sel)))) throw new Error(`gif: ${sel} not found`);
        await frame(0.6);
        await evaluate(`(() => { document.querySelector('#tap-dot')?.remove(); const s = document.querySelector(${JSON.stringify(sel)}); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
        await still();
      };
      // Scrolls in steps, a frame each, so the motion reads in the GIF.
      const scrollTo = async (sel, steps = 8) => {
        const target = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; return Math.max(0, Math.min(el.getBoundingClientRect().top + scrollY - 70, document.documentElement.scrollHeight - innerHeight)); })()`);
        if (target == null) throw new Error(`gif: ${sel} not found`);
        const from = await evaluate('scrollY');
        for (let i = 1; i <= steps; i++) { await evaluate(`window.scrollTo(0, ${Math.round(from + (target - from) * (i / steps))}), true`); await frame(0.06); }
      };
      // The sheet's content scrolls inside the dialog.
      const sheetScroll = async (px, steps = 6) => {
        const from = await evaluate("document.querySelector('#sheet').scrollTop");
        for (let i = 1; i <= steps; i++) { await evaluate(`(document.querySelector('#sheet').scrollTop = ${Math.round(from + px * (i / steps))}, true)`); await frame(0.06); }
      };

      // 1. Home: the task cards, then card 1.
      await go('#build', z);
      await frame(1.8);
      await tap('[data-key="home-build"]');
      await frame(1.0);
      // 2. Pick the scenario's members, then the supporter and the abstainer (each a member first, then its role).
      for (const id of members) { await tap(`[data-key="row-${id}"]`, 0.45); }
      await frame(0.8);
      for (const [id, role] of [...sc.supporters.map((x) => [x, 'supporter']), ...sc.abstainers.map((x) => [x, 'abstainer'])]) {
        await tap(`[data-key="row-${id}"]`, 0.45);
        await tap(`[data-key="role-${id}-${role}"]`, 0.6);
        await frame(0.9);
      }
      // 3. Results.
      await go(`#results${qs}`, z);
      await frame(2.2);
      await scrollTo('#matrix', 10);
      await frame(1.4);
      // 4. A gap cell: its source sheet.
      await tap(`.cell[data-party="${gapCell.pid}"][data-topic="${gapCell.tid}"]`);
      await frame(2.0);
      await sheetScroll(260);
      await frame(1.8);
      await evaluate("document.querySelector('#sheet').close(), true");
      // 5. The pair comparison.
      await go(`#pair?p=${pairA},${pairB}`, z);
      await frame(1.2);
      await scrollTo('#pair-view .pair-row', 8);
      await frame(2.0);
      // 6. The recommendations panel.
      await go(`#build${qs}`, z);
      await tap('[data-act="recs"]');
      await frame(2.2);
      await sheetScroll(320);
      await frame(2.4);

      const list = join(dir, 'frames.txt');
      writeFileSync(list, frames.map((x) => `file '${x.f}'\nduration ${x.hold}`).join('\n') + `\nfile '${frames.at(-1).f}'\n`);
      const W = 400;
      mkdirSync(join(GIF_FILE, '..'), { recursive: true });
      execFileSync(ffmpeg, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
        '-vf', `scale=${W}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
        '-loop', '0', GIF_FILE]);
      const secs = frames.reduce((t, x) => t + x.hold, 0);
      report.push({ file: relative(ROOT, GIF_FILE), url: `${frames.length} frames`, frag: `${secs.toFixed(1)}s`, size: statSync(GIF_FILE).size });
      console.log(`  ✓ demo.gif  ${frames.length} frames, ${secs.toFixed(1)}s, ${(statSync(GIF_FILE).size / 1e6).toFixed(2)} MB`);
      rmSync(dir, { recursive: true, force: true });
    }
  }
  c.close();
} catch (e) {
  errors.push(`[${current}] ${e.message}`);
}
cleanup();

console.log(`\nscenario: ${SCENARIO} · pair: ${pairA},${pairB} · closest: ${pairA} · cell: ${gapCell ? `${gapCell.pid} × ${gapCell.tid}` : 'none'}`);
for (const r of report) console.log(`  ${r.file}\t${(r.size / 1024).toFixed(0)} KB\t${r.url}`);
if (errors.length) { console.error(`✗ ${errors.length} error(s):\n  ${errors.join('\n  ')}`); process.exit(1); }
