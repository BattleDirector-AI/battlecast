# battlecast spec v1

This document is the producer ↔ battlecast contract. It defines how a **producer**
exposes live race state and how **battlecast** consumes it to render the standings
tower (`/tower`) and battle box (`/battle`) widgets.

The payload shape is defined formally in [`schema.json`](schema.json), which is the
**source of truth** for field names, types, and required-ness. This document is the
prose companion: it covers connection direction, message framing, versioning, and a
field-by-field walkthrough.

## Direction of connection — read this first

**The producer runs the HTTP + SSE server. battlecast connects OUT to the producer as
a client.**

This is the single most important architectural fact of the project. battlecast is
never a server that producers push to. battlecast is a *client* that opens a
connection to a producer-hosted endpoint and receives state events from it.

```
  ┌────────────┐   HTTP + SSE    ┌──────────────┐   Browser Source   ┌─────┐
  │  Producer  │ ──────────────▶ │  battlecast  │ ─────────────────▶ │ OBS │
  │  (server)  │   state events  │   (client)   │   /tower /battle   │     │
  └────────────┘                 └──────────────┘                    └─────┘
```

A producer is any tool — for any sim — that implements this contract. battlecast does
not care which sim or producer is on the other end; it only depends on the contract
described here. The [compliance harness](compliance/) lets producer authors self-check
their SSE endpoint against this spec.

## Transport and message framing

- **Transport**: HTTP, using
  [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
  (`text/event-stream`). battlecast opens an `EventSource` against the producer's SSE
  endpoint.
- **Event name**: state snapshots are delivered as SSE events named **`state`**.
  Consumers listen specifically for the `state` event (not the default unnamed
  message), so producers MUST set the SSE `event:` field to `state`.
- **Payload**: the `data:` field of each `state` event is a single JSON document
  conforming to [`schema.json`](schema.json). Each event carries a **complete
  snapshot** of current race state — not a delta. A consumer can render purely from
  the most recent `state` event without replaying history.
- **Cadence** (recommendation, not a hard requirement): producers should emit a
  `state` event whenever the state meaningfully changes, and for a live broadcast feed
  a steady rate of a few updates per second (≈2–10 Hz) is typical and sufficient for
  smooth tower/battle-box rendering. Producers may emit faster or slower; consumers
  MUST NOT assume a fixed interval and should simply render the latest snapshot
  received. There is no required minimum or maximum rate in v1.
- **Subject-change latency** (recommendation, non-normative): when `subject` changes —
  a camera cut / driver snap — the producer SHOULD emit a `state` snapshot promptly
  (target ≤ ~150 ms) rather than waiting for the next cadence tick. Subject-driven
  widgets (the driver and qualifying lower-thirds — see
  `docs/decisions/0002-lower-third-widgets.md`) fire on this change, so prompt emission
  keeps them responsive to the cut. This changes no schema fields; a producer that only
  ticks steadily still works, the lower-third just fires up to one tick late.

## Versioning policy

Every payload carries a top-level **`schemaVersion`** string identifying the version
of *this state contract*. It is numbered **independently** of:

- the battlecast app's own release version (e.g. its `package.json` version), and
- any producer application's own version.

v1 of the contract uses `schemaVersion` `"1"`. Future breaking changes to the payload
shape get a new contract version and a new `schemaVersion` value; the battlecast app
may go through many releases without the contract version changing, and vice versa.

**Consumer behavior on an unrecognized `schemaVersion`**: battlecast should **log a
warning and attempt best-effort rendering** rather than refusing outright. Because
each `state` event is a complete snapshot and unknown object properties are permitted
(`additionalProperties` is allowed), a consumer can usually still read the fields it
understands from a newer minor revision. battlecast renders what it can recognize and
surfaces the version mismatch in its logs; it only fails hard if the required fields
for a given widget are genuinely absent or unparseable.

## Payload field walkthrough

The top-level required fields are `schemaVersion`, `mode`, `vehicles`, `subject`, and
`relationship`. See [`schema.json`](schema.json) for exact types and nested
required-ness.

- **`schemaVersion`** (string) — Identifies the contract version, numbered
  independently of any app version. See *Versioning policy* above.
- **`mode`** (string) — The producer's current broadcast intent, e.g. `"race"`,
  `"qualifying"`, `"practice"`, or `"replay"`. Lets widgets adapt presentation to the
  session type. Consumers should tolerate unknown values.
- **`vehicles`** (array) — Every vehicle in the session, in no guaranteed array order.
  Each entry has a stable `slot_id`, a `driver_name`, a `vehicle_class`, an integer
  `position` (1 = leader), and lap/sector timing (`last_lap`, `best_lap`,
  `sector_times`, all in seconds). Consumers sort by `position` to produce the running
  order rendered in the standings tower. **`sector_times` is the vehicle's most recent
  *completed* lap** — the per-sector split of the lap that produced `last_lap`, not a
  lap currently in progress.

  Each entry may also carry the following **OPTIONAL, ADDITIVE** producer-computed
  fields (a minor v1 revision — see below). Per the *dumb overlay, smart producer*
  principle in [`docs/decisions/0002-lower-third-widgets.md`](../../docs/decisions/0002-lower-third-widgets.md),
  the producer holds authoritative race state and computes these facts; the consumer
  only renders them and **MUST tolerate their absence**:

  - **`notable`** (object) — Producer-set notability flags whose meaning the producer
    owns, mirroring how `battle_intensity` is an opaque producer computation. Defined
    keys are `class_best_lap` (holds the fastest `best_lap` in its `vehicle_class`),
    `session_best_lap` (holds the overall fastest lap), and `personal_best_lap` (just
    improved its own best). All are optional booleans; an absent or false flag means
    "not notable". The object is open — unknown notability keys are ignored, so new
    notability is a new flag, not new overlay logic. Consumers **MUST NOT** derive these
    by scanning `vehicles[]`; they read the flag the producer set.
  - **`target_lap`** (number, seconds) — A producer-provided reference "time to beat"
    for the vehicle that an overlay should display. The producer decides what the target
    references (class pole, session best, a chosen reference); the consumer just shows
    it. **`delta_to_target`** (number, seconds) optionally accompanies it as
    `best_lap` minus `target_lap` (negative = faster than target).

  **Contract note — no `schemaVersion` bump.** These fields were added in a minor
  revision of v1; `schemaVersion` stays `"1"`. That is permitted because `schemaVersion`
  is reserved for *breaking* changes, and `schema.json` sets `additionalProperties: true`
  at every level: a producer may emit these today and an older consumer that has never
  heard of them simply ignores them, while a newer consumer tolerates their absence from
  an older producer. See *Versioning policy* above.
- **`subject`** (object) — The on-camera driver identity: a `slot_id` (which should
  reference one of the `vehicles` entries) and a `driver_name`. Widgets highlight this
  driver in the tower and center the battle box on them.
- **`relationship`** (object) — The battle context for the on-camera subject:
  `gap_ahead` and `gap_behind` (seconds to the cars immediately ahead/behind in
  running order; null or absent when the subject leads or trails the field), and
  `battle_intensity` (a number in `[0, 1]` describing how close/contested the battle
  is — 0 is clear air, 1 is maximally contested). This drives the battle box.

## Fixtures and compliance

Concrete example payloads live in [`fixtures/`](fixtures/) and are the basis for
battlecast's fixture-based behavioral tests (see `CONTRIBUTING.md`): a fixture is a
complete spec-v1 `state` payload, and tests drive the widgets with it and assert on
the rendered content. Producer authors can validate their own SSE endpoint against
this contract with the [compliance harness](compliance/).
