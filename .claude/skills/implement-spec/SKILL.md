---
name: implement-spec
description: Implement an approved spec-first draft PR — make the failing tests green without touching them, then code review, CI, and merge. Use after a spec+failing-tests PR is approved, or when asked to "implement the spec", "make the tests pass", or "implement and merge" an issue.
---

# Implement Against an Approved Spec

The second half of the flow the `spec-first-pass` skill starts. The branch already carries an
approved spec and tests that fail. Your job is the production code that makes them green —
nothing else.

**The one rule that matters: the tests and the spec are the contract, and you do not get to
change them.** If a test looks wrong, stop and report it. Editing the test to match the code
inverts the whole process and is the single failure mode this flow exists to prevent.

## Phase 0 — Set up

```bash
git fetch origin
git checkout <the existing spec/ branch>      # do NOT create a new one
git log --oneline origin/next..HEAD           # confirm the spec + tests commits are here
cd app && npx vitest run                      # record the baseline: N passing, M failing
```

Note the baseline counts. You need them to prove you fixed exactly the right number.

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

## Phase 3 — Drop the `[PLANNED]` markers

The spec README: the marker "is dropped once the rule text describes what actually ships."
Once your code ships the behavior, remove `[PLANNED: #<issue>]` from the rules it covers.

**This is the only spec edit permitted in this phase, and only the marker text** — do not
reword the rule. Skipping it leaves the spec describing shipped behavior as planned, which
misleads every agent that reads it next.

## Phase 4 — Verify (all of it, before committing)

```bash
cd app
npx vitest run        # must be N+M passing, 0 failing — the whole baseline plus every red test
npm run lint          # CI gates on this
npm run build         # CI gates on this too
```

CI runs six jobs: `lint`, `test`, `build`, `compliance`, `server`, `mock`. Green locally on
the first three is the strong signal; the rest rarely break on app-only changes.

Do not report success unless all three are green. If a test cannot pass without being edited,
**stop and report which assertion and why** — that is a real finding about the spec, not a
licence to edit.

## Phase 5 — Commit and push

```bash
git add <explicit paths>          # never -A, never . — the tree may hold unrelated local edits
git commit                        # type(scope): summary, e.g. feat(config): / fix(tower):
git push origin <branch>
```

Leave the PR a **draft**. Do not mark it ready, do not merge, do not rewrite its description.

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

Post the review on the PR with a clear verdict: **APPROVE** / **APPROVE WITH NITS** /
**REQUEST CHANGES**. Be decisive — it gates a merge.

**Verify subagent work yourself.** Dispatched agents in this repo frequently finish the work
correctly but return no report. Check `git log`, `git diff --stat`, and re-run the suite
rather than trusting — or waiting on — a summary.

## Phase 7 — Merge

Only with review passed and CI green:

```bash
gh pr checks <pr>                 # all jobs pass
gh pr ready <pr>
gh pr merge <pr> --merge          # repo uses merge commits
```

Do **not** pass `--delete-branch` — it fails locally because `next` is checked out in a
worktree. Then confirm the merge really landed rather than trusting the command:

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
