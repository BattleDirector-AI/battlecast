# battlecast — Specifications

battlecast is a **protocol-first broadcast overlay renderer for sim racing**. It renders
broadcast graphics — a standings tower, battle box, lower-thirds, session status, and an
on-board HUD — as [OBS](https://obsproject.com/) Browser Sources, driven by a live race-state
feed. It is **producer-agnostic**: any tool for any sim that implements the `spec/v1` contract
can drive it. These specs describe what battlecast must do (behavioral rules) and how its code
is organized (codebase navigation).

> **Naming note:** the project's own producer↔consumer *protocol* spec lives at the repo root
> under `spec/v1/` (`SPEC.md`, `schema.json`, fixtures). It is a shipped deliverable, not part
> of this structure. These agent-facing specs live under `.ai/spec/` and *describe* it (see
> `what/protocol-contract.md`), they do not replace it.

## Structure

| Layer | Path | Purpose |
|---|---|---|
| **what/** | `.ai/spec/what/` | Behavioral rules. What the system must do. Implementation-agnostic. |
| **how/** | `.ai/spec/how/` | Codebase navigation. How the code is organized. Implementation-specific. |

## Scope

**In scope:** the battlecast renderer (`app/`), the companion config/asset server (`server/`),
the `spec/v1` protocol contract as battlecast consumes it, the reference mock producer
(`producers/mock/`), and the fixture-based testing discipline.

**Out of scope:** any real producer's internals (e.g.
[BattleDirector](https://github.com/BattleDirector-AI/battledirector)); the sims themselves
(rF2, LMU); OBS. battlecast only depends on the `spec/v1` contract at its boundary.

## Audience

AI agents. Content is optimized for precision and machine consumption. Human-facing overview
lives in the repo-root `ARCHITECTURE.md`, `README.md`, and `docs/`.

## Quick Start

| Task | Start here |
|---|---|
| Understand the system | `what/system-overview.md` |
| Change the producer↔battlecast data contract | `what/protocol-contract.md` + root `spec/v1/` |
| Change what a widget renders or when it shows | `what/widgets.md` |
| Change tower overflow (clamp, row budget, pinned rows, cycling) | `what/tower-overflow.md` |
| Change layout/profiles/motion behavior | `what/overlay-config.md` |
| Change config/logo persistence or serving | `what/companion-server.md` |
| Navigate the Svelte renderer | `how/renderer.md` |
| Navigate the `/config` editor or live config reload | `how/config-editor.md` |
| Navigate the companion server | `how/server.md` |
| Navigate the protocol files / write a test | `how/protocol-and-testing.md` |
| Look up a domain term | `glossary.md` |

## Cross-Reference

| what/ | how/ |
|---|---|
| `what/system-overview.md` | `how/project-structure.md` |
| `what/protocol-contract.md` | `how/protocol-and-testing.md` |
| `what/widgets.md` | `how/renderer.md` |
| `what/tower-overflow.md` | `how/renderer.md` |
| `what/overlay-config.md` | `how/config-editor.md`, `how/renderer.md`, `how/server.md` |
| `what/companion-server.md` | `how/server.md` |

## Conventions

- **Rule numbering:** behavioral rules are numbered sequentially within each what/ file. Numbers are
  **stable identifiers** — a PR, an issue, or a commit may cite "overlay-config rule 12", so never
  renumber. Removing a rule leaves a gap; inserting one between existing rules uses a sub-number
  (`16a`, `16b`); a genuinely new rule takes the next free number even if it lands in an earlier
  section. Two rules must never share a number.
- **Present-tense behavior only:** `what/` states what the system does — behavior that has shipped
  and behavior being built right now — in the present tense. No `[PLANNED]`, `[PROPOSED]`,
  "deferred until…", or other forward-looking or process language: a spec states what the system
  does, not what our workflow intends to do next. Scope boundaries ("these rules cover the flat
  tower; grouped is out of scope") are behavioral and belong; promises about future work do not.
  Work items themselves live in GitHub issues and `docs/plans/`, not in these specs.
- **Authority:** `what/` specs are authoritative for behavior; `how/` specs for implementation.
  When they conflict, what/ wins. For the *data payload*, root `spec/v1/schema.json` is the
  literal source of truth for field names/types; `what/protocol-contract.md` summarizes intent.
- **Design principle:** *dumb overlay, smart producer* — battlecast renders, it never analyzes
  the race. Any derived/semantic fact is producer-computed and delivered as a field; the overlay
  reads the field, it never scans `vehicles[]` to derive facts itself.
- **Additive-only contract:** `spec/v1` grows by optional, defaulted fields with
  `additionalProperties: true` at every level. `schemaVersion` stays `"1"` for any non-breaking
  addition; it bumps only on a breaking change.
- **Accepted decisions** live in `docs/decisions/` (ADRs). These specs reference them rather than
  restating them.
- **When to create a new file vs. extend one:** a concern with its own lifecycle and
  configuration surface that can be understood independently gets its own file; a capability
  added to an existing component goes in that component's file.
