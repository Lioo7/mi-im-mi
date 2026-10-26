# מי עם מי: project rules
Static, Hebrew, RTL web app showing where possible coalition partners clash or agree across 8 topics, for the Knesset 26 elections (27.10.2026). Vanilla JS, no build, no dependencies; deployed from `site/` to Netlify (`mi-im-mi-2026`, https://mi-im-mi-2026.netlify.app). Current state: README.md, this file, `docs/research/decisions.md`. PLAN.md is the historical plan (24–25.10).

## ⚠️ The site is live and frozen
Do not change anything under `site/`, and do not deploy, without the user's explicit OK. If you find a critical bug (wrong data shown, a broken core flow, a privacy leak, a missing legal disclaimer), report it first and wait. Open findings: `docs/review-2026-10-26.md`.

## Layout
- `site/`: everything that is deployed.
  - `index.html`, `css/app.css`
  - `js/app.js`: DOM, routing (`#build`, `#results`, `#method`, `#why`), rendering
  - `js/compat.js`: pure compatibility logic and URL state (`?b=&m=&o=`), unit-tested
  - `js/strings.js`: all UI strings
  - `js/links.js`: correction mailto and quote attribution
  - `js/stats.js`: cookieless GoatCounter beacon, sent only from `https://mi-im-mi-2026.netlify.app` (path, title, screen width, referrer origin; never the query)
  - `data/`: `parties.json`, `topics.json`, `positions.json`, `meta.json`
- `scripts/`: Node built-ins only. `lib.mjs` holds shared IO, CSV and validation.
- `test/*.test.mjs`: unit tests for `node --test`.
- `docs/`:
  - `research/`: public; generated, except the hand-written `decisions.md`
  - `screenshots/`
  - `review-*.md`
- Gitignored: `research/` (`merged.json` is the research source of truth, plus third-party files), `review/` (the reviewer's CSV), `smoke/` (screenshots).

## Commands
- **Test:** `node --test`
- **Validate:** `node scripts/validate.mjs`
- **Smoke:** `node scripts/smoke.mjs [baseUrl]`, then look at `smoke/*.png`. Against production every beacon is inspected (never sent); on any other host, no beacon may be sent at all. To test seat-hidden mode, copy `site/` and `scripts/` to a scratch dir, set `showSeats` to `false` there, and run smoke in the copy.
- **Local:** `python3 -m http.server -d site 8080`
- **Export CSV:** `node scripts/export-csv.mjs` (`research/merged.json` → `review/positions_review.csv`)
- **Import CSV:** `node scripts/import-csv.mjs review/positions_review.csv [--dry-run]`. This validates the file, prints the diff and writes `site/data/positions.json`.
- **Evidence:** `node scripts/export-evidence.mjs` (→ `docs/research/evidence.{json,csv}`)
- **Archive sources:** `node scripts/archive-sources.mjs`, then `node scripts/apply-archive.mjs`. Only snapshots listed in `research/archive-verified.json` are published. Then export, then import.
- **OG image:** `node scripts/make-og.mjs`
- **Deploy:** draft with `netlify deploy --dir=site`; prod with `netlify deploy --prod --dir=site`, only after the user confirms.

## Neutrality (a product requirement)
- One neutral color for all parties; severity colors encode distance only. Parties are ordered by poll average (by ballot letters when `showSeats` is `false`), presets alphabetically.
- No default coalition and no example clashes in UI copy. Axis numbers are never shown. Each pole is worded the way its supporters would put it.
- Party names come only from `parties.json` (`name` / `officialName`, from the CEC list), never from bakalpi, and never include ballot letters. Ballot letters appear only as the separate `ballotLetters` tag.

## Sources
- `sourceType`: `platform` | `statement` (party/leader's own words: site, X, recorded interview, direct quote) | `record` (a bill the party led/sponsored, or a vote breaking from its bloc; not plain bloc-discipline votes). A journalist's characterization is never a source.
- `redLine=true` only when the party or its leader said in its own words, on the record, that this is a coalition condition. Never from news reports.
- No source means `position: null`. Never guess. Summaries are in our own words; quotes are verbatim.

## Glossary (our voice; quotes stay verbatim)
"פטור/דחיית שירות" (not "השתמטות") · "השינויים המוצעים במערכת המשפט" (not "רפורמה"/"הפיכה") · "יהודה ושומרון / הגדה המערבית" · "החלת ריבונות / סיפוח" (both terms, never one side's alone). Loaded terms appear only inside attributed quotes.

## Quotes and attribution (`site/js/links.js`)
- A quote is shown in ״…״ with the line "<speaker or party>, <channel>, <date>". The date is left out when `sourceDate` is null.
- `quoteBy`: the speaker, when it is not the party itself, verified against the source. When null, the line names the party.
- `quoteChannel`: where the words were originally published, when that differs from the `sourceUrl` host (e.g. "פייסבוק" quoted via a news site). When null, the channel comes from the `sourceUrl` host (the `MEDIA` map), or is "מצע המפלגה" / "אתר המפלגה".
- `quoteTranslatedBy`: who translated a quote that was not said in Hebrew. An outlet's name adds "(תרגום: X)" to the attribution line. "האתר" means our own translation.
- `quoteTranslation`: our free Hebrew translation, shown under an original-language quote (Arabic gets `lang="ar"`). It is marked "(תרגום חופשי של האתר)" and requires `quoteTranslatedBy` = "האתר". The original quote stays verbatim.

## Data and polls
- Change positions **only** via `node scripts/import-csv.mjs review/positions_review.csv`. Never hand-edit `site/data/positions.json`.
- `meta.json → showSeats` (boolean): `false` hides every seat number and all poll-derived info: the threshold badge, the joint-list seat split, the poll ordering and the seat tie-breaks.
- The election-day flip is prepared as a one-line commit on the local branch `election-day-flip`. It needs the user's OK, then `git cherry-pick election-day-flip` onto `main`, validate, smoke, and a prod deploy.
- Wherever seat numbers or poll-derived figures show, the full legal sentence (`S.seats.pollLegal`, ממוצע סקרים שפורסמו עד … הסקרים אינם עדכניים …) must be visible with them.

## Conventions
- `<html lang="he" dir="rtl">`, CSS logical properties only, Latin/URLs wrapped in `<bdi>`, gershayim `״` in names.
- All UI strings live in `site/js/strings.js`. Colors are paired with an icon and text, never color alone.
- Commits: Conventional Commits (`feat:`, `fix:`, `data:`, `chore:`, `docs:`), one per build step. Push only when the user asks.
