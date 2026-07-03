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

## Design principle — dumb overlay, smart producer

battlecast **renders; it does not analyze the race.** Any *derived or semantic fact* —
"this lap is a class best", "this is the fastest lap", a target/reference time, how
contested a battle is — is **computed by the producer**, which holds authoritative,
complete race state, and delivered as a field. The overlay reads the field and presents
it; it **never scans `vehicles[]` to derive such facts itself.** This mirrors the
existing contract for `battle_intensity` (the producer computes it "from gaps, closing
rate, and recent position changes"; the consumer treats it as opaque).

The overlay's own logic is limited to **presentation**: noticing that a producer-provided
value changed, and timing/animating the display (dwell, fade). Consequence: any feature
that needs a derived fact (the #22 class-best flash, a target time) is **gated on the
producer providing that field** — see the v1.x additions — not on client-side derivation.

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
- **Race class-best fire (Decision C, extension):** independent of `modes`, when the
  **producer flags** the on-camera driver's lap as a class best, #22 fires to surface it —
  the "fastest lap" moment — even though the panel is otherwise mode-gated out of races.
  Per the dumb-overlay principle, the **producer owns the judgment** of what a class best
  is (v1.x `notable` flags, below); the overlay fires when the subject's flag says so and
  does **not** compute it by scanning lap times. The overlay's only logic is presentation:
  fire when `notable.class_best_lap` for the subject's vehicle turns true, then dwell.
  Config `fireOnClassBest` (default `true`) lets a broadcaster disable the flash. **Gated
  on the v1.x `notable` field**; the rest of #22 ships on v1. Overlaps the race ticker
  (#27), which reports the same producer flags field-wide; here it is scoped to the
  on-camera driver and rendered as the timing lower-third.
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
  "fireOnClassBest": true                // fire when the producer flags a class-best lap
                                         //   (needs the v1.x `notable` field; no-op until then)
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
  race pair where the producer flags the subject's lap `notable.class_best_lap` (v1.x).
- Behaviors: fire on change; dwell hides after `dwellSeconds`; re-fire resets the dwell;
  fire-once on connect; #22 mode-gating; #22 class-best fire in race; edge cases above.

## v1.x additions — the producer fields these features need (see #20)

Per the dumb-overlay principle these are **producer-computed fields the overlay renders**,
not client-side derivations. #21 and #22's core timing display ship on v1 (direct fields);
the class-best flash and target time wait on these:

1. **Lap notability — per-vehicle `notable` flags.** Extend each `vehicles[]` entry with
   producer-set booleans whose meaning the producer owns, e.g.
   `notable: { class_best_lap, session_best_lap, personal_best_lap }`. The overlay fires
   #22's class-best flash when the subject's `notable.class_best_lap` turns true, and the
   tower/ticker (#27, #28) can badge from the same flags. Forward-compatible: unknown
   `notable` keys are ignored per the spec's tolerance ethos. Generalizes to "…or whatever
   the producer deems notable" — new notability is a new flag, not new overlay logic.
2. **Reference / "target" time — producer-provided.** The time-to-beat the overlay should
   show (e.g. per-vehicle `target_lap` seconds, optionally `delta_to_target`). The producer
   decides what "target" means (class pole, session best, a chosen reference); the overlay
   just displays it — it does not scan the field to guess a target.
3. **Live sector semantics.** State explicitly that `sector_times` is the last *completed*
   lap, and add a "current lap in progress" representation for true hot-lap
   sector-by-sector timing.

The reference producer (`producers/mock`) gains these alongside the spec bump so #22's
full behavior can be built and tested against it.
