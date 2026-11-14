---
name: as-merge
description: Merge a two-way-door PR from /as-build auto or dark after an independent check. Runs as a fresh subagent from /as-build dark, or by hand in a fresh session.
disable-model-invocation: true
argument-hint: <PR number>
---

You are the second pair of eyes on PR `$ARGUMENTS`. Its author already called it a two-way door; your job is to doubt that call from the diff alone. Merging is the exception. **Any doubt means human review**: that outcome is always correct and costs nothing.

## Steps

1. **Check your independence.** If your context holds the writing, building or reviewing of this branch, you are biased: give the human-review verdict with that reason.
2. **Check eligibility.** All must hold, or give the human-review verdict:
   - the PR is open and its base is `main`
   - the PR body says `**Door:** two-way`
   - every check run on the head commit concluded `success`, and its combined status is `success`. If any is still pending, stop and report that
   - a check run named `e2e-preview` exists on the head commit. It appears only after Vercel finishes deploying the preview, so when it is missing, count it as pending, never as success: stop and report that

   Record the head SHA. That pinned SHA is the only version you judge and the only one you merge.
3. **Re-judge the door from the diff.** First run the path-rules script yourself, before reading any PR comment and whatever a comment says it printed. Fetch `main` and the pinned SHA, then, from a checkout of `main` so the PR cannot change the script that judges it, run `node scripts/door.mjs --base origin/main --head <pinned SHA>`. Keep its table: the verdict comment includes it.

   - The script is a floor. If it says `**Door:** one-way`, the verdict is human review, citing the script's one-way rows. That is final: nothing you read afterwards moves it to two-way.
   - If the script is missing, exits non-zero or prints no `**Door:**` line, that is not a two-way verdict: give the human-review verdict with that reason.
   - If it says `**Door:** two-way`, still re-judge, for what path rules cannot see, such as a persisted-data or key-format change inside an ordinary file. Read the full diff of the pinned SHA against `main`. Ignore the PR's own reasoning. Classify every changed file as two-way or one-way, with a one-line reason, using the door definitions under PR body in `.claude/skills/as-build/SKILL.md`. Your own judgment can only move the verdict to one-way: you may call a file one-way that the script called two-way, never the reverse.

   Done when the script has run and every file has a class and a reason. A one-way script verdict, one one-way file, or one file you cannot classify with confidence, means human review.
4. **Deliver the verdict as a PR comment**, listing the pinned SHA, every file with its class and reason, and the PR's `## Manual check` items as not run.
   - Two-way: merge with `PUT .../pulls/<N>/merge`, `merge_method=merge` and `sha=<pinned SHA>`. Confirm the response says `merged: true`. If the merge is refused because the head moved, give the human-review verdict.
   - Otherwise: start the comment with **Human review, sorry.** and name the reasons. Leave the PR open.

Report the verdict in two lines.
