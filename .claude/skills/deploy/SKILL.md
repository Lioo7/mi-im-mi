---
name: deploy
description: Deploy site/ to Netlify. axe and Lighthouse, the full local smoke, a draft deploy, the light check against the draft, the user's phone check, and only after the user's OK, publish that same draft and check production.
---

# /deploy

Claude may start this skill itself once a change is ready (committed, unit tests and targeted smoke passing). Starting it never covers publishing: step 6 always stops for the user's phone check, and steps 7–8 run only after the user's explicit OK for that draft.

Run the steps in order and log each one's start and end to `smoke/timings.log` (gitignored; `scripts/timings.mjs` has the format), appending to the log of the milestone it ships:

```bash
mkdir -p smoke && echo "$(date +%s) start deploy 3: full suite" >> smoke/timings.log
node scripts/smoke.mjs --mode=all
echo "$(date +%s) end deploy 3: full suite" >> smoke/timings.log
```

Stop at the first failure, report it with the rerun command smoke prints, and never drop or loosen an assertion to make a run pass. Read `smoke/<mode>/smoke.log` only when a run fails.

1. **Preflight.** `git status --short` must be clean: what gets deployed is what is committed. If it isn't, stop and list the uncommitted files. Then `node --test` and `node scripts/validate.mjs`.
2. **Accessibility and performance.** `node scripts/axe.mjs` (axe-core, WCAG 2.x A/AA: every view and sheet, both languages, 390 and 1280px, the three modes, about 1 min), then `node scripts/lighthouse.mjs` (the shared results link, mobile and desktop: CLS locally, about 20 s). A skip (npx can't provide the tool) is not a failure: say so in the report.
3. **Full local suite**, only once axe passes. `node scripts/smoke.mjs --mode=all` (the three modes in parallel, about 3 min).
4. **Draft.** `netlify deploy --dir=site --json`. Note `deploy_id` and `deploy_url`, and keep them through any compaction.
5. **Light check on the draft.** `node scripts/smoke.mjs <deploy_url> --light` (every file in `site/` served byte for byte, every `netlify.toml` header, the views at phone width in both languages), then `node scripts/lighthouse.mjs <deploy_url>` (served compressed, so the performance score counts too: at least 90).
6. **Stop for the phone check.** Give the user:
   - the draft URL, and the English link `<deploy_url>/#build?l=en`
   - the `deploy_id` and the commit it was built from (`git log --oneline -1`)
   - the timing table so far (`node scripts/timings.mjs`)

   Then wait. Publish only after the user's explicit OK for this draft. If anything under `site/` changes after the draft, start again from step 1: the OK covers the tested draft only.
7. **Publish that same draft** (an ask rule prompts for it):
   `netlify api restoreSiteDeploy --data '{"site_id":"4c946bab-f25b-4dcc-9f04-8653d8c4631c","deploy_id":"<deploy_id>"}'`
   If it fails, fall back to `netlify deploy --prod --dir=site` (it prompts too) and tell the user that the fallback was used.
8. **Light check on production.** `node scripts/smoke.mjs https://mi-im-mi-2026.netlify.app --light` (it also inspects every production beacon, without sending them).

Report at the end: the timing table from `node scripts/timings.mjs` (every step logged since the milestone began), the `deploy_id` that is live, whether the fallback was used, and the production check's result (including how many beacons were inspected).
