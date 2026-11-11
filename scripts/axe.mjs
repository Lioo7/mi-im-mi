// Accessibility check with axe-core (pinned, through npx): every view and every sheet, in Hebrew and English, at 390 and
// 1280px, in the three data modes (a local run) or the deployed mode (a URL). The WCAG 2.0–2.2 A and AA rules; any
// violation fails the run. Views are scanned with every <details> open, so closed content is checked too.
// Usage: node scripts/axe.mjs [baseUrl] [--mode=results|polls|hidden|all]   (default: serves ./site, --mode=all)
// When npx can't provide axe-core (offline on a first run, no npm), it skips with the reason and exits 0.
// Output: a line per mode and each violation once (with where it was found), all of it in smoke/axe/axe.json.
// Same harness as smoke (scripts/browser.mjs): reduced motion, no GoatCounter beacon ever sent.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadData } from './lib.mjs';
import { serve, launchChrome, pageClient, waitFor, npxModules, SETTLE_JS } from './browser.mjs';

const AXE = 'axe-core@4.14.0';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// As in smoke.mjs: a local run serves site/ with meta.json's mode overridden.
const MODES = { results: { mode: 'results' }, polls: { mode: 'polls', showSeats: true }, hidden: { mode: 'polls', showSeats: false } };
const SIZES = [{ tag: '390', width: 390, height: 844, dpr: 2, mobile: true }, { tag: '1280', width: 1280, height: 900, dpr: 1, mobile: false }];
// A coalition with every role (members, a supporter, abstainers), so the outside-party markup is scanned too.
const ROLES = 'm=yashar,together,democrats,yisrael-beiteinu&o=joint-list&a=raam,utj';
const VIEWS = [['home', '#build'], ['build', `#build?${ROLES}`], ['results', `#results?${ROLES}`], ['pair', '#pair?p=likud,yashar'], ['method', '#method']];
// [name, page, the clicks that open it]. A sheet whose trigger a mode doesn't show (the recommendations outside results
// mode) is listed as not shown, not failed.
const SHEETS = [
  ['party', `#results?${ROLES}`, ['#matrix .party-btn']],
  ['cell', `#results?${ROLES}`, ['#matrix .cell']],
  ['topic', `#results?${ROLES}`, ['[data-act="topic"]']],
  ['closest', `#results?${ROLES}`, ['#matrix .party-btn', '#sheet [data-act="closest"]']],
  ['recs', `#build?${ROLES}`, ['[data-act="recs"]']],
  ['poll-info', `#build?${ROLES}`, ['[data-act="poll-info"]']],
  ['pair', `#results?${ROLES}`, ['[data-act="pair-sheet"]']],
];

const args = process.argv.slice(2);
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const base = args.find((a) => !a.startsWith('--'));
const usage = (msg) => { console.error(`✗ ${msg}\n  usage: node scripts/axe.mjs [baseUrl] [--mode=${Object.keys(MODES).join('|')}|all]`); process.exit(2); };
for (const a of args.filter((x) => x.startsWith('--'))) if (!/^--mode=./.test(a)) usage(`unknown option ${a}`);
const dataMeta = loadData().meta;
const dataMode = dataMeta.mode === 'results' ? 'results' : dataMeta.showSeats === false ? 'hidden' : 'polls';
const MODE = opt('mode') ?? (base ? dataMode : 'all');
if (!MODES[MODE] && MODE !== 'all') usage(`unknown mode "${MODE}"`);
if (base && MODE !== dataMode) usage(`a remote run tests the deployed mode (${dataMode}), not --mode=${MODE}`);
const runModes = MODE === 'all' ? Object.keys(MODES) : [MODE];

const found = npxModules([AXE]);
if (found.skip) { console.log(`⚠ axe skipped: ${found.skip}. Run it once online.`); process.exit(0); }
const AXE_SRC = readFileSync(join(found.dir, 'axe-core', 'axe.min.js'), 'utf8');

const OUT = join(ROOT, 'smoke', 'axe');
mkdirSync(OUT, { recursive: true });
const chrome = launchChrome();
let server = null;
let current = '';
const where = () => current;
const cleanup = () => { try { server?.stop(); } catch { /* ignore */ } chrome.kill(); };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

const t0 = Date.now();
const errors = [];
// rule id → { impact, help, url, targets: Set, where: Set }
const violations = new Map();
const report = { axe: AXE, tags: TAGS, scans: [] };
const lines = [];
try {
  const c = await pageClient(chrome.profile, { where });
  c.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(`[${current}] exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    if (m.method === 'Fetch.requestPaused') c.send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, body: '' }).catch(() => {});
  });
  for (const d of ['Page', 'Runtime']) await c.send(`${d}.enable`);
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*goatcounter.com/count*' }] });
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  // axe in every document (CDP init scripts are not subject to the page's CSP).
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: AXE_SRC });
  const evaluate = async (expr) => {
    const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, 60000);
    if (r.exceptionDetails) throw new Error(`[${current}] ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  const go = async (url, z) => {
    await c.send('Emulation.setDeviceMetricsOverride', { width: z.width, height: z.height, deviceScaleFactor: z.dpr, mobile: z.mobile });
    await c.send('Page.navigate', { url: 'about:blank' });
    await c.send('Page.navigate', { url });
    await waitFor(() => evaluate("document.documentElement.classList.contains('ready') && document.querySelector('#footer')?.children.length > 0 && typeof axe === 'object'"), 15000, where);
    await evaluate(SETTLE_JS(1000));
  };
  const scan = async (name) => {
    const v = await evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] })
      .then((r) => r.violations.map((x) => ({ id: x.id, impact: x.impact, help: x.help, url: x.helpUrl, targets: x.nodes.map((n) => n.target.join(' ')) })))`);
    report.scans.push({ scan: name, violations: v });
    for (const x of v) {
      const e = violations.get(x.id) ?? { impact: x.impact, help: x.help, url: x.url, targets: new Set(), where: new Set() };
      x.targets.forEach((t) => e.targets.add(t));
      e.where.add(name);
      violations.set(x.id, e);
    }
  };

  for (const mode of runModes) {
    const tm = Date.now();
    if (!base) server = await serve(MODES[mode]);
    const baseUrl = (base ?? server.url).replace(/\/?$/, '/');
    let scans = 0;
    const notShown = new Set();
    for (const lng of ['he', 'en']) {
      const withLang = (h) => (lng === 'en' ? `${h}${h.includes('?') ? '&' : '?'}l=en` : h);
      for (const z of SIZES) {
        for (const [name, hash] of VIEWS) {
          current = `${mode} ${lng} ${z.tag} ${name}`;
          await go(baseUrl + withLang(hash), z);
          await evaluate("document.querySelectorAll('details').forEach((d) => { d.open = true; }), true");
          await evaluate(SETTLE_JS(500));
          await scan(current);
          scans++;
        }
        for (const [name, hash, clicks] of SHEETS) {
          current = `${mode} ${lng} ${z.tag} sheet:${name}`;
          await go(baseUrl + withLang(hash), z);
          let shown = true;
          for (const sel of clicks) {
            if (!(await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`))) { shown = false; break; }
            await evaluate(SETTLE_JS(800));
          }
          if (!shown) { notShown.add(name); continue; }
          if (!(await evaluate("document.querySelector('#sheet')?.open === true"))) { errors.push(`[${current}] the sheet did not open`); continue; }
          await scan(current);
          scans++;
        }
      }
    }
    server?.stop();
    server = null;
    lines.push(`${mode}: ${scans} scans in ${Math.round((Date.now() - tm) / 1000)}s${notShown.size ? ` (not shown in this mode: ${[...notShown].join(', ')} sheet)` : ''}`);
  }
} catch (/** @type {any} */ e) {
  errors.push(`[${current}] ${e.message}`);
}
writeFileSync(join(OUT, 'axe.json'), JSON.stringify(report, null, 1));
for (const l of lines) console.log(`  ${l}`);
for (const [id, e] of violations) {
  const w = [...e.where];
  console.error(`✗ ${id} (${e.impact}): ${e.help}\n    ${[...e.targets].slice(0, 5).join(' | ')}${e.targets.size > 5 ? ` (+${e.targets.size - 5})` : ''}\n    in ${w.length} scan(s): ${w.slice(0, 4).join('; ')}${w.length > 4 ? '; …' : ''}\n    ${e.url}`);
}
for (const e of errors) console.error(`✗ ${e}`);
const ok = !violations.size && !errors.length;
console.log(`${ok ? '✓' : '✗'} axe (${AXE}, WCAG 2.x A/AA): ${violations.size} rule(s) violated, ${Math.round((Date.now() - t0) / 1000)}s (details: smoke/axe/axe.json)`);
process.exit(ok ? 0 : 1);
