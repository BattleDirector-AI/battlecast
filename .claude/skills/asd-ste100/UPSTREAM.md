# Upstream

Vendored from https://github.com/danyuchn/asd-ste100-skill (MIT, see `LICENSE`).

- Commit: `a4905d922500dd7530ca8a0eb9e4940494255709` (2026-11-11)
- Files: `SKILL.md`, `LICENSE`, `references/`, `examples/`, `scripts/ste-lint.py`. Not copied: the
  upstream `README.md` and `.claude-plugin/`.
- Local changes: none. Do not edit these files here. To update, copy the new upstream files over
  them, record the new commit above, and run `make spec-lint`.

battlecast uses this skill for specs. `.ai/spec/README.md` ("Plain English") has the rules.
`scripts/spec-lint.mjs` runs `scripts/ste-lint.py` in CI.
