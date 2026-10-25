# Contributing to battlecast

Thanks for your interest in battlecast. This document covers the one discipline
that matters most here: **how we test.**

## Fixture-based behavioral testing

battlecast follows **fixture-based behavioral testing**, modeled on
[BattleDirector](https://github.com/BattleDirector-AI/battledirector)'s own
spec-driven development discipline.

The rule: **given a state fixture, assert on the actual rendered content — not on
"it rendered without throwing."**

A test that only proves a component mounted, an SSE event was received, or a
function was called tells you nothing about whether the user-visible output is
correct. Those are syntactic-shape assertions; they stay green while the broadcast
graphic silently regresses.

Instead, every behavioral test should:

1. Start from a **fixture** — a concrete spec-v1 state payload (see `spec/v1/fixtures/`).
2. Drive the widget with that fixture.
3. Assert on the **produced content**: the rendered DOM text, element order,
   highlight state, numeric values shown — the things a viewer would actually see.

Examples of the bar we hold:

- ✅ "Given vehicles in position order `[P1=Hamilton, P2=Verstappen]`, the tower's
  rendered rows read `Hamilton` then `Verstappen`, in that order."
- ✅ "Given `subject` on-camera = Verstappen with `gap_ahead = 0.4s`, the battle box
  shows `0.4` next to Verstappen."
- ✅ "Given no active battle, the battle box renders its explicit idle state."
- ❌ "The tower component mounts without error."
- ❌ "An SSE `state` event handler was called."

## Spec changes

The producer ↔ renderer contract lives in `spec/v1/`. Changes to the contract must
update `spec/v1/SPEC.md`, `spec/v1/schema.json`, and the affected fixtures together,
and must keep the compliance harness (`spec/v1/compliance/`) passing.

## Pull requests

Keep PRs focused. Include or update the fixtures your change is tested against, and
make sure CI is green before requesting review. Base your PR on **`next`** — see
[RELEASING.md](RELEASING.md) for the full branch model (`next` → `prerelease` →
`main`) and how releases and hotfixes flow through it.

## Agent identity

AI agents act on GitHub as the `battledirector-agent` App (App ID 5414605, installation
173849151, the same installation BattleDirector uses), so their pull requests, comments,
labels, reviews and pushes show as `battledirector-agent[bot]` and the owner's browser actions
stay `thoraxe`. The App's private key is `%USERPROFILE%\.battledirector-agent\private-key.pem`
(`~/.battledirector-agent/private-key.pem` in WSL), outside every worktree; `*.pem` is
gitignored.

| Permission | Access |
|---|---|
| Contents, Pull requests, Issues, Workflows | read and write |
| Actions, Checks, Metadata | read |

The set holds no Administration, Statuses, Secrets, Variables, Environments or Deployments
permission, so the agent token cannot change a branch ruleset or post a commit status.

- **`gh`:** run it as `bash scripts/agent-gh.sh <gh args>`. The script mints an installation
  token (`gh token generate`, from the `Link-/gh-token` extension), exports it as `GH_TOKEN`
  for that one process and execs `gh`. Start an agent session with a shell alias,
  `alias gh='bash scripts/agent-gh.sh'`. Never shadow `gh` on `PATH` or define it as an
  exported function: either one recurses into itself.
- **`git`:** run `bash scripts/agent-identity-setup.sh` once per clone (every Windows clone
  and every WSL clone; worktrees share their clone's config). It checks the key exists without
  reading it, copies `scripts/agent-git-credential.sh` next to the key, and writes three
  entries to the clone's `.git/config`: an empty `credential.https://github.com.helper` (so the
  system credential manager is replaced, not followed), a second one pointing at that copy by
  absolute path, and `url."https://github.com/".pushInsteadOf git@github.com:` so SSH pushes go
  over HTTPS and use the helper. Every push from that clone then goes as the bot, the owner's
  command-line pushes included. Fetches stay on SSH, which never consults a credential helper.
  The helper path is absolute because a relative one would run from whichever worktree is
  pushing, and a worktree whose branch predates the script would fall back to prompting.
  Re-run it after the helper changes. To undo it:
  `git config --unset-all credential.https://github.com.helper && git config --unset url.https://github.com/.pushInsteadOf`.
- **Prerequisites:** the installation must cover this repository. Until it does, a token still
  mints (the installation exists for BattleDirector) but has no access here, so every push and
  every `gh` write returns 403. Each machine also needs `gh extension install Link-/gh-token`.
- **No fallback:** if a token can't be minted, the `gh` wrapper exits non-zero and the git
  helper prints `quit=1`, so git neither tries another credential nor prompts.
- **WSL, once per install:** install the extension there too, then copy the key to
  `~/.battledirector-agent/private-key.pem` with `chmod 700` on the directory and `chmod 600`
  on the key. WSL has no `cygpath`, so the scripts fall back to `$HOME`. A separate App key for
  WSL can be revoked on its own.
