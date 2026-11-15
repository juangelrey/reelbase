# Software factory plan

Status on 2026-11-15. The plan to make Reelbase's build pipeline run unattended: you approve a PRD,
and the change reaches production with no further action from you.

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
| PRD → plan → tickets → build → two reviews → one PR | Works in a cloud run (#89, #112, #121, #135, #147) |
| The merge | Done. A green two-way PR merges itself (#135, #147) |
| Closing the PRD's issues after the deploy | Done. `smoke` closes them (#147) |
| Watching production | Done. A failed smoke test opens a `bug` issue and emails you (#142) |
| Starting a run | Works: the `approved` label started the run for #143. Two more PRDs to go. Phase 4 |

## Path to the goal

One step at a time, in this order.

| Step | Work | Who |
|---|---|---|
| Phase 3 | One workflow file, no secrets | Done (#141) |
| Settings | Require `test-integrity` and `e2e-preview` | Done |
| Phase 4 | The trigger | Set up. 1 of 3 PRDs done |
| | **Goal reached** | After two more PRDs |

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
  workflow files, and the code owner rule passes for the PR's author (#123). What stands in the way
  is `door`, which calls such a PR one-way, and the run's rule never to edit CI or skills.
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

### Phase 4: start

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
row. **1 of 3:** #143, about 22 minutes from the label to production, issues closed.

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
| Cleanup | One one-way PR: `CODEOWNERS`, the code owner rule, the `merger` agent and `/as-merge` are deleted | Your decision |
| 5 | Self-heal: the run stays until its PR is merged and fixes red checks, with a cap on attempts | A red PR has cost you an action |
| 6 | Auto-revert: a broken merge is reverted on `main`, so production heals without rollback and promote | `bug` issues from Phase 3 are frequent |
| 7 | Repair: a production error in Sentry becomes a `bug` issue, and an approved `bug` issue is built | Gate protection, under [Later](#later), is in place |
| 8 | Flags: each user-visible feature ships behind a flag, and an error spike turns it off | Your decision; it adds work to every product PRD |
| 9 | Widen: the one-way list shrinks | Metrics from many runs |

- Phase 5 reverses a Phase 2 decision, that the run ends after it opens the PR, and spends tokens
  while it waits.
- Phase 6 needs the door script to call an exact revert two-way. Today it calls a revert one-way,
  because it deletes files and tests.
- Phase 7 keeps your approval on every `bug` issue, and first needs proof that a cloud task can
  read Sentry through a claude.ai connector.
- If a workflow ever rolls back or promotes on Vercel, three findings from 2026-11-15 apply:
  - Vercel sends `repository_dispatch` events (`vercel.deployment.success`, `.error`, `.promoted`)
    that run only `main`'s copy of a workflow. Not yet observed in this repository.
  - Vercel creates deployments by commit, so on `deployment_status` an Environment limited to
    `main` will probably refuse the job.
  - Environments named `Production` and `Preview` already exist, created by Vercel. A token's
    Environment needs another name.

## Later

Beyond the goal and outside the phases. Each needs your decision.

- `door` passes only when the script's report has the exact line `**Door:** two-way`; today it
  fails open when the line is missing or reworded.
- `door` fails when the PR body says `**Door:** one-way`; today a builder can call its own PR
  one-way and it still merges itself.
- Gate protection: a PR that touches `.github/`, `.claude/` or `scripts/` cannot merge itself.
  Either the code owner is an account that runs do not act as, or a required check runs from
  `main`.
- Agent verification: controls migrated to ui-sdk, a verifier that runs each PR's manual checks, and
  holdout scenarios.
- Intake: an issue becomes a draft PRD.
- Metrics per PRD.

## What dark means for safety

**Enforced by GitHub** on every merge: lint, types, unit tests, the build and the path rules of the
door script. `test-integrity` and E2E on the preview run on every PR but hold nothing until they
are required, before Phase 4.

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
- The run is finished when the pull request is open and you have
  commented on the `prd` issue with a link to it and a summary.
- Then stop. Do not wait for checks, do not merge, and do not close
  issues: the pull request merges itself, and the issues close after
  the deploy.
- If nothing could be built, comment the reason on the `prd` issue
  and stop.
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
| An issue trigger can filter on Labels and State; the label started a run in 24 seconds | Task `reelbase-factory`, runs of 2026-11-15 for #143 |
| Events above the task's hourly cap are dropped | Claude Code docs, scheduled tasks, read 2026-11-15 |
| A triggered run cannot start a skill marked `disable-model-invocation`; it can read and follow the skill's files | First run for #143 stopped; the second built #147 |
| `smoke` closes a bot-merged PR's issues after the deploy, and opens a `bug` issue on a failure | #143 to #146 after #147; #142 |
| Cloud runs comment and label as you, through the Claude GitHub App | Issue events on #102, comments on #121 |

Not yet proven:

- A run can see which event started it. The plan does not depend on it.
- What happens when a production build fails: Vercel sends no `success` event, so `smoke` does not
  run and no `bug` issue opens. The PRD's issues stay open.

## Backlog

Not in any phase. Nothing here is built unless you pull it into a PRD.

- The cloud session's hook re-prompts the run about unpushed commits while the work branch is
  local. It costs a few tokens each time.
- In the cloud, the installed Playwright expects another Chromium build. Tried fix: the environment's
  setup script runs `pnpm exec playwright install chromium`.
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
