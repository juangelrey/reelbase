# Software factory plan

Status on 2026-11-14, evening. This is the plan to make Reelbase's build pipeline run unattended: a
PRD goes in, and tested, deployed, monitored software comes out.

**Read this first:** Phase 0 is done. Phase 1A is merged for 9 of its 11 tickets (PR #105); #102 and
#103 are still to build. [Current work](#current-work-prd-91-ci-verification-gates) says where it
stands and [Open decisions](#open-decisions) lists what is waiting on you. Scope is unchanged;
items marked **Proposed** are not agreed yet.

## Goal and limit

**Goal:** build, verify, ship and repair run with no person involved.

**What stays with a person, on purpose:**

- writing the intent (the PRD) and approving it with a label
- merging one-way-door changes (auth, secrets, dependencies, CI, `.claude/`, removed routes)
- answering tickets parked with `needs-human`

## Roles

| Who | Does | Does not |
|---|---|---|
| You | Write and approve PRDs, sign off high-risk work, merge one-way PRs, change account settings (Vercel, claude.ai, secrets) | |
| The factory (`/as-spec`, `/as-plan`, `/as-build`, `/as-merge`) | Plans, builds, tests, reviews, opens PRs, merges two-way PRs | Merge one-way PRs; change branch protection; read secrets |
| The advising session (Claude Code, local) | Steers: explains state, recommends, reviews by reading, keeps this plan current. Acts on GitHub only when you ask for a named action | Write code. Touch PRs or issues without being asked |

## Where we are

| Stage | Today | Target |
|---|---|---|
| Intake | You run `/as-spec` in a session | Issue in, draft PRD out, questions as comments |
| Start | You press **Run now** on a cloud task | `approved` label on the `prd` issue starts it |
| Build | Unattended for ordinary work. High-risk work parks ticket by ticket and needs a new run each time | One run per PRD |
| Review | Unattended, per ticket and whole branch. No limit on what a reviewer may demand | Same, with a bar that fits this repo |
| Verify | Unit tests, `test-integrity` and `door` in CI; manual checks by you on the preview | E2E on preview, verifier agent, holdout scenarios |
| Merge | Two-way: `/as-merge`. One-way: you | Same, with the door floor set by a script |
| After merge | Nothing | Smoke test, rollback, flag-off, Sentry errors become tickets |
| Cost control | None. Every agent runs on Fable; no budget, no measurement | Model per role, a budget per PRD, usage recorded per run |

## Current work: PRD #91, CI verification gates

This is Phase 1, tasks 1.1–1.4. State read from GitHub after PR #105 merged (20:22 UTC).

### Tickets

| Ticket | What | Plan task | State |
|---|---|---|---|
| #93 | Hover-delay tests use fake timers | 1.4 | Merged (#105), closed |
| #94 | Integrity gate: fail on new suppressions and `.only` | 1.2 | Merged (#105), closed |
| #95 | Integrity gate: fail on lowered thresholds | 1.2 | Merged (#105), closed |
| #96 | Integrity gate: report test removals and skips as one-way | 1.2 | Merged (#105), closed |
| #97 | Door script: classify a diff by path rules | 1.3 | Merged (#105), closed |
| #98 | Door script: one-way when tests are removed or skipped | 1.3 | Merged (#105), closed |
| #99 | Door job in CI, with one PR comment | 1.3 | Merged (#105), closed |
| #100 | Merge skills: the door script is a floor | 1.3 | Merged (#105), closed |
| #101 | Playwright config runs against a Vercel preview | 1.1 | Merged (#105), closed |
| #102 | `e2e-preview` workflow on `deployment_status` | 1.1 | Open. Signed off (`needs-human` removed), not built |
| #103 | Merge skills: a missing `e2e-preview` check counts as pending | 1.1 | Open. Not started; blocked by #102 |

PRD #91 and plan #92 stay open until #102 and #103 land.

### Branches and PRs

| Branch | Held | PR |
|---|---|---|
| `claude/nifty-einstein-h64q6q` | #93–#101 and the review fixes | **#105**, merged by you at 20:22 UTC (merge commit `4732a28`) |
| `claude/nifty-einstein-ya0ljc` | #93–#98, #100 | #104, superseded by #105; GitHub marked it merged because #105 contained its commits |

- After the 20:09 summary, the run added one more commit (`f3a2acc`) that fixed both Required
  findings and one Optional one, then opened #105. The finished work was banked first; the rest follows as a second PR.
- On #105's head, `test-integrity`, `door` and the main CI check all passed on GitHub.
- On `main` after the merge, the CI check passed; `door` and `test-integrity` are skipped on pushes,
  as designed (they are PR jobs).

### What has not been verified

- Preview mode in Playwright was proven only against a local stub server, not a real Vercel preview.
- `e2e-preview` does not exist yet, so nothing has run end to end on a preview.
- The gates have judged only the PR that introduced them, in bootstrap mode (door one-way,
  integrity skipped with a notice). Their first real verdict comes on the next PR.
- The runs used Node 22; `.nvmrc` names 24.

### Review findings from the second whole-branch review

| # | Level | Where | Finding | State |
|---|---|---|---|---|
| 1 | Required | `scripts/door.mjs` | A submodule hidden by `.gitmodules` `ignore = all` was invisible to the door | Fixed in `f3a2acc`, with a test |
| 2 | Required | `scripts/door.mjs` | No test pinned `--no-renames` on the mode lookup | Fixed in `f3a2acc`, with a test |
| 3 | Optional | integrity diff | `--no-textconv` was not passed | Fixed in `f3a2acc` |
| 4 | Optional | `e2e/global-setup.ts:45` | A 5xx from the preview is reported as a bad secret | Open, backlog |
| 5 | Optional | door comment | Fails silently above GitHub's 65,536-character comment limit | Open, backlog |
| 6 | Optional | request-API guard | Scans `e2e/` only | Open, backlog |

The advising session had recommended dropping 1 and 2; the run fixed them instead, at 41 lines.

### What is left

1. **One run for #102 and #103**, from `main`, as a new PR, with the scope-locked prompt in
   [Cloud task configuration](#cloud-task-configuration). The sign-off comment on #102 says to push
   to #104's branch; that is stale now, so the prompt must say to start from `main`. If the run does
   not end in a PR, stop and reassess rather than run again.
2. **You merge that PR** (one-way: `.github/` and `.claude/`). It is the first PR the gates judge
   for real, and the first real preview run of the e2e suite.
3. **Required checks.** `main` still requires only `Lint, typecheck, test and build`. #105's
   checklist has "add `test-integrity` to required checks" ticked, but the setting is unchanged.
   Add `test-integrity` now (it has reported), and `e2e-preview` after it has reported once. A
   cloud run cannot do this; you can, or the advising session on your go.
4. **Close** PRD #91 and plan #92 if the last PR does not.
5. **Delete** the two `claude/nifty-einstein-*` branches (both fully merged).

## Operating rules

**Stated by you**

- Scope does not grow inside a phase. That is what the phases are for.
- Work is finished before more is started. Nothing sits half-done while consuming tokens.
- The advising session steers and does not write code.

**Proposed, to make those hold**

| Rule | How it is applied |
|---|---|
| One run per PRD | If a second run is needed, stop and find out why before running again |
| At most 4 tickets per PRD | `/as-plan` splits anything larger into a second PRD |
| Scope freezes when the PRD is approved | New ideas, from any agent, go to [Backlog](#backlog), never into the running PRD |
| One sign-off per PRD | The PRD lists its high-risk items; approving the PRD signs them off. Until task 2.3 builds this, run high-risk PRDs with `/as-build auto` in a session you are in, where the skill asks you directly instead of parking |
| One advisor | Questions from another session come here once, and one answer goes back |
| A review bar that fits this repo | A finding is Required only when an acceptance criterion fails or a bug can occur in this repo today. Anything else is Optional and goes to the backlog |
| Budget before running | Check claude.ai/settings/usage before and after each run and note both |
| A model per role | See below |

**Model per role**

Each agent in `.claude/agents/` names its model, so a build no longer inherits the session's.

| Role | Agent | Model | Why |
|---|---|---|---|
| `/as-spec`, `/as-plan` | the session | Fable | Few tokens, most leverage: a bad plan costs every ticket |
| Coordinator | the session or cloud task | Opus | The longest context, so the largest token sink; the work is ordering, merging and checking |
| Implementers and fixes | `implementer` | Opus | Most of a run's tokens |
| Per-ticket and whole-branch review | `code-reviewer` | Opus, high effort | Same model as the implementer, so it leans on fresh context and effort |
| `/as-merge` | `merger` | Opus, high effort | A small diff and a high-stakes judgment |
| Doubt review of a high-risk ticket | `doubter` | Fable | Rare, and the one place a stronger second opinion pays |

The coordinator's model is not in `.claude/`: set it in the cloud task form, or with `/model opus`
before `/as-build auto` in a local session.

Later experiment, once 4.3 records usage per run: implementers on Sonnet, as the only change in that
run. If review rejects them much more often, the extra fix rounds cancel the saving.

## How it fits together

```text
issue ──> /as-spec ──> PRD ──[you: approved label]──> cloud task: /as-build dark
                                                            │
                          plan ─> tickets ─> build ─> review ─> one PR
                                                            │
      GitHub Actions: lint, types, unit, build, e2e on preview, test-integrity, door script
      Cloud tasks:    verifier (manual checks via ui-sdk bridge), holdout judge
                                                            │
                 two-way door ──> /as-merge          one-way door ──> you
                                                            │
                                   Vercel production (features behind flags, off)
                                                            │
        smoke test ──fail──> rollback      Sentry spike ──> flag off      Sentry sweep ──> bug issue
                                                            │
                                              bug issue ──> back to the queue
```

**Where each piece runs**

| Piece | Runs in | Why there |
|---|---|---|
| Build, review, merge, verifier, judge, Sentry sweep | Claude cloud tasks, on the Max subscription | Needs a model; triggers on schedule, API call or GitHub issue/PR events |
| Lint, types, tests, e2e, door script, smoke, rollback | GitHub Actions | Deterministic, no model; cloud tasks have no check-run or deployment trigger |
| Handoff from Actions to cloud | The task's `/fire` endpoint | Lets a finished check start `/as-merge` or a fix |

## Decisions made

| # | Decision | Choice |
|---|---|---|
| 1 | Order | Foundation, cloud spike, verification, then triggers |
| 2 | Plan approval | Approving the PRD covers the plan; no second approval |
| 3 | Feature flags | Only for user-visible features |
| 4 | Holdout scenarios | `scenario`-labeled GitHub issues to start; move to a private repo on the signals below |
| 5 | Production authority | The factory may roll back and turn flags off without asking; both are reversible |
| 6 | Build-guard hook (#70, #71) | Dropped and closed; required checks on `main` and the door script cover it |
| | Hosting | Vercel Hobby |
| | Model access | Claude cloud tasks on the Max subscription |
| | Errors | Sentry |
| | Flags | LaunchDarkly |

**Signals to move holdouts to a private repo:** scenarios pass but the feature is broken in
production; diffs contain values copied from a scenario; autonomy is widened to one-way doors.

**Decided while specifying and building PRD #91**

| Topic | Choice |
|---|---|
| Door script and `/as-merge` | Two layers. The script is a floor: one-way from the script is final. If it says two-way, `/as-merge` still judges the diff and may only be stricter |
| Paths the script does not know | One-way |
| Removing or skipping a test | Passes the integrity gate but makes the PR one-way. Exception: deleting a test together with the file it tests |
| Override label for test removal | None. Runs act as your GitHub user, so a label cannot prove you applied it |
| New suppressions and `.only` | Fail the gate |
| Which copy of the gate scripts runs | `main`'s copy, for both `door` and `test-integrity`, in CI and in `/as-merge`. When `main` has none (the PR that introduces them), door reports one-way and test-integrity skips with a notice |
| Door comment on fork PRs | Skipped; the job summary is enough. Trigger stays `pull_request`, never `pull_request_target` |
| Bypass secret in Playwright | Sent once, to the preview origin only, from `globalSetup`; the cookie is saved as storage state under `$RUNNER_TEMP`. No `extraHTTPHeaders` |
| E2E artifact | HTML report and failure screenshots only. No traces, video or storage-state file, because the repo is public and traces record the bypass cookie |
| Playwright request API in `e2e/` | Not used; a failed `request.get` printed the cookie to the public log. A unit test fails if an e2e file uses it |
| Proving `e2e-preview` goes red (#102) | The coordinator pushes a deliberately failing commit and its revert to the plan's PR branch |

**Choices the runs made that the spec did not cover**

- Suppression rules inspect only JS and TS files.
- The door script is stricter than #97 in places: any deletion or rename under `src/app/` or `e2e/`
  is one-way, file-name rules match in any directory and ignore case, and `.gitattributes`,
  symlinks and submodules are one-way.
- #96 also reports `.skipIf`, `.fails` and a test file renamed to a non-test name.
- #95 treats a key absent at base as the tool default, so a newly added `retries` fails, and a
  `timeout` of `0` counts as a raise.

## Tasks

Owner: **You** = by hand. **F** = the factory builds it; you merge when it touches CI or `.claude/`.
**GA** = GitHub Action. **CT** = cloud task.

### Phase 0: foundation — done

| # | Task | Status |
|---|---|---|
| 0.1 | Commit ui-sdk, Sentry and config; remove the Sentry example routes | Done (#83, #89) |
| 0.2 | LaunchDarkly server SDK and `src/lib/flags` | Done (#83). Flag override for Playwright still to add, in 3.1 |
| 0.3 | Sentry tags environment and release | Done (#89). Checked on the preview: `environment: preview`, `release` = commit SHA |
| 0.4 | `main` requires the CI check, admins included | Done. See [Repository settings in force](#repository-settings-in-force) |
| 0.5 | Spike: can a cloud task run `/as-build dark` | Done: yes (PR #89) |
| 0.6 | Sentry and LaunchDarkly as claude.ai connectors | Reported done by you; not verifiable from the repo |

### Phase 1: verification

This replaces the manual checks you did on PR #89. It is split into two PRDs.

**Phase 1A: CI gates (PRD #91) — in progress, see [Current work](#current-work-prd-91-ci-verification-gates)**

| # | Task | Owner | Why it is useful | Status |
|---|---|---|---|---|
| 1.1 | Run Playwright against each Vercel preview | F, then GA | E2E specs exist but CI never runs them; the merge gate is unit-level | Config merged (#101); workflow (#102) and skill wait (#103) not built |
| 1.2 | Test-integrity gate | F, then GA | Stops a build going green by weakening the bar | Merged (#94–#96). Not yet a required check |
| 1.3 | Door check as a path-rules script | F, then GA | The one-way or two-way call was model judgment alone | Merged (#97–#100) |
| 1.4 | Fix the flaky hover-delay test | F | A flake will trigger false auto-fixes once 2.6 is on | Merged (#93) |

Design of 1.1, `e2e-preview`:

- A workflow on `deployment_status`, running only when the state is `success` and the environment is
  a Vercel Preview. Production deployments are skipped.
- Checks out the deployed commit, installs as `ci.yml` does, installs Chromium only.
- Runs `pnpm e2e` with `PLAYWRIGHT_BASE_URL` set to the deployment URL. Both projects, desktop and
  phone. `retries: 0` so flakes show; `forbidOnly` in CI.
- With `PLAYWRIGHT_BASE_URL` unset, local `pnpm e2e` behaves as before.
- The secret reaches only the Playwright step, as an environment variable. Permissions:
  `contents: read`.
- `/as-merge` and `/as-build` treat a missing `e2e-preview` check as pending, because it appears
  only after Vercel finishes deploying.

Design of 1.2, `test-integrity` (`scripts/test-integrity.mjs`, a job in `ci.yml`):

- Looks only at added and removed lines and files, so existing code is never flagged.
- Fails on: new `@ts-ignore`, `@ts-expect-error` or `eslint-disable`; `.only`; a lowered threshold.
- Passes but reports one-way to the door script: a skipped test, or a removed test whose source file
  is not removed in the same PR.

Design of 1.3, `door-check` (`scripts/door.mjs`):

- Classifies every changed file as one-way or two-way with a one-line reason. The PR is one-way if
  any file is, or if `test-integrity` reported a removal or skip.
- One-way paths: `package.json`, `pnpm-lock.yaml`, `.nvmrc`; `.github/**`; `next.config.*`,
  `vercel.json`, `tsconfig.json`, `eslint.config.*`, `postcss.config.*`, `vitest.config.*`,
  `vitest.setup.*`, `playwright.config.*`; `.env*`; `sentry.*.config.*`,
  `src/instrumentation*.ts`; `src/lib/flags/**`; `src/lib/watchlist/**`; `scripts/**`;
  `.claude/**`, `CLAUDE.md`, `AGENTS.md`; any deleted or renamed page or route under `src/app/`.
- Two-way paths: `src/components/**`; additions and edits under `src/app/**`;
  `src/lib/{catalog,theme,tmdb}/**`; additions and edits under `e2e/**`; `docs/**`; `*.md` outside
  `.claude/`.
- Anything else is one-way. Order: one-way rules, then the two-way list, then one-way by default.
- CI: a `door` job writes the table to the job summary and to one PR comment that it updates in
  place. Only that job has `pull-requests: write`. It always succeeds; it informs and does not gate.
- `/as-merge` runs the script itself on the pinned commit and does not read the comment.
- The `**Door:**` line in a PR body may not say two-way when the script says one-way.

**Phase 1B: agent verification — not started**

Whether and when to do this is an [open decision](#open-decisions).

| # | Task | Owner | Why it is useful |
|---|---|---|---|
| 1.5 | Migrate interactive controls to ui-sdk, with an agent test per interface | F | Makes every control findable and usable by name; the test fails on any that is not |
| 1.6 | Verifier: run each PR's `## Manual check` on the preview through the ui-sdk bridge, and post a check run | F, then CT | Removes the manual check; `dark` currently merges with those checks not run |
| 1.7 | Holdout scenarios, judged on the preview | You and F | Tests an implementer can see can be gamed |

Detail for 1.5:

- ui-sdk is installed (`@ui-sdk/core`, `@ui-sdk/react`) but nothing in `src` imports it yet, so this
  is a real migration.
- An interface is agent-ready when every control has a unique name, every control is a ui-sdk part,
  state flows through change callbacks, and destructive actions carry `data-agent-confirm`.
- The test per interface asserts that every component in the snapshot has a name, that each named
  control is present, and that an agent can act on each.
- Adding or upgrading a dependency is one-way, so migrations that need new packages come to you.

Detail for 1.6:

- Depends on 1.5: the bridge sees only ui-sdk components.
- Depends on 1.1: it uses the same preview access.
- The verifier posts pass or fail per manual-check item as a check run, which `/as-merge` then
  requires.

Detail for 1.7:

- A scenario is a plain-language user story used only to judge the result, such as "pick region
  Spain, filter by Netflix and Comedy; every title shown is a comedy on Netflix ES".
- Stored as issues labeled `scenario`, never linked from the `prd`, `plan` or tickets.
- The implementer brief says not to read `scenario` issues.
- The judge writes only pass or fail and a one-line reason on the PR, never the scenario text.
- `/as-spec` can draft scenarios from the acceptance criteria, approved with the PRD.

### Phase 2: triggers

This removes you starting and resuming runs. Tasks 2.1 and 2.3 have grown in detail because of what
PRD #91 showed; whether they move ahead of Phase 1B is an [open decision](#open-decisions).

| # | Task | Owner | Why it is useful |
|---|---|---|---|
| 2.1 | Kill switch and budgets | You | Must exist before anything starts by itself |
| 2.2 | Start the build task from the `approved` label on a `prd` issue | CT | Removes **Run now** |
| 2.3 | Make the skills fit unattended runs | F | One run per PRD instead of three |
| 2.4 | Resume when `needs-human` is removed, plus an hourly sweep for ready tickets | CT | Parked work restarts without you |
| 2.5 | When checks finish, an Action calls `/fire` to run `/as-merge` | GA, then CT | Cloud tasks cannot trigger on check runs |
| 2.6 | Turn on auto-fix for factory PRs | Built in | A red PR or a review comment gets fixed without you |

Detail for 2.1. All of it is settings; none of it is code:

- The cloud task has no schedule trigger unless you added one on purpose. Run 2's summary called
  itself "scheduled", so check.
- The coordinator's model is set in the task form.
- A usage figure is read before and after every run.
- A limit per PRD: one run. A limit per day, to be chosen by you.
- The kill switch is the task's on/off toggle.
- A cloud environment setup step that installs the Node version in `.nvmrc`, since runs used Node 22
  against a repo that names 24.

Detail for 2.3. This is more than 4 tickets, so it is two PRDs. All of it is `.claude/`, so it is
one-way and should be run with `/as-build auto` in a session you are in:

| Part | Change | Fixes |
|---|---|---|
| a | PRD approval covers the plan, in the skill instead of the task prompt | The prompt carries a rule the skill should own |
| b | Unattended runs park instead of asking, in the skill | Same |
| c | One sign-off per PRD: the PRD lists its high-risk items and approval covers them | Tickets parking one at a time |
| d | A resumed run reuses the open PR's branch | Work splitting across branches |
| e | When the last review still asks for changes, open the PR anyway and list the findings in it | Finished work left on a branch with no PR |
| f | The review bar from [Operating rules](#operating-rules), written into `as-review` | Scope growing through review |
| g | `/as-plan` caps a plan at 4 tickets and splits the rest into a follow-up PRD | Oversized PRDs |
| h | Findings outside the acceptance criteria go to a backlog issue, not into the run | Scope growing after approval |
| i | A model per role: `model:` on the `code-reviewer`, `implementer`, `merger` and `doubter` agents | Every agent on Fable |
| j | A decision that affects another ticket is written into that ticket's body or the PRD | A resumed run reading only some comments |

### Phase 3: after merge

This closes the loop from production back to the queue.

| # | Task | Owner | Why it is useful |
|---|---|---|---|
| 3.1 | Flag-per-feature rule in `/as-plan` and `/as-build`; a change behind an off flag is a two-way door; e2e covers both flag states | F | Far fewer PRs land on you; turning off is a flag flip, not a revert |
| 3.2 | Production smoke test after each deploy; on failure `vercel rollback`, open an issue, and `vercel promote` once fixed | F, then GA | Nothing watches production today |
| 3.3 | Hourly Sentry sweep: new errors become deduplicated `bug` issues | CT | Production problems enter the queue |
| 3.4 | Bug lane in `/as-build`: reproduce with a failing test first, no PRD | F | A fix should not need a spec cycle |
| 3.5 | Error spike after a flag is turned on: turn it off | CT | Faster and narrower than a rollback |

Detail:

- 3.1 needs a way to force a flag's state in Playwright, carried over from 0.2. Adding the flag
  path to the door script's two-way list is part of it; `src/lib/flags/**` is one-way today.
- 3.2 runs on the production `deployment_status`, reusing the `e2e-preview` setup with a smaller
  spec set. A Sentry error spike right after a deploy is a second signal.
- 3.3 uses the Sentry connector, counts production events only (previews are tagged `preview`), and
  uses the `release` tag to name the commit and PR that introduced the error.
- 3.5 and 3.2 are the two actions decision 5 allows without asking.

### Phase 4: intake and operations

| # | Task | Owner | Why it is useful |
|---|---|---|---|
| 4.1 | Unattended `/as-spec`: an issue becomes a draft PRD, with questions as comments | CT | Your input becomes a few async minutes |
| 4.2 | Weekly stale-flag cleanup | CT | Flags left on forever become dead code paths |
| 4.3 | Metrics: runs per PRD, park rate, review rejections, usage per run, reverts, holdout pass against later bugs | F | Evidence for 4.4, for the model split and for the holdout decision |
| 4.4 | Widen the two-way policy from the metrics, such as patch dependency updates | You | Maintenance without you |

## Cloud task configuration

Task `reelbase build`: repository `reelbase`, Default environment, no connectors, no trigger (started
with **Run now**).

**Prompt in use**

```text
Run the as-build skill in dark mode (`/as-build dark`).

This run is unattended: my approval of the open `prd` issue covers the plan,
and where the skill says to stop and ask, park the ticket instead.

End with a comment on the `prd` issue summarizing the run.
```

**Proposed prompt for the last run on PRD #91**

```text
Run the as-build skill in dark mode (`/as-build dark`).

This run is unattended: my approval of the open `prd` issue covers the plan,
and where the skill says to stop and ask, park the ticket instead.

Scope lock: build only #102 and #103. Start from `main` and open a new PR;
ignore the branch instruction in the comment on #102. Do not fix earlier
review findings or add tickets. Reviewers mark a finding Required only when
an acceptance criterion fails. One review round, then open the PR.

End with a comment on the `prd` issue summarizing the run.
```

Proposed model for that run: Opus. After it, restore the prompt in use. After 2.3, the second
paragraph of the prompt goes away.

## Repository settings in force

- The repository is public. Workflow logs and artifacts can be read by anyone signed in to GitHub.
- `main` is protected: the check `Lint, typecheck, test and build` is required; the rule applies to
  admins; force pushes and deletion are blocked; no review is required; the branch need not be up
  to date.
- Direct pushes to `main` are rejected unless the commit already passed CI, so everything goes
  through a PR.
- Undo: `gh api -X DELETE repos/juangelrey/reelbase/branches/main/protection`.
- Secrets: `VERCEL_AUTOMATION_BYPASS_SECRET` in GitHub Actions. `SENTRY_AUTH_TOKEN` is in the local
  `.env`; whether it is also set in Vercel has not been checked.
- Labels in use: `prd`, `plan`, `ticket`, `needs-human`. To come: `approved`, `scenario`, `bug`.

## Constraints to design around

**Claude cloud**

- Runs push and comment as you. A required review cannot gate them; required status checks do.
- A run cannot change branch protection and cannot read secrets.
- Triggers are schedule, API and GitHub issue, PR and release events. Nothing fires on check runs or
  deployments, hence 2.5.
- Label filters are documented for PR triggers only. For issue triggers, the prompt checks the label.
- `/fire` text reaches the task marked as untrusted; the task prompt must say to act on it.
- `gh issue` and `gh pr` fail there; use REST, as `AGENTS.md` says.
- Local MCP servers are not visible. Sentry and LaunchDarkly must be claude.ai connectors.
- Each run starts on a fresh `claude/` branch.
- An implementer in a worktree cannot produce real PR checks; only the coordinator can push to the
  PR branch.
- Parallel runs draw down the Max limit quickly. Scheduled tasks are a research preview.

**Vercel Hobby**

- Rollback only reaches the immediately previous deployment, so the smoke test must run right after
  each deploy.
- After a rollback, new pushes to `main` do not go live until `vercel promote`.
- No rolling releases; LaunchDarkly rollouts take that role.
- Previews are behind Vercel login. Automation gets in with the bypass secret, which also skips
  Vercel's firewall and bot checks, so it must stay out of logs, reports and third-party requests.

**GitHub Actions**

- A check can be made required only after it has reported once.
- `e2e-preview` appears on a commit only after Vercel finishes deploying, so "all checks finished"
  can be true before it exists.
- Under `pull_request`, the workflow file comes from the PR, so a PR can edit or delete a job.
  Running `main`'s copy of a script does not stop that. What does: `.github/**` is one-way,
  `/as-merge` runs `main`'s script itself, and the gate is a required check.

**ui-sdk**

- Pinned at `0.1.0-beta.1`; expect API changes.
- The bridge only sees ui-sdk components, so 1.6 depends on 1.5.

**Skills**

- `/as-build` treats any argument other than exactly `auto` or `dark` as single-ticket mode. Extra
  instructions go in the prompt text, not after the command.
- `/as-build` and `/as-merge` are user-invoked only; a cloud task prompt that names them works.
- In `dark` mode a high-risk ticket parks unless that ticket has its own sign-off.
- A resumed run reads comments only on tickets that lost `needs-human`.
- After two review rounds that still ask for changes, the run stops without opening a PR.

## Risks

| Risk | What limits it |
|---|---|
| Scope grows after a PRD is approved | Scope freeze, the review bar, the 4-ticket cap, the backlog |
| Tokens spent with nothing merged | One run per PRD, usage recorded per run, a model per role, banking finished work |
| You become the message bus between agents | One advisor; decisions written into the PRD or ticket body |
| Code grows faster than anyone understands it | One-way doors stay with you; PR summaries; metrics in 4.3 |
| Agents pass their own tests without the feature working | Holdouts (1.7), test-integrity gate (1.2), verifier (1.6) |
| A bad change reaches production | Flags off by default (3.1), smoke and rollback (3.2), flag-off on spike (3.5) |
| Runaway cost or loops | Kill switch and caps (2.1); auto-fix is bounded |
| A fix loop on a flaky test | Fix flakes first (1.4) |
| The door is called two-way wrongly | Script (1.3) plus the independent `/as-merge` check; when unsure, one-way |
| The bypass secret leaks | Sent to the preview origin only; no traces or storage state uploaded; request API banned in `e2e/` |

## Backlog

Not in any PRD. Nothing here is built unless you pull it into one.

- Open findings 4–6 in [Current work](#review-findings-from-the-second-whole-branch-review).
- `README.md` line 18 still describes `pnpm e2e` as dev-server only.
- `workers: 2` in `playwright.config.ts` is a `next dev` limit but also applies to preview runs.
- The `test-integrity` job's `setup-node` reads the PR's `.nvmrc`; it fails closed.
- Actions are pinned by tag, not by commit, including in the job that holds the write token.
- Suppression rules cover only JS and TS files.
- The `next.config.ts` comment says the Sentry release is unset without a commit; the build plugin
  falls back to the git HEAD. Events are unaffected.
- The LaunchDarkly MCP server is configured locally at `https://mcp.launchdarkly.com/mcp`;
  LaunchDarkly's docs give `https://mcp.launchdarkly.com/mcp/launchdarkly`.
- Stale remote branches from earlier runs: four `claude/*` besides the two `nifty-einstein` ones for
  PRD #91, plus `ccr-f87702df-q2gc0b`, `dark-parallel`, `marquee-home`, `refactor-own-course`,
  `chore/reelbase-references`.

## Open decisions

| # | Decision | Recommended |
|---|---|---|
| 1 | Run the last PRD #91 run (#102, #103) with the scope-locked prompt | Yes, once, on Opus |
| 2 | Add `test-integrity` to `main`'s required checks now | Yes |
| 3 | The operating rules above | Adopt all |
| 4 | The model split | Adopt, starting with the last run on PRD #91 |
| 5 | Order after Phase 1A: bring 2.1 and 2.3 ahead of Phase 1B | Yes. 2.1 is settings only; 2.3 is what makes every later PRD one run |
| 6 | Whether the next thing through the factory is a product feature | Yes, once 1A has landed, so that the factory delivers value before more of its own plumbing |
| 7 | Whether Phase 1B is still worth doing, and when | Decide after 1A has run on a few real PRs |
| 8 | A daily run limit for the cloud task | Yours to set |

## Sources

- [Software Factories, Light and Dark](https://addyosmani.com/blog/software-factories/) (Addy Osmani)
- [StrongDM's software factory](https://simonwillison.net/2026/Feb/7/software-factory) (Simon Willison) and [factory.strongdm.ai](https://factory.strongdm.ai/)
- [Built by Agents, Tested by Agents, Trusted by Whom?](https://law.stanford.edu/2026/02/08/built-by-agents-tested-by-agents-trusted-by-whom/) (Stanford Law)
- [Cloud scheduled tasks](https://code.claude.com/docs/en/routines.md), [Claude Code in the cloud](https://code.claude.com/docs/en/claude-code-on-the-web.md), [GitHub Actions](https://code.claude.com/docs/en/github-actions.md)
- [Vercel: e2e after a preview deployment](https://examples.vercel.com/guides/how-can-i-run-end-to-end-tests-after-my-vercel-preview-deployment), [protection bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation), [instant rollback](https://vercel.com/docs/instant-rollback)
- [Sentry: agents need production context](https://blog.sentry.io/agents-need-production-context/)
- [LaunchDarkly hosted MCP server](https://launchdarkly.com/docs/home/getting-started/mcp-hosted)
