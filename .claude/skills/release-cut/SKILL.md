---
name: release-cut
description: Full battlecast release flow — changelog, next→prerelease integration PR, version cut + tag on a branch merged into prerelease by PR, prerelease→main promotion PR, tag push, GitHub release, and back-merge. Use when cutting a new vX.Y.Z release or landing a hotfix.
---

# Release Cut

End-to-end release for battlecast. The branch model is `next` → `prerelease` → `main`
(see [RELEASING.md](../../../RELEASING.md) for the full rationale): work accumulates on
`next`; a release integrates `next` into `prerelease`, cuts the version + tag on a branch merged into
`prerelease` by PR, then promotes `prerelease` → `main`. All three branches are protected by
`.github/rulesets/`, so every step that changes one of them is a merged pull request.

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
node scripts/check-labels-live.mjs --agent                 # live labels match .github/labels.yml
```

If the label check reports drift, run it again with `--apply`. That creates the missing labels
and fixes the differing ones. It never deletes a label: one that `labels.yml` does not declare
is only reported.

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

Wait for CI green: `gh pr checks <n> --watch`. CI runs **five** jobs — `lint`, `test`,
`compliance`, `server`, `mock`. There is no `build` job; the build is a step inside `test`,
so do not wait for a sixth. **"no checks" or "cancelled" is not the same as passing** —
during a GitHub Actions incident a PR can report no checks at all. Confirm a run actually
registered against the SHA you are about to merge:

```bash
gh run list --commit "$(git rev-parse HEAD)" --json databaseId,workflowName,status,conclusion \
  -q '.[] | "\(.databaseId) \(.workflowName) \(.status) \(.conclusion // "-")"'
```

Then merge:
```bash
gh pr merge <n> --merge
```
Use a plain merge commit here (not squash) so `prerelease` keeps the individual commits
from `next` — this matters for `git log`-based changelog drafting on the *next* release.

**Note — when issues auto-close.** `Closes #N` only auto-closes an issue when the commit
carrying it lands on the repo's **default branch**, which is `next`
(`gh repo view --json defaultBranchRef`). Feature PRs therefore close their issues as they
merge into `next`, and this integration PR closes nothing new. A `Closes #N` written into a
release-time commit, such as the changelog commit, takes effect only when Phase 5's back-merge
lands it on `next`.

## Phase 3 — Cut the version on a branch, merged into `prerelease` by PR

`next`, `prerelease` and `main` are protected by the rulesets in `.github/rulesets/`, which have
no bypass actors, so nobody (the owner included) can push to them: the release commit reaches
`prerelease` through a pull request like everything else. Cut it on a branch taken from the
freshly merged `prerelease`:

```bash
git fetch origin
git checkout -b release/vX.Y.Z-cut origin/prerelease
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
2. Commit, tag locally, and open the cut PR:
   ```bash
   git add CHANGELOG.md app/package.json app/package-lock.json
   git commit -m "Release vX.Y.Z"
   git tag vX.Y.Z
   git push -u origin release/vX.Y.Z-cut
   gh pr create --base prerelease --head release/vX.Y.Z-cut \
     --title "Release vX.Y.Z (version cut)" --body "Version bump and changelog for vX.Y.Z."
   ```

Wait for the five checks green and merge with `gh pr merge <n> --merge`. The merge commit
keeps the tagged release commit in `prerelease`'s history. **If the cut PR needs a fix before it
merges**, amend the release commit rather than adding one on top, so the tag moves with it:
amend, `git tag -d vX.Y.Z && git tag vX.Y.Z`, then `git push --force-with-lease` (the cut branch
is not protected). Never move the tag after the merge.

## Phase 4 — Promote `prerelease` → `main`

```bash
git push origin vX.Y.Z
gh pr create --base main --head prerelease --title "Release vX.Y.Z" --body "See CHANGELOG.md."
```

Tags are not covered by the branch rulesets, so the tag push goes straight through.
`releases.json` does not require the head to be up to date with `main`, so this PR merges even
though `prerelease` lacks `main`'s earlier merge commits. Wait for CI green, then merge
(`gh pr merge <n> --merge` — again a merge commit, not squash, so `main`'s history reflects what
actually shipped). Publish the GitHub release:

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
git merge --no-edit origin/next        # next.json is strict: the head must contain next
git push -u origin backmerge/vX.Y.Z
gh pr create --base next --head backmerge/vX.Y.Z \
  --title "Back-merge vX.Y.Z (prerelease → next)" \
  --body "Carries the vX.Y.Z version bump and changelog back into next."
```
`next.json` requires a PR's head to be up to date with `next`, which a branch cut from
`prerelease` is not once anything has merged into `next` since the integration PR; merging
`origin/next` in first satisfies it. If `next` moves again before this merges, repeat the merge
and push. Merge once CI is green (`gh pr merge <n> --merge`). Delete the `release/X.Y.Z`,
`release/vX.Y.Z-cut` and `backmerge/vX.Y.Z` helper branches once merged.

## Phase 6 — Announce on Discord

Post the release to the **battlecast `#announcements`** channel in the BattleDirector AI
Discord. Do this **last**, after Phase 5 — the post carries a download link, so nothing
should go out until the tag, the GitHub release and its `.exe` asset all exist and the
back-merge is clean.

**Where it goes.** Guild `1476282641274634325` (BattleDirector AI), channel
`1542291495099433010` — the `#announcements` inside the **Battlecast** category. That is
*not* the same channel as the `#announcements` under **BattleDirector**
(`1487105208617013490`), which carries BattleDirector's own releases. Discord allows the
duplicate name; the category is what distinguishes them. Post to the wrong one and it
lands in the wrong product's feed, so use the id, never the name.

**Prerequisite.** The `discord` MCP server must be connected (`mcp__discord__*` tools
present). It is registered at **user scope** and reads its token from the gitignored
`.discord` via `node --env-file`. A server added mid-session is not available until Claude
restarts. See the `discord-mcp-setup` memory for the wiring and the drive-letter-casing
trap that makes a locally-scoped server silently fail to load.

The channel is **member-only and writable only by `admins` and `BD Bot`** — the bot posts
through an explicit channel overwrite, not through `@everyone`. If a send fails with *"The
bot is not a member of the target Discord server or lacks required permissions"*, distrust
it: that is the MCP server's catch-all for every error, and the bot is almost certainly a
member. Get the real code from Discord before changing any permission:

```bash
node --env-file=.discord -e 'fetch("https://discord.com/api/v10/channels/1542291495099433010",
  {headers:{Authorization:`Bot ${process.env.DISCORD_TOKEN}`}}).then(async r=>
  console.log(r.status, await r.text()))'
```

`50013 Missing Permissions` means a permission is absent — `MANAGE_ROLES` ("Manage
Permissions") is the one needed to edit any overwrite, and is separate from
`MANAGE_CHANNELS`. `50001 Missing Access` means the bot cannot see the channel at all: it
has been locked out by a channel or category overwrite, and only Administrator bypasses
that, so recovery needs a human in the Discord UI. Check the **HTTP status** before parsing
any response — a `403` body has no `permission_overwrites` field, which reads exactly like
"no permissions are set" and sends the diagnosis the wrong way. Details in the
`discord-channel-permissions` memory.

**Draft it from the CHANGELOG entry you just wrote**, in the house style the server already
uses:

- The whole body sits in a ``` fence.
- First line: `battlecast vX.Y.Z — lowercase human subtitle` saying what the release is
  *for*, not what it contains.
- A short prose paragraph framing the release, often referring back to what the previous
  one set up.
- Then `What you'll notice` and `Fixed` sections, `•` bullets, broadcaster-facing prose.
  The CHANGELOG's Added/Fixed entries port over with light editing — the register is
  already right. **Drop the Internal section**; it is contributor-facing and means nothing
  to a broadcaster.
- **Put the links *outside* the fence.** Discord does not linkify URLs inside a code block,
  and the download is the point of the post. Verify afterwards that the sent message came
  back with `embeds: 1` — that is the proof Discord treated the URL as a real link. Discord
  builds link previews asynchronously, so a read straight after sending can show `embeds: 0`;
  wait a few seconds and read once more before treating 0 as a failure.

```
**Download** (Windows, no install needed)
https://github.com/BattleDirector-AI/battlecast/releases/download/vX.Y.Z/battlecast-vX.Y.Z-windows-x64.exe

**Full notes:** https://github.com/BattleDirector-AI/battlecast/releases/tag/vX.Y.Z
```

Get the exact asset URL from the release rather than composing it by hand:

```bash
gh release view vX.Y.Z --json url,assets -q '.url, (.assets[] | "\(.name) -> \(.url)")'
```

**Show the draft and get approval before sending.** This is the one step of the release
that is *not* covered by the standing unattended authorization: that authorization was
written for git and GitHub steps, and this posts to a shared community server where a bad
post is visible to members immediately. Send with `mcp__discord__discord_send`
(`channelId`, `message`), then read it back with `mcp__discord__discord_read_messages`
(`limit: 1`) to confirm it landed and embedded.

## Hotfix flow (urgent fix to already-released code)

See `RELEASING.md` for the summary. Mechanically:

1. Branch from `main`, not `next`: `git checkout -b hotfix/x.y.z-description origin/main`.
2. Make the fix, then on the same branch do Phase 3's version bump and changelog rename as a
   final `Release vX.Y.Z` commit, and tag it locally. `main` is protected, so the release commit
   goes in with the fix rather than being cut on `main` afterwards. As in Phase 3, a fix needed
   before the merge amends the release commit and re-tags (`git tag -d vX.Y.Z && git tag
   vX.Y.Z`), so the tag stays on the merged head; never add a commit on top of the tagged one.
3. PR straight to `main`. Merge once green (`gh pr merge <n> --merge`), then push the tag and
   `gh release create`.
4. Back-merge in two legs, in this order, so the next regular release doesn't drop the fix.
   Each is a PR from a temporary branch with its own name:
   ```bash
   # main -> prerelease (releases.json is not strict: no merge-in needed)
   git checkout -b backmerge/vX.Y.Z-prerelease origin/main
   git push -u origin backmerge/vX.Y.Z-prerelease
   gh pr create --base prerelease --head backmerge/vX.Y.Z-prerelease \
     --title "Back-merge vX.Y.Z (main → prerelease)" --body "Carries hotfix vX.Y.Z into prerelease."
   # once that merges: prerelease -> next, exactly as Phase 5 (merge origin/next in first)
   ```
   Merge each with `gh pr merge <n> --merge` once green.

## Gotchas

- `gh pr merge` here always uses `--merge` (not `--squash`) for every release-flow PR
  (integration, version cut, promotion, back-merges, and the hotfix PR and its back-merges) —
  these are structural merges between
  long-lived branches, not feature landings, and squashing would flatten history that the
  next release's changelog draft (Phase 1) relies on for `git log <last-tag>..`. Feature
  PRs into `next` can still be squash-merged per normal project convention.
- `producers/mock/package.json` has its own independent version — it's a dev-only
  reference tool, not part of the shipped app, and is **not** bumped by this skill unless
  its own content changed for this release.
- Tags are pushed explicitly (`git push origin vX.Y.Z`); a plain `git push` does not carry
  them.
- Every write to `next`, `prerelease` or `main` is a merged pull request: the rulesets in
  `.github/rulesets/` have no bypass actors. A `git push origin prerelease` is refused.
