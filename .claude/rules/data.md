---
paths:
  - "site/data/**"
  - "site/js/links.js"
  - "research/**"
  - "review/**"
  - "docs/research/**"
  - "scripts/{import,export}-*.mjs"
  - "scripts/apply-*.mjs"
  - "scripts/archive-sources.mjs"
  - "scripts/validate.mjs"
---
# Data rules: sources, quotes, modes, scenarios

## Commands
- **Positions change only via** `node scripts/import-csv.mjs review/positions_review.csv [--dry-run]`, which validates, prints the diff and writes `site/data/positions.json`. Never hand-edit `positions.json` (a hook blocks Edit/Write on it, and a shell write is no exception).
- **Export CSV:** `node scripts/export-csv.mjs` (`research/merged.json` → `review/positions_review.csv`).
- **Evidence:** `node scripts/export-evidence.mjs` (→ `docs/research/evidence.{json,csv}`).
- **Download:** `node scripts/export-download.mjs` (→ `site/download/mi-im-mi-positions.{csv,json}`, from `site/data` only).
- **Archive sources:** `node scripts/archive-sources.mjs`, then `node scripts/apply-archive.mjs`. Only snapshots listed in `research/archive-verified.json` are published. Then export, then import.
- **Changelog (#19):** `site/data/changelog.json` is the method page's dated list of data changes a visitor would notice, newest first. A placement entry is `{date, kind: "placement", party, topic, from, to}` with no text (rendered from the names and axis labels; the newest entry for a cell must match `positions.json`). The other kinds (`results`, `name`, `scenario`, `recommendations`, `notes` for dated notes in cells with no position) have `he` and `en`: one factual line, no evaluation, no seat or vote figures (the page shows no source line there) and no poll wording (polls mode with `showSeats: false` hides it everywhere), no ballot letters, parties and topics only as `{party:<id>}` / `{topic:<id>}`, scenarios named by their parties. After reviewing, `node scripts/changelog.mjs --ack`.
- After any data change: `node scripts/export-evidence.mjs` and `node scripts/export-download.mjs` (the method page's CSV/JSON download, `site/download/`, #18), then the changelog entry or `node scripts/changelog.mjs --ack`, then `node scripts/validate.mjs` and `node --test`. Validate fails when `docs/research/evidence.*` falls behind `positions.json`, or when `research/merged.json` differs from it on a public field (#40), or when `site/download/` is not what the data builds.

## Sources
- `sourceType`: `platform` | `statement` (party/leader's own words: site, X, recorded interview, direct quote) | `record` (a bill the party initiated or advanced). Votes breaking from the bloc were planned as evidence, but no position uses one; plain bloc-discipline votes never count. A journalist's characterization is never a source.
- `redLine=true` only when the party or its leader said in its own words, on the record, that this is a coalition condition. Never from news reports.
- No source means `position: null`. Never guess. Summaries are in our own words; quotes are verbatim.
- A null cell shows what was found (quote, attribution, source) without placing it. When no current position exists, an older official platform from a previous election may appear as a dated note in the null cell, only when the item answers the axis question directly (a partial fit is not enough). The note names the year and the document type exactly ("במצע יהדות התורה מ-1999 נכתב: …", "במסמך העקרונות של ש״ס מ-2006 נכתב: …"). Its source (the IDI or archive copy) goes in `extraSourceUrl`, or in `sourceUrl` when the cell has no other source, with `sourceDate` = the year alone when the exact date is unknown. It is never used for placement, and the rule applies to every party the same way.
- The Ra'am disqualification annex (`research/cec/`) is a partisan compilation, not a source. Anything in it is taken only from the primary source (e.g. the 1999 platform, from the IDI archive).

## Quotes and attribution (`site/js/links.js`)
- A quote is shown in ״…״ with the line "<speaker or party>, <channel>, <date>". The date is left out when `sourceDate` is null.
- `quoteBy`: the speaker, when it is not the party itself, verified against the source. When null, the line names the party.
- `quoteChannel`: where the words were originally published, when that differs from the `sourceUrl` host (e.g. "פייסבוק" quoted via a news site). When null, the channel comes from the `sourceUrl` host (the `MEDIA` map), or is "מצע המפלגה" / "אתר המפלגה".
- `quoteTranslatedBy`: who translated a quote that was not said in Hebrew. An outlet's name adds "(תרגום: X)" to the attribution line. "האתר" means our own translation.
- `quoteTranslation`: our free Hebrew translation, shown under an original-language quote (Arabic gets `lang="ar"`). It is marked "(תרגום חופשי של האתר)" and requires `quoteTranslatedBy` = "האתר". The original quote stays verbatim.

## Modes
- `meta.json → mode`: `"results"` (current) or `"polls"`. Switching back to polls (e.g. a repeat election) is this one line; `pollAvg` in `parties.json` is never touched, and a test covers the switch.
- **Results mode:** seats come from `results-26.json` (final official CEC votes since 4.11), entered **as published by the CEC, never computed** (surplus agreements change the split). The ט list's 6 seats are split 5/1 by Zehut's list slots (2, 8, 10, 11). Parties are ordered by seats, then votes. Lists under the threshold are not selectable (positions stay viewable). Every seat number is preceded by the results status line (`meta.resultsStatus` + CEC link). The poll disclaimer is not shown. `showSeats` does not apply.
- **Polls mode:** `meta.json → showSeats` (boolean): `false` hides every seat number and all poll-derived info: the threshold badge, the joint-list seat split, the poll ordering and the seat tie-breaks. Wherever seat numbers or poll-derived figures show, the full legal sentence (`S.seats.pollLegal`, ממוצע סקרים שפורסמו עד … הסקרים אינם עדכניים …) must be visible with them, placed before the numbers.
- **Poll order:** polls mode lists parties in `parties.json` file order, so the file is kept sorted: non-increasing `pollAvg`, ties by Hebrew name alphabetically (עוצמה יהודית before ש״ס at 7.8), a party with no `pollAvg` last. Validate enforces it (#51).
- Smoke enforces the source line before the numbers (results line or legal sentence) at 390×844 and 375×667, on first load and while scrolling.
- **הציונות הדתית / זהות:** soft-linked (one unit) in polls mode only; with results they are chosen and counted independently.
- **Roles:** member / supporter (`o=`) / abstainer (`a=`); unselected = opponent. Clash analysis is members only; supporters' and abstainers' gaps have their own card. Investiture: for = members + supporters, against = all others except abstainers, approved when for > against. Old `o=` links mean supporters.

## Ordering (#52)
- A list may be sorted by an outcome (red lines crossed, clashes, friction points) only when the sort is mechanical, the same rule for every party, and its full rule is stated on the method page in both languages. The wording stays plain and readable ("הקואליציות הקרובות לעמדות של X" is fine). Still no "best", no recommendation, no default coalition. Filtering by outcome (hiding coalitions) is not covered and needs its own decision. Entry points such as the home task cards carry no ranking word at all.

## Scenarios (results mode, `scenarios.json`; to add one, the user runs `/add-scenario`)
- At most 4, replacing the bloc presets. Named by composition only (generated from the roles, never hand-labeled), sorted alphabetically.
- Each source is opened and checked against the members and roles before it is added; a role the source doesn't clearly support is raised with the user, never guessed. When a source names a party that ran on a joint list, the whole list is included (e.g. "Smotrich" = the ט list, so זהות too).
- Source line, one format: "מקור: <outlet>, <d.m>" or "מקורות: <a> · <b>" (main report first); a person's statement reads "<person> ב<outlet>, <d.m>" (`by`, with "ב-" before a Latin outlet: "ב-ynet"); outlet names in Hebrew where that is the common name (ג׳רוזלם פוסט); the link sits on the outlet name.
- A party's own reply to the report is a source with one of `denialBy` / `refusalBy` / `responseBy` (a party of the scenario), rendered "הכחשת / דחיית / תגובת <party>: <outlet>, <d.m>" ("Denial / Rejection / Response by <party>:").
- Notes are not rendered; verbatim objections from a scenario's own source go in decisions.md. Log each scenario in `docs/research/decisions.md`.
