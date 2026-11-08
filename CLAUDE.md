# מי עם מי: project rules
Static, Hebrew, RTL web app showing where possible coalition partners clash or agree across 8 topics, for the Knesset 26 elections (27.10.2026), now in results mode (CEC seats, party roles, investiture vote) and also in English (`l=en`, Hebrew is authoritative). Vanilla JS, no build, no dependencies, deployed from `site/` to Netlify (`mi-im-mi-2026`, https://mi-im-mi-2026.netlify.app). State and history: README.md, `docs/research/decisions.md`.

More rules load with their files: `.claude/rules/data.md` (sources, quotes, modes, scenarios, the data scripts) and `.claude/rules/i18n.md` (the English version). Before data or translation work, make sure the matching one is loaded (read it if not).

## ⚠️ The site is live
Changes under `site/` are allowed as part of agreed work. **A production deploy needs the user's explicit OK**, always after the full local smoke, a draft deploy, the light check against the draft URL and the user's phone check: run `/deploy`. If you find a critical bug (wrong data shown, a broken core flow, a privacy leak, a missing legal disclaimer), report it first and wait.

Backlog: GitHub Issues. Run `gh issue list` before starting new work. Reference issues in commits (closes #N, refs #N).
Issue format: a one-sentence goal, short bullets, a "Done when" line. Labels: enhancement, tech-debt, research, data, priority:high.

### Working in a session (#37)
- During a fix: `node --test` and the targeted smoke sections. The full suite once, before the draft.
- Research (sources, docs, broad code searches) goes to a subagent that returns only its conclusion. `smoke.mjs` and `app.js` are about 2,000 lines each: find the part with `grep -n` and read that range, not the whole file.
- Read `smoke/<mode>/smoke.log` only when a run fails, and screenshots only for a visual change.
- Between tasks, `/clear`. When compacting, keep the issue number and its agreed decisions, the commits made, any draft `deploy_id` and URL, and what still waits for the user's OK.

## Layout
- `site/` is everything deployed. `js/app.js`: DOM, routing, rendering. `js/compat.js`: pure logic and URL state, unit-tested. `js/strings.js` / `js/strings.en.js`: all UI strings (the English file also has `NAMES`). `js/links.js`: correction mailto and quote attribution. `js/stats.js`: cookieless GoatCounter beacon, sent only from the production host, never with the query. `data/*.json`.
- `scripts/`: Node built-ins only, shared code in `lib.mjs`. `test/*.test.mjs`: unit tests.
- `docs/research/` is public and generated, except the hand-written `decisions.md`.
- Gitignored: `research/` (`merged.json` is the research source of truth), `review/` (the reviewer's CSV), `smoke/` (`<mode>/smoke.log`, screenshots).

## Commands
- **Test:** `node --test` · **Validate:** `node scripts/validate.mjs` · **Local:** `python3 -m http.server -d site 8080` · **OG image:** `node scripts/make-og.mjs`
- **Smoke:** `node scripts/smoke.mjs [baseUrl] [--mode=results|polls|hidden|all] [--only=<sections> | --light] [--shots]`
  - During a fix: only the sections the change touches, in its mode (`--only=pair,fit`; the default mode is `meta.mode`, a bad name lists the sections). A failure prints its rerun command.
  - Before the draft deploy: the full suite once, `--mode=all` (the three modes in parallel, about 2 min). Against a deploy: `--light`.
  - Output: a line per section and the first 10 errors, everything in `smoke/<mode>/smoke.log` (`smoke/remote/` for a URL). Screenshots only with `--shots` (`*-en.png` for English).
  - **Never drop or loosen an assertion to make a run pass.** What each section enforces is commented in `scripts/smoke.mjs`: both languages, beacons, CSP and headers, no coalition state in any request, first-screen fit (#26), fit at 360–412 and 125% text (#35), the party sheet's ✕ (#30). Bounded (#27): `SMOKE_STEP_MS`, `SMOKE_WATCHDOG_MS`.
- **Data, translations, archive:** the commands are in `.claude/rules/data.md` and `.claude/rules/i18n.md`.
- **Deploy:** `/deploy`. Full local suite → draft (`netlify deploy --dir=site --json`) → `--light` against the draft → the user's phone check → **only after the user's OK**, publish that same deploy (`netlify api restoreSiteDeploy`) → `--light` against production.

## Neutrality (a product requirement)
- One neutral color for all parties; severity colors encode distance only. Parties are ordered by poll average (by ballot letters when `showSeats` is `false`; by seats, then votes, in results mode), presets alphabetically.
- No default coalition and no example clashes in UI copy. Axis numbers are never shown. Each pole is worded the way its supporters would put it.
- Party names come only from `parties.json` (`name` / `officialName`, from the CEC list), never from bakalpi, and never include ballot letters. Ballot letters appear only as the separate `ballotLetters` tag.

## Seat numbers and roles
- `meta.json → mode`: `"results"` (current) or `"polls"`. The full rules are in `.claude/rules/data.md`.
- Every seat number is preceded by its source line: the results status line (`meta.resultsStatus` + CEC link) in results mode, the full legal sentence (`S.seats.pollLegal`) in polls mode. Smoke enforces it.
- Roles: member / supporter (`o=`) / abstainer (`a=`), unselected = opponent. Clash analysis is members only.

## Glossary (our voice; quotes stay verbatim)
| Hebrew | English | Never (outside quotes) |
|---|---|---|
| פטור/דחיית שירות | exemption / deferral of service | השתמטות · draft dodging, evasion |
| השינויים המוצעים במערכת המשפט | the proposed changes to the judicial system | רפורמה, הפיכה · judicial reform, overhaul, coup |
| יהודה ושומרון / הגדה המערבית | Judea and Samaria / the West Bank | one term alone |
| החלת ריבונות / סיפוח | applying sovereignty / annexation | one term alone |
| חרדים | "Haredi (ultra-Orthodox)" on first use in a text, then "Haredi" | "ultra-Orthodox" alone |

Loaded terms appear only inside attributed quotes. `test/glossary.test.mjs` enforces this in both languages.

## URL and security
- **URL state lives in the fragment:** `#<view>?b=&m=&o=&a=` (plus `l=en`). `#pair` adds `p=<a>,<b>`, which is not coalition state (its share link carries only `p` and `l`). Never put coalition state in the query: the server, and the Referer of every same-origin request, would see it. Old `?m=` links are moved into the fragment by `moveLegacyState` before any request. Share links are `/#results?…`.
- **CSP (`netlify.toml`):** `script-src 'self'; style-src 'self'; style-src-attr 'none'`. No inline scripts, no inline `<style>`, no `style=""` attributes (set styles through the CSSOM), no new hosts without updating the policy. No exceptions.
- **Hosting:** Netlify's Free plan (no attribution required). The "Powered by Netlify" badge is off in the dashboard (Project configuration > General). Netlify injects it at the edge, so if it is turned on again its script breaks under our CSP and remote smoke fails.

## English
Hebrew is authoritative. Every key in `strings.js` has its twin in `strings.en.js`, and every Hebrew data field has its `en` twin (the tests and `validate.mjs` fail otherwise). The rest: `.claude/rules/i18n.md`.

## Conventions
- No ";" in Hebrew text (UI strings, our data text, summaries): a period, a comma or a list. Quotes stay verbatim. `test/punctuation.test.mjs` enforces it.
- `<html lang="he" dir="rtl">`, CSS logical properties only, Latin/URLs wrapped in `<bdi>`, gershayim `״` in names.
- All UI strings live in `site/js/strings.js`. Colors are paired with an icon and text, never color alone.
- Commits: Conventional Commits (`feat:`, `fix:`, `data:`, `chore:`, `docs:`), one per build step. Push only when the user asks.
