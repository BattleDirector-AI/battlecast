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
  - **`gap_to_leader`** (number, seconds) — The time gap from this vehicle to the
    **overall** classification leader (`position` 1) — the interval a broadcast tower
    prints against each row. `0` for the leader; null or absent until it can be
    determined (e.g. before any lap is completed). The producer owns what the metric
    measures (a lap-time delta in a qualifying-style session, an on-track time gap in a
    race), so consumers just render it. A grouped-by-class tower MAY show a
    **gap-to-class-leader** by subtracting the class leader's `gap_to_leader` from a
    car's own — that is exact arithmetic on producer-authored values, not a forbidden
    re-derivation of the gap itself.
  - **`car_number`** (string) — the vehicle's racing number, rendered **verbatim** as a
    string (e.g. `"44"`, `"1"`, `"007"`) so leading zeros and any numbering scheme
    survive. Distinct from `slot_id`, which is an opaque identity key, not a display
    number. Optional; null or absent when not supplied.
  - **`make`** / **`model`** (string) — the vehicle's manufacturer (e.g. `"Ferrari"`) and
    model/chassis (e.g. `"296 GT3"`), rendered verbatim and often shown together. Distinct
    from `vehicle_class` (the racing category). Both optional; null or absent when not
    supplied. Consumed by the on-board HUD's configurable driver/vehicle identity (#26).
  - **`interval_ahead`** (number, seconds) — the time gap to the car immediately **ahead**
    in overall running order (`position` − 1) — the "interval" column a broadcast tower
    prints beside the gap-to-leader. Distinct from `gap_to_leader` (which is to `position`
    1). `null` or absent for the leader (no one ahead) or until it can be determined. The
    producer owns what the metric measures (an on-track time gap in a race, a lap-time
    delta in a qualifying-style session), so consumers render it verbatim and **MUST NOT**
    derive it by scanning `vehicles[]`. Note the asymmetry with `gap_to_leader`: a grouped
    tower MAY compute a gap-to-*class*-leader by exact subtraction of producer values, but a
    class-relative interval is **not** re-derivable, so a grouped tower renders
    `interval_ahead` verbatim (the gap to the car ahead overall) and makes no class-relative
    claim.
  - **`pit_stops`** (integer ≥ 0) — count of **completed** pit stops this session. Optional;
    null or absent when not tracked.
  - **`in_pit`** (boolean) — `true` while the vehicle is currently in the pit lane / box.
    Absent or false means on track; a consumer renders an in-pit indicator only when true.
  - **`tire_compound`** (string) — the current tires' compound label, rendered **verbatim**
    (e.g. `"S"`, `"M"`, `"H"`, `"wet"`, `"C3"`); producers define their own compound names.
    Optional; null or absent when not supplied.
  - **`tire_wear`** (number in `[0, 1]`) — current-tire wear, **normalized** `0` = fresh,
    `1` = fully worn. A normalized fraction (rather than age-in-laps or percent) lets the
    consumer render a wear bar with no unit claim, the same discipline the on-board HUD's
    throttle/brake bars take; a producer measuring wear another way MUST convert before
    emitting. Optional; the consumer clamps to `[0, 1]` defensively.
  - **`fuel`** (number in `[0, 1]`) — fuel **or** hybrid-energy remaining, **normalized**
    `1` = full, `0` = empty. Deliberately one field for either resource — the producer
    defines which (combustion fuel or hybrid/EV energy) and the overlay renders a neutral
    resource bar making no ICE-vs-EV claim. Optional; the consumer clamps to `[0, 1]`.

  - **`laps_behind_leader`** (integer ≥ 0) — whole laps this vehicle is behind the
    **overall** leader (`position` 1). `0`, null, or absent means on the lead lap. A time
    gap cannot say "one lap down", so this field carries the lap deficit and a tower shows
    it (`+1 LAP`, `+2 LAPS`) in place of the `gap_to_leader` time whenever it is 1 or more.
    A lapped vehicle's `gap_to_leader` **SHOULD** still carry its real time gap in seconds
    (a grouped tower subtracts it, see below) and **MUST NOT** carry a `0` placeholder —
    `0` means the leader.
  - **`laps_behind_ahead`** (integer ≥ 0) — whole laps behind the car immediately
    **ahead** in overall running order (`position` − 1): the lap-deficit companion of
    `interval_ahead`, shown in the interval column in place of the time when it is 1 or
    more. `0`, null, or absent means on the same lap as the car ahead; null or absent for
    the leader.
  - **`laps_behind_class_leader`** (integer ≥ 0) — whole laps behind the leader of the
    vehicle's **own** `vehicle_class`. `0`, null, or absent means on the class lead lap.
    In a multi-class race a class leader is routinely laps down overall while leading its
    class, so a grouped-by-class tower needs this field for its gap-to-class-leader cell.
    It is **not** re-derivable from `laps_behind_leader`: the difference of two whole-lap
    counts can be off by one lap, so unlike the gap-to-class-leader *time* (exact
    subtraction, above) the class lap deficit is a producer fact.

  All three lap-deficit fields are race concepts; a producer omits them in a lap-timed
  (qualifying / practice) session. Consumers read them, never derive them, and treat a
  value that is not a number ≥ 1 as "on the same lap".

  - **`yellow_involved`** (boolean) — the vehicle is involved in an active **local**
    yellow: the producer judges it stopped or crawling (not merely lifting for the flag),
    or off the track surface, inside the yellow zone, and not in the pit lane. A car that
    only drives through a yellow sector is **not** involved. `false`, null, or absent
    means not involved. No sim reports involvement directly, so this is the producer's
    own judgment; it does not claim to identify which car *caused* the yellow. A producer
    MAY set it without sending `session.sector_flags` (a sim that knows a local yellow is
    out but not where). Consumers read it and **MUST NOT** infer it from speed, position,
    or `session.sector_flags`. A tower marks the row of a vehicle whose value is exactly
    `true`. Which sector is yellow lives on `session.sector_flags`, below.
  - **`finish_status`** (integer) — whether the vehicle has finished the race, as a code:
    `0` running (has not taken the chequered flag), `1` finished (has taken it), `2` DNF
    (retired), `3` DQ (disqualified). The codes match rFactor 2 `mFinishStatus` (Le Mans
    Ultimate exposes the same field), so a producer for those sims copies the value; a
    producer for a sim without a per-car finish field (iRacing) works it out from each
    car's own line crossing after the chequered flag. It is **per car**: a car becomes `1` when *it*
    crosses the line under the chequered flag, not when the leader does, so cars still on
    their last lap stay `0`. Null or absent means unknown and renders like `0`. Any other
    integer is a code this revision does not define; consumers tolerate it and render it
    like `0`. It is a race concept: a producer **SHOULD** send it only in `race` and
    `results`, and a tower shows it only when `mode` (trimmed, case-insensitive) is `race`
    or `results`, ignoring it in every other mode. It is independent of `session.flag`: a
    car that retires under green is `2` at once.
    Consumers read it and **MUST NOT** infer it from `session.flag`, laps, or position.

  These six per-vehicle metrics are consumed by the LMU-style richer standings tower — an
  **interval column** beside the gap-to-leader, plus config-gated **pit / tire / fuel**
  indicators a broadcaster enables for endurance density. They are kept **flat on
  `vehicle`** (not grouped into a sub-object) — the deliberate opposite of the
  `subject.telemetry` grouping — because `vehicle` is already a uniformly-flat, mixed-cadence
  object and these metrics' churn does not split cleanly (`interval_ahead` / `tire_wear` /
  `fuel` drift every tick; `pit_stops` / `in_pit` / `tire_compound` change only at a stop).
  See `docs/plans/0.7.0-richer-tower.md`.

  **Contract note — no `schemaVersion` bump.** These fields were added in a minor
  revision of v1; `schemaVersion` stays `"1"`. That is permitted because `schemaVersion`
  is reserved for *breaking* changes, and `schema.json` sets `additionalProperties: true`
  at every level: a producer may emit these today and an older consumer that has never
  heard of them simply ignores them, while a newer consumer tolerates their absence from
  an older producer. See *Versioning policy* above.
- **`subject`** (object) — The on-camera driver identity: a `slot_id` (which should
  reference one of the `vehicles` entries) and a `driver_name`. Widgets highlight this
  driver in the tower and center the battle box on them.

  - **`telemetry`** (object, **OPTIONAL, ADDITIVE**) — the on-camera subject's
    **live-input telemetry**, driving the on-board HUD overlay (#26). Every field is
    producer-computed per the *dumb overlay, smart producer* principle in
    [`docs/decisions/0002-lower-third-widgets.md`](../../docs/decisions/0002-lower-third-widgets.md):
    the producer holds the authoritative vehicle inputs and the consumer only renders what
    it is handed and **MUST tolerate its absence**. A payload with **no**
    `subject.telemetry` still validates and every existing widget still renders. The object
    is open, so unknown live-input keys are ignored.

    - **`throttle`** / **`brake`** (number in `[0, 1]`) — throttle and brake application,
      `0` = off/closed, `1` = full. The HUD renders each as a fill bar and clamps to
      `[0, 1]` defensively.
    - **`speed`** (number) — vehicle speed in **canonical km/h**. Fixing a canonical unit
      lets the consumer offer a **km/h vs mph display toggle** by converting deterministically
      (`mph = km/h × 0.621371`): the on-board HUD renders km/h by default and converts to mph
      when the broadcaster selects it (a per-widget `speedUnit` config knob, `?unit=mph` on the
      standalone `/onboard` route). Producers measuring in another unit MUST convert to km/h
      before emitting.
    - **`gear`** (integer) — the selected gear. By convention `0` is neutral (rendered
      `N`) and `-1` is reverse (rendered `R`); positive integers are the forward gears,
      rendered verbatim. Producer-owned — the consumer does not derive gear from speed.

    **Why a sub-object, not flat fields.** `telemetry` is grouped under `subject` (rather
    than spread across its top level) because it is a **high-churn** channel a producer
    populates *every tick*, distinct from the stable identity fields (`slot_id` /
    `driver_name`) that change only on a camera cut. Keeping the two cadences in separate
    structures signals which block is the live feed, and namespaces future live-input
    fields (rpm, drs, steering) so they land additively too. The whole sub-object is
    optional (omit it when there is no live telemetry, e.g. a parked car), and each field
    within is independently optional so a partial feed still renders what it has.
- **`relationship`** (object) — The battle context for the on-camera subject:
  `gap_ahead` and `gap_behind` (seconds to the cars immediately ahead/behind in
  running order; null or absent when the subject leads or trails the field), and
  `battle_intensity` (a number in `[0, 1]` describing how close/contested the battle
  is — 0 is clear air, 1 is maximally contested). This drives the battle box.
- **`session`** (object, **OPTIONAL, ADDITIVE**) — Session-level broadcast state
  driving the session status overlay. Like the vehicle-level optional fields above,
  every field is producer-computed per the *dumb overlay, smart producer* principle in
  [`docs/decisions/0002-lower-third-widgets.md`](../../docs/decisions/0002-lower-third-widgets.md):
  the producer holds authoritative session state, and the consumer only renders what it
  is handed and **MUST tolerate its absence**. A payload with **no** `session` still
  validates and every existing widget still renders. The object is open, so unknown
  session keys are ignored.

  - **`flag`** (string) — the current session flag: commonly `"green"`, `"yellow"`,
    `"red"`, `"checkered"`, `"white"`, or `"none"`, but **free-form** — the producer
    owns the flag state and consumers tolerate unknown values. A `"yellow"` here is a
    local/sector flag; a session-wide caution is `full_course_yellow`.
  - **`full_course_yellow`** (boolean) — the whole course is under caution, distinct
    from a local `yellow` `flag`. Absent or false means no FCY.
  - **`safety_car`** (boolean) — a safety/pace car is deployed. Independent of
    `full_course_yellow` (either may be set without the other). Absent or false means
    none.
  - **`sector_flags`** (array of strings) — the local flag state of each track sector,
    in lap order: index 0 is sector 1, index 1 is sector 2, and so on, for however many
    sectors the producer's sim has (commonly 3). Index 0 is sector 1 whatever the sim's
    own indexing; a producer remaps the sim's sector order and translates its values.
    `"yellow"` (trimmed, case-insensitive) marks a sector under a local yellow; any other
    value — `"green"`, `"none"`, a sim-specific string — means no local yellow there, and
    consumers tolerate unknown values. Null or absent means no sector information, which
    is not the same as all-clear: a producer whose sim exposes no per-sector flag
    (iRacing, for one) **SHOULD** omit the field rather than send all-green, and a
    producer that has sector flags **SHOULD** send every sector. It says *where* a local
    yellow is; *who* is involved is the per-vehicle `yellow_involved`, above. A local
    yellow is distinct from
    `full_course_yellow`: under a full-course caution the producer may still send sector
    flags, and a consumer showing the full-course caution need not repeat them.
  - **`multiclass`** (boolean or null) — whether the session has more than one vehicle
    class. `false` says the session is single-class: every car shares one class, so a
    consumer **MAY** hide its class tags (class chips, class-rank badges, class group
    headers), which would otherwise all repeat one label, often a producer's placeholder
    for a sim that reports no class. `true` says the session has two or more classes. Null
    or absent gives no signal either way. It is the **producer's** judgment: a consumer never infers it from `vehicles[]`, neither by
    counting distinct `vehicle_class` values nor by recognizing a placeholder class name
    such as `"Default"`, which is one producer's convention and not part of this contract.
    A producer that knows the session's classes **SHOULD** send it on every snapshot.
  - **`time_remaining`** / **`session_length`** (number, seconds) — the countdown clock
    and total length of a **timed** session; `session_length` is the progress
    denominator. Null or absent in a lap-limited session.
  - **`laps_remaining`** / **`total_laps`** / **`current_lap`** (integer) — the lap state
    of a **lap-limited** session. `current_lap` is the **producer-owned** lap the leader
    is on (the X) and `total_laps` the scheduled total (the Y), so the widget renders
    `"LAP X OF Y"` **verbatim** — it MUST NOT derive the current lap from
    `total_laps` − `laps_remaining`, because the counting convention (does the lap in
    progress count? how is the final lap numbered?) is the producer's judgment, not the
    overlay's. When `current_lap` is absent the consumer shows `laps_remaining` /
    `total_laps` as given (e.g. `"12 LAPS REMAINING"`) rather than inventing a lap number.
    All null or absent in a timed session.
  - **`basis`** (string) — an optional explicit `"time"` \| `"laps"` override of the
    progress mode.

  **Timed vs lap-limited — automatic selection.** The consumer infers which progress
  readout to draw; the producer only disambiguates the endurance case via `basis`:

  1. If `basis` is set, honor it (`"time"` → clock, `"laps"` → lap counter).
  2. Else if `time_remaining` is non-null → session clock.
  3. Else if `laps_remaining` / `total_laps` / `current_lap` is non-null → lap counter.
  4. Else → hide the progress readout (flag / FCY / SC can still show).

  The endurance "time-certain + N laps" case — where both `time_remaining` and
  `laps_remaining` are briefly non-null near the end — is resolved by the **producer**,
  not the widget: on the final timed lap the producer sets `basis:"laps"` and populates
  `laps_remaining`, so the widget flips clock → lap counter automatically. The widget
  carries no endurance-specific logic; it just obeys `basis`.

  **Contract note — no `schemaVersion` bump.** `session` was added in a minor revision
  of v1; `schemaVersion` stays `"1"`. As with the vehicle-level optional fields above,
  this is permitted because `schemaVersion` is reserved for *breaking* changes and
  `schema.json` sets `additionalProperties: true` at every level: a producer may emit
  `session` today and an older consumer that has never heard of it simply ignores it,
  while a newer consumer tolerates its absence from an older producer. See *Versioning
  policy* above.

- **`race_events`** (array, **OPTIONAL, ADDITIVE**) — the producer's **recent** race
  events, **oldest first**: fastest laps, leader changes, retirements, penalties. It is
  not an SSE event type and not a delta. It rides in every `state` snapshot as a short
  **rolling list**: the producer adds an event when it happens, keeps listing it for a
  while (it **SHOULD** keep each event for at least 30 seconds, so a consumer that misses
  a few snapshots still sees it), then drops it, and it **SHOULD** keep at most the 20
  most recent. Null or absent means no recent events. The events are the **producer's**
  judgment (dumb overlay, smart producer): a consumer **MUST NOT** derive an event from
  `vehicles[]` or from changes between snapshots. Each entry carries:
  - **`id`** (string, required) — unique and stable: the same event carries the same id
    in every snapshot that lists it, and the producer never reuses an id for a different
    event while it runs. Because the list repeats, the id is how a consumer shows each
    event **once**. A consumer that stays connected remembers the ids it has shown, so a
    producer **SHOULD** keep ids unique across its own restarts too (for example by
    prefixing a run or session key).
  - **`type`** (string, required) — `fastest_lap`, `leader_change`, `retirement`, or
    `penalty` in this revision. Later revisions may add types; a consumer skips a type it
    does not know.
  - **`driver_name`** (string, required) — the driver the event is about.
  - **`slot_id`** (string, optional) — the event's vehicle, matching a `vehicles` entry
    while the car is in the field.
  - **`vehicle_class`** (string or null, optional) — a string makes this a **class**
    event (the fastest lap or new leader *of that class*); null or absent makes it an
    overall event. An event that is both overall and a class's (the overall fastest lap
    is also its class's fastest lap; an overall leader change is also the top class's)
    **SHOULD** be sent once, as the overall event: a consumer cannot tell the two entries
    are the same event without deriving it.
  - **`lap_time`** (number, seconds) — required for `fastest_lap`.
  - **`finish_status`** (integer) — required for `retirement`: `2` DNF (retired) or `3`
    DQ (disqualified), the same codes as the per-vehicle `finish_status`.
  - **`penalty`** (string) — required for `penalty`: short producer text, rendered
    verbatim (`Drive-through`, `+5s`, `Stop-go 10s`).
  - **`detail`** (string, optional) — a free-text second line for any type (`Lap 14`,
    `Gearbox`), rendered verbatim.

  A consumer skips an entry it cannot read — not an object, no `id`, an unknown `type`,
  or a missing field its type requires — and renders the rest. battlecast's race update
  box shows each new event once, one at a time, and treats every event already listed
  when it starts as already shown, so reloading a Browser Source never replays old
  events. A worked example with one event of each type is
  [`fixtures/race-events.json`](fixtures/race-events.json). Added in a minor revision of
  v1; `schemaVersion` stays `"1"`.

- **`event`** (object, **OPTIONAL, ADDITIVE**) — the **event** this session belongs to:
  the weekend or race meeting, not the live session (that is `session`). It changes
  rarely, typically once per event. Null or absent means the producer does not say. All
  of its fields are optional and nullable:
  - **`name`** (string) — the event's name (`Spa 6 Hours`).
  - **`round`** (integer, at least 1) — the event's round number in its championship. A
    consumer shows it as a round number (battlecast renders `ROUND 3`), so a producer
    with an event whose round has a name rather than a number (a finale, a
    non-championship race) puts that in `name` and leaves `round` out.
  - **`track`** (string) — the circuit's name (`Spa-Francorchamps`).

  The fields are the **producer's** text; a consumer **MUST NOT** derive any of them from
  other fields. battlecast trims `name` and `track` and shows them in an uppercased header
  (`ROUND 3 · SPA 6 HOURS · SPA-FRANCORCHAMPS`), and changes nothing else. A consumer treats a field that is absent, null, of the
  wrong type, blank, or (for `round`) not an integer of at least 1 as absent, and renders
  the others.

- **`info_lines`** (array of strings, **OPTIONAL, ADDITIVE**) — free-text lines the
  producer wants on screen: commentary, a note about the session, a reminder of what is
  next (`Live from the Ardennes`, `Race 2 starts at 15:00 CET`). Each line is shown
  **verbatim**: battlecast trims surrounding whitespace and keeps the case and everything
  else. battlecast's info panel shows one line at a time, cycling through them on a dwell,
  followed by the broadcaster's own lines from the overlay profile; a line that repeats an
  earlier one (in the list or among the broadcaster's lines) is shown once, and when the list
  changes, the line on screen stays if it is still listed. A producer **SHOULD** keep each line
  short enough to fit on one line of a lower-screen strip (roughly 80 characters) and the
  list short; it **SHOULD** send the same list, in the same order, while the lines are
  unchanged. Null or absent means no lines. A consumer skips an entry that is not a
  string, or is blank, and renders the rest.

  A worked example carrying both is
  [`fixtures/event-info.json`](fixtures/event-info.json). Both were added in a minor
  revision of v1; `schemaVersion` stays `"1"`.

## Fixtures and compliance

Concrete example payloads live in [`fixtures/`](fixtures/) and are the basis for
battlecast's fixture-based behavioral tests (see `CONTRIBUTING.md`): a fixture is a
complete spec-v1 `state` payload, and tests drive the widgets with it and assert on
the rendered content. Producer authors can validate their own SSE endpoint against
this contract with the [compliance harness](compliance/).
