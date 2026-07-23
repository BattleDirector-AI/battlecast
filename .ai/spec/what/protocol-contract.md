# Protocol Contract (spec v1)

The producer↔battlecast contract: how a producer exposes live race state and how battlecast
consumes it. The literal source of truth for payload shape is root `spec/v1/schema.json`; the
prose companion is root `spec/v1/SPEC.md`. This file states the *behavioral rules* battlecast must
honor as a consumer — it does not restate every field. When this file and `schema.json` disagree
on a field name/type, `schema.json` wins.

## Behavioral Rules

### Connection & framing

1. Transport is HTTP **Server-Sent Events** (`text/event-stream`). battlecast opens an
   `EventSource` against the producer's endpoint and listens for the SSE event named **`state`**
   (not the default unnamed message). Producers MUST set `event: state`.
2. Each `state` event's `data:` is one complete JSON snapshot conforming to `schema.json`. Snapshots
   are **not deltas** — the latest snapshot is sufficient to render.
3. Consumers MUST NOT assume a fixed cadence; they render the latest snapshot received. Typical live
   cadence is ≈2–10 Hz but there is no required minimum/maximum in v1.
4. **Subject-change latency (non-normative):** when `subject` changes (a camera cut), the producer
   SHOULD emit a snapshot promptly (≤ ~150 ms) rather than waiting for the next tick, because
   subject-driven widgets fire on that change. A steady-tick producer still works (fires up to one
   tick late).

### Versioning

5. Every payload carries top-level **`schemaVersion`** (string), numbered **independently** of the
   battlecast app release and any producer version. v1 uses `"1"`.
6. `schemaVersion` bumps **only on breaking changes**. Optional additive fields are a minor revision
   of v1 and keep `schemaVersion` `"1"`, permitted because `additionalProperties: true` holds at
   every level.
7. On an unrecognized `schemaVersion`, battlecast logs a warning and best-effort renders.

### Required payload shape

8. Top-level required fields: `schemaVersion`, `mode`, `vehicles`, `subject`, `relationship`.
   Optional additive top-level object: `session`. Optional additive object under subject:
   `subject.telemetry`.
9. **`mode`** (string) — broadcast intent (`race`, `qualifying`, `practice`, `replay`, …). Consumers
   MUST tolerate unknown values.
10. **`vehicles`** (array, no guaranteed order) — each entry has the **required** identity fields
    `slot_id`, `driver_name`, `vehicle_class`, and integer `position` (1 = leader). Lap/sector
    timing (`last_lap`, `best_lap`, `sector_times`, seconds) is **optional and nullable** —
    consumers treat its absence as a first-class case (e.g. render an em-dash), not an error.
    Consumers **sort by `position`** for running order. `sector_times`, when present, is the most
    recent **completed** lap, not one in progress.
11. **`subject`** (object) — the on-camera driver: `slot_id` (should reference a `vehicles` entry)
    and `driver_name`. Widgets highlight this driver and center the battle box on them. Identity is
    keyed off **`slot_id`, never `driver_name`** (two drivers can share a name).
12. **`relationship`** (object) — the subject's battle context: `gap_ahead` / `gap_behind` (seconds,
    null/absent when the subject leads/trails the field) and `battle_intensity` (`[0,1]`, opaque
    producer computation). Drives the battle box.

### Optional additive fields (consumer MUST tolerate absence)

13. Per-vehicle: **`notable`** (open object of booleans — `class_best_lap`, `session_best_lap`,
    `personal_best_lap`; unknown keys ignored), **`target_lap`** / **`delta_to_target`** (seconds),
    **`gap_to_leader`** (seconds; `0` for the leader; null/absent until determinable),
    **`car_number`** (string, rendered verbatim to preserve leading zeros), **`make`** / **`model`**
    (strings, verbatim). Consumers read the flags/values the producer set; they never derive them.
    **Richer-tower per-vehicle metrics (0.7.0, same additive category):** **`interval_ahead`**
    (seconds to the car immediately ahead, `position−1`; null/absent for the leader; rendered
    verbatim and NOT re-derivable class-relatively), **`pit_stops`** (integer ≥ 0 completed stops),
    **`in_pit`** (boolean; indicator shown only when true), **`tire_compound`** (verbatim label),
    **`tire_wear`** (`[0,1]` normalized, 0 fresh → 1 worn, clamped defensively), **`fuel`** (`[0,1]`
    normalized fuel *or* hybrid energy, 1 full → 0 empty, clamped). Kept **flat on `vehicle`** (the
    deliberate opposite of the `subject.telemetry` grouping). Consumed by the richer standings tower.
14. **`subject.telemetry`** (open object) — the subject's live inputs: **`throttle`** / **`brake`**
    (`[0,1]`, clamped defensively), **`speed`** (canonical **km/h**; consumers convert to mph
    deterministically), **`gear`** (integer; `0`=neutral→`N`, `-1`=reverse→`R`, positive verbatim).
    High-churn channel; each field independently optional so a partial feed renders what it has.
15. **`session`** (open object) — session status: **`flag`** (free-form string;
    `green`/`yellow`/`red`/`checkered`/`white`/`none` common), **`full_course_yellow`** /
    **`safety_car`** (booleans, independent), timed fields **`time_remaining`** / **`session_length`**
    (seconds), lap fields **`laps_remaining`** / **`total_laps`** / **`current_lap`** (integers), and
    optional **`basis`** (`"time"` | `"laps"`).
16. **Timed-vs-lap progress selection** (consumer-inferred): honor `basis` if set; else if
    `time_remaining` non-null → session clock; else if a lap field non-null → lap counter; else hide
    the progress readout. The widget MUST render `current_lap`/`total_laps` verbatim (`"LAP X OF Y"`)
    and MUST NOT derive the current lap from `total_laps − laps_remaining` — the counting convention
    is the producer's judgment. The endurance "time-certain + N laps" case is resolved by the
    producer flipping `basis:"laps"`, not by widget logic.

## Constraints

- The contract is battlecast's only coupling to the outside world. Do not add consumer logic that
  depends on producer internals or on a specific sim.
- Any contract change updates `SPEC.md` + `schema.json` + affected `fixtures/` together and keeps
  `spec/v1/compliance/` passing (`CONTRIBUTING.md`).
- Optional fields are additive-only; do not make a previously-optional field required without a
  breaking `schemaVersion` bump.
