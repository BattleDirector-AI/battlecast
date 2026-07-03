# Decision: lower-third widgets (driver identity + qualifying/sector timing)

**Issues:** #21 (driver lower-third), #22 (qualifying/sector lower-third) · **Epic:** #31 · **Milestone:** 0.3.0
**Status:** Accepted · **Date:** 2026-07-03

Specifies the two subject-driven lower-third widgets: what they render, when they
show, and what "idle" means. Both are **renderable from spec v1 today** (no schema
change); the only protocol touch is a non-normative latency recommendation added to
`spec/v1/SPEC.md`. Grounded in `docs/research/native-overlays.md` (LMU "Detail Panel"
and "Qualifying Information" panel).

## Summary

A **lower-third** is the bottom-of-screen name-tag a broadcast shows for the driver
currently on camera. Both widgets are **subject-driven** — they render info about the
single on-camera driver (`subject`), never the whole field — and both **fire on a
camera cut** (a change of `subject`) rather than rendering continuously.

- **#21 Driver lower-third** — identity: name, position, class.
- **#22 Qualifying/sector lower-third** — timing: best/last lap and sector times.

## Visibility model

Visibility layers in this order; every gate must pass before the widget renders:

```
config.visible  →  trigger (dwell | persistent)  →  subject validity / idle  →  render
```

- `config.widgets.<key>.visible` and the `?show=` / `?hide=` URL overrides gate
  everything, unchanged from the existing contract.
- Everything below is **consumer-side** behavior. The spec stays a pure data feed: it
  never says "show widget X". The producer's only role is to keep `subject` (and the
  referenced `vehicles[]` timing) current, and to emit promptly on change.

## Subject resolution

- **Valid** — `subject.slot_id` is present *and* resolves to a `vehicles[]` entry
  (needed for position / class / timing).
- **Degraded** — `subject.driver_name` present but `slot_id` unresolved → render name
  only, omit position/class/timing (#21); treat as idle (#22, which is all timing).
- **Invalid** — no `driver_name` and no resolvable `slot_id` → idle.
- Identity is keyed off **`slot_id`, never `driver_name`** — slot_id is the stable
  per-session key; two drivers can share a name.

## Camera-switch detection (edge-triggered)

The consumer tracks the previous snapshot's `subject.slot_id`. A **subject change** =
the new `slot_id` differs from the previous snapshot's, including `null → X`,
`X → Y`, and `X → null`. This is the "camera cut".

- **Edge-triggered, not level.** Producers send a full snapshot every tick; the widget
  fires only when the subject *changes*, never on an unchanged repeat.
- `A → (null) → A` re-fires (a genuine new cut to A); `A → A` does nothing.

## Producer latency (protocol)

Added to `spec/v1/SPEC.md` as a non-normative recommendation: on a `subject` change the
producer **SHOULD** emit a `state` snapshot promptly (≤ ~150 ms) rather than waiting for
the next cadence tick, so the lower-third fires responsively to the cut. Non-breaking,
no schema change; a steady-tick producer still works (fires up to one tick late).

## Trigger modes (Decision A — default `dwell`)

Per-widget config, two modes:

| Mode | Behavior | Feels like |
| --- | --- | --- |
| **`dwell`** *(default)* | On subject change → fire (animate in), show for `dwellSeconds`, then auto-hide even if the camera stays on that driver. A new change re-fires and **resets the dwell in place** — updates the card, no hide→show flicker. | Broadcast name-tag |
| **`persistent`** | Show whenever the subject is valid; hide when invalid. No timer. | Native rF2/LMU panel |

- Rapid switching (director scrubbing) updates the card in place and restarts the dwell,
  so it never flickers. An optional `minDwellSeconds` floor can guarantee readability.
- For these widgets `trigger: "persistent"` is equivalent to the existing
  `hideWhenIdle: true` with idle = "no valid subject", so `trigger` **subsumes**
  `hideWhenIdle` here.

## On (re)connect (Decision B — fire once)

On the first snapshot after page load or SSE reconnect, the widget **fires once** for
the current valid subject (so opening the Browser Source shows the current driver
briefly), then follows normal change-detection. Config `showOnConnect` (default
`true`). A class-best fire (#22) does **not** trigger on connect — only genuine new
achievements after the baseline snapshot.

## #21 — Driver lower-third (identity)

- **Data (spec v1):** `subject.driver_name`; resolved vehicle → `position`,
  `vehicle_class`.
- **Renders:** name, position (e.g. "P4"), class chip.
- **Fires on:** any subject change to a valid subject (all session modes — identity is
  always relevant).
- **Idle when:** subject invalid; or dwell elapsed (dwell mode).
- **Degraded:** name-only when slot_id unresolved.

## #22 — Qualifying / sector lower-third (timing)

- **Data (spec v1):** resolved vehicle's `best_lap`, `last_lap`, `sector_times[]`
  (S1/S2/S3, seconds).
- **Renders:** best + last lap and per-sector times. Most useful on a hot lap.
- **Mode-gating (Decision C):** by default shows only when
  `mode ∈ {qualifying, practice}` (config `modes`, overridable). Sector-times in a race
  are unusual as a standing panel; in a race prefer #21.
- **Race class-best fire (Decision C, extension):** independent of `modes`, when
  `fireOnClassBest` is set (default `true`) the widget **fires on a class-best event** —
  when the on-camera driver's most recent completed lap makes them the fastest in their
  `vehicle_class`. This surfaces the "fastest lap" moment during a race without keeping
  the panel up otherwise.
  - **Detection (v1, client-side):** class best = the minimum `best_lap` among vehicles
    sharing the subject's `vehicle_class`. Fire when the subject's `best_lap` becomes
    ≤ that minimum *and* it improved since the previous snapshot (edge-triggered — the
    subject *newly* holds the class best). The first post-connect snapshot only sets the
    baseline; a pre-existing class best does not fire.
  - Overlaps the race ticker (#27), which reports fastest-lap events field-wide; here it
    is scoped to the on-camera driver and rendered as the timing lower-third.
- **Idle when:** subject invalid; or no timing at all (`best_lap`, `last_lap`, and
  `sector_times` all absent); or mode-gated out with no class-best fire; or dwell
  elapsed.

## Config schema additions

Per-widget, all optional and defaulted, added to `config.widgets.<key>` alongside
geometry — only lower-third widgets read them (same pattern as `hideWhenIdle`). No
`configVersion` bump: additive + defaulted, like `canvas` and `hideWhenIdle`. Existing
profiles are unaffected.

```jsonc
{
  "trigger": "dwell",                    // "dwell" | "persistent"  (default "dwell")
  "dwellSeconds": 6,                     // dwell mode only          (default 6)
  "minDwellSeconds": 0,                  // optional anti-flicker floor
  "showOnConnect": true,                 // fire once for the current subject on load
  // #22 only:
  "modes": ["qualifying", "practice"],   // session modes it dwells on every cut
  "fireOnClassBest": true                // also fire on a class-best lap (esp. in race)
}
```

## Edge cases (specified)

- Unchanged subject repeated every tick → no re-fire (edge-trigger).
- Same `driver_name`, different `slot_id` → treated as a switch (key off slot_id).
- Subject resolves to no vehicle → degrade to name-only (#21) / idle (#22).
- Replay mode → same rules; frequent cuts handled by dwell-reset-in-place.
- Producer never populates `subject` → widget stays idle/hidden, no error.
- SSE reconnect → fire once per Decision B; class-best baseline re-established (no
  spurious class-best fire on the first snapshot).

## Testing (fixture-based, per CONTRIBUTING)

Assert rendered content, driven by fixtures + fake timers (as `LogoRotation` does):

- Fixtures: subject-A, subject-B (camera switch), no-subject (idle), unresolved-slot
  (degraded), no-timing (#22 idle), qualifying-mode vs race-mode (#22 gating), and a
  race pair where the subject sets a class best between snapshots.
- Behaviors: fire on change; dwell hides after `dwellSeconds`; re-fire resets the dwell;
  fire-once on connect; #22 mode-gating; #22 class-best fire in race; edge cases above.

## v1.x follow-ups (deferred; see #20)

Client-side derivation covers v1, but these would make #22 more robust:

1. **Reference / "target" time.** LMU shows a target (time to beat). v1 derives the
   field/class best client-side by scanning `vehicles[]`; a v1.x `session` block or a
   per-class reference time would give an authoritative target.
2. **Live sector semantics.** v1 renders the most recent *completed* lap's
   `sector_times`. A true hot-lap experience (sectors lighting up as they complete)
   needs a v1.x "current lap in progress" field; the spec should also state explicitly
   that `sector_times` is the last completed lap.
3. **Explicit fastest-lap / class-best flag.** A per-vehicle flag would remove the
   client-side class-best inference used for the race fire.
