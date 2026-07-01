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
| `next`       | Integration branch. Every feature/fix PR targets `next` and lands here first. | Feature PR merges |
| `prerelease` | Staging branch — **the GitHub default branch**. Holds what's about to ship; version bumps and tags are cut here. | Release-cut integration PRs, back-merges |
| `main`       | Released code only. Always matches the latest published tag. Hotfixes branch from here. | Release promotion PRs, hotfix PRs |

## Everyday work

1. Branch off `next` (or an up-to-date fork of it) for your feature/fix.
2. Open a PR with base `next`. CI (`lint`, `test`, `build`) must be green.
3. Once merged, your change is in `next` but **not yet released** — it ships on the
   next release cut.

## Cutting a release

Use the `release-cut` skill (`.claude/skills/release-cut/`) for the full flow. In short:

1. **Changelog** — curate `CHANGELOG.md`'s `[Unreleased]` section from the commits
   landing in this release.
2. **Integrate** — PR `next → prerelease`, wait for CI, merge.
3. **Cut** — on `prerelease`, bump the version (`app/package.json`), move
   `[Unreleased]` to a dated version section, commit, and tag `vX.Y.Z`.
4. **Promote** — PR `prerelease → main`, push the tag, merge, then
   `gh release create vX.Y.Z`.
5. **Back-merge** — a small `prerelease → next` PR carries the version bump and
   changelog forward so `next` doesn't conflict on the following release.

## Hotfixes

For an urgent fix to already-released code:

1. Branch from `main` (not `next`), e.g. `hotfix/x.y.z-description`.
2. PR straight to `main`. Once merged, cut a patch tag directly on `main`
   (`vX.Y.Z+1`) and publish the GitHub release.
3. Back-merge `main → prerelease → next` (in that order) so the fix isn't lost on
   the next regular release — the `release-cut` skill's back-merge step can be run
   standalone for this.

## Why not just `main`?

Two widgets rendered live on stream via OBS Browser Sources have a low tolerance
for an in-progress `next` state leaking onto someone's broadcast. Splitting
integration (`next`), staging (`prerelease`), and released (`main`) means:

- `prerelease` (the default branch) is always what a new contributor or evaluator
  should look at — the most recent complete, staged snapshot.
- `main` never contains anything that hasn't been through a release cut, so a
  hotfix branched from it never accidentally carries unreleased `next` work.
