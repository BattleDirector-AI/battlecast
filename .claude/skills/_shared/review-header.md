# Review header — the template every agent review opens with

`spec-first-pass` (Phase 6) and `implement-spec` (Phase 6) read this file. Ported from
BattleDirector (#365 step 5). `scripts/test/review-header.test.mjs` fails when a
review-posting skill stops naming this file.

```markdown
## Review — <spec|implementation> — round N of M

| | |
|---|---|
| **Verdict** | ✅ APPROVE / ⚠️ APPROVE WITH NITS / ❌ REQUEST CHANGES |
| **Blocking** | the finding IDs that block, or `none` |
| **Findings** | n CRITICAL · n HIGH · n MEDIUM · n LOW — and which are closed since the last round |
| **Reviewed at** | `<sha>` |
| **CI** | n/5 at time of review |
```

## Filling it

- **Heading.** `spec` for a spec PR's review, `implementation` for code. `round N of M` counts this
  review among the rounds the skill allows: `implement-spec` allows 3; `spec-first-pass` sets no
  cap, so write `round N`.
- **Verdict.** On the last allowed round with findings still open, the verdict is
  `❌ REQUEST CHANGES` and **Blocking** lists every open finding.
- **Findings.** Each finding gets an ID, `F1`, `F2`, … numbered across rounds of the same PR (a
  new round continues from the last ID; it never reuses one). Give each a severity, a `file:line`
  and whether it was **run or read**. The counts in the table match the findings in the body.
- **Reviewed at.** The PR's full 40-character head commit, read right before posting:
  `gh pr view <n> --json headRefOid --jq .headRefOid`. Never a local `HEAD`: an unpushed commit
  reviews fine locally while GitHub shows something else.
- **CI.** Passing checks over the five required (`lint`, `test`, `compliance`, `server`,
  `mock`, the list in `.github/rulesets/next.json`), from `gh pr checks <n>`.

Then one line per finding:

```markdown
- **F1** [HIGH, run] `path/to/file.js:42` — what is wrong, the input that shows it, the fix.
```

## Posting it

Post it as a **formal review**, never a plain PR comment: `gh pr review <n> --comment
--body-file <file>`, run with the agent token (the `gh` alias). The agent authored the PR, and
GitHub refuses `--approve` / `--request-changes` on your own PR, so the verdict lives in the
header. Each round is a new formal review with its own header. An agent review never counts as
the owner's approval: the owner approves a spec with the `spec-approved` label.

## Dispositions

The author answers every finding in one PR comment per round, one line per ID. It is a
plain comment, not a formal review, because it answers a review rather than giving one:

```markdown
Dispositions for round N (amended `<short sha>`):
- **F1** fixed: what changed.
- **F2** wrong: why the finding does not hold.
- **F3** intentional: the decision, and where it is recorded.
- **F4** not-worth-it: why, and the follow-up issue if one was filed.
```

The four words are the only dispositions. `fixed` means the next round can check it; a
`not-worth-it` finding that is still worth doing later gets an issue in the PR's milestone.
