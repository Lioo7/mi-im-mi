# Plan: "מי עם מי", a one-day static web app
**Tagline:** "בנו קואליציה וגלו איפה היא תתפרק" · **Netlify site:** `mi-im-mi-2026` (`mi-im-mi` was taken by an unrelated site) · **Public GitHub repo:** `Lioo7/mi-im-mi`

## Before writing any app code
1. Save this plan (final version) to `PLAN.md` in the project root.
2. Create `CLAUDE.md` (≤30 lines): project goal, neutrality rules, source and redLine rules, glossary, "data changes only via `scripts/import-csv.mjs`", the test/validate/smoke/deploy commands, RTL/Hebrew conventions, "all UI strings live in `js/strings.js`", and "see PLAN.md for everything else".
3. ✅ `netlify status`: logged in as lioz.akirav@gmail.com. The site is created as `mi-im-mi-2026` in the **existing team** (currently "People's Budget", which you're renaming to "Lioz Akirav") via `netlify sites:create --name mi-im-mi-2026` at the first draft deploy.

## Git workflow
- `git init` at step 1. **Commit locally at the end of every build step** using short Conventional Commits: `feat:`, `fix:`, `data:`, `chore:`, `docs:`. Each message ends with the required `Co-Authored-By` line.
- `.gitignore`: `research/`, `review/` (the review CSV holds verifier flags and internal notes), `smoke/`, `.netlify/`, `.DS_Store`.
- **No push to GitHub until step 14**, after your CSV review, so unreviewed positions never appear in the public repo. The repo `Lioo7/mi-im-mi` (public) is created at step 14, not step 1.

## Context
The Knesset elections are on **Tuesday 27.10.2026**. This app shows where the platforms of possible coalition partners **clash** and where they **agree**. It must be built and shared today via a WhatsApp link, mostly opened on phones. Neutrality and sourcing are product requirements. `/Users/liozakirav/Documents/projects/elections` is currently empty, so this is a greenfield project.

### What research turned up (bakalpi.co.il, checked 24.10)
- **Terms:** robots.txt is `Allow: /`. There is no terms-of-use page and no license text. The site is run independently by Dana Melamed. **Plan:** a polite, one-time read of about 30 pages (13 party pages plus the relevant `/he/issues/<slug>` pages). We write **our own** summaries, link back to bakalpi on every position (`viaUrl`), and credit it in the methodology. We copy no text verbatim. A courtesy email to the site owner is optional.
- **Polls:** each party page shows a **"ממוצע X מנדטים · טווח"** line, an average of its last 5 polls. We use these averages. The home page shows bloc totals from the 23.10 Channel 12 poll (coalition 50 / Zionist opposition 56 / Arab parties 14). Membership can be derived from those totals, and the sums match exactly.
- **Party names: the single source is the Central Elections Committee list** "רשימות המועמדים לכנסת" (https://www.gov.il/he/pages/candidates-lists-26; lists approved 27.9.2026, page updated 22.10.2026). gov.il blocks automated fetches, so the source of record is your saved copy, `research/cec-candidate-lists-26.pdf`. **I verified all 13 rows against it**, visually from the page images and through the text layer. **bakalpi is never a source for names.** Its "רק ביחד" or "דרך ישר" is ballot letters + name. Three fields:
  - `officialName`: verbatim from the list. Shown in the cell sheet, the party profile and the methodology.
  - `name`: the list's own core name, with the leader or slogan part dropped and nothing reworded. Used everywhere in the UI.
  - `ballotLetters`: from the same list.
  ASCII `"` is normalized to gershayim `״`. The en dash `–` is kept as in the list. The methodology states: "שמות הרשימות לפי פרסום ועדת הבחירות המרכזית".
- **Party set (13; Noam is excluded per your answer):**

| id (bakalpi slug) | ballotLetters | name | officialName (CEC, verbatim) | poll avg | status | bloc (bakalpi/Ch.12) |
|---|---|---|---|---|---|---|
| likud | מחל | הליכוד | הליכוד בהנהגת בנימין נתניהו לראשות הממשלה | 21.8 (19–30) | above | coalition |
| yashar | דרך | ישר! | ישר! עם איזנקוט לראשות הממשלה מאחדים את ישראל | 21.6 | above | opposition |
| together | רק | ביחד | ביחד בראשות נפתלי בנט | 13.8 | above | opposition |
| democrats | אמת | הדמוקרטים | הדמוקרטים בראשות יאיר גולן | 9.2 | above | opposition |
| joint-list | ודם | הרשימה המשותפת | הרשימה המשותפת | 8.8 | above in most | arab |
| shas | שס | ש״ס | התאחדות הספרדים שומרי תורה תנועתו של מרן הרב עובדיה יוסף זצ״ל | 7.8 | above | coalition |
| otzma-yehudit | ב | עוצמה יהודית | עוצמה יהודית בראשות איתמר בן גביר | 7.8 | above | coalition |
| utj | ג | יהדות התורה | יהדות התורה והשבת אגודת ישראל – דגל התורה | 7.6 | above | coalition |
| yisrael-beiteinu | ל | ישראל ביתנו | ישראל ביתנו בראשות אביגדור ליברמן | 7.4 | above | opposition |
| religious-zionism | ט | הציונות הדתית וזהות | הציונות הדתית בראשות בצלאל סמוטריץ' וזהות בראשות משה פייגלין | 7.0 | above | coalition |
| raam | עם | רע״ם | רע״ם – הרשימה הערבית המאוחדת | 5.8 | above in most | arab |
| kalkalit | די | המילואימניקים והכלכלית | המילואימניקים והכלכלית בראשות יועז הנדל וירון זליכה | 4.0 | **on the threshold** (below in most) | none |
| amcha-yisrael | ך | עמך ישראל | עמך ישראל בראשות עופר וינטר | — (0) | **on the threshold** (below in all) | none |

Note: `ש״ס` is the only `name` that doesn't appear in its own official list name. It's the established short form, chosen by you.

- **Data gaps:** bakalpi has **no Likud source** for conscription, judiciary or religion-state, because Likud has no 2026 platform. It mentions an **Oct 7 commission** for only 2 of the 13 parties, and it records no **red lines**. These cells need statements and legislative record, under the rules below.
- **⚠️ Poll-publication restriction:** Israeli election law restricts publishing polls in the final days before the vote. The ban appears to run from Friday 23.10. Per the [gov.il guidance](https://www.gov.il/BlobFolder/guide/knesset25-elections-info/he/survey_section16_acces.pdf), anyone who publishes, during this period, a poll released before it must state **prominently that the poll is not current**. That means the seat counter carries a visible line: **"ממוצע סקרים שפורסמו עד 23.10.2026 — הסקרים אינם עדכניים"**. I have not confirmed the exact statutory wording ([IDI background](https://www.idi.org.il/parliaments/7129/9017)), so do a 2-minute check before sharing. On election day itself (27.10), hide all seat numbers with the single flag `meta.json → showSeats: false`, then redeploy.

---

## 1. Stack & hosting
| Choice | Why |
|---|---|
| **Vanilla HTML/CSS/JS (ES modules), no framework, no build step** | About 13 parties × 8 topics, one page, a handful of views. A framework adds KB and setup time for no benefit. Everything is under ~30 KB gzipped. |
| **System fonts** (`system-ui, "Segoe UI", Arial`) | Hebrew renders well everywhere, and a web font would cost 0 KB to skip, 50–100 KB to load. |
| **Node (built-in only) scripts** for CSV ↔ JSON + validation, `node --test` for logic | Node 22 is installed. Zero dependencies means nothing to install. |
| **Netlify**, site `mi-im-mi-2026` | Deploys a folder in one command, supports custom headers, has draft URLs for the reviewer round, and offers Edge Functions later for per-coalition previews. |
| **Public GitHub repo `mi-im-mi`** (created via `gh` at step 14) | Data and sources are open for inspection, and the footer links to `site/data/`. `research/` and `review/` are gitignored. |
| **GoatCounter** (cookieless, page views only) | Lightweight, needs no consent banner. Configured to record **`location.pathname` only** (`window.goatcounter = {path: () => location.pathname}`), so coalition choices in the query string are **never** sent. No events. Until you give me the site code, the snippet stays a commented-out placeholder in `index.html`. |
| **Smoke test: `scripts/smoke.mjs` using Chrome over the DevTools protocol** (Node 22 built-in `WebSocket`, zero installs) | Playwright is **not** installed on this machine (no npm/global package, no browser cache), and you asked not to install it. Chrome is installed, so the script launches it headless and does the same job. |

### Layout
```
elections/
  site/                     ← deployed folder
    index.html  og.png
    css/app.css
    js/app.js               (state, URL sync, rendering, events)
    js/compat.js            (pure algorithm; imported by browser + tests)
    js/strings.js           (ALL UI strings, one exported object; no i18n framework)
    data/parties.json topics.json positions.json meta.json
  scripts/export-csv.mjs import-csv.mjs validate.mjs make-stub.mjs smoke.mjs
  smoke/                    (screenshots; gitignored)
  PLAN.md  CLAUDE.md  README.md (step 14)
  research/drafts/<topic>.json   (agent output; not deployed)
  review/positions_review.csv
  test/compat.test.mjs
  netlify.toml  .gitignore
```

---

## 2. Data schema

**`meta.json`**: `{ dataUpdated, pollsAsOf: "2026-10-23", pollNote, blocSourceUrl, showSeats: true, stub: false }`. When `showSeats: false`, the app hides **every** seat number: chip numbers, the seat counter and bar, the "חסרים X", the seat figures in the friction preview and in the unity preset line. Presets still work, and tie-breaks still use `pollAvg` internally. When `stub: true`, the app shows a red "נתוני דמה" banner and the deploy script refuses to ship.

**`parties.json`** (array, sorted by `pollAvg` desc, ties broken alphabetically in Hebrew)
| field | type | notes |
|---|---|---|
| id | string | bakalpi slug |
| officialName | string | verbatim from the CEC list (see the table above) |
| name | string | the core name from the CEC list, leader or slogan dropped, never reworded; used across the UI |
| ballotLetters | string | from the same CEC list (e.g. `רק`) |
| leader | string | |
| pollAvg | number\|null | bakalpi 5-poll average |
| pollRange | string\|null | e.g. "19–30" |
| threshold | `above`\|`borderline` | `borderline` triggers the "על סף החסימה" badge |
| bloc | `coalition`\|`opposition`\|`arab`\|null | from bakalpi/Ch.12 only; null = in no preset |
| platformStatus | `full`\|`partial`\|`none` | shown on the party card |
| bakalpiUrl, platformUrl | string | |

There is no separate short-name field. The matrix party column wraps `name` onto up to 2 lines at 12–13 px, so no abbreviation invents wording. If a smoke screenshot shows the column breaking at 360 px, I'll propose specific short forms for you to approve.

**`topics.json`** (array, in your fixed order 1–8)
`{ id, name, short, bakalpiIssues: [slug], axis: { "-2": label, "-1": …, "0": …, "1": …, "2": … }, axisNote }`.
Short column labels: **גיוס · משפט · חקירה · דת · מדיני · עזה · כלכלה · פשיעה** (all ≤5 chars; "מדיני" avoids both "שטחים" and "יו״ש").

**`positions.json`** (array of 104 rows)
| field | type | rule |
|---|---|---|
| partyId, topicId | string | must exist |
| position | -2…2 \| null | null = no stated position |
| redLine | bool | true **only** if the party or its leader said in its own words, on the record (official site, X, recorded interview), that this is a coalition condition or deal-breaker. News-report red lines don't count. |
| summary | string | 1–2 Hebrew sentences in our own neutral words |
| quote | string? | short and verbatim, only from the cited source |
| sourceUrl | string | required unless position is null |
| sourceType | `platform`\|`statement`\|`record` | `record` = a bill the party itself led or sponsored, **or** a vote where it broke from its bloc. Plain votes under bloc discipline don't count. |
| sourceDate | YYYY-MM-DD | |
| viaUrl | string? | the bakalpi page where the item was found |
| confidence | `high`\|`med`\|`low` | internal, review only |
| flagged, flagReason | bool, string | set by the verification agent |

**Sources allowed for `statement`:** the party's site or X account, or the leader's or MK's own words in a recorded interview, video, or a direct quote. A journalist's characterization is never a source.

---

## 3. Draft axes (checkpoint A: you review these before research starts)
> **Superseded:** the axes were approved and frozen at checkpoint A (25.10). The source of truth is `site/data/topics.json`. Decisions made at that checkpoint:
> - **גיוס** measures the *scope* of the service obligation. +2 only for parties that explicitly support an obligation for all citizens including Arabs. The Arab-service position always goes in the summary. A general rejection of compulsory service sits at −2 (e.g. the Joint List), with the party's own reasoning in the summary.
> - **מדיני/עזה** −2 no longer mentions emigration. Any stated position on emigration must appear in that topic's summary in the party's own terms, and redLine applies by the usual rules.
> - **משפט** −2 and **פשיעה** +2 were reworded; the Nation-State Law appears in summaries only.
> - Research agents may use primary sources in Hebrew, Arabic or English (summary always in Hebrew). The shared research brief is `research/brief.md` (gitignored).

The UI never shows the numbers, so the sign direction is arbitrary and carries no meaning. Each pole is worded the way its own supporters would describe it.

1. **גיוס ושוויון בנטל.** The axis covers **Haredi conscription and yeshiva budgets only**. A party's position on service for Arab citizens goes in the summary, and if that is its only stance, the cell is null.
   -2 פטור לבני ישיבות מעוגן בחוק; לימוד תורה מוכר כשירות; תקציבי הישיבות נשמרים · -1 הסדר גיוס הדרגתי בהסכמה, במסלולים ייעודיים, בלי סנקציות אישיות · 0 יעדי גיוס מחייבים שעולים בהדרגה, עם סנקציות מוסדיות/תקציביות · +1 חובת גיוס או שירות לבני ישיבות, עם סנקציות כלכליות אישיות · +2 חובת שירות צבאי/אזרחי לכולם, אכיפה מלאה ושלילת תקציבים והטבות ממי שאינו משרת
2. **מערכת המשפט ושלטון החוק.**
   -2 שינוי יסודי: רוב פוליטי בבחירת שופטים, פסקת התגברות, הגבלת הביקורת השיפוטית · -1 שינויים משמעותיים בכיוון זה גם בלי הסכמה רחבה · 0 שינויים מוגבלים רק בהסכמה רחבה · +1 שמירה על המבנה והסמכויות הקיימים · +2 עיגון עצמאות מערכת המשפט בחוקה/חוק יסוד שמחזק את הביקורת השיפוטית
3. **ועדת חקירה ממלכתית ל-7 באוקטובר.**
   -2 מתנגדת לוועדת חקירה חיצונית בשלב זה · -1 ועדה שהרכבה נקבע בידי הדרג הפוליטי, לא ממלכתית · 0 חקירה בהרכב מוסכם/מעורב, בלי התחייבות למנגנון · +1 ועדת חקירה ממלכתית לפי החוק · +2 ועדה ממלכתית מיידית שחוקרת גם את הדרג המדיני, עם התחייבות ליישם את מסקנותיה
4. **דת, מדינה וזהות.** The axis covers **the religious character of the state only**. The Nation-State Law position goes in the summary. Mixing the two on one axis would misplace parties such as ישראל ביתנו vs. רע״ם, which are liberal on one and conservative on the other. **You decide at checkpoint A.**
   -2 חיזוק הצביון הדתי בחוק (הרחבת סמכויות הרבנות, חקיקה ברוח ההלכה) · -1 שמירה על הסטטוס קוו וחיזוק הזהות היהודית · 0 סטטוס קוו עם התאמות נקודתיות בהסכמה · +1 ליברליזציה: נישואים אזרחיים, תחבורה ציבורית בשבת · +2 הפרדת דת ממדינה
5. **הסוגיה הפלסטינית.**
   -2 ריבונות על כל יהודה ושומרון / הגדה המערבית, הרחבת ההתיישבות, שלילת מדינה פלסטינית · -1 ריבונות חלקית (בקעה, גושים) והתנגדות למדינה · 0 ניהול הסכסוך: בלי מדינה ובלי סיפוח בטווח הנראה · +1 היפרדות והסדר עתידי (כולל מדינה מפורזת) בתנאים ביטחוניים · +2 מדינה פלסטינית על בסיס קווי 1967, הקפאה או פינוי התנחלויות
6. **ביטחון, עזה והיום שאחרי.** Calibrate these labels against bakalpi's `security-diplomacy` page first, since the situation in 2026 shapes the options.
   -2 שליטה ישראלית מלאה ומתמשכת ברצועה, כולל ממשל צבאי/התיישבות · -1 שליטה ביטחונית ישראלית, ממשל מקומי שאינו הרש״פ · 0 חופש פעולה ביטחוני + ניהול אזרחי בינלאומי/ערבי · +1 הסדר אזורי עם תפקיד לרש״פ מחודשת ונסיגה הדרגתית · +2 סיום המלחמה, נסיגה מלאה ופתרון מדיני כמסגרת לביטחון
7. **כלכלה ויוקר המחיה (כולל דיור).**
   -2 שוק חופשי: הפחתת מסים והוצאה, הפרטה, הסרת רגולציה · -1 נטייה לשוק חופשי עם רשת ביטחון ממוקדת · 0 תחרות וייבוא לצד התערבות נקודתית (דיור, מזון) · +1 התערבות רחבה: דיור ציבורי, הרחבת שירותים, מיסוי פרוגרסיבי · +2 מדינת רווחה: הרחבה משמעותית של קצבאות ושירותים, פיקוח מחירים, מיסוי הון
8. **ביטחון אישי ופשיעה.**
   -2 יד קשה: הרחבת סמכויות המשטרה, הקלה ברישוי נשק, ענישה מחמירה · -1 הקשחת ענישה והגדלת המשטרה, עם שימור הפיקוח הקיים · 0 אכיפה מוגברת לצד השקעה במניעה · +1 דגש על מניעה, השקעה בחברה הערבית ובפריפריה, משטרה מקצועית שאינה תלויה בדרג הפוליטי · +2 מניעה ושיקום, צמצום נשק אזרחי ופיקוח חיצוני חזק על המשטרה

---

## 4. Data-collection workflow
1. **Calibrate axes (me, ~30 min).** Read the 6 relevant bakalpi issue pages (`recruitment, judiciary-governance, religion-state, security-diplomacy, economy, housing, crime-personal-security`) and adjust the labels so real positions spread across the scale. **→ Checkpoint A: you approve the axes (~5 min), then I freeze `topics.json`.**
2. **Four research agents in parallel, in the background, split by topic:**
   A: גיוס + דת · B: משפט + ועדת חקירה · C: מדיני + עזה · D: כלכלה + פשיעה.
   Each agent gets the frozen axes, the party list, the source rules from §2, and a neutral-language glossary (below). It starts from the bakalpi issue and party pages, then fills gaps from the party's own site or X, recorded interviews, and record (bills it sponsored; bakalpi's government-legislation and votes pages). It prefers the **primary source** as `sourceUrl` and puts bakalpi in `viaUrl`. When nothing qualifies, it sets `null` and never guesses. Output goes to `research/drafts/<topic>.json`, with an `evidenceNote` per row.
3. **Normalize (me, ~30 min).** Merge to 104 rows. Check that ±2 is used with the same strictness across topics and across blocs. Check that each party's evidence is consistent across topics. Then produce a coverage table of nulls and red lines per party and per bloc.
4. **Verification (1–2 fresh agents, never the drafters).** For every row, open `sourceUrl` and check that (a) it loads, (b) it supports the summary, (c) the position label is a fair reading, (d) any red line is in the party's own words, (e) `sourceType` is correct, (f) the wording is neutral. The agent sets `flagged` and `flagReason`.
5. **Export:** `node scripts/export-csv.mjs` writes `review/positions_review.csv` (UTF-8 **with BOM** so Excel and Sheets render Hebrew). **Sort order:** flagged first, then `redLine=true`, then |position| = 2, then the rest by topic and party order.
   Columns: `flagged, flag_reason, red_line, position, position_label, topic, party, summary, quote, source_type, source_url, via_url, source_date, confidence, party_id, topic_id`. `position_label` is a read-only helper so you review words, not numbers.
6. **→ Checkpoint B: your 15-minute review** in Sheets or Excel. Edit `position`, `red_line`, `summary` and `source_url` in place, and clear `flagged` when a row is resolved.
7. **Import:** `node scripts/import-csv.mjs review/positions_review.csv` validates the file and writes `site/data/positions.json`. It ignores column order and the `position_label` column, and it **prints a diff** of what you changed. It fails loudly with row numbers on: an unknown id, position out of range, a missing source for a non-null position, a bad `sourceType`, duplicate or missing pairs (≠104), or an unresolved `flagged` row (a warning, overridable with `--allow-flagged`).

**Glossary for our own voice** (quotes stay verbatim): "פטור/דחיית שירות" (never "השתמטות"); "השינויים המוצעים במערכת המשפט" (neither "רפורמה" nor "הפיכה"); "יהודה ושומרון / הגדה המערבית"; party names only from `parties.json` (`name` in the UI, `officialName` in the profile and methodology), which comes from the CEC list and never includes ballot letters.

---

## 5. Compatibility algorithm (`site/js/compat.js`, pure functions)

**Pair level per topic:** `level(a, b, topic)`
```
if a.position == null or b.position == null → NONE   ⚪ אין עמדה מוצהרת (excluded from all counts)
d = |a − b|
if d ≥ 3 or (d ≥ 2 and (a.redLine or b.redLine)) → CLASH  🔴 סתירה חזיתית  ✕
if d == 2 → MAJOR  🟠 פער מהותי  ≠
if d == 1 → MINOR  🟡 פער קל  ≈
if d == 0 → AGREE  🟢 מסכימים  ✓
```
Why these thresholds: on a 5-point scale, 3+ steps means the parties sit on opposite halves (one at a pole, the other past the center). A red line is a party's own statement that a 2-step gap is non-negotiable for it.
**The UI explains it in one sentence:** "אדום = המפלגות רחוקות 3 דרגות או יותר בסולם, או 2 דרגות כשאחת מהן הצהירה שזה קו אדום שלה." Each red cell also gets a sentence of its own, e.g. "הליכוד ↔ ישר!: 3 דרגות (‹label›  ↔  ‹label›)".

**Topic status for a coalition** = the worst `level` over all member pairs with positions. If fewer than 2 members have a position, the status is `NODATA` ("אין מספיק עמדות").

**Results:**
1. **3 המשברים.** Candidates are the topics whose status is CLASH or MAJOR. For each topic, take its worst pair. Sort by level, then d, then red line present, then combined poll seats of the pair (a clash between bigger partners weighs more), then topic order. Show at most 3, one per topic, each with "+N זוגות נוספים". If none qualify: "אין פערים מהותיים בין השותפות".
2. **מה מדביק אותה:** topics with status AGREE or MINOR where ≥2 members have a position, each with a coverage note "(5 מתוך 6 שותפות הביעו עמדה)". AGREE topics come first.
3. **השותפה שמייצרת הכי הרבה חיכוך** (needs ≥3 members): for each non-base member, `friction = Σ over topics and partners of (CLASH = 3, MAJOR = 1)`. Show the maximum when it is > 0. On a tie, show both. The base party is excluded because the user chose to build around it. The card has a **"מה אם נוריד אותה?"** button with a preview, e.g. "בלעדיה: 1 נושא בסתירה במקום 3 · ≈49 מנדטים". Tapping it removes the party and shows an undo toast. The methodology notes that a party with more null positions can score lower friction, and the party chip shows coverage ("עמדה ב-5/8").
4. **Overall indicator:** **"X מתוך Y נושאים ללא סתירה חזיתית"** (Y = topics that aren't NODATA), plus an 8-segment bar where each segment shows the topic status as a color, an icon and the short label. **There is no percentage score**, because a single number would imply precision the data doesn't have.

5. **Add-chip indicator** (informational): for each party not yet selected, `newClashTopics(p, coalition)` = the number of topics (0–8) where p would be at CLASH level with at least one current member. The chip shows **"+N ✕"**, with "0 ✕" shown as well, and only when ≥1 party is selected. The aria-label reads "הוספתה תיצור סתירה חזיתית ב-N נושאים". The value never reorders chips, and no "recommended" wording appears anywhere.

**Matrix cell color:**
- With a base party: `level(base, party, topic)`. The base row shows "● נקודת ייחוס".
- Without a base: the party's **worst level against any other member** on that topic. I'm recommending this instead of a centroid. It reuses the same rule, avoids fractional medians, and explains itself: "הצבע = ההתנגשות החמורה ביותר של המפלגה בנושא מול שותף כלשהו".

**Edge cases:**
- 0 parties selected: landing page with presets and party chips.
- 1 party: its profile (8 positions with sources) and the prompt "הוסיפו שותפה כדי לראות התנגשויות".
- Exactly 2 parties: the results area becomes the **pair view**.
- All members null on a topic: the topic is NODATA and is listed under "אין נתונים".
- Base party null on a topic: that matrix column is grey with the note "לבסיס אין עמדה".
- Outside support (`o=` in the URL): these parties count fully in clash calculations and are marked "מבחוץ". The seat counter shows "X בקואליציה + Y מבחוץ".
- Unknown ids in the URL are ignored silently.

**Seats:** the sum of `pollAvg` is shown rounded as "≈52 / 61", with "חסרים 9". Borderline parties count with their average and get a note ("כולל 4 של מפלגה על הסף, ייתכן 0"). עמך ישראל counts as 0. The "not current" poll line from Context appears directly below the counter.

---

## 6. UI plan (single page, mobile-first)
`<html lang="he" dir="rtl">`. CSS uses logical properties only (`margin-inline-start` and so on), wraps URLs and Latin text in `<bdi>`, uses `tabular-nums` for numbers, and puts all colors in CSS vars (light theme only). Every visible string comes from `js/strings.js`.

**Mobile (360 px, 16 px gutters), top to bottom:**
1. **Header:** **מי עם מי**, the tagline "בנו קואליציה וגלו איפה היא תתפרק", and "עודכן DD.MM".
1b. **"איך זה עובד" block** (3 short lines, then "למתודולוגיה המלאה ←" linking to `#method`), e.g.: (1) בחרו מפלגות או התחילו מתרחיש מוכן. (2) לכל מפלגה מיקום ב-8 נושאים, לפי המצע או הצהרות רשמיות, עם מקור. (3) הצבע מראה את המרחק בין העמדות, לא מה נכון.
2. **Presets row** (horizontally scrolling chips, sorted alphabetically in Hebrew as a documented rule): אופוזיציה + תמיכה ערבית מבחוץ · אחדות · גוש האופוזיציה · גוש הקואליציה. Tapping a preset fills the builder, and everything stays editable. **אחדות** = Likud plus the largest `opposition` party by `pollAvg` (currently ישר), followed by the line "חסרים לכם X מנדטים ל-61".
3. **Builder:** a "הקואליציה שלכם" tray (selected chips with ★ set-as-base and ✕ remove buttons), then "הוסיפו שותפה" (all 13 chips in poll order, **one neutral color for all parties**, a seats number on each chip when `showSeats` is on, the "+N ✕" indicator, and a "על הסף" badge where it applies). Chips are ≥44 px with `aria-pressed`.
4. **Sticky bottom bar:** seat counter with a progress bar and a 61 marker (hidden when `showSeats` is off), plus a share button.
5. **Results cards:** crises, glue, problem partner, overall bar. An `aria-live="polite"` region announces each change, e.g. "נוספה ש״ס: 2 סתירות חזיתיות".
6. **Matrix:** a real `<table>` with rows = selected parties and 8 topic columns. A sticky 72 px party column plus 8 × 32 px cells fits 328 px. Below 340 px wide, the matrix (only) scrolls horizontally. Each cell is a `<button>` with **color + icon** (✓ ≈ ≠ ✕ –), a 🚩 corner mark for a red line, and an `aria-label` such as "ש״ס, גיוס: סתירה חזיתית מול הליכוד". The legend sits under the table.
7. **Cell sheet:** a `<dialog>` bottom sheet with party · topic · position label, summary, quote, a **source-type badge (מצע / הצהרה / רקורד)**, the source link and date, the "דרך בקלפי" link, and the "למה בצבע הזה?" sentence. It traps focus and closes on Esc.
8. **Pair view:** tap a party name, then "השוו עם…", or select exactly 2 parties. It shows 8 rows of topic · A's label · B's label · level badge, each expandable to summaries and sources, with a header like "מסכימות ב-3, פער קל ב-2 … מתוך 7 נושאים". **No left/right scale graphic**, so we never pick which pole goes on the right side of an RTL screen. (Venn is **cut**.)
9. **Methodology & disclaimer** (`#method`): the axes and all their labels, the color rule, the source ladder and sourceType definitions, the coverage table (nulls and red lines per party), "לא המלצת הצבעה", "אינו קשור לבקלפי או לאף מפלגה", credit to bakalpi, and the last-updated date.
10. **Footer:** "Lioz Akirav" · GitHub https://github.com/Lioo7 · תיקונים: lioz.akirav@gmail.com · **"הנתונים והמקורות פתוחים לבדיקה"**, linking to `https://github.com/Lioo7/mi-im-mi/tree/main/site/data`.

**Desktop:** a **centered single column** (`max-width: 720px`). The matrix uses full topic names in its headers when there is room. No two-column layout.

**URL state:** `?b=likud&m=shas,utj,otzma-yehudit&o=raam`, using readable slugs and updated with `history.replaceState` on every change. Query parameters (not a hash) let a later Edge Function read the coalition for previews.

**Sharing:** `navigator.share` with a copy-link fallback, plus a `wa.me` link with generated text ("הקואליציה שבניתי: … · 2 סתירות חזיתיות"). **OG:** static `og:title`, `og:description` and a neutral 1200×630 `og.png` (rendered with headless Chrome from an HTML template). WhatsApp doesn't run JS, so per-coalition previews would need a Netlify Edge Function. That is deferred.

**Performance budget:** HTML+CSS+JS under 30 KB gzipped and data under 20 KB gzipped, in 5 requests, plus the async GoatCounter script (~3 KB), which never blocks rendering. No images above the fold (inline SVG icons only). `netlify.toml` sets `Cache-Control: max-age=300` so corrections propagate fast.

---

## 7. Neutrality checklist (run before sharing; results go in the methodology where relevant)
- [ ] All party chips share one neutral color, and no bloc colors appear anywhere. Severity colors mean only "distance".
- [ ] Party order = poll average (an external number). Preset order = Hebrew alphabetical. Both rules are stated in the methodology.
- [ ] Bloc membership comes only from bakalpi/Ch.12 and is cited. Parties without a bloc appear in no preset.
- [ ] No default coalition on load, and no example clash in the UI copy. The methodology uses **mirrored example pairs**, one from inside each bloc, taken from real data.
- [ ] Axis poles are worded the way their supporters would describe them, the glossary is applied, and the numbers are never shown.
- [ ] Coverage audit: nulls per party and per bloc are published. If one bloc has more nulls, the reason is explained (e.g. "לליכוד אין מצע 2026").
- [ ] Red-line audit: every `redLine=true` has an own-words source. The count per bloc is reviewed to confirm one standard was applied, not to force a balance.
- [ ] ±2 audit: the same strictness applies across blocs.
- [ ] sourceType and date are visible on every position.
- [ ] Symmetry read-through: run the 4 presets plus mirrored pairs (e.g. ביחד ↔ הדמוקרטים and הליכוד ↔ עוצמה יהודית), then read all generated text for asymmetric wording.
- [ ] The poll "not current" line is present, along with "לא המלצת הצבעה" and the last-updated date.
- [ ] The add-chip "+N ✕" stays informational: chip order never changes, and no "recommended" or "best partner" wording appears.
- [ ] GoatCounter sends the pathname only: confirm in DevTools that the count request carries no `?b=`/`m=`.

---

## 8. Build order (≈8 h wall-clock; "∥" = runs while agents research)
| # | Step | Est. |
|---|---|---|
| 0 | Write `PLAN.md` + `CLAUDE.md` (Netlify login already checked) | 10m |
| 1 | `git init` + `.gitignore`, scaffold, `strings.js`, `netlify.toml`, `parties.json` + `meta.json` (from the table above) | 30m |
| 2 | Calibrate the axes and draft `topics.json` → **Checkpoint A (you, 5 min)** | 35m |
| 3 | Launch 4 research agents in the background | ~75m wall |
| 4 ∥ | `compat.js` + `test/compat.test.mjs` (thresholds, red-line escalation, nulls, NODATA, crisis ordering, glue coverage, friction ties and base exclusion, URL round-trip) | 45m |
| 5 ∥ | `make-stub.mjs` (stub data with the banner), `export`/`import`/`validate` scripts | 30m |
| 6 ∥ | Shell: header + "איך זה עובד", builder, chips (+N ✕), base, presets, seat counter + `showSeats`, URL sync, footer | 80m |
| 7 ∥ | Results cards + live region | 60m |
| 8 ∥ | Matrix + cell sheet | 60m |
| 9 ∥ | Pair view | 40m |
| 10 ∥ | Methodology section, GoatCounter placeholder, `scripts/smoke.mjs` | 45m |
| 11 | Normalize drafts, run the verification agent(s), export CSV | 30m + ~40m wall |
| 12 | **Checkpoint B: your 15-min review** → import + diff | 25m |
| 13 | QA: `node scripts/smoke.mjs`, **I look at every screenshot myself**, then run the neutrality checklist | 30m |
| 14 | OG image. `README.md`: Hebrew first, plus one short English paragraph. It covers what the app does, the live link, the data files and their fields, a 5-line methodology summary linking to `#method`, and how to report a correction (email or a GitHub issue). Then `gh repo create Lioo7/mi-im-mi --public` + **first push**, then `netlify deploy` (draft URL), then **I stop and ask you to check it on your phone** (WhatsApp preview, RTL, tap targets). After your OK, you send it to the 2 reviewer friends. | 30m |
| 15 | Apply reviewer fixes → **production deploy only after you confirm** (`netlify deploy --prod --dir=site`) | — |

**Cut now (decided):** Venn, the desktop two-column layout, dark mode, and the formal Lighthouse/VoiceOver pass.
**Cut next if time runs short, in order:** (1) `navigator.share` and the generated WhatsApp text (keep copy-link); (2) the OG image (keep title and description); (3) the "what if we remove it" preview line (keep the remove button); (4) the standalone pair view (a base-party matrix covers pairs).
**Never cut:** sources and sourceType badges, the verification pass, your review, the methodology and disclaimers, the poll "not current" line, the `showSeats` flag, the neutrality checklist, the smoke screenshots, and the draft-then-confirm release.

---

## Verification
- `node --test` runs the algorithm unit tests, including mirrored-input cases: swapping blocs must produce identical results.
- `node scripts/validate.mjs` checks the data: schema, 104 pairs, sources present, `stub: false`, no unresolved flags.
- Local check: `python3 -m http.server -d site 8080`, using desktop and Chrome device emulation at 360 px and 320 px.
- **Smoke:** `node scripts/smoke.mjs [baseUrl]`. It launches headless Chrome over CDP at 360×800 (DPR 2) and opens the 4 presets plus one 2-party link (e.g. `?m=together,democrats`). It saves `smoke/<name>.png` and exits non-zero on any console error, uncaught exception or failed request. I review every screenshot before each deploy. It runs against the local server and again against the draft URL.
- Toggle `showSeats: false` locally and confirm in a smoke run that no seat number is visible.
- `netlify deploy --dir=site` (draft URL): I run the smoke script against it, then **stop and ask you** to do the real-phone check (WhatsApp link preview, RTL rendering, tap targets, bottom sheet). That step is yours. After your OK, the link goes to the 2 reviewer friends.
- `validate.mjs` also checks that every party has non-empty `officialName`, `name` and `ballotLetters`, that no `officialName`/`name` starts with `ballotLetters + " "`, and that names match the verified CEC table (pinned in a test fixture).
- Shared URLs: open the 4 presets, a 2-party link and an invalid id in a fresh browser and confirm the state restores.
- **Only after your explicit OK:** `netlify deploy --prod --dir=site`, then commit and push.
- Before the first push, run `git log --stat` and `git ls-files` to confirm that nothing under `research/` or `review/` was ever committed.

---

## Checkpoint B decisions (25.10)
- **Red lines, wording test:** "without X we won't join or support a government" or "X is non-negotiable" counts; a stated priority ("בראש הדרישות") does not. Judged by wording only, never by bloc. Draft red lines: ש״ס and יהדות התורה (verified own words, 10.2026), הציונות הדתית, ישראל ביתנו, עמך ישראל. Inquiry red line: ישראל ביתנו.
- **Joint lists:** lists that announced a post-election split are shown as separate parties. הציונות הדתית and זהות (ט) are soft-linked in the UI, with seats split ≈6/≈1 by Zehut's list slots (2, 8, 10, 11). No other joint list declared a split, so ביחד, הרשימה המשותפת, המילואימניקים והכלכלית and יהדות התורה stay single lists, with `componentsDisagree` (◐) per topic.
- **Axes:** crime −2 = Shin Bet plus at least one other extraordinary measure (Shin Bet alone = −1; gun licensing removed). מדיני/עזה −2 now include emigration/expulsion as an *active state policy*; "allowing those who want to leave" goes in the summary only. Inquiry 0 = a mixed composition elected by the Knesset.
- **Placements:** הליכוד גיוס −1 (`record`: the government-initiated enforcement freeze, Amendment 28, Knesset bill 2168881, struck down by the High Court on 3.9.2026); הליכוד פשיעה −1; רע״ם פשיעה +1; ישראל ביתנו עזה 0; עמך ישראל עזה −2 and חקירה 0; ביחד משפט +1.
- **UI:** coverage footnote for parties with 3+ null topics; a hint to pick a ★ base party; GoatCounter `miimmi` (pathname only).

## Round 3 UI changes (after the phone check)
- **Three views by hash:** `#build` (default), `#results`, `#method`. The coalition stays in the query string; a shared link without a hash opens `#results`.
- **Build:** one intro line, a 2×2 preset grid, one grid of party chips (selected chips are filled in place with ★ base and ✕), and a sticky bottom bar (seats, progress, "לתוצאות ←", and a grey poll disclaimer with an ⓘ sheet), constrained to the 720px column.
- **Add-chip counts:** `✓A ✕C ?U` per unselected chip, relative to the current coalition. Per topic the worst level against current members decides: AGREE/MINOR → ✓, CLASH → ✕, no stated position → ?; MAJOR counts in none. Never used to order chips. The results summary gives the same breakdown per topic status. No single score.
- **Logo:** a Venn mark (two overlapping circles) with a wordmark, inline SVG, also the favicon and the OG image.
- **Privacy:** GoatCounter's `count.js` is not loaded, because it always attaches `location.search`. `site/js/stats.js` sends only path, title, screen width and the referrer origin; it skips localhost and Netlify deploy previews.
- **Data:** זהות · דת = +1 (low), with both sides in the summary.
