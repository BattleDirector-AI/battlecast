# Branching & releases

battlecast uses a three-branch model, adapted from
[BattleDirector](https://github.com/BattleDirector-AI/battledirector)'s own
`next → prerelease → main` flow:

```
feature branches ──PR──▶ next ──release──▶ prerelease ──promote──▶ main
                     (integration)      (staging / RC)        (released)
                                                                    │
                                                    hotfix branch ◀─┘
```

| Branch       | Purpose                                                                 | Who pushes here |
| ------------ | ------------------------------------------------------------------------ | --------------- |
| `next`       | Integration branch — **the GitHub default branch**. Every feature/fix PR targets `next` and lands here first. | Feature PR merges |
| `prerelease` | Staging branch. Holds what's about to ship; version bumps and tags are cut here. | Release-cut integration and version-cut PRs, back-merges |
| `main`       | Released code only. Always matches the latest published tag. Hotfixes branch from here. | Release promotion PRs, hotfix PRs |

## Everyday work

1. Branch off `next` (or an up-to-date fork of it) for your feature/fix.
2. Open a PR with base `next`. CI (`lint`, `test`, `compliance`, `server`, `mock`) must be green.
3. Once merged, your change is in `next` but **not yet released** — it ships on the
   next release cut.

## Cutting a release

Use the `release-cut` skill (`.claude/skills/release-cut/`) for the full flow. In short:

1. **Changelog** — curate `CHANGELOG.md`'s `[Unreleased]` section from the commits
   landing in this release.
2. **Integrate** — PR `next → prerelease`, wait for CI, merge.
3. **Cut** — on a `release/vX.Y.Z-cut` branch from `prerelease`, bump the version
   (`app/package.json`), move `[Unreleased]` to a dated version section, commit, tag `vX.Y.Z`,
   and merge it into `prerelease` by PR.
4. **Promote** — PR `prerelease → main`, push the tag, merge, then
   `gh release create vX.Y.Z`. Publishing the release triggers
   `.github/workflows/release.yml`, which builds `battlecast.exe` and attaches it
   with `SHA256SUMS.txt` — nothing to do by hand. (Re-run it for an existing tag via
   the workflow's `workflow_dispatch` input.)
5. **Back-merge** — a small PR from a branch cut from `prerelease`, with `next` merged in
   first (the `next` ruleset is strict), carries the version bump and changelog forward so
   `next` doesn't conflict on the following release.

Every one of these steps that changes `next`, `prerelease` or `main` is a merged pull request.
The branch rulesets in `.github/rulesets/` require a PR and the five CI checks, with no bypass
for anyone, the owner included.
To merge past red CI in a real emergency, the owner edits the ruleset in GitHub's settings
for that one merge and restores it from the file afterwards (`gh api -X PUT
repos/BattleDirector-AI/battlecast/rulesets/<id> --input .github/rulesets/<file>`): a
deliberate, visible step, never an agent's.

## Hotfixes

For an urgent fix to already-released code:

1. Branch from `main` (not `next`), e.g. `hotfix/x.y.z-description`.
2. Add the patch version bump (`vX.Y.Z+1`) as the branch's last commit and tag it, then PR
   straight to `main`. Once merged, push the tag and publish the GitHub release.
3. Back-merge `main → prerelease → next` (in that order) so the fix isn't lost on
   the next regular release, each by PR from its own temporary branch — the `release-cut`
   skill's hotfix flow gives both legs.

## Why not just `main`?

Two widgets rendered live on stream via OBS Browser Sources have a low tolerance
for an in-progress `next` state leaking onto someone's broadcast. Splitting
integration (`next`), staging (`prerelease`), and released (`main`) means:

- `prerelease` is always the most recent complete, staged snapshot — what an evaluator
  should look at.
- `main` never contains anything that hasn't been through a release cut, so a
  hotfix branched from it never accidentally carries unreleased `next` work.
