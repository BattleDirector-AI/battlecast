# Widgets

Behavioral rules for what each widget renders and when it shows. All widgets consume the same
`spec/v1` snapshot and obey *dumb overlay, smart producer* — they present producer-provided values,
never derive semantic facts. Implementation lives under `app/src/routes/*`; see `how/renderer.md`.

## Behavioral Rules

### Standings tower (`/tower`)

1. Renders the running order: sort `vehicles[]` by `position` ascending. Highlights the `subject`
   driver's row (keyed by `slot_id`). Shows lap/gap timing per row.
2. In qualifying, the leader's row shows the pole lap time, not a "LEADER" gap.
3. **Class display** (`classDisplay`): `inline` (one overall list, each row badged with its class
   position) or `grouped` (per-class sections, positions restarting within each class). Only the
   tower reads this knob.
4. A grouped-by-class tower MAY show a gap-to-class-leader by subtracting the class leader's
   `gap_to_leader` from a car's own — exact arithmetic on producer values, not a forbidden
   re-derivation.

### Battle box (`/battle`)

5. Centers on the `subject`, showing `gap_ahead` / `gap_behind` and a `battle_intensity` meter.
6. Renders an **explicit idle state** when there is no active battle. It is idle outside a racing
   mode, or when the on-camera car has no adjacent car to fight (`isActiveBattle`).

### Subject-driven lower-thirds (`/driver` #21, `/qualifying` #22)

A lower-third is the bottom-of-screen name-tag for the driver currently on camera. Both are
subject-driven and **fire on a camera cut** (a change of `subject.slot_id`), not continuously.
Full rules: `docs/decisions/0002-lower-third-widgets.md`.

7. **Visibility layering** (every gate must pass): `config.visible` → trigger (`dwell` |
   `persistent`) → subject validity / idle → render. `?show=`/`?hide=` override `visible`.
8. **Subject resolution:** *valid* = `slot_id` resolves to a `vehicles` entry; *degraded* =
   `driver_name` present but `slot_id` unresolved (render name only for #21, treat as idle for #22);
   *invalid* = neither → idle. Keyed off `slot_id`, never `driver_name`.
9. **Edge-triggered camera cut:** fire only when the new `slot_id` differs from the previous
   snapshot's, including `null→X`, `X→Y`, `X→null`. `A→A` does nothing; `A→null→A` re-fires.
10. **Trigger modes:** `dwell` (default) — fire on change, show for `dwellSeconds`, then auto-hide
    even if the camera stays; a new change resets the dwell **in place** (no hide→show flicker).
    `persistent` — show whenever the subject is valid, no timer.
11. **On (re)connect:** fire once for the current valid subject (`showOnConnect`, default true),
    then follow change detection. A class-best fire does NOT trigger on connect.
12. **#21 driver lower-third** renders identity: name, position (`P4`), class chip. Fires on any
    subject change to a valid subject, in all modes. Degrades to name-only when `slot_id` unresolved.
13. **#22 qualifying/sector lower-third** renders timing: best/last lap, per-sector times, and
    target/delta when present. **Mode-gated** by `modes` (default `["qualifying","practice"]`).
    Independently, when the producer flags the subject's `notable.class_best_lap` true, it fires a
    class-best flash even in a race (`fireOnClassBest`, default true) — firing on the transition to
    true, never by scanning lap times. Idle when subject invalid, no timing at all, or mode-gated
    out with no class-best fire.

### Race Control (`/racecontrol`, session status #25)

14. Renders session status from the optional `session` object: current `flag`, `full_course_yellow`,
    `safety_car`, and the timed/lap progress readout (see `what/protocol-contract.md` rule 16).
    Renders whenever visible and there is session content, in every mode. Not a lower-third and not
    class-aware — the trigger/`modes`/`classDisplay` knobs are inert for it.

### On-board HUD (`/onboard`, #26)

15. Renders the subject's live `subject.telemetry`: throttle/brake fill bars (clamped `[0,1]`),
    speed, and gear (`0`→`N`, `-1`→`R`). Reads telemetry every tick; idles automatically when there
    is no telemetry content (e.g. a parked car).
16. **Speed unit** (`speedUnit`, `kmh` default | `mph`; `?unit=mph` on the standalone route). The
    producer emits canonical km/h; the widget converts to mph deterministically when selected.
17. **Driver/vehicle identity** (`driverInfo`) — toggles `name` / `number` / `class` / `make` /
    `model` independently (name+number on by default), sourced from the additive per-vehicle fields.
18. **Hand-off** (`waitForLowerThird`, default true): in `/all`, the HUD holds off while the driver
    lower-third (#21) is showing its dwell, then reveals when the lower-third wipes out, so the two
    never overlap. Only applies in `/all`; the standalone `/onboard` route has nothing to wait for.

### Composite & takeover routes

19. **`/all`** composes configured widgets onto the fixed canvas by `z` order (see
    `what/overlay-config.md`); each widget still applies its own visibility/idle logic.
20. **`/logos`** cycles sponsor logos (`logoRotation`: images, `perSlotSeconds`, `order`).
21. **`/grid`** (pre-race starting grid) and **`/results`** are full-screen **opaque takeover**
    slides — full-bleed but NOT transparent overlay routes.

### Auto-hide (`hideWhenIdle`)

22. A *supporting* widget can be opted into `hideWhenIdle` (default off) to drop out of the render
    while it has nothing meaningful to show. Supporting widgets are those with an idle predicate:
    `battle` (clear air / non-racing mode), `logos` (no valid images), `driver` and `qualifying`
    (no valid subject / no timing). The tower has no predicate — always meaningful, ignores the flag.
    The predicate reads the same snapshot/config the widget renders from, so auto-hide can never
    disagree with what the widget would draw.

## Constraints

- No widget may derive a semantic fact by scanning `vehicles[]`; it reads the producer-set field
  (`notable`, `target_lap`, `gap_to_leader`, `battle_intensity`). The only permitted arithmetic is
  exact math on producer-authored values (e.g. gap-to-class-leader subtraction).
- Every widget must render (or cleanly idle) when its optional fields are absent.

## Planned Changes

- `[PLANNED]` Tower/ticker badging from `notable` flags field-wide (#27/#28 direction) — see
  `docs/decisions/0002-lower-third-widgets.md`.
