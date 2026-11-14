# Software factory plan

Status on 2026-11-14. The plan to make Reelbase's build pipeline run unattended: you approve a PRD,
and the change reaches production with no further action from you.

## Goal and limit

**Goal:** build, verify, ship and repair run with no person involved.

**What stays with you, on purpose:**

- writing the PRD and approving it with the `approved` label
- merging one-way-door PRs (auth, secrets, dependencies, CI, `.claude/`, removed routes)
- answering tickets parked with `needs-human`

These are a queue, not a stop. Work that does not depend on them keeps moving.

## Phases

One phase at a time, in this order. A phase starts when the one before it is done.

| Phase | Goal | Owner | Status |
|---|---|---|---|
| 0 | Foundation: Sentry, flags library, protected `main`, cloud task | | Done |
| 1 | Build: a PRD becomes one reviewed PR, with CI gates | | Done (#89, #112) |
| 2 | Merge: a two-way PR merges itself | Factory; you merge the skill change | **Next** |
| 3 | Start: the `approved` label starts the run | You | After 2 |
| | **Unattended for ordinary product work** | | |
| 4 | Resume and rules: a resumed run finishes in the same PR; the skills hold the scope rules | Factory; you merge the skill change | After 3 |
| 5 | E2E gate: Playwright on each preview blocks a red merge | You and factory | After 4 |
| 6 | After merge: production is watched and repaired | Factory | After 5 |
| 7 | Agent verification: manual checks and holdout scenarios run by agents | Factory | After 6 |
| 8 | Intake and operations | Factory | After 7 |

**Rules for every phase**

- The Scope list is closed. Anything not on it goes to [Backlog](#backlog), never into the phase.
- A phase is done only when its "Done when" is observed, not when its code is merged.
- A phase that changes `.claude/` or CI is one-way: it is one PRD, built with `/as-build auto` in a
  session you are in, and you merge it.
- A PRD for a factory phase copies that phase's Scope list as its Behaviour, word for word.

### Phase 0: foundation — done

Sentry with environment and release tags, the LaunchDarkly library in `src/lib/flags`, `main`
protected with a required CI check, and a cloud task that can run `/as-build dark` (#83, #89).

### Phase 1: build — done

A cloud run takes a PRD to one reviewed PR with no person involved (#89, #112). CI runs lint, types,
unit tests, the build, `test-integrity` (`scripts/test-integrity.mjs`) and the door script
(`scripts/door.mjs`). Each agent names its own model (#106).

Built but not working: the `e2e-preview` workflow (#101–#103) has never run. Phase 5 fixes it.

### Phase 2: merge

**Goal:** a two-way PR opened by a `dark` run is merged by the `merger` agent, with no action from
you.

**Why it does not happen today:** the merge skills wait for a check named `e2e-preview`, and that
check never appears.

**Scope.** One PRD, one ticket, two files:

1. `.claude/skills/as-build/autonomous.md`, step 8: wait until every check run and commit status on
   the head commit has finished, except `e2e-preview`, which is not waited for. Wait at most 30
   minutes; past that, comment on the PR that checks did not finish, and do not spawn the `merger`.
2. `.claude/skills/as-merge/SKILL.md`, step 2: delete the line that requires an `e2e-preview` check
   run to exist. In the line before it, a check run named `e2e-preview` is not counted.

**Not in this phase:** making `e2e-preview` run (Phase 5); any other change to a skill, an agent or
CI.

**Done when:** the next product PRD, started with **Run now**, ends with its PR merged by the
`merger`: the PR has the merger's verdict comment, it is merged, and you did nothing after
**Run now**.

**If GitHub refuses the merge call:** the phase is not done. The PR waits for you like a one-way PR,
and the refusal message defines one more ticket in this phase. Phase 3 does not start.

### Phase 3: start

**Goal:** putting `approved` on a PRD is your last action.

**Scope.** The cloud trigger. You set it up. The plan needs three things from it:

1. A run of the `reelbase build` task starts when a `prd` issue gets the `approved` label.
2. Nothing else starts a run.
3. You can turn it off. That is the kill switch.

The task prompt stays as it is today; see [Cloud task](#cloud-task).

**Not in this phase:** restarting parked work, which stays a **Run now** by you; any skill change.

**Done when:** a PRD you label reaches `main` with no other action from you, three PRDs in a row.

**Rules while Phases 3 and 4 are open**

- One open PRD at a time. `/as-build` and `/as-plan` act on "the open `prd` issue".
- When a ticket parks, the run finishes the rest and opens its PR. After you answer and remove
  `needs-human`, press **Run now**. That second run opens a second PR until Phase 4.
- Every PRD carries the three sections below. Phase 4 moves the Rules into the skills.

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

### Phase 4: resume and rules

**Goal:** a resumed run finishes in the same PR, and a PRD no longer needs the Rules section.

**Scope.** One PRD, four tickets, `.claude/` only:

1. `/as-build`: a run that finds an open PR for the plan continues on that PR's branch and updates
   that PR. It does not open a second one.
2. `/as-build`: when the whole-branch review still asks for changes after its one fix round, open
   the PR anyway, list the open findings in its body, and do not spawn the `merger`.
3. `as-review`: a finding is Required only when an acceptance criterion fails or a bug can occur in
   this repo today. Anything else is Optional, is listed in the run's summary, and is not fixed.
4. `/as-plan`: a plan has at most 4 tickets. If the PRD needs more, write no plan, add
   `needs-human` to the PRD and comment that it must be split.

**Not in this phase:** a trigger for resuming (you remove `needs-human` and press **Run now**);
one sign-off per PRD for high-risk tickets (each still parks and waits for you); moving the two "unattended" sentences from the task prompt into the skill.

**Done when:** a PRD with a parked ticket ends as one PR, and your only actions after `approved`
were removing `needs-human` and pressing **Run now**; and a PRD written without the Rules section stays within its
tickets.

### Phase 5: E2E gate

**Goal:** Playwright runs against each PR's Vercel preview, and a red result blocks the merge.

**Why it does not run today:** the workflow triggers on `deployment_status`. Vercel's
`deployment_status Events` toggle is on, but no such event reaches this repo: it has no GitHub
Deployments and the workflow has no runs. Vercel reports each preview as a commit status only.

**Scope,** in order:

1. Done: `repository_dispatch Events` is on in the Vercel project's Git settings.
2. One PRD, one ticket: `.github/workflows/e2e-preview.yml` triggers on Vercel's
   `repository_dispatch` event `vercel.deployment.ready`, for preview deployments only, instead of
   `deployment_status`.
3. After `e2e-preview` has passed on 3 PRs: one PRD, one ticket. It reverses Phase 2 in the same two
   files: the merge skills require `e2e-preview` again, and wait for it at most 15 minutes after the
   `Vercel` status succeeds; past that, the PR waits for you.
4. You: add `test-integrity` and `e2e-preview` to `main`'s required checks.

**Not in this phase:** new E2E specs; changes to the Playwright config.

**Done when:** a PR with a failing E2E spec is not merged by the `merger`, and a PR with passing
specs is.

### Phase 6: after merge

**Goal:** a bad change in production is found and undone without you, and its bug enters the queue.

**Scope:**

| # | Task |
|---|---|
| 6.1 | User-visible features ship behind a LaunchDarkly flag that is off. A change behind an off flag is a two-way door. E2E covers both flag states |
| 6.2 | A smoke test after each production deploy. On failure: `vercel rollback`, open a `bug` issue, `vercel promote` once fixed |
| 6.3 | An hourly Sentry sweep: new production errors become deduplicated `bug` issues |
| 6.4 | A bug lane in `/as-build`: a `bug` issue is built from a failing test, with no PRD |
| 6.5 | An error spike after a flag is turned on turns the flag off |

**Done when:** a deliberately broken deploy is rolled back and has a `bug` issue, with no action
from you.

### Phase 7: agent verification

**Goal:** the `## Manual check` items of a PR are run by an agent, and the result is judged against
scenarios the implementer never saw.

**Scope:**

| # | Task |
|---|---|
| 7.1 | Migrate interactive controls to ui-sdk, with an agent test per interface |
| 7.2 | A verifier runs each PR's manual checks on the preview through the ui-sdk bridge and posts a check run, which `/as-merge` requires |
| 7.3 | Holdout scenarios: `scenario` issues, never linked from a PRD, plan or ticket, judged on the preview. The judge posts pass or fail and one line, never the scenario text |

**Done when:** a PR whose manual check fails is not merged by the `merger`.

### Phase 8: intake and operations

**Scope:**

| # | Task |
|---|---|
| 8.1 | An issue becomes a draft PRD, with questions as comments |
| 8.2 | Weekly cleanup of stale flags |
| 8.3 | Metrics per PRD: runs, parked tickets, review rejections, usage, reverts |
| 8.4 | Widen the two-way policy from the metrics, such as patch dependency updates |

**Done when:** an issue you write becomes a draft PRD without a session.

## What unattended means for safety

From Phase 3 to Phase 5, a two-way PR reaches production on lint, types, unit tests, the build,
`test-integrity`, the door script, two reviews and the independent `merger`. E2E and the PR's manual
checks are not run, and nothing watches production. Phase 5 adds E2E, Phase 6 watches production,
Phase 7 runs the manual checks.

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
| At most 4 tickets per PRD | In the PRD's Rules until Phase 4, then in `/as-plan` |
| Scope freezes when the PRD is approved | New ideas, from any agent, go to [Backlog](#backlog) |
| What the factory cannot decide is parked | The ticket gets `needs-human`; the rest of the run carries on |
| A plumbing failure is reported, not fixed | A product run never edits CI, skills or settings to get itself through |
| A new gate reports before it blocks | It may block a merge after it has passed on 3 PRs |
| Every wait has a limit | Past the limit, the PR waits for you |
| Usage is checked | claude.ai/settings/usage before and after each run |

**Roles**

| Who | Does | Does not |
|---|---|---|
| You | Write and approve PRDs, answer parked tickets, merge one-way PRs, change settings (Vercel, claude.ai, GitHub, secrets) | |
| The factory (`/as-spec`, `/as-plan`, `/as-build`, `/as-merge`) | Plans, builds, tests, reviews, opens PRs, merges two-way PRs | Merge one-way PRs; change branch protection; read secrets |
| The advising session (Claude Code, local) | Explains state, recommends, keeps this plan current. Acts on GitHub only when you name the action | Write code. Touch PRs or issues without being asked |

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

## Cloud task

Task `reelbase build`: repository `reelbase`, Default environment, no connectors, coordinator model
Opus. Started with **Run now** until Phase 3; the trigger is yours to set up.

```text
Run the as-build skill in dark mode (`/as-build dark`).

This run is unattended: my approval of the open `prd` issue covers the plan,
and where the skill says to stop and ask, park the ticket instead.

End with a comment on the `prd` issue summarizing the run.
```

## Decisions made

| Decision | Choice |
|---|---|
| Order | Merge and start first; gates and production watching after |
| Plan approval | Approving the PRD covers the plan; no second approval |
| E2E before Phase 5 | The merge skills ignore `e2e-preview` |
| High-risk tickets | Each parks and waits for you. Removing `needs-human` is the sign-off |
| Feature flags | Only for user-visible features |
| Holdout scenarios | `scenario` issues in this repo |
| Production authority | The factory may roll back and turn flags off without asking; both are reversible |
| Hosting | Vercel Hobby |
| Model access | Claude cloud tasks on the Max subscription |
| Errors | Sentry |
| Flags | LaunchDarkly |

**Gates, as built**

| Topic | Choice |
|---|---|
| Door script and `/as-merge` | Two layers. One-way from the script is final. If it says two-way, `/as-merge` still judges the diff and may only be stricter |
| Paths the script does not know | One-way |
| Removing or skipping a test | Passes `test-integrity` but makes the PR one-way. Exception: deleting a test together with the file it tests |
| New suppressions and `.only` | Fail `test-integrity` |
| Which copy of the gate scripts runs | `main`'s, in CI and in `/as-merge` |
| Override labels | None. Runs act as your GitHub user, so a label cannot prove you applied it |
| Preview bypass secret | Sent once, to the preview origin only. No traces, video or storage state uploaded: the repo is public. The Playwright request API is banned in `e2e/` |

## Settings in force

- The repository is public. Workflow logs and artifacts can be read by anyone signed in to GitHub.
- `main` is protected: the check `Lint, typecheck, test and build` is required, admins included;
  force pushes and deletion are blocked; no review is required.
- Undo: `gh api -X DELETE repos/juangelrey/reelbase/branches/main/protection`.
- Secrets: `VERCEL_AUTOMATION_BYPASS_SECRET` in GitHub Actions.
- Labels in use: `prd`, `plan`, `ticket`, `needs-human`, `bug`. To create: `approved` (Phase 3),
  `scenario` (Phase 7).

## Constraints

**Claude cloud**

- Runs push and comment as you. A required review cannot gate them; required status checks do.
- A run cannot change branch protection and cannot read secrets.
- `gh issue` and `gh pr` fail there; use REST, as `AGENTS.md` says.
- Local MCP servers are not visible. Sentry and LaunchDarkly must be claude.ai connectors (Phase 6).
- Each run starts on a fresh `claude/` branch.

**Skills, as written today**

- `/as-build` and `/as-merge` are user-invoked only; a cloud task prompt that names them works.
- `/as-build` treats any argument other than exactly `auto` or `dark` as single-ticket mode.
- In `dark` mode a high-risk ticket parks until you remove `needs-human` from it.
- When the whole-branch review still asks for changes after one fix round, the run pushes the branch
  and stops without a PR (Phase 4 changes this).
- `/as-merge` requires every check run on the head commit to conclude `success`.
- The `merger` agent has not yet merged a PR (Phase 2 proves it).

**Vercel Hobby**

- Rollback only reaches the immediately previous deployment, so the smoke test runs right after
  each deploy.
- After a rollback, new pushes to `main` do not go live until `vercel promote`.
- Previews are behind Vercel login. Automation gets in with the bypass secret, which must stay out
  of logs, reports and third-party requests.

**GitHub Actions**

- A check can be made required only after it has reported once.
- Under `pull_request`, the workflow file comes from the PR, so a PR can edit or delete a job. What
  stops that: `.github/**` is one-way, and `/as-merge` runs `main`'s door script itself.

**ui-sdk**

- Pinned at `0.1.0-beta.1`; expect API changes. The bridge only sees ui-sdk components, so 7.2
  depends on 7.1.

## Risks

| Risk | What limits it |
|---|---|
| Scope grows after a PRD is approved | Closed Scope lists, the scope freeze, the review bar, the 4-ticket cap, the backlog |
| Tokens spent with nothing merged | One run per PRD, usage checked, a model per role, always ending in a PR (Phase 4) |
| A bad change reaches production | Until Phase 5 and 6: two reviews and the `merger`. Then E2E, flags, smoke test and rollback |
| Agents pass their own tests without the feature working | `test-integrity`; then the verifier and holdouts (Phase 7) |
| Runaway runs | Only the `approved` label starts a run; the trigger's off switch |
| The door is called two-way wrongly | The script plus the independent `/as-merge`; when unsure, one-way |
| The bypass secret leaks | See "Gates, as built" |

## Backlog

Not in any phase. Nothing here is built unless you pull it into a PRD.

- One sign-off per PRD: the PRD lists its high-risk items and `approved` covers them.
- Move the two "unattended" sentences from the task prompt into `/as-build`.
- A decision that affects another ticket is written into that ticket's body.
- Auto-fix for factory PRs when a check goes red.
- Merge started by finished checks instead of by the run waiting.
- A 5xx from the preview is reported as a bad secret (`e2e/global-setup.ts`).
- The door comment fails silently above the 65,536-character GitHub comment limit.
- The request-API guard scans `e2e/` only.
- Cloud runs use Node 22; `.nvmrc` names 24.
- `README.md` line 18 still describes `pnpm e2e` as dev-server only.
- `workers: 2` in `playwright.config.ts` is a `next dev` limit but also applies to preview runs.
- Actions are pinned by tag, not by commit.
- Suppression rules cover only JS and TS files.
- Stale remote branches from earlier runs.

## Sources

- [Software Factories, Light and Dark](https://addyosmani.com/blog/software-factories/) (Addy Osmani)
- [StrongDM's software factory](https://simonwillison.net/2026/Feb/7/software-factory) (Simon Willison) and [factory.strongdm.ai](https://factory.strongdm.ai/)
- [Built by Agents, Tested by Agents, Trusted by Whom?](https://law.stanford.edu/2026/02/08/built-by-agents-tested-by-agents-trusted-by-whom/) (Stanford Law)
- [Cloud scheduled tasks](https://code.claude.com/docs/en/routines.md), [Claude Code in the cloud](https://code.claude.com/docs/en/claude-code-on-the-web.md)
- [Vercel: `repository_dispatch` events](https://vercel.com/changelog/trigger-github-actions-with-enriched-deployment-data-from-vercel), [the `deployment_status` toggle](https://vercel.com/changelog/optionally-disable-deployment_status-webhook-events-for-github-actions)
- [Vercel: protection bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation), [instant rollback](https://vercel.com/docs/instant-rollback)
