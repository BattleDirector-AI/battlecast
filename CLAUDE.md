# battlecast

Protocol-first broadcast overlay renderer for sim racing. Renders OBS Browser-Source graphics
(standings tower, battle box, lower-thirds, session status, on-board HUD) from a producer's live
SSE race-state feed. **Producer-agnostic:** any tool implementing the `spec/v1` contract can drive
it.

## Specs

All agent-facing specifications live in `.ai/spec/`. Start with `.ai/spec/README.md` for the
project overview, reading order, and structure guide (what/ = behavioral rules, how/ = codebase
navigation).

The producer↔battlecast **protocol** is a shipped deliverable at `spec/v1/` (`SPEC.md`,
`schema.json`, fixtures) — `schema.json` is the literal source of truth for payload shape.
`.ai/spec/what/protocol-contract.md` describes how battlecast consumes it.

## Core principle

**Dumb overlay, smart producer.** battlecast renders; it never analyzes the race. Any derived or
semantic fact (class-best lap, target time, gap to leader, battle intensity) is producer-computed
and delivered as a field — the overlay reads the field and MUST NOT scan `vehicles[]` to derive it.
Every optional field must be tolerated when absent.

## Development

Node ≥ 22. The `server/` and `producers/mock/` are zero-dependency (Node built-ins only).

| Command | What it does |
|---|---|
| `make install` | Install app deps (server + mock need none). |
| `make dev` | Run the full stack: app `:5173`, mock producer `:8080`, companion server `:7397`. |
| `make build` | Build the production app bundle (`app/dist`). |
| `make test` | Run the app test suite (Vitest). |
| `make lint` | Lint the app (ESLint). |
| `make dev-app` / `dev-mock` / `dev-server` | Run one piece on its own. |

## Testing discipline (non-negotiable)

**Fixture-based behavioral testing.** Given a `spec/v1` state fixture, drive the widget and assert
on the **rendered content** (DOM text, order, highlight, numeric values) — not "it mounted" or "a
handler was called." Shape-only assertions are rejected (`CONTRIBUTING.md`). Tests are co-located as
`*.test.js`.

## Contract changes

A change to the producer↔renderer contract updates `spec/v1/SPEC.md`, `spec/v1/schema.json`, and the
affected `fixtures/` **together**, keeps `spec/v1/compliance/` passing, and emits any new field from
`producers/mock/`. Additions are optional + defaulted; `schemaVersion` stays `"1"` unless the change
is breaking.

## Branch model

Base PRs on **`next`** → `prerelease` → `main`. See `RELEASING.md` for the full flow.
Accepted design decisions are recorded as ADRs in `docs/decisions/`.
