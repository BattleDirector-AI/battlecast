# Protocol Files & Testing Discipline

How the `spec/v1` contract, the reference mock producer, and the fixture-based testing discipline
fit together. Behavioral rules: `what/protocol-contract.md`. Contributor rule: `CONTRIBUTING.md`.

## Module Map

| File / Directory | Key Symbols | Responsibility |
|---|---|---|
| `spec/v1/schema.json` | JSON Schema (draft 2020-12) | **Source of truth** for payload shape (field names, types, required-ness). `additionalProperties: true` everywhere. |
| `spec/v1/SPEC.md` | — | Prose companion: connection direction, framing, versioning, field walkthrough. |
| `spec/v1/fixtures/*.json` | complete `state` payloads | Canonical example snapshots; the basis for behavioral tests. |
| `spec/v1/compliance/check.js` | — | Compliance harness: validates a third-party producer's SSE endpoint against the schema. |
| `producers/mock/server.js` | `simulate` subcommand | Reference producer: streams fixtures over SSE on `:8080/events`. |
| `producers/mock/simulate.js` | — | Drives a simulated race so the dev overlay has live-looking motion. |
| `app/src/**/*.test.js` | Vitest | Co-located behavioral tests, fixture-driven. |
| `app/src/routes/all/fixtures/*.json` | layout profiles | Route-local config fixtures (distinct from state fixtures). |

## Data Flow

1. `make dev` (via `scripts/dev.mjs`) starts the mock producer (`:8080`), the Vite app (`:5173`),
   and the companion server (`:7397`) together.
2. The mock producer emits `state` events (fixtures / simulated race) → the overlay's `sseClient`
   consumes them exactly as a real producer would.
3. Tests import a fixture (a complete `spec/v1` payload), drive a widget with it, and assert on the
   **rendered content**.

## Key Abstractions

- **Fixture-based behavioral testing (the one discipline that matters).** Given a state fixture,
  assert on the actual rendered content — DOM text, element order, highlight state, numeric values —
  **not** "it rendered without throwing." Shape-only assertions (mounted / handler-called) stay
  green while the graphic silently regresses; they are explicitly rejected in `CONTRIBUTING.md`.
- **Fixtures are the shared currency** between the spec, the mock producer, and the app tests. The
  same payload shape validates against `schema.json`, replays from the mock producer, and drives a
  unit test — so a contract change that breaks one surfaces in all three.
- **Schema is authoritative; SPEC.md is prose.** When they seem to disagree, `schema.json` wins on
  field shape. Both plus affected fixtures move together on any contract change, and the compliance
  harness must stay green.

## Integration Points

| Consumer | Provider | Mechanism |
|---|---|---|
| App behavioral tests | `spec/v1/fixtures/` | Import JSON, drive widget, assert rendered content. |
| Dev overlay | `producers/mock` | SSE `state` events on `:8080/events`. |
| Third-party producers | `spec/v1/compliance` | Self-check their SSE endpoint against `schema.json`. |

## Implementation Notes

- Timing-dependent behavior (lower-third dwell, logo rotation, class-best flash) is tested with fake
  timers plus fixtures (as `LogoRotation` does) — see the `*.motion.test.js` / `*.shine.test.js`
  suites.
- The mock producer and compliance harness are **zero-dependency** Node (compliance has its own tiny
  `package.json`). Keep them dependency-free.
- Adding an optional field: extend `schema.json` (still additive, `additionalProperties: true`),
  document it in `SPEC.md`, add/extend a fixture, emit it from the mock producer, and cover the
  consumer behavior with a fixture-driven test — all without a `schemaVersion` bump.
