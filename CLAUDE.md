# מי עם מי: project rules
Static, Hebrew, RTL web app showing where possible coalition partners clash or agree across 8 topics, for the Knesset 26 elections (27.10.2026). Since 1.11 it runs in results mode (CEC seats, party roles, investiture vote). Since 2.11 it is also in English (`l=en`; Hebrew is authoritative). Vanilla JS, no build, no dependencies; deployed from `site/` to Netlify (`mi-im-mi-2026`, https://mi-im-mi-2026.netlify.app). Current state: README.md, this file, `docs/research/decisions.md`. PLAN.md is the historical plan (24–25.10).

## ⚠️ The site is live
The site is no longer frozen (1.11): changes under `site/` are allowed as part of agreed work. **A production deploy still needs the user's explicit OK**, always after a draft deploy, smoke against the draft URL and the user's phone check. If you find a critical bug (wrong data shown, a broken core flow, a privacy leak, a missing legal disclaimer), report it first and wait. Open findings: GitHub Issues (`tech-debt`); the original review is `docs/review-2026-10-26.md`.

Backlog: GitHub Issues. Run `gh issue list` before starting new work. Reference issues in commits (closes #N).
Issue format: a one-sentence goal, short bullets, a "Done when" line. Labels: enhancement, tech-debt, research, data, priority:high.

### Results: official since 4.11
The CEC submitted the results to the President on 4.11.2026 (#2). `results-26.json` holds the final official votes; the seats did not change. See `docs/research/decisions.md`.

## Layout
- `site/`: everything that is deployed.
  - `index.html`, `css/app.css`
  - `js/app.js`: DOM, routing (`#build`, `#results`, `#pair`, `#method`, `#why`), rendering
  - `js/compat.js`: pure compatibility logic, seat source per mode, roles and investiture, completions to 61, and URL state (`#<view>?b=&m=&o=&a=`), unit-tested
  - `js/strings.js`: all UI strings (Hebrew); `js/strings.en.js`: the same shape in English, plus `NAMES` (people and channels named in the data)
  - `js/links.js`: correction mailto and quote attribution
  - `js/stats.js`: cookieless GoatCounter beacon, sent only from `https://mi-im-mi-2026.netlify.app` (path, title, screen width, referrer origin; never the query)
  - `data/`: `parties.json`, `topics.json`, `positions.json`, `meta.json`, `results-26.json` (CEC results per list, as published), `scenarios.json` (media scenarios, results mode)
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
- **Smoke:** `node scripts/smoke.mjs [baseUrl]`, then look at `smoke/*.png` (`*-en.png` for English). Every case also runs with `l=en`: lang/dir, the translation notice, no Hebrew outside `lang="he"`, the same numbers, links keeping `l=en`, and the toggle. Against production every beacon is inspected (never sent); on any other host, no beacon may be sent at all. Smoke follows `meta.mode`. To test polls mode, and polls mode with seats hidden, copy `site/`, `scripts/` and `netlify.toml` to a scratch dir, set `mode` to `"polls"` (and `showSeats` to `false`) there, and run smoke in the copy. Run all three before a deploy. Local runs send `netlify.toml`'s headers (so the CSP is enforced; any violation fails the run) and run Netlify's live badge script, fetched from production (`--no-hud` offline). Remote runs check the served CSP matches `netlify.toml`. Smoke also fails if any request to the site carries coalition state, except the first load of an old-format link.
- **Local:** `python3 -m http.server -d site 8080`
- **Export CSV:** `node scripts/export-csv.mjs` (`research/merged.json` → `review/positions_review.csv`)
- **Import CSV:** `node scripts/import-csv.mjs review/positions_review.csv [--dry-run]`. This validates the file, prints the diff and writes `site/data/positions.json`.
- **Evidence:** `node scripts/export-evidence.mjs` (→ `docs/research/evidence.{json,csv}`)
- **Translations:** `node scripts/apply-translations.mjs` (`research/translations-en.json` → `summaryEn`/`quoteTranslationEn` in `research/merged.json`, and `en` in `topics.json`). Then export, then import.
- **Archive sources:** `node scripts/archive-sources.mjs`, then `node scripts/apply-archive.mjs`. Only snapshots listed in `research/archive-verified.json` are published. Then export, then import.
- **OG image:** `node scripts/make-og.mjs`
- **Deploy:** draft with `netlify deploy --dir=site`; prod with `netlify deploy --prod --dir=site`, only after the user confirms.

## Neutrality (a product requirement)
- One neutral color for all parties; severity colors encode distance only. Parties are ordered by poll average (by ballot letters when `showSeats` is `false`), presets alphabetically.
- No default coalition and no example clashes in UI copy. Axis numbers are never shown. Each pole is worded the way its supporters would put it.
- Party names come only from `parties.json` (`name` / `officialName`, from the CEC list), never from bakalpi, and never include ballot letters. Ballot letters appear only as the separate `ballotLetters` tag.

## Sources
- `sourceType`: `platform` | `statement` (party/leader's own words: site, X, recorded interview, direct quote) | `record` (a bill the party initiated or advanced). Votes breaking from the bloc were planned as evidence, but no position uses one; plain bloc-discipline votes never count. A journalist's characterization is never a source.
- `redLine=true` only when the party or its leader said in its own words, on the record, that this is a coalition condition. Never from news reports.
- No source means `position: null`. Never guess. Summaries are in our own words; quotes are verbatim.
- A null cell shows what was found (quote, attribution, source) without placing it. When no current position exists, an older official platform from a previous election may appear as a dated note in the null cell, only when the item answers the axis question directly (a partial fit is not enough). The note names the year and the document type exactly ("במצע יהדות התורה מ-1999 נכתב: …", "במסמך העקרונות של ש״ס מ-2006 נכתב: …"). Its source (the IDI or archive copy) goes in `extraSourceUrl`, or in `sourceUrl` when the cell has no other source, with `sourceDate` = the year alone when the exact date is unknown. It is never used for placement, and the rule applies to every party the same way.
- The Ra'am disqualification annex (`research/cec/`) is a partisan compilation, not a source. Anything in it is taken only from the primary source (e.g. the 1999 platform, from the IDI archive).

## Glossary (our voice; quotes stay verbatim)
| Hebrew | English | Never (outside quotes) |
|---|---|---|
| פטור/דחיית שירות | exemption / deferral of service | השתמטות · draft dodging, evasion |
| השינויים המוצעים במערכת המשפט | the proposed changes to the judicial system | רפורמה, הפיכה · judicial reform, overhaul, coup |
| יהודה ושומרון / הגדה המערבית | Judea and Samaria / the West Bank | one term alone |
| החלת ריבונות / סיפוח | applying sovereignty / annexation | one term alone |
| חרדים | "Haredi (ultra-Orthodox)" on first use in a text, then "Haredi" | "ultra-Orthodox" alone |

Loaded terms appear only inside attributed quotes. `test/glossary.test.mjs` enforces this in both languages (UI strings and data, quoted spans removed).

## Quotes and attribution (`site/js/links.js`)
- A quote is shown in ״…״ with the line "<speaker or party>, <channel>, <date>". The date is left out when `sourceDate` is null.
- `quoteBy`: the speaker, when it is not the party itself, verified against the source. When null, the line names the party.
- `quoteChannel`: where the words were originally published, when that differs from the `sourceUrl` host (e.g. "פייסבוק" quoted via a news site). When null, the channel comes from the `sourceUrl` host (the `MEDIA` map), or is "מצע המפלגה" / "אתר המפלגה".
- `quoteTranslatedBy`: who translated a quote that was not said in Hebrew. An outlet's name adds "(תרגום: X)" to the attribution line. "האתר" means our own translation.
- `quoteTranslation`: our free Hebrew translation, shown under an original-language quote (Arabic gets `lang="ar"`). It is marked "(תרגום חופשי של האתר)" and requires `quoteTranslatedBy` = "האתר". The original quote stays verbatim.

## Data and polls
- Change positions **only** via `node scripts/import-csv.mjs review/positions_review.csv`. Never hand-edit `site/data/positions.json`.
- `meta.json → mode`: `"results"` (current) or `"polls"`. Switching back to polls (e.g. a repeat election) is this one line; `pollAvg` in `parties.json` is never touched, and a test covers the switch.
- **Results mode:** seats come from `results-26.json`, entered **as published by the CEC, never computed** (surplus agreements change the split). The ט list's 6 seats are split 5/1 by Zehut's list slots (2, 8, 10, 11). Parties are ordered by seats, then votes. Lists under the threshold are not selectable (positions stay viewable). Every seat number is preceded by the results status line (`meta.resultsStatus` + CEC link). The poll disclaimer is not shown. `showSeats` does not apply.
- **Polls mode:** `meta.json → showSeats` (boolean): `false` hides every seat number and all poll-derived info: the threshold badge, the joint-list seat split, the poll ordering and the seat tie-breaks. Wherever seat numbers or poll-derived figures show, the full legal sentence (`S.seats.pollLegal`, ממוצע סקרים שפורסמו עד … הסקרים אינם עדכניים …) must be visible with them, placed before the numbers.
- Smoke enforces the source line before the numbers (results line or legal sentence) with a simulated host badge at 390×844 and 375×667, on first load and while scrolling.
- **Scenarios (results mode):** at most 4, replacing the bloc presets. Named by composition only (generated from the roles, never hand-labeled), sorted alphabetically. Each source is opened and checked against the members and roles before it is added; a role the source doesn't clearly support is raised with the user, never guessed. Source line, one format: "מקור: <outlet>, <d.m>" or "מקורות: <a> · <b>" (main report first); a person's statement reads "<person> ב<outlet>, <d.m>" (`by`); outlet names in Hebrew where that is the common name (ג׳רוזלם פוסט); the link sits on the outlet name. When a source names a party that ran on a joint list, the whole list is included (e.g. "Smotrich" = the ט list, so זהות too). Notes are not rendered; verbatim objections from a scenario's own source go in decisions.md. Log each scenario in `docs/research/decisions.md`.
- **הציונות הדתית / זהות:** soft-linked (one unit) in polls mode only; with results they are chosen and counted independently.
- **Roles:** member / supporter (`o=`) / abstainer (`a=`); unselected = opponent. Clash analysis is members only; supporters' and abstainers' gaps have their own card. Investiture: for = members + supporters, against = all others except abstainers, approved when for > against. Old `o=` links mean supporters.

## URL and security
- **URL state lives in the fragment:** `#<view>?b=&m=&o=&a=` (plus `l=en` for English), with the views and method anchors as routes. The pair view adds `p=<a>,<b>` on `#pair` only; it is not coalition state, and its share link carries only `p` and `l`. Never put coalition state in the query: the server, and the Referer of every same-origin request, would see it. Old `?m=` links: `moveLegacyState` moves the query state into the fragment verbatim before any request, then the ids are checked. Other query params (e.g. `?s=wa`) stay. Share links are `/#results?…`.
- **CSP (`netlify.toml`):** no inline scripts, no `style=""` attributes (set styles through the CSSOM), and no new hosts without updating the policy. The one script hash is the inline script of Netlify's badge, which runs in a srcdoc iframe that inherits our CSP; if smoke reports a new hash, update it there. Inline `<style>` elements are allowed (`style-src-elem 'unsafe-inline'`) only because the badge's style embeds the visitor's viewport size, so it has no stable hash.

## English version
- **Every new string needs both languages:** a key in `strings.js` needs its twin in `strings.en.js` (the parity test fails otherwise). An English string has no Hebrew except the toggle label and a ballot letter.
- **Every Hebrew text field in the data has an `en` twin** (`parties`, `topics`, `meta`, results `splitNote`, scenario sources), and every position has `summaryEn`, plus `quoteTranslationEn` for a quote not in English. `validate.mjs` fails otherwise. Records are localized with `localize()`; party order is always computed from the Hebrew data.
- **Translation flow:** `research/translate-brief.md` (rules and glossary) → `research/translations-en.json` → independent verifier (`research/verify-en-brief.md`: blind back-translation first, then the comparison) → resolve every flag (disputes go to the user) → `apply-translations.mjs` → export → import. Before exporting, make sure `research/merged.json` matches `site/data/positions.json` (it fell behind once; see decisions.md), and check the import with `git diff`: only the intended fields may change.
- **Names:** GPO English list → the party's or person's own English → transliteration. A Hebrew party name is transliterated unless it has an established English name. Leaders as they spell themselves. Ballot letters stay Hebrew (`lang="he"`). The official list name is shown verbatim in Hebrew with our translation. Names in the data's Hebrew fields (quote speakers, channels) go through `NAMES`.
- **Quotes** stay in their original language; the English page shows the site's translation under them, marked as such. The required Hebrew poll sentence (polls mode) is shown verbatim before its translation.
- **Language in the URL:** `l=en` in the fragment (never the query); Hebrew is the default and is omitted. A shared English link previews in Hebrew (#21).

## Conventions
- `<html lang="he" dir="rtl">`, CSS logical properties only, Latin/URLs wrapped in `<bdi>`, gershayim `״` in names.
- All UI strings live in `site/js/strings.js`. Colors are paired with an icon and text, never color alone.
- Commits: Conventional Commits (`feat:`, `fix:`, `data:`, `chore:`, `docs:`), one per build step. Push only when the user asks.
