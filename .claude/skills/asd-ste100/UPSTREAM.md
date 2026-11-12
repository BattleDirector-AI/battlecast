# Upstream

Vendored from https://github.com/danyuchn/asd-ste100-skill (MIT, see `LICENSE`).

- Commit: `a4905d922500dd7530ca8a0eb9e4940494255709` (2026-11-11)
- Files: `SKILL.md`, `LICENSE`, `references/`, `examples/`, `scripts/ste-lint.py`. Not copied: the
  upstream `README.md` and `.claude-plugin/`.
- Local changes: none. Do not edit these files here.

## Update

A new linter can change the violation count of every spec file. The ratchet then reads the change
as `MORE` or `LESS`. So an update is its own PR:

1. Copy the new upstream files over these files.
2. Record the new commit above.
3. Run `node scripts/spec-lint.mjs --reset` and commit the new `.ai/spec/ste-baseline.json`.
4. Run `make spec-lint`. It must pass.
5. Do not change spec text in the same PR. Then a reviewer can see that only the linter changed
   the counts.

battlecast uses this skill for specs. `.ai/spec/README.md` ("Plain English") has the rules.
`scripts/spec-lint.mjs` runs `scripts/ste-lint.py` in CI.
