---
name: implement-spec
description: Implement an approved spec-first draft PR — make the failing tests green without touching them, then code review, CI, and merge. Use after a spec+failing-tests PR is approved, or when asked to "implement the spec", "make the tests pass", or "implement and merge" an issue.
---

# Implement Against an Approved Spec

The second half of the flow the `spec-first-pass` skill starts. The branch and its draft PR
already carry an approved spec and tests that fail, as a single commit. Your job is the
production code that makes them green — nothing else — added as a **second commit to that same
PR**. You do not open a new PR; that one PR merges once, at the end of this skill. (A PR whose
whole deliverable was spec + tests never reaches this skill — it merges straight from review.)

**The one rule that matters: the tests and the spec are the contract, and you do not get to
change them.** If a test looks wrong, stop and report it. Editing the test to match the code
inverts the whole process and is the single failure mode this flow exists to prevent.

## Phase 0 — Set up

```bash
git fetch origin
git checkout <the existing spec/ branch>      # do NOT create a new one
git log --oneline origin/next..HEAD           # expect exactly one commit: the spec + tests
cd app && npx vitest run                      # record the baseline: N passing, M failing
```

Note the baseline counts. You need them to prove you fixed exactly the right number.

The PR must carry `spec-approved` (`gh pr view <pr> --json labels`). A PR still on
`spec-review` is waiting for the owner, not for you; see `spec-first-pass` Phase 6 for who sets
the label.

## Phase 1 — Read before writing

- `gh issue view <n>` and `gh pr view <pr>` — but **verify the issue's claims against the
  code**; issue bodies go stale and are sometimes wrong.
- The `what/` rules you are implementing, and any `docs/decisions/` ADR for the area — the
  ADR carries the rationale and the alternatives already rejected.
- The `how/` file. It often prescribes the **implementation shape** — e.g. "gate via a shared
  exported predicate, not an inline key chain". Follow it; it is there because someone
  decided it.
- The failing test file. It defines the exact contract, including `data-testid` handles.
- **The neighbours.** Before writing a control, a page, or a widget, read the two or three
  nearest existing ones and match their idiom: the same update path, the same gating helper,
  the same styling tokens. A change that looks like the code around it is the goal.

## Phase 2 — Implement

Keep the diff focused. No drive-by refactors, no reformatting untouched code, no "while I'm
here" improvements — those make the review harder and hide the real change.

Watch for:
- **Lifecycle.** Listeners removed on destroy; pending frames/timers cancelled; a `cancelled`
  flag so a late async resolve cannot write to a destroyed component.
- **Async gaps.** What renders between mount and the first resolved value? A flash of an
  unbounded or unstyled widget is a real defect even if no test catches it.
- **Reading CSS.** `getPropertyValue('--token')` returns the token's *authored text*, not a
  resolved length — `3rem` parses to `3`. Read resolved properties (`paddingTop`) when you
  need a real px value.
- **Svelte 5 runes.** `$state`/`$derived`/`$effect` used without effect loops or needless
  re-runs.

## Phase 3 — Clear any legacy `[PLANNED]` marker

Specs are written in the present tense and carry no `[PLANNED]` markers, so there is usually
nothing to do here. Older work left a few behind, though: if a spec file **this change touches** —
the `what/` rules you implemented, the paired `how/` file — still carries a legacy
`[PLANNED: #<issue>]` next to behavior your code now ships, delete the marker text so it does not
get orphaned.

**This is the only spec edit permitted in this phase, and only the marker text** — do not reword
the rule, and do not go hunting through files unrelated to this change.

## Phase 4 — Verify (all of it, before committing)

```bash
cd app
npx vitest run        # must be N+M passing, 0 failing — the whole baseline plus every red test
npm run lint          # CI gates on this
npm run build         # CI gates on this too
```

CI runs five jobs: `lint`, `test`, `compliance`, `server`, `mock`. There is no `build` job;
`npm run build` is a step inside `test`. Green locally on these three commands is the strong
signal; the rest rarely break on app-only changes.

Do not report success unless all three are green. If a test cannot pass without being edited,
**stop and report which assertion and why** — that is a real finding about the spec, not a
licence to edit.

## Phase 5 — Commit and push

```bash
git add <explicit paths>          # never -A, never . — the tree may hold unrelated local edits
git commit                        # type(scope): summary, e.g. feat(config): / fix(tower):
git push origin <branch>
```

**The implementation lands as exactly one commit.** If this pass iterates — you apply the Phase 6
review findings before the PR is approved — `git commit --amend` and `git push --force-with-lease`
rather than appending another commit. Before merging, `git log --oneline origin/next..HEAD` must
show exactly two commits: spec + tests, then implementation.

Label it for the code review: `gh pr edit <pr> --add-label ai-code-review`. Leave
`spec-approved` on: it is the approval record Phase 7 checks before merging.

Leave the PR a **draft** until Phase 7. Do not mark it ready, do not merge, do not rewrite its
description.

## Phase 6 — Code review

Review is a **separate pass from authoring** — never approve your own work in the same
context. Dispatch a fresh reviewer, or if reviewing yourself, say so plainly in the review so
the user can weight it.

The tests pass now, so "the tests fail" is not a finding. The job is **what the tests don't
catch**:
- Would a wrong implementation slip past each assertion?
- Which code path has no coverage at all? (In this repo that is usually anything needing real
  layout — happy-dom does none.)
- Boundary values, lifecycle leaks, async gaps, silent desync between a hardcoded list and the
  reality it mirrors.

Post the review as a **formal GitHub review** that opens with the header in
`.claude/skills/_shared/review-header.md` (`gh pr review <pr> --comment --body-file <file>`),
with a clear verdict: **APPROVE** / **APPROVE WITH NITS** / **REQUEST CHANGES**, and an ID on
every finding. Be decisive — it gates a merge. Answer every finding with a disposition comment
(`fixed`, `wrong`, `intentional` or `not-worth-it`, per that file), amend, and re-review. At most
three rounds; a third round with findings still open stops the pass (`fail-escalated`, Phase 7).

**Verify subagent work yourself.** Dispatched agents in this repo frequently finish the work
correctly but return no report. Check `git log`, `git diff --stat`, and re-run the suite
rather than trusting — or waiting on — a summary.

## Phase 7 — Arm auto-merge

Arm only once the review has passed: its last round has no open blocking finding. The merge
itself is GitHub's. The `next` ruleset (`.github/rulesets/next.json`) merges the PR once its
five checks pass, and nobody can bypass it. Never merge it yourself: every `gh pr merge` here carries `--auto`.

Arm at the commit the review saw, never at whatever the head is now. `REVIEWED` is the full SHA
in the "Reviewed at" row of the clean review's header:

```bash
set -e                                                    # any failed check stops the arm
REVIEWED=<sha from the clean review's "Reviewed at" row>
git fetch origin
test "$(gh pr view <pr> --json headRefOid --jq .headRefOid)" = "$REVIEWED"   # else: re-review
node scripts/check-pr-shape.mjs origin/next "$REVIEWED"   # "shape: spec-first" (or "plain" for a
                                                          # spec + tests PR); BAD stops here
gh pr view <pr> --json labels --jq '[.labels[].name] | index("spec-approved") != null' | grep -qx true
gh pr edit <pr> --remove-label ai-code-review --add-label ready-to-merge
gh pr ready <pr>                                          # GitHub won't arm a draft
gh pr merge <pr> --auto --merge --match-head-commit "$REVIEWED"
```

Run these with the agent token (the `gh` alias, see `CONTRIBUTING.md`, "Agent identity").

**A PR is armed only while it carries `spec-approved`.** Phase 6 of `spec-first-pass` says who
set it: the owner for everything but a `how/`-only spec, and the coordinator after a clean AI
review for that one. Without the label, stop: the spec was never approved. A spec + tests PR
with no implementation commit comes here straight from `spec-first-pass` Phase 6. It never
carried `ai-code-review`, so its `--remove-label` is a no-op.

**Never push to an armed PR.** Disarm it first with `gh pr merge <pr> --disable-auto`, swap
`ready-to-merge` back for `ai-code-review`, and arm again only after a new review of the new
head. Whether GitHub itself refuses to merge a head other than `--match-head-commit` is not
documented, so don't count on it.

**A PR behind `next` waits**, because `next.json` is strict and GitHub never updates the branch
itself. Bringing it up to date is a push too, so disarm first. The merge GitHub makes holds
nothing but `next`'s work, so it needs no new review once both its parents check out (the shape
check ignores merges, so this is the only check on its content):

```bash
set -e
gh pr merge <pr> --disable-auto
gh pr update-branch <pr>
git fetch origin
NEW=$(gh pr view <pr> --json headRefOid --jq .headRefOid)
test "$(git rev-parse "$NEW^1")" = "$REVIEWED"            # the reviewed work, unchanged
test "$(git rev-parse "$NEW^2")" = "$(git rev-parse origin/next)"   # next, and nothing else
gh pr merge <pr> --auto --merge --match-head-commit "$NEW"
gh pr view <pr> --json autoMergeRequest                   # confirm it is armed
```

Watch for the merge with `gh pr checks <pr> --watch` and `gh pr view <pr> --json state`.

**When it can't merge:**
- **CI on the armed head goes red:** disarm, swap `ready-to-merge` back for `ai-code-review`,
  fix, and re-review the new head.
- **Still red after three fix attempts, or a third review round with findings still open:** stop
  and report it, because it needs a human:
  `gh pr edit <pr> --remove-label ai-code-review --add-label fail-escalated`.
- **GitHub refuses to arm or merge:** take `ready-to-merge` back off
  (`gh pr edit <pr> --remove-label ready-to-merge --add-label ai-code-review`), then fix whatever
  it named.

Do **not** pass `--delete-branch` — it fails locally because `next` is checked out in a
worktree. Once it has merged, confirm it really landed rather than trusting the command:

```bash
git fetch origin && git log --oneline origin/next -3
git -C <next-worktree> pull --ff-only && (cd <next-worktree>/app && npx vitest run)
```

File follow-ups for anything the review surfaced but did not block on, and restore any local
edits you stashed at the start.

## Gotchas

- **Serialize file-writing agents.** They share one working tree and one git index, so two
  agents committing on different branches will collide even when their file sets are disjoint.
  Read-only reviewers can run in parallel; forbid them from checking out or running tests.
- **LF line endings.** Patching with Python? Open with `newline=''` on read *and* write, or
  Windows turns a small edit into a whole-file rewrite. Check `git diff --stat`.
- **Git Bash mangles `.ai/` in revision syntax** — prefix with `MSYS_NO_PATHCONV=1`.
