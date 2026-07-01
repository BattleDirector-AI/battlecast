---
name: release-cut
description: Full battlecast release flow — changelog, next→prerelease integration PR, version cut + tag on prerelease, prerelease→main promotion PR, tag push, GitHub release, and back-merge. Use when cutting a new vX.Y.Z release or landing a hotfix.
---

# Release Cut

End-to-end release for battlecast. The branch model is `next` → `prerelease` → `main`
(see [RELEASING.md](../../../RELEASING.md) for the full rationale): work accumulates on
`next`; a release integrates `next` into `prerelease`, cuts the version + tag there, then
promotes `prerelease` → `main`.

Drive this interactively with the user. Confirm the target version and get explicit
confirmation before each irreversible step (PR merge, tag push, GitHub release publish).
This is a small repo with no Python/`make` tooling — everything here is plain `git`, `gh`,
and `npm`.

## Phase 0 — Pre-flight

```bash
git fetch origin
git status --porcelain              # must be empty before you start
git merge-base --is-ancestor origin/prerelease origin/next && echo "clean" || echo "DIVERGED — stop and investigate"
git log --oneline origin/next --not origin/prerelease     # PRs/commits this release will carry
```

If `next` has diverged from `prerelease` in a way that isn't a simple fast-forward
history (e.g. someone committed directly to `prerelease` outside a release), stop and
ask the user how to reconcile before continuing.

Optionally prune merged worktrees/branches:
```bash
git worktree list
git worktree remove --force <path>   # for any worktree whose branch is already merged into origin/next
git worktree prune -v
git remote prune origin
```

## Phase 1 — Changelog

The release's notes live under `## [Unreleased]` in `CHANGELOG.md` at the repo root.

1. Find the last release tag: `git describe --tags --abbrev=0 origin/main` (if no tags
   exist yet, this is the first release — use the repo's root commit).
2. Draft entries from the commits that will ship:
   ```bash
   git log --oneline <last-tag>..origin/next
   ```
3. **Curate, don't enumerate.** Group by Added / Changed / Fixed (Keep a Changelog
   categories), citing the PR/issue number where useful (e.g. `(#4)`). A raw commit-log
   dump is not a changelog.
4. Keep entries under `## [Unreleased]` — the cut in Phase 3 renames that heading to the
   version with today's date.

## Phase 2 — Integration PR (`next` → `prerelease`)

```bash
git checkout -b release/X.Y.Z origin/next
git add CHANGELOG.md && git commit -m "docs(changelog): summarize vX.Y.Z"
git push -u origin release/X.Y.Z
gh pr create --base prerelease --head release/X.Y.Z \
  --title "Release vX.Y.Z (next → prerelease)" \
  --body "Integrates next into prerelease ahead of the vX.Y.Z cut. See CHANGELOG.md."
```

Wait for CI (`lint`, `test`, `build`) green: `gh pr checks <n> --watch`. Then merge:
```bash
gh pr merge <n> --merge
```
Use a plain merge commit here (not squash) so `prerelease` keeps the individual commits
from `next` — this matters for `git log`-based changelog drafting on the *next* release.

**Note — issues don't auto-close yet.** `Closes #N` in a feature PR only auto-closes the
issue when it lands on the repo's **default branch**. Since `prerelease` is the default
branch here (not `main`), merging this integration PR *does* auto-close issues referenced
by the PRs it carries. If a future change makes `main` the default again, auto-close will
instead wait until Phase 4.

## Phase 3 — Cut the version on `prerelease`

```bash
git checkout prerelease && git pull --ff-only origin prerelease
grep '"version"' app/package.json
```

The canonical version lives in `app/package.json` (the shipped renderer). Bump it without
letting npm create its own commit/tag — this skill handles both itself so the version
bump, changelog rename, and any other release-day file changes land in one commit:

```bash
npm --prefix app version patch --no-git-tag-version   # or: minor / major
```

Confirm with the user which bump matches the changelog (patch = fixes only,
minor = new features/widgets, major = breaking contract or route changes).

Then, by hand:
1. In `CHANGELOG.md`, rename `## [Unreleased]` → `## [X.Y.Z] - <YYYY-MM-DD>` and add a
   fresh empty `## [Unreleased]` above it.
2. Commit and tag:
   ```bash
   git add CHANGELOG.md app/package.json app/package-lock.json
   git commit -m "Release vX.Y.Z"
   git tag vX.Y.Z
   ```

## Phase 4 — Promote `prerelease` → `main`

```bash
git push origin prerelease
git push origin vX.Y.Z
gh pr create --base main --head prerelease --title "Release vX.Y.Z" --body "See CHANGELOG.md."
```

Wait for CI green, then merge (`gh pr merge <n> --merge` — again a merge commit, not
squash, so `main`'s history reflects what actually shipped). Publish the GitHub release:

```bash
gh release create vX.Y.Z --title "vX.Y.Z" \
  --notes-file <(sed -n '/## \[X.Y.Z\]/,/## \[/p' CHANGELOG.md | head -n -1)
```

## Phase 5 — Post-release back-merge

The release commit (version bump + changelog rename) lands *on* `prerelease` and never
flows back to `next` automatically. Skipping this step means the *next* release's
Phase 2 PR hits a changelog/version merge conflict.

```bash
git checkout -b backmerge/vX.Y.Z origin/prerelease
git push -u origin backmerge/vX.Y.Z
gh pr create --base next --head backmerge/vX.Y.Z \
  --title "Back-merge vX.Y.Z (prerelease → next)" \
  --body "Carries the vX.Y.Z version bump and changelog back into next."
```
Merge once CI is green (`gh pr merge <n> --merge`). Delete the `release/X.Y.Z` and
`backmerge/vX.Y.Z` helper branches once merged.

## Hotfix flow (urgent fix to already-released code)

See `RELEASING.md` for the summary. Mechanically:

1. Branch from `main`, not `next`: `git checkout -b hotfix/x.y.z-description origin/main`.
2. PR straight to `main`. Merge once green.
3. Cut a patch tag directly on `main` (repeat the version-bump + tag steps from Phase 3,
   but on `main` instead of `prerelease`) and `gh release create`.
4. Run Phase 5's back-merge **twice**: `main → prerelease`, then `prerelease → next`, in
   that order, so the fix isn't silently dropped by the next regular release.

## Gotchas

- `gh pr merge` here always uses `--merge` (not `--squash`) for the three release-flow
  PRs (integration, promotion, back-merge) — these are structural merges between
  long-lived branches, not feature landings, and squashing would flatten history that the
  next release's changelog draft (Phase 1) relies on for `git log <last-tag>..`. Feature
  PRs into `next` can still be squash-merged per normal project convention.
- `producers/mock/package.json` has its own independent version — it's a dev-only
  reference tool, not part of the shipped app, and is **not** bumped by this skill unless
  its own content changed for this release.
- Tags are pushed explicitly (`git push origin vX.Y.Z`); a plain `git push` does not carry
  them.
