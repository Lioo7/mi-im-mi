# מי עם מי: project rules
Static, Hebrew, RTL web app showing where possible coalition partners clash or agree across 8 topics, for the Knesset 26 elections (27.10.2026). Vanilla JS, no build, no dependencies; deployed from `site/` to Netlify (`mi-im-mi`). **See PLAN.md for everything else.**

## Neutrality (a product requirement)
- One neutral color for all parties; severity colors encode distance only. Parties are ordered by poll average, presets alphabetically.
- No default coalition and no example clashes in UI copy. Axis numbers are never shown. Each pole is worded the way its supporters would put it.
- Party names come only from `parties.json` (`name` / `officialName`, from the CEC list), never from bakalpi, and never include ballot letters.

## Sources
- `sourceType`: `platform` | `statement` (party/leader's own words: site, X, recorded interview, direct quote) | `record` (a bill the party led/sponsored, or a vote breaking from its bloc; not plain bloc-discipline votes). A journalist's characterization is never a source.
- `redLine=true` only when the party or its leader said in its own words, on the record, that this is a coalition condition. Never from news reports.
- No source means `position: null`. Never guess. Summaries are in our own words; quotes are verbatim.

## Glossary (our voice; quotes stay verbatim)
"פטור/דחיית שירות" (not "השתמטות") · "השינויים המוצעים במערכת המשפט" (not "רפורמה"/"הפיכה") · "יהודה ושומרון / הגדה המערבית"

## Data
Change positions **only** via `node scripts/import-csv.mjs review/positions_review.csv`. Never hand-edit `site/data/positions.json`.

## Commands
- Test: `node --test` · Validate: `node scripts/validate.mjs` · Smoke: `node scripts/smoke.mjs [baseUrl]` (then look at `smoke/*.png`)
- Local: `python3 -m http.server -d site 8080`
- Draft: `netlify deploy --dir=site` · Prod (only after the user confirms): `netlify deploy --prod --dir=site`

## Conventions
- `<html lang="he" dir="rtl">`, CSS logical properties only, Latin/URLs wrapped in `<bdi>`, gershayim `״` in names.
- All UI strings live in `site/js/strings.js`. Colors are paired with an icon and text, never color alone.
- Commits: Conventional Commits (`feat:`, `fix:`, `data:`, `chore:`, `docs:`), one per build step. No push before the user's CSV review.
