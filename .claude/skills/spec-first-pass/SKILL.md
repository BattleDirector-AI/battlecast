---
name: spec-first-pass
description: Turn a GitHub issue into a spec + failing tests draft PR — read the issue, write or update the behavioral rules (and an ADR when there is a real decision), then write tests that fail for the right reason. No implementation. Use when starting work on an issue, or when asked for a "spec-first pass" / "spec first" on an issue.
---

# Spec-First Pass

battlecast works spec-first. A feature lands as **one draft PR carrying exactly two commits**:
this pass writes the spec + failing tests as the first commit, and once that is approved the
`implement-spec` skill adds the production code as the second commit to the *same* PR, which
then merges once. There is no second PR, and the spec never merges unimplemented. (An issue
whose *whole* deliverable is spec + tests — a rule the code already satisfies, tests it was
simply missing — lands as one commit and merges once review passes.) The failing tests are the
executable statement of the spec — that they fail is the deliverable, not a problem to fix.

**The one rule that matters: do not implement anything.** If you find yourself editing a
`.svelte` component or a non-test `.js` module to make something pass, stop — that is the
next pass on this same branch.

## Phase 0 — Set up

```bash
git fetch origin
git status --porcelain            # note any pre-existing local edits — they must NOT be committed
git checkout -b spec/<issue>-<slug> origin/next
```

Base on **`origin/next` explicitly**. The main clone often sits on a stale or detached
branch, so `git checkout -b foo` without a start point silently branches from the wrong place.

If the tree has unrelated local modifications (e.g. `.claude/settings.json`), either stash
them or be scrupulous about staging explicit paths later. Never `git add -A`.

## Phase 1 — Read

```bash
gh issue view <n>
```

Read the whole issue, then **verify its factual claims against the code before building on
them.** Issue bodies go stale and are sometimes simply wrong — #140 asserted that a profile
`maxRows` bounded the standalone tower when no profile had ever reached that route. A spec
built on a false premise is worse than no spec.

Then read, in this order:
- `.ai/spec/README.md` — especially **Conventions** (rule numbering, present-tense rules,
  authority).
- The relevant `what/` file — behavioral rules. This is what you are changing.
- The paired `how/` file (see the README's Cross-Reference table) — codebase navigation.
- `CONTRIBUTING.md` — the testing bar.
- Any ADR in `docs/decisions/` that the area already has.

## Phase 2 — Decide (if there is a decision)

If the issue offers multiple resolutions, **ask the user which one** before writing. Do not
pick for them and do not spec two options.

When the choice has real rationale — alternatives rejected, consequences, a premise worth
recording — that rationale belongs in an **ADR** (`docs/decisions/000N-<slug>.md`), not in
the spec. The spec states behavior; the ADR states why. Model on
`0003-tower-overflow-pinning-and-cycling.md`; use the next free number.

A spec rule that reads like a history lesson ("no longer unbounded", "instead of growing
with the field", "these rules are new because…") is ADR content that leaked. Cut it.

## Phase 3 — Write the spec

Rules live in `.ai/spec/what/<area>.md`. The conventions are non-negotiable:

- **Rule numbers are stable identifiers.** Never renumber. A new rule takes the **next free
  number even if it lands in an earlier section** — that is explicitly allowed. Inserting
  between existing rules uses a sub-number (`16a`). Two rules never share a number.
- **Write every rule in the present tense, as behavior the system has.** No `[PLANNED]`,
  `[PROPOSED]`, "deferred until…", or other forward-looking or process language, and no issue
  number used as a work-item pointer — the failing tests, not a marker, are what record that the
  behavior is not built yet. (Widget identifiers like `#21`/`#22` are names, not work items, and
  stay.) Scope boundaries are behavioral and fine; notes about our workflow are not.
- Behavior goes in `what/`; mechanism and file-level guidance go in `how/`. If the behavior
  is unchanged and only the mechanism is wrong, this is a `how/`-only change with **no new
  `what/` rule** — say so explicitly rather than inventing a rule to look thorough.
- Reference ADRs, don't restate them. One line: `Decision record: docs/decisions/…`.
- Answer the questions a reviewer will ask. Ambiguity is the defect you are here to remove:
  a rule saying something "may" happen lets two implementers build opposite things and both
  comply. Use MUST/does, not may.

## Phase 4 — Write the failing tests

Per `CONTRIBUTING.md`, **shape-only assertions are rejected.** Not "it mounted", not "a
handler was called" — assert rendered content: DOM text, row counts, order, numeric values,
computed style.

Co-locate as `*.test.js` next to the code. Drive from a `spec/v1` fixture where the widget
takes producer state.

Three things to get right:

1. **Fail for the RIGHT reason.** Run them. A test failing on a typo, bad import, or missing
   mock proves nothing. The failure message should name the real gap
   (`no plate-opacity control for tower`, `expected 30 to be 8`).
2. **Would it pass a WRONG implementation?** Imagine the laziest thing that satisfies the
   assertion. If that thing would be wrong, tighten the test. This is where spec-first
   usually fails.
3. **Say which tests pass.** Some tests you add are regression guards that are already green.
   That is fine and worth having — but they are not part of the red deliverable, and the PR
   body must not imply otherwise.

Watch the environment: **happy-dom does no layout and resolves no CSS custom properties**, so
`getComputedStyle` returns empty and components fall back to hardcoded defaults. If the code
path you care about is the measured one, the default suite will not reach it — stub
`getComputedStyle` deliberately and say in the test header why the file exists.

## Phase 5 — Verify, then draft the PR

```bash
cd app && npx vitest run          # any new test meant to be RED fails for the right reason;
                                  # everything else GREEN. An all-green run is the correct
                                  # result when the rule was already satisfied — not a mistake.
npm run lint                      # must be clean — CI gates on it
```

Record the exact counts. Then:

```bash
git add <explicit paths>          # never -A, never .
git commit
git push -u origin spec/<issue>-<slug>
gh pr create --draft --base next
```

**The pass lands as exactly one commit.** If it iterates — you apply review findings before the
spec is approved — `git commit --amend` and `git push --force-with-lease` rather than appending
another commit. `git log --oneline origin/next..HEAD` must show one commit when you hand off.

The PR body must state:
- **That this commit contains no implementation**, unmissably — and, next to it, what the tests
  actually do, because that differs by issue. When they are red, say
  **"Spec + failing tests only — no implementation"**. When the rule turns out to be already
  satisfied by shipped code and the tests are the ones it was simply missing, say *that* instead:
  the tests pass, the tests are the deliverable, and no implementation commit is coming. Never
  claim tests are failing when they are not.
- The new rule numbers, quoted.
- Each test and its exact assertion, with a table sorting them into three kinds: which are red,
  which are green regression guards riding along, and which are passing tests that are themselves
  the deliverable — the ones a rule was missing and the shipped code already satisfies. The third
  kind is not a guard and must not be filed as one.
- The pasted failure output for the red tests, proving they fail for the right reason. If nothing
  is red, say so explicitly and paste nothing — do not manufacture a failure in order to have
  output to show.
- Every judgement call a reviewer should challenge, named explicitly.
- `Closes #<issue>` — this PR closes the issue when it merges, whether or not an implementation
  commit follows.

Keep it a **draft** until the implementation commit lands — or, for an issue whose whole
deliverable is spec + tests, until review passes, then merge it with `implement-spec`'s **Phase
7**, which carries the merge steps and the `--delete-branch` footgun. While tests are red CI's
`test` job will fail, and that is correct — say so in the body so nobody "fixes" it.

## Gotchas

- **LF line endings.** If you patch a file with a Python script, open it with `newline=''`
  for both read and write. Python's default on Windows rewrites `\n` → `\r\n` and turns a
  three-line edit into a whole-file diff. Check `git diff --stat` is surgical.
- **Git Bash mangles `.ai/` in revision syntax.** `git show 'origin/next:.ai/spec/...'` fails
  with "ambiguous argument". Prefix with `MSYS_NO_PATHCONV=1`.
- **Don't bundle unrelated cleanup silently.** The pass is one commit, so an unrelated fix — a
  legacy `[PLANNED]` marker, a stale line you happen to be sitting on — rides along invisibly
  unless you name it. Either leave it alone, or fix it and describe it in the PR body, offering
  to split it into its own PR.
