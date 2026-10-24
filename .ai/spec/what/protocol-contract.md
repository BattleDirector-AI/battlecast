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
   Optional additive top-level objects: `session`, `event` (rule 23); optional additive
   top-level arrays: `race_events` (rule 22), `info_lines` (rule 23). Optional additive object
   under subject: `subject.telemetry`.
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
21. **Malformed `vehicles` is tolerated.** A payload whose `vehicles` is not an array (`{}`, a
    string, `null`) is treated by every widget as an empty array. An entry of a `vehicles` array
    that is not an object (`null`, a number, a string, an array — an array is not an object whatever
    properties it carries) is treated by every widget as absent: it is never a row, never a match
    for `subject.slot_id`, and never counts toward a class rank, a class car count, a total, or a
    column's sizing — the widget renders exactly as if the entry were not in the array, wherever it
    sits.

    An object entry is **listable** when it has a usable `slot_id` and a usable `position`.
    - A `slot_id` is usable when it is a non-empty string; whitespace-only counts as usable, since
      it is an opaque key. `""`, a number, `null` and a missing key are not usable.
    - A `position` is usable when it is a finite number. `0`, a negative number and `2.5` are
      usable (the schema's integer-from-1 range is not enforced) and sort as the numbers they are.
      `null`, a string, `NaN`, `Infinity` and a missing key are not usable.

    An entry that is not listable is absent for every consumer that lists, counts, sizes or looks
    up neighbours by position: the tower, `/grid`, `/results`, and the battle box's ahead/behind
    lookup. Finding the on-camera subject needs only a usable `slot_id`: an entry with a usable
    `slot_id` and no usable `position` still matches `subject.slot_id`. No widget throws on
    either. Widget specifics: `widgets.md` rules 14a, 59, and 66.

    **Entries sharing a `slot_id`.** A `slot_id` is one car. When several object entries carry the
    same usable `slot_id` (compared as exact strings), the car is the **first listable entry** with
    that `slot_id`, in array order; when none of them is listable, it is the first entry with that
    `slot_id`. Every other entry with that `slot_id` is absent in the sense above: never a row,
    never a match for `subject.slot_id`, never named as the car ahead or behind, and never counted
    toward a class rank, a class car count, a total, or a column's sizing. The widget renders
    exactly as if only the winning entry were in the array. The tower, `/grid`, `/results`, the
    battle box's class chip and neighbours, the driver lower-third, the qualifying lower-third and
    the on-board HUD all read the same winning entry, so the subject's card, its chip, and its row
    in a list show the same car's data. Duplicates never stop a widget rendering.

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
17. **Lap-deficit fields** (per-vehicle, same additive category): **`laps_behind_leader`**,
    **`laps_behind_ahead`**, **`laps_behind_class_leader`** — integers ≥ 0, whole laps behind the
    overall leader, the car immediately ahead, and the vehicle's own class leader respectively.
    `0`/null/absent = same lap. The tower shows a lap deficit in place of the matching time
    (`widgets.md` rules 33–35). A lapped vehicle's `gap_to_leader` stays a real time and is never a
    `0` placeholder. The class field is a producer fact, not re-derivable from the overall one.
    Decision record: `docs/decisions/0012-lap-deficit-fields.md`.
18. **Local-yellow fields** (additive): per-vehicle **`yellow_involved`** (boolean — the producer
    judges the car stopped or crawling, or off the track surface, inside an active local yellow
    and not in the pit lane; a car only driving through is not involved) and
    **`session.sector_flags`** (array of strings in lap order, index 0 = sector 1; `yellow`,
    trimmed and case-insensitive, marks a local yellow, anything else does not). Both are producer judgments: the overlay never infers
    involvement or a sector's flag. The tower marks involved rows (`widgets.md` rule 43) and Race
    Control names the yellow sectors (rule 44). Decision record:
    `docs/decisions/0016-local-yellow-fields.md`.
19. **Finish status** (additive): per-vehicle **`finish_status`**, an integer code — `0` running,
    `1` finished (this car has taken the chequered flag), `2` DNF, `3` DQ; null, absent, or any
    other integer reads as running. Per car and producer-owned: the overlay never infers it from
    the session flag, laps, or position. The tower marks finished, DNF, and DQ rows when `mode` is
    `race` or `results`, under any session flag (`widgets.md` rule 45). Decision record: `docs/decisions/0017-finish-status-field.md`.
20. **Single-class session** (additive): **`session.multiclass`** (boolean or null) says whether
    the session has more than one vehicle class. Exactly `false` means single-class; `true`
    means two or more; null, absent, or no `session` means the producer does not say. Producer
    fact: the overlay never infers it from `vehicles[]` (not by counting distinct
    `vehicle_class` values, not by recognizing a class string such as `"Default"`). With the
    broadcaster's `theme.classTags` at `auto`, exactly `false` hides every class tag
    (`widgets.md` rules 60–64); every other value leaves them showing. Decision record:
    `docs/decisions/0022-single-class-tags.md`.
22. **Race events** (additive): top-level **`race_events`**, the producer's recent race events
    as a short rolling list, oldest first, or null. It is not an SSE event type: it rides in
    every `state` snapshot, and the producer keeps each event listed for a while, then drops
    it. Each entry carries a required `id` (a string, unique and stable: the same event has the
    same id in every snapshot that lists it, and no two events share one), a `type`
    (`fastest_lap`, `leader_change`, `retirement`, or `penalty` in this revision), the required
    `driver_name`, an optional `slot_id`, an optional `vehicle_class` (a string makes it a
    class event; absent or null, an overall one; an event that is both overall and a class's,
    such as an overall fastest lap that is also its class's, is sent once, as the overall
    event), the field its type requires — `lap_time`
    (seconds) for `fastest_lap`, `finish_status` (`2` DNF or `3` DQ, rule 19's codes) for
    `retirement`, `penalty` (short text) for `penalty` — and an optional free-text `detail`.
    Events are producer judgments: the overlay never derives one from `vehicles[]` or from the
    difference between snapshots. The race update box consumes it (`widgets.md` rules 69–75).
    An entry that is not an object, has an unknown `type`, or lacks its `id` or a field its
    type requires is skipped, never an error, and a `race_events` that is not an array holds
    no events. Decision record: `docs/decisions/0023-race-update-box.md`.
23. **Event and info lines** (additive): top-level **`event`**, an open object describing the
    event the session belongs to (the weekend, not the live session), or null, with three
    optional fields: **`name`** (string, the event's name), **`round`** (integer, at least 1,
    the round of a championship), and **`track`** (string, the circuit's name). Top-level
    **`info_lines`**, an array of strings or null: free-text lines the producer wants on screen,
    shown verbatim apart from trimming (the panel uppercases only the event header and shows a
    repeated line once). Both are producer-authored text: the overlay never builds an event name, a
    round, a track or a line from `vehicles[]`, `session` or anything else. The info panel
    consumes them (`widgets.md` rules 76–82). A field of `event` that is absent, null, or of the
    wrong type (a non-integer or a `round` below 1, a blank `name` or `track`) counts as absent
    and the other fields still render; an `event` that is not an object has no fields. An
    `info_lines` entry that is not a string, or is blank, is skipped, and an `info_lines` that is
    not an array holds no lines. Neither is ever an error. Decision record:
    `docs/decisions/0024-info-panel.md`.
15. **`session`** (open object) — session status: **`flag`** (free-form string;
    `green`/`yellow`/`red`/`checkered`/`white`/`none` common), **`full_course_yellow`** /
    **`safety_car`** (booleans, independent), timed fields **`time_remaining`** / **`session_length`**
    (seconds), lap fields **`laps_remaining`** / **`total_laps`** / **`current_lap`** (integers), and
    optional **`basis`** (`"time"` | `"laps"`), and **`multiclass`** (boolean or null; rule 20).
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
