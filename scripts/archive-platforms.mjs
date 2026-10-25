// Downloads local copies of the platform pages/PDFs we cite into research/platforms/<party-id>/ and writes INDEX.md.
// PDFs: curl. HTML pages: saved as .html and printed to .pdf with headless Chrome so they stay readable offline.
// research/ is gitignored (third-party content). Usage: node scripts/archive-platforms.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { ROOT, loadData, readJson } from './lib.mjs';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIR = join(ROOT, 'research', 'platforms');
const today = new Date().toISOString().slice(0, 10);
const { parties } = loadData();
const byParty = readJson(join(ROOT, 'research', 'platform-urls.json'));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

const slug = (url) => {
  const u = new URL(url);
  let name = decodeURIComponent(u.pathname).replace(/\/+$/, '').split('/').pop() || u.hostname.replace(/^www\./, '');
  name = name.replace(/\.(pdf|html?)$/i, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return name || 'page';
};
const run = (cmd, args, timeout = 90000) => spawnSync(cmd, args, { encoding: 'utf8', timeout });

const results = []; // { party, file, url, status, note }
for (const [pid, urls] of Object.entries(byParty)) {
  const out = join(DIR, pid);
  mkdirSync(out, { recursive: true });
  const used = new Set();
  for (const url of urls) {
    let base = slug(url);
    for (let i = 2; used.has(base); i++) base = `${slug(url)}-${i}`;
    used.add(base);
    const isPdf = /\.pdf(\?|$)/i.test(url);
    const files = [];
    let note = '';
    const tmp = join(out, `${base}.${isPdf ? 'pdf' : 'html'}`);
    const c = run('curl', ['-sSL', '--max-time', '60', '-A', UA, '-o', tmp, '-w', '%{http_code} %{content_type}', url]);
    const [code, ctype = ''] = (c.stdout ?? '').trim().split(' ');
    const ok = code === '200' && existsSync(tmp) && statSync(tmp).size > 500;
    if (!ok) { rmSync(tmp, { force: true }); note = `download failed (HTTP ${code || 'n/a'})`; }
    else if (isPdf || /pdf/i.test(ctype)) { files.push(basename(tmp)); }
    else files.push(basename(tmp));
    if (ok && !(isPdf || /pdf/i.test(ctype))) {
      const pdf = join(out, `${base}.pdf`);
      const prof = mkdtempSync(join(tmpdir(), 'plat-'));
      run(CHROME, ['--headless=new', `--user-data-dir=${prof}`, '--no-pdf-header-footer', '--virtual-time-budget=12000', `--print-to-pdf=${pdf}`, url], 120000);
      rmSync(prof, { recursive: true, force: true });
      if (existsSync(pdf) && statSync(pdf).size > 1000) files.push(basename(pdf)); else note += ' PDF print failed';
    }
    results.push({ party: pid, files, url, note: note.trim() });
    console.log(`${files.length ? '✓' : '✗'} ${pid} ${files.join(', ') || '-'} ${note}`);
  }
}

// ---- INDEX.md ----
const party = new Map(parties.map((p) => [p.id, p]));
const sizeOf = (p, f) => { try { return `${Math.round(statSync(join(DIR, p, f)).size / 1024)} KB`; } catch { return ''; } };
const rows = results.flatMap((r) => (r.files.length ? r.files : ['(none)']).map((f) => `| ${party.get(r.party).name} | ${f === '(none)' ? '—' : `${r.party}/${f}`} | ${f === '(none)' ? '' : sizeOf(r.party, f)} | ${r.url} | ${today} | ${r.note} |`));
const local = [
  ['זהות', 'zehut-platform-full-he.pdf', 'https://zehut.org.il/platform/full (הקובץ המלא של 188 עמודים זמין באתר רק אחרי הרשמה; עותק שסיפק הסוקר)'],
  ['המילואימניקים והכלכלית (המפלגה הכלכלית החדשה)', 'kalkalit-new-economic-party-summary.pdf', 'https://www.hakalkalit.org/ (סיכום המצע; עותק שסיפק הסוקר)'],
  ...readdirSync(join(DIR, 'religious-zionism')).filter((f) => f.endsWith('.pdf')).sort().map((f) => ['הציונות הדתית (מצע 2021)', `religious-zionism/${f}`, `https://zionutdatit.org.il/wp-content/uploads/2021/12/${f} (נוצר ב-2.12.2021; עותק שסיפק הסוקר)`]),
].map(([name, f, src]) => `| ${name} | ${f} | ${existsSync(join(DIR, f)) ? Math.round(statSync(join(DIR, f)).size / 1024) + ' KB' : ''} | ${src} | (סופק מראש) | |`);

const failed = results.filter((r) => !r.files.length);
const md = `# ארכיון מצעים מקומי

נוצר ב-${today} על ידי \`scripts/archive-platforms.mjs\`. התיקייה \`research/\` אינה בגיט (תוכן של צדדים שלישיים), ולכן הקבצים כאן הם לשימוש מקומי בלבד.
לכל דף HTML נשמר גם קובץ HTML גולמי וגם PDF שנוצר מהדף בדפדפן, כדי שיהיה קריא גם בלי חיבור. דפים שמבוססים על JavaScript עשויים להיראות חלקית ב-PDF.

## מפלגות בלי מצע בחירות מלא ל-2026
ליכוד, ש״ס, יהדות התורה, עוצמה יהודית, רע״ם. עבור הליכוד ועוצמה יהודית נשמרו דפי האתר הרשמי שאליהם הפנינו (עקרונות או תוכניות נקודתיות, לא מצע). לש״ס, ליהדות התורה ולרע״ם אין קבצים כאן, והעמדות שלהן (אם יש) מבוססות על הצהרות ורקורד חקיקתי, שמקורותיהם ב-\`docs/research/evidence.csv\`.

## קבצים שהורדו
| מפלגה | קובץ | גודל | כתובת המקור | תאריך הורדה | הערה |
|---|---|---|---|---|---|
${rows.join('\n')}

## קבצים שסופקו מראש (לא הורדו שוב)
| מפלגה | קובץ | גודל | מקור | תאריך | הערה |
|---|---|---|---|---|---|
${local.join('\n')}

${failed.length ? `## הורדות שנכשלו\n${failed.map((r) => `- ${party.get(r.party).name}: ${r.url} (${r.note})`).join('\n')}\n` : ''}
## הערות לבדיקה אחרי הבחירות (לא שונה דבר באתר)
<!-- NOTES -->
`;
writeFileSync(join(DIR, 'INDEX.md'), md);
console.log(`\n✓ INDEX.md written; ${results.filter((r) => r.files.length).length}/${results.length} URLs saved`);
