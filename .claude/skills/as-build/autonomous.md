## Autonomous: the whole plan (`/as-build auto` and `dark`)

1. **Require a spec:** an open issue labeled `prd`. If none exists, stop and tell the user to run `/as-spec` first.
2. **Start from a clean working tree,** as Default does.
3. **Plan if needed.** If there is no open issue labeled `plan`, invoke the as-plan skill to generate one.
4. **Single checkpoint.** Skip this when resuming the plan: any of its tickets is closed, parked or on a work branch. Present the full plan and wait for an unambiguous affirmative (e.g. "approve", "go", "yes"). Treat hedged responses ("looks reasonable", "I guess") as **not** approved.
5. **Execute every task in dependency order.** A ticket is ready as defined in `SKILL.md`. Create the work branch per `.claude/skills/git-workflow-and-versioning/references/branch-naming.md`. You coordinate; do not write code yourself. Each ticket gets one `implementer` agent, so it starts with a fresh context and its work stays out of this session. Spawn every agent by its type alone: its definition in `.claude/agents/` sets its model.
   - `auto`: one ready ticket at a time, on the work branch.
   - `dark`: up to 3 ready tickets at once, each in an `implementer` agent with `isolation: "worktree"`, which gives it its own branch starting from the work branch. When one reports DONE, merge its branch into the work branch, delete its worktree and branch, and run your check. Only after the check passes, or the ticket is parked, start the next ready ticket that is not already running, keeping at most 3 running. If a merge conflicts, abort it, delete the ticket's worktree and branch, and re-run the ticket once in the same slot with a fresh implementer, whose worktree starts from the latest work branch.

   Keep the brief short and use pointers, not copied text:
   - the ticket number, the `prd` issue and the `plan` issue
   - its branch (in `dark`, its worktree's own branch, which must contain the work branch's latest commit, else it reports BLOCKED), plus the commits made so far on the work branch
   - whether the user signed off its high risk
   - "Follow the Default loop in `.claude/skills/as-build/SKILL.md` from installing dependencies through the commit. Stay on this branch; pushing and the PR are mine."
   - "If a condition under Park or stop in `.claude/skills/as-build/autonomous.md` applies, do not push through or guess. Report BLOCKED with the reason, commit nothing, and leave the working tree as you found it."

   It must report, in at most 5 lines, DONE or BLOCKED, its branch, the commit hash, any decision later tickets need, and anything noticed but not touched.

   After each report (in `dark`, after each merge), check it yourself: the commit exists and the working tree is clean. In `dark`, a merge is trivial when the work branch had not moved since the worktree started, so the merged tree is the one its implementer tested: `git diff --quiet <its commit> HEAD` succeeds. A trivial merge passes your check as it is. For any other merge, install dependencies as the project's CI does and run the checks the project's CI runs on the work branch; all pass. Keep only pass or fail and any failing test names, not full logs. Then pass any decisions on in the next brief.

   In `dark`, review each ticket once its merge into the work branch passes your check: spawn the `code-reviewer` agent in the background with `isolation: "worktree"`, naming the ticket, that merge commit, read from `git rev-parse HEAD` after the merge, and, as base ref, its first parent. Reviewers take none of the 3 slots. If one returns REQUEST CHANGES, run one `implementer` agent in a slot as the fix, briefed like that ticket's implementer plus the findings, to fix every Critical and Required one, and merge and check its work as you do a ticket's. Until the fix is on the work branch, the ticket's dependents that have not started stay unready.

   The work branch stays local until step 7: each push deploys a preview and runs the e2e suite on it.

   When no ticket is ready and no subagent is running, go to step 7.

6. **Park or stop.** An implementer reports BLOCKED when:
   - a test can't be made to pass or the build breaks without an obvious fix
   - the spec is ambiguous, or a task needs a decision the spec doesn't cover
   - the ticket needs something the `prd` lists under Out of scope: it is parked, not widened
   - the ticket turns out high-risk and its brief carries no sign-off

   A plumbing failure is not a ticket's blocker and not the run's to fix: when CI, a skill, a hook or a setting fails for a reason outside the tickets, change nothing to get past it. Stop the run and report what failed; in `dark`, as a comment on the `prd` issue.

   Before spawning each implementer, check whether its ticket is high-risk (defined under PR body in `SKILL.md`).

   - `auto`: stop and ask the user when your check fails or an implementer reports BLOCKED. For a high-risk ticket, follow the doubt-driven-development skill and get explicit sign-off before spawning it.
   - `dark`: park a ticket when it is high-risk without the user's sign-off, its implementer reports BLOCKED, its merge fails your check, or its re-run's merge conflicts too. To park: undo its merge so none of its commits remain on the work branch, add the `needs-human` label (create it if missing), comment the reason or question on the ticket, delete its worktree and branch, discarding their changes, and continue with the rest. Its dependents stay unready; leave them unlabeled. Removing `needs-human` from a ticket parked as high-risk is the user's sign-off. Drop a fix that reports BLOCKED, or whose merge conflicts or fails your check: abort or undo its merge, delete its worktree and branch, and carry its findings to step 7.

   Before any stop, let running implementers finish, then merge or park each. After the user resolves a blocker or removes a `needs-human` label, they re-invoke the same mode. On resume, read the comments on each ticket that lost its `needs-human` label, and put any answer that settles a spec question into the `prd` body before briefing it.

7. **Open one PR.** If no ticket is on the work branch, skip to step 9. Otherwise run Default's review step once on the whole branch, naming every ticket on it, with one `implementer` agent making the fixes. In `dark`, each ticket already had its own review in step 5: brief the reviewer to cover how the tickets fit together and the fix merges, and add the findings carried from step 6. In `dark`, when every merge was trivial, no fix ran and no findings are carried, each ticket was built and reviewed on top of the ones before it: go straight to the push. Then push, and open the PR as Default does or, if the work branch already has an open PR, rewrite its body. Either way the body follows the PR body section of `SKILL.md` for the tickets on the work branch. Leave the tickets open.
8. **Watch the PR (`dark` only).** Choosing `dark` is the user's sign-off to deploy two-way-door PRs to production without their manual check. Once the PR is open, comment on the `prd` issue with a link to it and step 9's summary. Then leave auto-fix on for the PR and end your turn: a PR from a `claude/` branch merges itself when its required checks are green.

   Auto-fix has three limits here. It never fixes a failed `door`, which means the PR is one-way and waits for the user, or a plumbing failure (step 6). It pushes a fix only when `node scripts/door.mjs --base <main>` still says two-way. It pushes at most 2 fixes per PR. When it cannot fix within these limits, or would ask the user, comment the reason on the `prd` issue, turn auto-fix off and end.
9. **Summarize at the end:** tasks completed, tests added, commits made, each parked ticket with its question and the tickets waiting on it, and anything implementers noticed but did not touch.
