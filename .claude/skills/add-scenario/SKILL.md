---
name: add-scenario
description: Add or update a media coalition scenario (results mode) in site/data/scenarios.json, checking every member and role against the source text.
argument-hint: <source URL> [more source URLs…]
disable-model-invocation: true
---

# /add-scenario

Sources: $ARGUMENTS

## 1. Read first
- `.claude/rules/data.md`, the Scenarios section (it loads with `site/data/`; read it directly if it hasn't).
- `site/data/scenarios.json`, `site/data/parties.json` (ids, Hebrew and English names), `site/data/results-26.json` (seats, joint lists).
- In `docs/research/decisions.md`: the scenarios table, the roles rule below it, and "הערות לתרחישים", so the new entry follows the same format.

## 2. Check each source (a subagent may fetch it, but it must return the verbatim lines)
- Open every source. Quote, verbatim, the lines that name the members and each role (member, supporter, abstainer). Note the outlet, the date (d.m), the author, and whether it is the outlet's report, a commentator's proposal, or a party's or person's own statement.
- A role the text doesn't clearly support goes to the user as a question, with the quote. Never guess.
- A party that ran on a joint list brings the whole list (e.g. "Smotrich" = the ט list, so זהות too).
- When the text gives only a seat total (e.g. "48"), show the user the arithmetic that gives the parties. If more than one combination fits, ask.
- A party's own reply (denial, rejection, response) is a source with `denialBy` / `refusalBy` / `responseBy`, and the party must be in the scenario.
- Verbatim objections from the scenario's own source go into decisions.md, not into the data.

## 3. Before editing, confirm with the user
Show the composition, the roles, the source line exactly as it will render in both languages, and the investiture result (for / against / abstaining, approved or not). There are at most 4 scenarios: if there are already 4, ask which one this replaces. Edit only after the user's OK.

## 4. Edit `site/data/scenarios.json`
- `members` / `supporters` / `abstainers` as party ids. No hand-written name: the label is generated from the roles.
- `sources`: main report first. Each has `outlet` (Hebrew where that is the common name, e.g. ג׳רוזלם פוסט), `date` (ISO), `url`, optional `by` (a person's statement, rendered "<person> ב<outlet>", with "ב-" before a Latin outlet), at most one of `denialBy` / `refusalBy` / `responseBy`, and an `en` twin (`outlet`, and `by` when set).
- `asOf`: the date the sources were last checked.
- No `note` field.

## 5. Check
- `node scripts/validate.mjs` and `node --test`. `test/results.test.mjs` pins the current scenarios (count, investiture, red lines, pivotal parties). Where a pinned fact changes, update the test to the new fact and show the user the change. Never loosen it.
- `node scripts/smoke.mjs --mode=results --only=views,narrow,interaction,en-views,tasks,fit,nobreak` (the sections that render scenarios).

## 6. Log and commit
- `docs/research/decisions.md`: a row in the scenarios table (composition, roles, sources, what was checked, with the verbatim quotes), any objections under "הערות לתרחישים", and a dated entry with the issue number. No ";" in Hebrew text.
- One `data:` commit referencing the issue. Deploying is a separate step: `/deploy`, with the user's OK.
