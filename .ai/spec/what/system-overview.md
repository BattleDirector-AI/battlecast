# System Overview

battlecast is a broadcast-graphics **renderer** for sim racing. It runs as a set of transparent
web pages loaded as OBS Browser Sources, opens an outbound SSE connection to a **producer**, and
draws overlays (standings tower, battle box, lower-thirds, session status, on-board HUD) from the
race-state snapshots the producer streams. It ships no race logic of its own: it renders what a
producer hands it.

## Behavioral Rules

### System role

1. battlecast is a **client**, never a server for the state feed. The producer runs the HTTP + SSE
   server; battlecast opens an `EventSource` *out* to a producer-hosted endpoint and receives
   `state` events. This is the single most important architectural fact of the project.
2. battlecast MUST be **producer-agnostic**: it depends only on the `spec/v1` contract, never on a
   specific sim or producer. Any tool that implements the contract can drive it.
3. battlecast obeys the **dumb overlay, smart producer** principle: it renders and presents; it
   never analyzes the race. Any derived or semantic fact (class-best lap, target time, gap to
   leader, battle intensity) is computed by the producer and delivered as a field. The overlay's
   own logic is limited to presentation — noticing a producer value changed, and timing/animating
   the display. It MUST NOT scan `vehicles[]` to derive such facts.
4. Each `state` event carries a **complete snapshot** (not a delta). A consumer can render purely
   from the most recent snapshot without replaying history.

### Widget inventory

5. v1's core deliverable is two widgets — the **standings tower** (`/tower`) and **battle box**
   (`/battle`). Later minor revisions added, without breaking the contract: **driver lower-third**
   (`/driver`), **qualifying/sector lower-third** (`/qualifying`), **Race Control** session status
   (`/racecontrol`), and the **on-board HUD** (`/onboard`). Composite `/all` composes configured
   widgets onto one canvas. `/grid` and `/results` are full-screen takeover slides; `/logos` is a
   sponsor-logo carousel; `/config` is the layout editor.
6. Widgets are selected by **URL pathname**, because OBS Browser Sources are launched by URL — there
   is no in-app navigation.

### Rendering & tolerance

7. On an **unrecognized `schemaVersion`**, battlecast logs a warning and attempts best-effort
   rendering rather than refusing. Because snapshots are complete and unknown properties are
   permitted, it renders the fields it understands. It fails hard only if a widget's genuinely
   required fields are absent or unparseable.
8. Widgets MUST **tolerate the absence** of every optional field. A payload with no `session`, no
   `subject.telemetry`, and none of the optional per-vehicle fields still validates and every
   existing widget still renders.
9. Overlay pages composite over live video, so overlay routes render on a **transparent** page
   background; takeover slides (`/results`, `/grid`) are opaque.

### Motion

10. The overlay **animates by default**, regardless of the render host's `prefers-reduced-motion`.
    OBS's Browser Source (Chromium/CEF) reports `reduce`, but the OBS machine is not the audience.
    Reduced motion is an explicit opt-in only: `?motion=reduced` per Browser Source, or the
    `/config` toggle (`reducedMotion` profile field). The OS media query is intentionally not
    consulted.

## Configuration Surface

Runtime knobs are URL params per Browser Source and saved-profile fields. See
`what/overlay-config.md` for the full config contract.

| Knob | Where | Purpose |
|---|---|---|
| `?src=<url>` | URL | Producer SSE endpoint (default `http://localhost:8080/events`). |
| `?profile=<name>` | URL | Select a saved layout profile (`/all`). |
| `?show=` / `?hide=` | URL | Comma list toggling per-widget visibility (highest precedence). |
| `?motion=reduced\|full` | URL | Per-source motion override. |
| `?class=<class>` | URL | Cross-route field filter (`/tower`, `/all`, `/grid`, `/results`) — show one vehicle class. |
| `?unit=mph` | URL (`/onboard`) | Speed-unit override for the standalone on-board HUD. |
| `?metrics=<list>` | URL (`/tower`) | Select which tower metrics (`interval,pit,tire,fuel`) show on the standalone tower. |

## Constraints

- **Additive-only protocol.** New producer data arrives as optional, defaulted fields;
  `schema.json` sets `additionalProperties: true` at every level. `schemaVersion` stays `"1"` for
  any non-breaking addition and bumps only on a breaking change.
- **Contract changes move together.** A change to the producer↔renderer contract MUST update
  `spec/v1/SPEC.md`, `spec/v1/schema.json`, and the affected fixtures together, and keep the
  compliance harness passing.
- **Split read from write.** Render pages only ever *read* config over HTTP; the `/config` UI is
  the only writer. The render path is identical whether config/assets are served by the companion
  server or a plain static host — static degradation is a property of the design, not a second
  code path.
- **Node ≥ 22** across app tooling, server, and mock producer. The server and mock producer are
  **zero-dependency** (Node built-ins only).

## Planned Changes

Tracked as GitHub issues (see `docs/plans/` and `docs/decisions/`); not enumerated here. Known
`[PLANNED]` protocol hooks referenced in decisions: live in-progress-lap sector semantics, and
broader use of per-vehicle `notable` flags by the tower/ticker (`docs/decisions/0002-…`).
