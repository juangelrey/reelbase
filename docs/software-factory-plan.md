# Software factory plan

Status on 2026-11-15. The plan to make Reelbase's build pipeline run unattended: you approve a PRD,
and the change reaches production with no further action from you.

## Goal and limit

**Goal:** approving a PRD is your only action. Build, verify, ship and repair run without you.

**What stays with you, on purpose:**

- writing the PRD and approving it with the `approved` label
- merging one-way-door PRs (auth, secrets, dependencies, CI, `.claude/`, removed routes)
- answering tickets parked with `needs-human`

A parked ticket keeps its PRD open, and only one PRD can be open. So a parked ticket holds the next
PRD until you answer it.

## Where it stands

| Step | State |
|---|---|
| PRD → plan → tickets → build → two reviews → one PR | Works in a cloud run (#89, #112, #121) |
| CI, `test-integrity`, door script, E2E on the preview | Run on every PR. Only CI is required |
| The merge | By hand. An agent cannot merge: Claude's auto mode blocks it (#121). Phase 2 |
| Starting a run | By hand, with **Run now**. Phase 4 |
| After the merge | Nothing watches production. Phase 3 |

## How the merge works

GitHub merges, not an agent. This is GitHub's own auto-merge, the same mechanism Dependabot PRs use:

1. `main` has required checks. They are the gates.
2. A small workflow turns on auto-merge for each factory PR when it opens.
3. GitHub merges the PR when every required check is green. A red check means it never merges.

A one-way PR fails the `door` check, so it waits for you. No agent holds the merge button, so
Claude's permission system is not involved.

**The gates are not protected from the PR they judge. Accepted for now (2026-11-15).** The checks
run from the PR's own copy of the workflow files, so a PR could edit a workflow to make itself
pass. The code owner rule does not stop it: GitHub counts the rule as passed when the PR's author
is the code owner, and runs open PRs as you (#123 merged itself). What stands in the way is the
`door` check, which calls such a PR one-way, and the run's own rule never to edit CI or skills. The
fix, when wanted, is under [Later](#later).

**An edited workflow also runs before any gate applies.** A `claude/` branch that edits a workflow
runs its own copy before any gate applies, with every repository secret. With only `GITHUB_TOKEN`
that copy can do no harm: the token is not a code owner and cannot bypass. So one rule holds in
every phase: **a secret that can merge or deploy is stored in a GitHub Environment limited to
`main`, never as a repository secret.** A job on a `claude/` branch cannot read it.

A merge made by auto-merge starts no workflow on `main`. Nothing in this plan depends on one.

## Phases

One phase at a time, in this order. A phase starts when the one before it is done.

| Phase | Goal | Removes this action of yours |
|---|---|---|
| 2 | Merge: a green two-way PR merges itself | The merge click |
| 3 | Watch: a broken production deploy is undone | Noticing and rolling back |
| 4 | Start: the `approved` label starts the run | **Run now** |
| | **Goal reached** | |

Watch comes before Start: once the label starts runs, nobody is looking at production. Phases 5 to
9 are under [After the goal](#after-the-goal).

**Rules for every phase**

- The Scope list is closed. Anything not on it goes to [Backlog](#backlog), never into the phase.
- A phase that depends on an unproven fact starts with the cheapest test of that fact, before any
  PRD is written.
- A phase is done only when its "Done when" is observed, not when its code is merged.
- A phase that changes `.claude/` or CI is one-way: one PRD, built with `/as-build auto` in a
  session you are in, and you merge it. What holds it for you is the required `door` check, not
  the code owner rule, which passes for its author (#123). Gate protection, under [Later](#later),
  is the stronger fix.
- A PRD for a factory phase copies that phase's Scope list as its Behaviour, word for word.

### Phase 2: merge

**Goal:** a two-way PR opened by a `dark` run merges itself when its checks are green.

**First, before any PRD. Done on 2026-11-15:** PR A (#122) and PR C (#124) merged themselves and
deployed. The ruleset is live with the "For pull requests only" bypass. PR B (#123) failed: it
merged itself. You accepted that gap; see [How the merge works](#how-the-merge-works). The steps
as they were run:

1. Settings → General → turn on **Allow auto-merge**.
2. PR A adds `.github/CODEOWNERS` with three lines: `/.github/ @juangelrey`,
   `/.claude/ @juangelrey`, `/scripts/ @juangelrey`. Click **Enable auto-merge**. Pass: GitHub merges it when the required check is green, and
   Vercel deploys `main` to production.
3. Settings → Rules → Rulesets: create a ruleset for `main`, then delete the old branch protection
   rule, so one mechanism is left.
   - Require a pull request before merging: 0 approvals, "Require review from Code Owners" on.
   - Require status checks: `Lint, typecheck, test and build`, with **GitHub Actions** as its
     source.
   - Bypass list: Repository admin, set to **For pull requests only**. You can then merge any PR,
     and nobody can push to `main` directly. If that mode is not offered on this repository, use
     "Always allow"; the direct push then stays open, see
     [safety](#what-dark-means-for-safety).
4. PR B changes a comment in `.github/workflows/ci.yml`. Click **Enable auto-merge**. Wait until
   its checks are green. Pass: 10 minutes after green it is still open, waiting for a code owner
   review. Merge it with the bypass option.
5. PR C changes a comment under `src/`. Click **Enable auto-merge**. Pass: it merges itself.

**Scope, your settings:**

1. The ruleset's required checks become: `Lint, typecheck, test and build`, `test-integrity`,
   `door`, `e2e-preview`. Each has **GitHub Actions** as its source, so a status with the same name
   posted through the API by anyone else does not count. Done before the Phase 2 PRD's PR opens.
   Until `door` is required, nothing holds that PR: the code owner rule passes for its author
   (#123), and its own `automerge.yml` turns on auto-merge.
2. The settings from the test stay on. You merge a one-way PR with the bypass option. It is also
   your way out when a required check never reports.

**Scope, one PRD, one ticket, four files:**

1. `.github/workflows/ci.yml`, `door` job: it fails when the verdict is one-way.
2. `.github/workflows/automerge.yml`, new: on `pull_request` opened, reopened or ready for review,
   when the head branch is in this repository and starts with `claude/`, it runs
   `gh pr merge --auto --merge` with `permissions: contents: write, pull-requests: write`. The job
   fails if the command fails.
3. `.claude/skills/as-build/autonomous.md`, `dark` mode: step 8 ends the run after it opens the
   PR and comments on the PRD. It no longer waits for checks or spawns the `merger`. Its first
   sentence stays: choosing `dark` is the user's sign-off to deploy two-way-door PRs to production
   without their manual check. Step 9's summary no longer reports a merge verdict.
4. `.claude/skills/as-build/SKILL.md`, the description and the Modes table: no line says the user
   or the `merger` merges the PR. They say instead that a PR from a `claude/` branch merges itself
   when its required checks are green, so a one-way PR waits for the user, and a PR from any other
   branch is merged by the user.

The workflow acts on every `claude/` PR, so a two-way PR from `/as-build auto` also merges itself.
Accepted: it is outside the goal.

**Not in this phase:** any other change to a skill, an agent, CI or settings. `/as-merge` stays for
use by hand.

**Test:** two steps.

1. The Phase 2 PRD's own PR is the first time the workflow's token turns on auto-merge. It must stay
   open, held by a red `door`. The run checks that the ruleset requires `door` before it opens the
   PR, and stops if not. If `door` is green on that PR, the run turns auto-merge off and stops: the
   change meant to hold it is wrong.
2. The next product PRD, started with **Run now**, is the first merge made by `github-actions`.

**Done when:** that PR merges itself and reaches production, and you did nothing after **Run now**.

**If the workflow cannot turn on auto-merge** (a 403 from `GITHUB_TOKEN`): set Settings → Actions →
Workflow permissions to read and write. If it still fails, use the token fallback below.

**If Vercel does not deploy that merge:** use the token fallback, so the merge is made as you.

**Token fallback.** A fine-grained token acts as you, with bypass, so a workflow edited on a
`claude/` branch must never read it. Both of these, together:

- The token is a secret of a GitHub Environment limited to `main`.
- `automerge.yml` runs on `pull_request_target` and names that Environment. It then runs `main`'s
  copy of the file, never the PR's. That is safe here because the job checks out no code: its only
  step is `gh pr merge --auto --merge`.

### Phase 3: watch

**Goal:** a broken production deploy is undone without you, and production stays on the last good
version until a fix passes.

**Verified limits of Vercel Hobby:**

- A rollback goes only to the previous production deployment.
- After a rollback, new pushes to `main` build but do not go live. `vercel promote <deployment>`
  makes one live and restores normal behaviour.

**First, before any PRD:** prove three things by hand:

- `vercel rollback` and `vercel promote` work on this project with `--token`.
- After a rollback, a new `main` deployment that is not live still sends `deployment_status`.
- A job started by `deployment_status` for a `main` deployment can use an Environment limited to
  `main`, and the same job for a preview deployment is refused. Vercel may create deployments from
  a commit with no branch, and the Environment rule matches on the branch.

If the third fails: the `deployment_status` job holds no token. On a failed smoke test it starts a
second workflow with `gh workflow run rollback.yml --ref main`; that one runs `main`'s copy and
holds the token.

**Scope:**

1. A smoke test runs after each deployment to Vercel's Production environment, as a GitHub Action
   on `deployment_status`. A job condition skips every preview deployment. It retries once before
   it calls a failure.
2. On failure it runs `vercel rollback` and opens a `bug` issue naming the merge and its PRD. The
   Vercel token is a secret of a GitHub Environment limited to `main`: `deployment_status` also
   fires for previews, and by the docs the job runs the deployed commit's copy of the workflow.
3. While production is rolled back, the smoke test runs against each new `main` deployment's own
   URL, with the same protection bypass secret `e2e-preview` uses. The first one that passes is
   promoted with `vercel promote`.

**What this leaves to you:** the bad commit stays on `main`. Every later merge carries it and is
not promoted, so production is frozen on the last good version until the `bug` issue is fixed. Until
Phase 7, you turn that issue into a PRD.

**Not in this phase:** reverting the commit; feature flags; Sentry; undoing changes to stored data.

**Done when:** a deliberately broken deploy is rolled back and reported as a `bug` issue, and the
merge that fixes it goes live. Your only action in between is writing and approving the PRD for the
fix.

### Phase 4: start

**Goal:** putting `approved` on a PRD is your last action.

**First, before anything else.** Open the task's trigger settings and check whether an issue trigger
can be limited to the `approved` label. Filters are documented for pull request triggers only.

**If it cannot:** the trigger fires on the "labeled" action only, and the task prompt starts with
these lines:

```text
If no open `prd` issue has the `approved` label, stop now.
Otherwise, before anything else, remove `approved` from it and add `building`.
```

The lines test the issue's state, not the event, because the docs do not say a run can see which
event started it. A run started by any other label finds no `approved` PRD and ends at once. In
this variant **Run now** also ends at once, so parked work is restarted by putting `approved` back
on the PRD, not with **Run now**.

**Scope.** The cloud trigger. You set it up. The plan needs four things from it:

1. A run of the `reelbase build` task starts when a `prd` issue gets the `approved` label.
2. Nothing else starts a run. A label or comment added by a run must not start one: runs act as
   you, and each event starts a new session.
3. You can turn it off. That is the kill switch.
4. You hear about a run's result: turn on "your own updates" in GitHub's email notification
   settings, because runs comment as you.

**Not in this phase:** restarting parked work, which stays a **Run now** by you; any skill change.

**Done when:** a PRD you label reaches production with no other action from you, three PRDs in a
row.

**Rules from here on**

- One open PRD at a time. `/as-build` and `/as-plan` act on "the open `prd` issue".
- When a ticket parks, the run finishes the rest and its PR merges. After you answer and remove
  `needs-human`, press **Run now** (or put `approved` back, in the variant above); the parked
  ticket gets its own PR.
- A run that dies says nothing, and so does a PR with a red check. If a PRD has no run comment an
  hour after you approve it, open the task's History. If its PR is not merged 30 minutes after the
  run comment, open the PR.
- Every PRD carries these three sections:

```markdown
## Behaviour
- [each line decided, none open]

## Out of scope
- [what is not built]
- Paths outside [the allowed paths]

## Rules
- At most 4 tickets.
- A review finding is Required only when a Behaviour line fails. Anything else is Optional and is
  not fixed in this run.
- A ticket that needs something listed under Out of scope is parked, not widened.
- If CI, a skill or a setting fails, report it and stop. Do not fix it.
```

## After the goal

Not scheduled. Each becomes a phase by your decision, in this order, when its condition holds. Each
gets its Scope list then, not before.

| Phase | Goal | Starts when |
|---|---|---|
| 5 | Self-heal: the run stays until its PR is merged and fixes red checks, with a cap on attempts | A red PR has cost you an action |
| 6 | Auto-revert: a broken merge is reverted on `main` | Phase 3 shows how often production freezes |
| 7 | Repair: a production error becomes a fix | Gate protection, under [Later](#later), is in place |
| 8 | Flags: each user-visible feature ships behind a flag, and an error spike turns it off | Your decision; it adds work to every product PRD |
| 9 | Widen: the one-way list shrinks | Metrics from many runs |

- Phase 5 reverses a Phase 2 decision, that the run ends after it opens the PR, and spends tokens
  while it waits.
- Phase 6 needs the door script to call an exact revert two-way. Today it calls a revert one-way,
  because it deletes files and tests.
- Phase 7 keeps your approval on every `bug` issue. Fixing without your approval changes the goal's
  limit and is a separate decision.

### Phase 7: repair

**Goal:** a production error becomes a fix in the queue.

**First, before any PRD:** prove that a cloud task can read Sentry issues through a claude.ai
connector.

**Scope:**

1. `/as-build` builds a `bug` issue from a failing test, with no PRD.
2. The Phase 4 trigger also starts a run when a `bug` issue gets the `approved` label. If Phase 4
   uses the prompt lines, they say "`prd` or `bug` issue".
3. An hourly cloud task turns new production errors in Sentry into deduplicated `bug` issues.

**Rule added by this phase:** one run at a time. Approve a `bug` issue only when no PRD is open, and
a PRD only when no approved `bug` issue is open.

Sentry error text comes from a public site, so anyone can influence it. Your `approved` label is
the filter: read the `bug` issue before you approve it.

**Done when:** a production error becomes a `bug` issue, and after you label it `approved` its fix
reaches production.

## Later

Beyond the goal and outside the phases. Each needs your decision.

- The `merger`'s verdict becomes a required commit status, so its reading of the diff is enforced
  by GitHub. Any agent in the run could post that status, so it needs a source the builder cannot
  use.
- Gate protection: a PR that touches `.github/`, `.claude/` or `scripts/` cannot merge itself.
  Either the code owner is an account that runs do not act as, or a required check runs from
  `main`.
- `/as-merge` becomes by-hand only: its description still says it runs as the `merger` agent from
  `/as-build dark`, which is no longer true after Phase 2.
- The scope rules move from the PRD into the skills: the review bar in `as-review`, the ticket cap
  in `/as-plan`.
- Agent verification: controls migrated to ui-sdk, a verifier that runs each PR's manual checks, and
  holdout scenarios.
- Intake: an issue becomes a draft PRD.
- Metrics per PRD.

## What dark means for safety

**Enforced by GitHub** on every merge: lint, types, unit tests, the build, `test-integrity`, the
path rules of the door script, and E2E on the preview.

**Done by the run, not enforced:** the two reviews before the PR opens.

**One thing gets weaker in Phase 2.** With bypass allowed for you, GitHub no longer refuses a merge
of a red PR made in your name. Runs act as you. What stops a run from doing it is Claude's auto
mode, which refused exactly that on #121. A direct push to `main` stays refused by GitHub only if
the bypass is set to "For pull requests only"; with "Always allow", auto mode is the only stop
there too.

**One exposure exists today.** `e2e-preview` runs on `deployment_status` with the preview bypass
secret, so a workflow edited on a `claude/` branch can read it. That secret only opens preview
deployments, and previews need it, so it stays a repository secret.

**Not done:**

- The `merger`'s second reading of the diff. A one-way change inside an ordinary file, such as a
  stored-data format, is not caught by path rules.
- A PR's manual checks.
- Any check the builder cannot influence. The tests and E2E specs for a feature are written by the
  same run that builds it. Holdout scenarios, under [Later](#later), are the fix.
- Any watch on production, until Phase 3. Until then, a bad deploy is undone by you with Vercel's
  Instant Rollback.

## Operating rules

**Stated by you**

- Scope does not grow inside a phase. That is what the phases are for.
- Work is finished before more is started. Nothing sits half-done while consuming tokens.
- The advising session steers and does not write code.
- The factory's plumbing must not block product work.

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

Task `reelbase build`: repository `reelbase`, Default environment, coordinator model Opus.

```text
Run the as-build skill in dark mode (`/as-build dark`).

This run is unattended: my approval of the open `prd` issue covers the plan,
and where the skill says to stop and ask, park the ticket instead.

End with a comment on the `prd` issue summarizing the run.
```

## Facts this plan rests on

| Fact | Source |
|---|---|
| Auto-merge merges a PR "after all required reviews and status checks pass"; it must be turned on for the repository | GitHub docs, automatically merging a pull request |
| A workflow on `pull_request` can turn on auto-merge with `gh pr merge --auto --merge` and `GITHUB_TOKEN` | GitHub docs, automating Dependabot with GitHub Actions |
| A required check that never reports stays pending and blocks the merge | GitHub docs, required status checks |
| A pull request uses "the version of `CODEOWNERS` from the base branch" | GitHub docs, about code owners |
| The code owner rule passes when the PR's author is the code owner | #123, ruleset log result `pass`, no review |
| Auto-merge honours a ruleset; "For pull requests only" bypass works on this repository | #124, ruleset 27289358 |
| Events caused by `GITHUB_TOKEN` start no new workflow run | GitHub docs, GITHUB_TOKEN |
| Code owner review is required for "any pull request that affects code with a code owner" | GitHub docs, about protected branches |
| A required check can name an app as its only accepted source | GitHub docs, about protected branches; available rules for rulesets |
| Rulesets work on public repositories with GitHub Free; a bypass can be "For pull requests only" | GitHub docs, about rulesets; creating rulesets |
| Environment secrets "are only available to workflow jobs that use the environment"; an Environment can be limited to chosen branches; free for public repositories | GitHub docs, managing environments |
| `pull_request_target` "runs in the context of the default branch" | GitHub docs, events that trigger workflows |
| On `deployment_status`, the run's commit is the "commit to be deployed", its branch "empty if commit" | GitHub docs, events that trigger workflows |
| A cloud run starts in auto mode, which blocks "merging a pull request no human has approved" | Claude Code docs, scheduled tasks and permission modes |
| The cloud GitHub proxy rejects GraphQL, so a run cannot turn on auto-merge itself | Claude Code docs, cloud environments |
| Issue events can trigger a task; label filters are documented for pull requests only | Claude Code docs, scheduled tasks |
| Cloud runs comment and label as you, through the Claude GitHub App | Issue events on #102, comments on #121 |
| `e2e-preview` runs on `deployment_status` | 5 workflow runs since 2026-11-14 |
| The `door` job reports its verdict as a comment and does not fail | `.github/workflows/ci.yml` |
| Hobby rolls back one deployment only; after a rollback, `vercel promote` restores auto-deploy | Vercel docs, instant rollback |
| Scheduled tasks can use claude.ai connectors and a committed `.mcp.json` | Claude Code docs, scheduled tasks |

Not yet proven:

- A run can see which event started it. The plan does not depend on it.
- A `deployment_status` job for `main` passes an Environment limited to `main` (Phase 3, first
  test).
- `GITHUB_TOKEN` can turn on auto-merge here while the repository default is read-only (Phase 2,
  test step 1).
- Vercel deploys `main` after a merge made by `github-actions` (Phase 2, test step 2).
- The issue trigger can be limited to the `approved` label (Phase 4).
- A Sentry connector is available to a cloud task (Phase 7).

## Backlog

Not in any phase. Nothing here is built unless you pull it into a PRD.

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
