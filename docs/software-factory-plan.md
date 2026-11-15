# Software factory plan

Status on 2026-11-15: **the goal is reached.** The plan to make Reelbase's build pipeline run
unattended: you approve a PRD, and the change reaches production with no further action from you.

## Goal and limit

**Goal:** approving a PRD is your only action. Build, verify and ship run without you.

**What stays with you, on purpose:**

- writing the PRD and approving it with the `approved` label
- merging one-way-door PRs (auth, secrets, dependencies, CI, `.claude/`, removed routes)
- answering tickets parked with `needs-human`
- acting on a `bug` issue opened for a broken production deploy

A parked ticket keeps its PRD open, and only one PRD can be open. So a parked ticket holds the next
PRD until you answer it.

## Where it stands

| Step | State |
|---|---|
| PRD → plan → tickets → build → two reviews → one PR | Works in a cloud run (#89, #112, #121, #135, #147, #153, #158) |
| The merge | Done. A green two-way PR merges itself (#135, #147, #153, #158) |
| Closing the PRD's issues after the deploy | Done. `smoke` closes them (#147, #153, #158) |
| Watching production | Done. A failed smoke test opens a `bug` issue and emails you (#142) |
| Starting a run | Done. The `approved` label started the runs for #143, #149 and #154 |

## Path to the goal

One step at a time, in this order.

| Step | Work | Who |
|---|---|---|
| Phase 3 | One workflow file, no secrets | Done (#141) |
| Settings | Require `test-integrity` and `e2e-preview` | Done |
| Phase 4 | The trigger | Done. 3 of 3 PRDs (#143, #149, #154) |
| | **Goal reached** | 2026-11-15 |

**Rules for every phase**

- The Scope list is closed. Anything not on it goes to [Backlog](#backlog), never into the phase.
- A phase that depends on an unproven fact starts with the cheapest test of that fact, before any
  PRD is written.
- A phase is done only when its "Done when" is observed, not when its code is merged.
- A phase that changes `.claude/` or CI is one-way: one PRD, built with `/as-build auto` in a
  session you are in, and you merge it. The required `door` check holds it for you.
- A PRD for a factory phase copies that phase's Scope list as its Behaviour, word for word.

## How the merge works

GitHub merges, not an agent:

1. `main` has a ruleset (27289358) with required checks. They are the gates:
   `Lint, typecheck, test and build`, `door`, `test-integrity` and `e2e-preview`.
2. `automerge.yml` turns on auto-merge for each PR from a `claude/` branch when it opens.
3. GitHub merges the PR when every required check is green.

A one-way PR fails `door`, so it waits for you. To merge it: **Disable auto-merge**, then merge with
the bypass option.

**Two limits, both accepted on 2026-11-15:**

- The gates are not protected from the PR they judge. The checks run from the PR's own copy of the
  workflow files, and no rule asks for anyone else's review (the code owner rule passed for the
  PR's author, #123, and is off since #160). What stands in the way is `door`, which calls such a
  PR one-way, and the run's rule never to edit CI or skills.
- A merge made by `GITHUB_TOKEN` does not close the issues its PR names. Phase 3 closes them.

**One rule for secrets:** a secret that can merge or deploy is stored in a GitHub Environment
limited to `main`, never as a repository secret. A `claude/` branch that edits a workflow runs its
own copy with every repository secret. No phase on the path to the goal adds a secret.

### Phase 2: merge. Done

- Built and merged as #130 (PRD #126).
- #135 was merged by `github-actions[bot]` 85 seconds after it opened and deployed to Production,
  with no action after **Run now**.
- #135 left its issues open, because a merge by `GITHUB_TOKEN` closes none. Phase 3 fixed it.

### Phase 3: watch. Done

**Goal:** a healthy production deploy closes its PRD's issues, and a broken one is reported to you.

Nothing here needs a test first. Each fact it rests on is already observed; see
[Facts](#facts-this-plan-rests-on).

**Scope, one PRD, one ticket, one new file `.github/workflows/smoke.yml`:**

1. It runs on `deployment_status`. A job condition lets through only state `success` with an
   environment name that starts with `Production`.
2. It requests the production address `https://reelbase-tau.vercel.app` and passes when the home
   page answers 200. It retries once, after a wait, before it calls a failure.
3. On a pass, it finds the pull request of the deployed commit and closes each issue that pull
   request closes, with a comment naming the deployment.
4. On a failure, it opens a `bug` issue naming the deployed commit, its pull request and its PRD.
   It closes nothing.
5. It can also be started by hand with an address to test, so the failure path can be proven
   without breaking production. A run started by hand closes nothing.
6. Its permissions are `contents: read`, `issues: write`, `pull-requests: read`. It uses no secret.

**What this leaves to you**, when a `bug` issue arrives:

- Click **Instant Rollback** in Vercel. Production is broken until you do.
- Write and approve the PRD for the fix.
- After a rollback, Vercel does not put new `main` deployments live. When the fix has merged,
  promote its deployment in Vercel (**Manage** on the production tile).
- While production is rolled back, the smoke test tests the old version and passes, so it closes
  the fix's issues before the fix is live.

**Not in this phase:** rollback or promote by a workflow; any Vercel token; reverting the commit;
feature flags; Sentry.

**Done when:** all three are observed. All three were, on 2026-11-15.

- The workflow, started by hand with an address that fails, opens a `bug` issue: #142, and GitHub
  emailed you.
- Its own merge deploys and the smoke test passes: run 43713553788 for #141.
- The next product PRD's issues close without you: #143 to #146, closed by `github-actions[bot]`
  after #147 deployed (run 43719518273).

### Settings before Phase 4. Done

`test-integrity` and `e2e-preview` are required checks, each with **GitHub Actions** as its source.
Head branches are deleted after a merge. E2E against the preview of the same build is the real protection before the merge, which is
why the production smoke test can be thin.

### Phase 4: start. Done

**Goal:** putting `approved` on a PRD is your last action.

**The trigger, set up on 2026-11-15** on the task `reelbase-factory`:

| Field | Value |
|---|---|
| Event | Issue: Labeled |
| Filter | Labels · is one of · `approved` |
| Filter | Labels · is one of · `prd` |
| Filter | State · is one of · `open` |

Filter rows must all match. The values inside one row are alternatives, so the two labels are two
rows. The task has no schedule. Its on/off switch is the kill switch.

**What the plan needs from it:**

1. A run starts when a `prd` issue gets the `approved` label. Observed: 24 seconds after the label
   on #143.
2. Nothing else starts a run. The filter reads the issue's labels, not the label just added, so
   any label added to an open, approved PRD starts another run. Runs label only tickets.
3. You can turn it off.
4. You hear about a run's result: the task sends a push notification, and the run comments on the
   PRD.

**The prompt must not depend on the Skill tool.** `as-build` has `disable-model-invocation`, and
the first triggered run stopped on it. The prompt under [Cloud task](#cloud-task) tells the run to
read the skill's files and states where the task starts and ends.

**Not in this phase:** restarting parked work, which stays a **Run now** by you; any skill change.

**Done when:** a PRD you label reaches production with no other action from you, three PRDs in a
row. All three were observed on 2026-11-15, each merged and closed by `github-actions[bot]`.

| PRD | Label to production | PR | Smoke run |
|---|---|---|---|
| #143 | about 22 minutes | #147 | 43719518273 |
| #149 | about 15 minutes | #153 | 43725705254 |
| #154 | about 17 minutes | #158 | 43727704356 |

- #143's first label started a run that stopped on the Skill tool. The prompt was fixed and the
  label removed and added again; the time is counted from that second label. #149 and #154 ran on
  the same prompt from their first label.
- All three were small product changes with two tickets each and none parked.

**Rules from here on**

- One open PRD at a time. `/as-build` and `/as-plan` act on "the open `prd` issue".
- When a ticket parks, the run finishes the rest and its PR merges. After you answer and remove
  `needs-human`, press **Run now**; the parked ticket gets its own PR.
- A run that dies says nothing, and so does a PR with a red check. If a PRD has no run comment an
  hour after you approve it, open the task's History. If its PR is not merged 30 minutes after the
  run comment, open the PR.
- GitHub events above the task's hourly cap are dropped without notice.
- The skills hold the rules a PRD used to carry. You no longer paste a Rules section.

| Rule | Skill |
|---|---|
| A PRD has Behaviour and Out of scope sections; the `approved` label is the approval | `as-spec` |
| At most 4 tickets; the tickets cover every Behaviour line in full | `as-plan` |
| A finding is Required only when a Behaviour line fails or it makes a test more reliable | `as-review` |
| A ticket that needs something out of scope is parked; a plumbing failure is reported, not fixed | `as-build` |

The prompt for a PRD is `/as-spec` and one or two sentences that name the feature.

## After the goal

Not scheduled. Each becomes a phase by your decision, when its condition holds. Each gets its Scope
list then, not before.

| Phase | Goal | Starts when |
|---|---|---|
| Cleanup | `CODEOWNERS`, the `merger` agent and `/as-merge` are deleted, in one one-way PR made by the advising session on 2026-11-15 | Done (#160). The code owner rule is off in ruleset 27289358 |
| 5 | Self-heal: the run stays until its PR is merged and fixes red checks, with a cap on attempts | Done 2026-11-15 (#161, task prompt). Scope [below](#phase-5-self-heal) |
| 6 | Auto-revert: a broken merge is reverted on `main` | Dropped 2026-11-15. A flag turned off heals in seconds with no PR and no deploy, and the code stays on `main` |
| 7 | Repair: a production error in Sentry becomes a `bug` issue, and an approved `bug` issue is built | Gate protection, under [Later](#later), is in place |
| 8 | Flags: each user-visible feature ships behind a flag, and a failed smoke test turns it off | Built and switched on 2026-11-15, before Phase 7. Scope [below](#phase-8-flags) |
| 9 | Widen: the one-way list shrinks | Metrics from many runs |

- Phase 5 reverses a Phase 2 decision, that the run ends after it opens the PR. It does not wait
  actively: the PR watch wakes the session, so tokens are spent only when an event arrives.
- Phase 7 keeps your approval on every `bug` issue, and first needs proof that a cloud task can
  read Sentry through a claude.ai connector.
- If a workflow ever rolls back or promotes on Vercel, three findings from 2026-11-15 apply:
  - Vercel sends `repository_dispatch` events (`vercel.deployment.success`, `.error`, `.promoted`)
    that run only `main`'s copy of a workflow. Not yet observed in this repository.
  - Vercel creates deployments by commit, so on `deployment_status` an Environment limited to
    `main` will probably refuse the job.
  - Environments named `Production` and `Preview` already exist, created by Vercel. A token's
    Environment needs another name.

### Phase 5: self-heal

**Goal:** a red check that the PR's own change caused is fixed by the run, and the PR merges
without you. When the run cannot fix it, it tells you.

**It is built on auto-fix,** a documented Claude Code feature: a session watches a pull request
and is woken when a check fails. The run does not wait actively. No test comes first: the feature
is the provider's, and what is ours is proven by "Done when".

**Scope, one PR, one file, `.claude/skills/as-build/autonomous.md`, step 8:**

1. In `dark`, once the PR is open and the run has commented on the `prd` issue, the run leaves
   auto-fix on for the PR and ends its turn.
2. Auto-fix does the fixing. Step 8 states only its limits:
   - It never fixes a failed `door`, which means the PR is one-way and waits for you, or a
     plumbing failure.
   - It pushes a fix only when `scripts/door.mjs` still says two-way. So a fix cannot delete or
     skip a test, or touch CI, skills, scripts or config.
   - It pushes at most 2 fixes per PR.
3. When it cannot fix within these limits, or would ask you, the run comments the reason on the
   `prd` issue, turns auto-fix off and ends.
4. `auto` and the default mode are unchanged.

**One setting, changed by you on 2026-11-15:** the End section of the task's prompt, under
[Cloud task](#cloud-task), no longer tells the run to stop without waiting for checks. It points
to step 8.

**How it was built:** as Cleanup was (#160): the advising session edited step 8 directly, with
no PRD and no factory run, and you merged it as #161.

**Not in this phase:** a failed production deploy or smoke test, which is Phase 6; merge
conflicts, which the watch cannot see; review comments from people; telling you about a run that
died; running e2e in the cloud before the push, which stays in the [Backlog](#backlog); any
change to CI, `door` or `automerge.yml`.

**Done:** closed by you on 2026-11-15 without waiting for a run. It is a setting that is on, and
the next PRD shows it anyway.

### Phase 8: flags

**Goal:** a broken feature is switched off in seconds, with no revert and no deploy.

1. **Helper, done (#162, #165):** `isFlagOn(key)` in `src/lib/flags/flags.ts`. It is a kill switch:
   on unless the flag serves `false`, so a missing flag or an unreachable LaunchDarkly leaves the
   feature on. A feature calls it from its own code, so adding a flag is two-way.
2. **Build rule:** a PRD names a flag key under `## Flag`. The run puts the change behind it,
   creates the flag in LaunchDarkly project `reelbase`, turned on in every environment,
   through the task's LaunchDarkly connector, and names it in the PR body. Made by the advising
   session as an edit to `/as-spec` and `as-build`.
3. **Automatic off, switched on by you on 2026-11-15:** a second cloud task, `reelbase-flag-off`
   under [Cloud task](#cloud-task), starts on a `bug` issue. It turns off the flag named in the
   failing PR and requests the home page. On a 200 it says so on the issue; otherwise it turns
   the flag back on and leaves Instant Rollback to you. It changes no code and uses no new secret.
   Not observed yet.

**Limits:** the app has one visitor context, so a flag is on or off for everyone and there is no
gradual rollout. Breakage outside the flagged code stays with you and Instant Rollback. Removing
old flags is not in this phase.

## Later

Beyond the goal and outside the phases. Each needs your decision.

- `door` passes only when the script's report has the exact line `**Door:** two-way`; today it
  fails open when the line is missing or reworded.
- `door` fails when the PR body says `**Door:** one-way`; today a builder can call its own PR
  one-way and it still merges itself.
- Gate protection: a PR that touches `.github/`, `.claude/` or `scripts/` cannot merge itself.
  Either `CODEOWNERS` and the code owner rule come back with an owner that runs do not act as, or
  a required check runs from `main`.
- Agent verification: controls migrated to ui-sdk, a verifier that runs each PR's manual checks, and
  holdout scenarios.
- Intake: an issue becomes a draft PRD.
- Metrics per PRD.

## What dark means for safety

**Enforced by GitHub** on every merge: lint, types, unit tests, the build, the path rules of the
door script, `test-integrity` and E2E on the preview.

**Done by the run, not enforced:** the two reviews before the PR opens.

**Bypass.** You can merge a red PR, and runs act as you. What stops a run from doing it is Claude's
auto mode, which refused exactly that on #121. A direct push to `main` is refused by GitHub.

**One exposure exists today.** `e2e-preview` runs on `deployment_status` with the preview bypass
secret, so a workflow edited on a `claude/` branch can read it. That secret only opens preview
deployments, and previews need it, so it stays a repository secret.

**Not done:**

- A second reading of the diff. A one-way change inside an ordinary file, such as a stored-data
  format, is not caught by path rules.
- A PR's manual checks.
- Any check the builder cannot influence. The tests and E2E specs for a feature are written by the
  same run that builds it. Holdout scenarios, under [Later](#later), are the fix.
- Undoing a bad deploy. Phase 3 reports it; you roll back.

## Operating rules

**Stated by you**

- Scope does not grow inside a phase. That is what the phases are for.
- Work is finished before more is started. Nothing sits half-done while consuming tokens.
- The advising session steers and does not write code.
- The factory's plumbing must not block product work.
- An open question is settled by the cheapest check, not by a factory run.
- A provider's documented feature is used, not tested. What is tested is the pipeline.

**How they are applied**

| Rule | How |
|---|---|
| One run per PRD | If a second run is needed for anything but a parked ticket, find out why before running again |
| Scope freezes when the PRD is approved | New ideas, from any agent, go to [Backlog](#backlog) |
| What the factory cannot decide is parked | The ticket gets `needs-human`; the rest of the run carries on |
| A plumbing failure is reported, not fixed | A product run never edits CI, skills or settings to get itself through |
| Every wait has a limit | Past the limit, the PR waits for you |
| Usage is checked | claude.ai/settings/usage before and after each run |

## Cloud task

Task `reelbase-factory`: repository `reelbase`, Default environment, coordinator model Opus.

```text
You build the open, approved PRD of this repository. Nobody is watching.

Start
- Find the open issue labeled both `prd` and `approved`.
- If there is none, or more than one, stop and change nothing.

Work
- Read `.claude/skills/as-build/SKILL.md` and
  `.claude/skills/as-build/autonomous.md`, and follow their `dark` mode
  from step 1.
- Do not use the Skill tool for this: the skill is marked for manual
  invocation, and this prompt is that invocation, written by me.
- My `approved` label covers the plan: do not wait for an approval.
- Where the skill says to stop and ask, park the ticket instead.

End
- When the pull request is open, comment on the `prd` issue with a
  link to it and a summary.
- Then follow step 8 of `autonomous.md`: keep the watch on the pull
  request, and fix a red check as that step says.
- Do not merge and do not close issues: the pull request merges
  itself, and the issues close after the deploy.
- If nothing could be built, comment the reason on the `prd` issue
  and stop.
```

Task `reelbase-flag-off`: repository `reelbase`, trigger Issue Labeled with label `bug` and state
open, LaunchDarkly connector.

```text
You switch off the flag of a feature that broke production in this
repository. Nobody is watching.

Start
- List the open issues labeled `bug` whose title starts with
  `Smoke test failed for`. Leave out any that has a comment starting
  with `Flag off:`. Take the newest.
- If there is none, stop and change nothing.
- If its title ends with `(run started by hand)`, comment
  `Flag off: not done, the smoke run was started by hand.` and stop.

Work
- The issue names a pull request. Read that pull request's body and
  find its `**Flag:**` line.
- If the issue names no pull request, or the line is missing or says
  none, comment `Flag off: not done, the pull request names no flag.`
  and stop.
- With the LaunchDarkly connector, in project `reelbase`, environment
  `production`, make that flag serve `false`. If the flag does not
  exist, create it as a boolean that serves `false` in `production`
  and `true` in every other environment.
- Change no other flag and no other environment.
- Wait 30 seconds, then request https://reelbase-tau.vercel.app. If
  the answer is not 200, wait 30 seconds and request it once more.

End
- On a 200, comment: `Flag off: <key> is off in production and the
  home page answers 200. The fix is a new PRD.`
- Otherwise make the flag serve `true` in `production` again and
  comment: `Flag off: undone. The home page still answers <status>
  with <key> off, so the flag was not the cause. Production is still
  broken: use Instant Rollback in Vercel.`
- If you could not change the flag or request the page, comment what
  failed, starting with `Flag off:`.
- Change no code, open no pull request and close no issue.
```

## Facts this plan rests on

Only facts a remaining step depends on.

| Fact | Source |
|---|---|
| Vercel sends `deployment_status` with state `success` and environment `Production` for a `main` deployment, also after a merge by `github-actions[bot]`, and it starts a workflow run | Deployment 7802461820, run 43707174046 |
| The deployed commit leads to its pull request, and the pull request to the issues it closes | `commits/9016e81/pulls` gives #135; `closingIssuesReferences` of #135 gives #131 to #134 |
| The production address is public; a deployment's own address is behind Vercel's login | `reelbase-tau.vercel.app` answers 200; the deployment address answers 302 |
| GitHub applies no closing keywords to a merge made by `GITHUB_TOKEN`; `issues: write` on the merging workflow does not change that | #135; reports in other repositories, not GitHub docs |
| Events caused by `GITHUB_TOKEN` start no new workflow run, except `workflow_dispatch` and `repository_dispatch` | GitHub docs, events that trigger workflows |
| On `deployment_status` the run uses the deployed commit's copy of the workflow | GitHub docs, events that trigger workflows; `e2e-preview` runs per branch |
| The `bug` label exists | Label list, 2026-11-15 |
| The code owner rule passes when the PR's author is the code owner | #123, ruleset log result `pass` |
| Hobby rolls back one deployment only; after a rollback new pushes do not go live until one is promoted | Vercel docs, instant rollback |
| A cloud run starts in auto mode, which blocks "merging a pull request no human has approved" | Claude Code docs, scheduled tasks and permission modes |
| An issue trigger can filter on Labels and State; the label started a run in 24 seconds | Task `reelbase-factory`, runs of 2026-11-15 for #143, #149 and #154 |
| Events above the task's hourly cap are dropped | Claude Code docs, scheduled tasks, read 2026-11-15 |
| A triggered run cannot start a skill marked `disable-model-invocation`; it can read and follow the skill's files | First run for #143 stopped; the second built #147 |
| `smoke` closes a bot-merged PR's issues after the deploy, and opens a `bug` issue on a failure | #143 to #146 after #147; #142 |
| Cloud runs comment and label as you, through the Claude GitHub App | Issue events on #102, comments on #121 |
| Opening a PR in a cloud run starts a watch that says to stay until the merge; the run followed the prompt and ended the watch | Reported by the run for #154; not checked outside it |

Not yet proven:

- A PRD with a new page, stored data or a parked ticket, started by the trigger. The three PRDs of
  Phase 4 were small filters and a header count.
- A run can see which event started it. The plan does not depend on it.
- What happens when a production build fails: Vercel sends no `success` event, so `smoke` does not
  run and no `bug` issue opens. The PRD's issues stay open.

## Backlog

Not in any phase. Nothing here is built unless you pull it into a PRD.

- The cloud session's hook re-prompts the run about unpushed commits while the work branch is
  local: three times in the run for #154, which held each time. An early push would cost one
  preview build and one e2e run; it cannot merge anything. A sentence in `autonomous.md` telling
  the run to ignore the hook until the PR step can ride along with the next skill change.
- In the cloud, the installed Playwright expects another Chromium build, so reviewers cannot run
  e2e before the push. Tried fix: the environment's setup script runs
  `pnpm exec playwright install chromium`. The run for #154 reported that the download fails and
  that a browser is installed at `/opt/pw-browsers/chromium`. Not verified. Pull this forward the
  first time a red `e2e-preview` costs you an action.
- Product: the no-results text on home browse ignores the decade filter (`emptyMessage` in
  `src/app/page.tsx`), so `/?decade=1990` with no results names no filter.
- Product: the list of home browse filters is written by hand in three places, so each new filter
  needs three edits.
- Product: no test checks that changing region keeps `runtime` or `language`.
- In the cloud no TMDB token is set, so agents build a stand-in from fixtures for local E2E. The
  run for #143 reported that the session's proxy may supply TMDB credentials. Not verified.
- A ticket can narrow a Behaviour line without saying so: #146 checked one page where the PRD said
  every page. Fixed in `as-plan` on 2026-11-15; watch the next plan.
- A review of an E2E-only ticket starts a production server for its mutation test and takes about
  as long as the build.
- A one-way PR keeps auto-merge on, so a later green re-run of `door` would merge it.
- `automerge.yml` may go red on a PR opened as a draft.
- A parked ticket moves out of its PRD, so the PRD closes and the next one can start.
- A second open PRD is refused instead of two runs sharing "the open `prd` issue".
- A run that dies is reported without you looking.
- A resumed run continues on the open PR's branch.
- When the last review still asks for changes, open the PR anyway and list the findings.
- One sign-off per PRD for high-risk tickets.
- A 5xx from the preview is reported as a bad secret (`e2e/global-setup.ts`).
- The door comment fails silently above the 65,536-character GitHub comment limit.
- Cloud runs use Node 22; `.nvmrc` names 24.
- `README.md` line 18 still describes `pnpm e2e` as dev-server only.
- Actions are pinned by tag, not by commit.
- Stale remote branches from earlier runs.
