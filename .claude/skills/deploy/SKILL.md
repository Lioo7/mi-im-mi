---
name: deploy
description: Deploy site/ to Netlify. Full local smoke, a draft deploy, the light check against the draft, the user's phone check, and only after the user's OK, publish that same draft and check production.
---

# /deploy

Claude may start this skill itself once a change is ready (committed, unit tests and targeted smoke passing). Starting it never covers publishing: step 5 always stops for the user's phone check, and steps 6–7 run only after the user's explicit OK for that draft.

Run the steps in order and time each one (`date +%s` before and after). Stop at the first failure, report it with the rerun command smoke prints, and never drop or loosen an assertion to make a run pass. Read `smoke/<mode>/smoke.log` only when a run fails.

1. **Preflight.** `git status --short` must be clean: what gets deployed is what is committed. If it isn't, stop and list the uncommitted files. Then `node --test` and `node scripts/validate.mjs`.
2. **Full local suite.** `node scripts/smoke.mjs --mode=all` (the three modes in parallel, about 2 min).
3. **Draft.** `netlify deploy --dir=site --json`. Note `deploy_id` and `deploy_url`, and keep them through any compaction.
4. **Light check on the draft.** `node scripts/smoke.mjs <deploy_url> --light` (every file in `site/` served byte for byte, every `netlify.toml` header, the views at phone width in both languages).
5. **Stop for the phone check.** Give the user:
   - the draft URL, and the English link `<deploy_url>/#build?l=en`
   - the `deploy_id` and the commit it was built from (`git log --oneline -1`)
   - the time of each step so far

   Then wait. Publish only after the user's explicit OK for this draft. If anything under `site/` changes after the draft, start again from step 1: the OK covers the tested draft only.
6. **Publish that same draft** (an ask rule prompts for it):
   `netlify api restoreSiteDeploy --data '{"site_id":"4c946bab-f25b-4dcc-9f04-8653d8c4631c","deploy_id":"<deploy_id>"}'`
   If it fails, fall back to `netlify deploy --prod --dir=site` (it prompts too) and tell the user that the fallback was used.
7. **Light check on production.** `node scripts/smoke.mjs https://mi-im-mi-2026.netlify.app --light` (it also inspects every production beacon, without sending them).

Report at the end: each step's time, the `deploy_id` that is live, whether the fallback was used, and the production check's result (including how many beacons were inspected).
