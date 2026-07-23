# Widgets

Behavioral rules for what each widget renders and when it shows. All widgets consume the same
`spec/v1` snapshot and obey *dumb overlay, smart producer* — they present producer-provided values,
never derive semantic facts. See `how/renderer.md` for how the routes are wired.

## Behavioral Rules

### Standings tower (`/tower`)

> **Overflow** (what happens when the field is larger than the slot can display — the CSS clamp, row
> budget, pinned rows, and the cycling window) is specified separately in `tower-overflow.md`.

1. Renders the running order: sort `vehicles[]` by `position` ascending. Highlights the `subject`
   driver's row (keyed by `slot_id`). Shows lap/gap timing per row (em-dash when timing is absent).
2. In a **lap-timed** session (qualifying/practice), the leader's cell shows their best (pole) lap —
   the benchmark every delta measures against — while the field shows deltas. In a race the leader
   reads "LEADER".
3. **Class display** (`classDisplay`): `inline` (one overall list, each row badged with its class
   position) or `grouped` (per-class sections in class-registry order, positions restarting within
   each class). Only the tower reads this knob.
4. A grouped-by-class tower MAY show a gap-to-class-leader by subtracting the class leader's
   `gap_to_leader` from a car's own — exact arithmetic on producer values, not a forbidden
   re-derivation.
5. In **inline** layout, each row carries a **class-rank badge** (e.g. `GTP 3/7`) computed from the
   full field's running order, so it stays stable regardless of the `?class=` filter (rule 10). In
   **grouped** layout the badge is omitted — class rank is conveyed structurally by the restarting
   position column and the group header's car count.
6. **Interval column** — renders per-vehicle `interval_ahead` (gap to the car immediately ahead)
   beside the gap-to-leader. Gated by `towerMetrics.interval` (default **on**). Because a
   class-relative interval is not re-derivable, `interval_ahead` is rendered verbatim even in a
   grouped tower.
7. **Race-strategy indicators** — config-gated per `towerMetrics` (each default **off**): `pit`
   (completed `pit_stops` count + an in-pit indicator when `in_pit`), `tire` (verbatim
   `tire_compound` label + a `tire_wear` bar over `[0,1]`), `fuel` (a neutral resource bar over
   `[0,1]`, fuel or hybrid energy). A broadcaster enables these for endurance density.
8. **Qualifying/practice suppression** — in lap-timed modes the tower suppresses `pit`, tire **wear**,
   and `fuel` **outright**, regardless of the `towerMetrics` toggles or what the producer sends;
   these are race features that don't belong on a lap board. Tire **compound**
   and the interval column stay. (This is the one place the dumb-overlay rule yields to a
   presentation decision.)
9. **Session-progress header** — the tower header renders the native "Session Info" readout (session
   countdown clock or `LAP X OF Y` counter) from the `session` object (protocol rule 16). This is a
   **tower** element, distinct from the Race Control widget (rule 20). Null when the producer sends no
   session progress → the header then shows just the `mode`.
10. **`?class=` filter** — narrows the rendered field to a single `vehicle_class` (case-insensitive).
    A filter that matches nothing is an **explicit** state distinct from "no snapshot at all"; the
    tower surfaces which and never blanks silently.

### Battle box (`/battle`)

11. Centers on the `subject`, showing `gap_ahead` / `gap_behind` and a `battle_intensity` meter.
12. **Idle behavior splits by cause.** Outside a racing mode (qualifying/practice/takeover) the
    battle box renders **nothing** at all. Within a racing mode but with no adjacent car to fight, it
    renders an **explicit placeholder** (e.g. "CLEAR AIR"). Both count as idle for `hideWhenIdle`.

### Subject-driven lower-thirds (`/driver` #21, `/qualifying` #22)

A lower-third is the bottom-of-screen name-tag for the driver currently on camera. Both are
subject-driven and **fire on a camera cut** (a change of `subject.slot_id`), not continuously.
Full rules: `docs/decisions/0002-lower-third-widgets.md`.

13. **Visibility layering** (every gate must pass): `config.visible` → trigger (`dwell` |
    `persistent`) → subject validity / idle → render. `?show=`/`?hide=` override `visible`.
14. **Subject resolution:** *valid* = `slot_id` resolves to a `vehicles` entry; *degraded* =
    `driver_name` present but `slot_id` unresolved (render name only for #21, treat as idle for #22);
    *invalid* = neither → idle. Keyed off `slot_id`, never `driver_name`.
15. **Edge-triggered camera cut:** fire only when the new `slot_id` differs from the previous
    snapshot's, including `null→X`, `X→Y`, `X→null`. `A→A` does nothing; `A→null→A` re-fires.
16. **Trigger modes:** `dwell` (default) — fire on change, show for `dwellSeconds`, then auto-hide
    even if the camera stays; a new change resets the dwell **in place** (no hide→show flicker).
    `persistent` — show whenever the subject is valid, no timer.
17. **On (re)connect:** fire once for the current valid subject (`showOnConnect`, default true),
    then follow change detection. A class-best fire does NOT trigger on connect.
18. **#21 driver lower-third** renders identity: name, position (`P4`), class chip. Fires on any
    subject change to a valid subject, in all modes. Degrades to name-only when `slot_id` unresolved.
19. **#22 qualifying/sector lower-third** renders timing: best/last lap, per-sector times, and
    target/delta when present. **Mode-gated** by `modes` (default `["qualifying","practice"]`).
    Independently, when the producer flags the subject's `notable.class_best_lap` true, it fires a
    class-best flash even in a race (`fireOnClassBest`, default true) — firing on the transition to
    true, never by scanning lap times. Idle when subject invalid, no timing at all, or mode-gated
    out with no class-best fire.

### Race Control (`/racecontrol`, session status #25)

20. Renders **only** flag / FCY / Safety-Car status from the optional `session` object (`flag`,
    `full_course_yellow`, `safety_car`). It does **NOT** render the timed/lap progress readout —
    that lives in the standings-tower header (rule 9). Renders whenever
    visible and there is flag/FCY/SC content, in every mode. Not a lower-third and not class-aware —
    the trigger/`modes`/`classDisplay` knobs are inert for it.

### On-board HUD (`/onboard`, #26)

21. Renders the subject's live `subject.telemetry`: throttle/brake fill bars (clamped `[0,1]`),
    speed, and gear (`0`→`N`, `-1`→`R`). Reads telemetry every tick; idles automatically when there
    is no telemetry content (e.g. a parked car).
22. **Speed unit** (`speedUnit`, `kmh` default | `mph`; `?unit=mph` on the standalone route). The
    producer emits canonical km/h; the widget converts to mph deterministically when selected.
23. **Driver/vehicle identity** (`driverInfo`) — toggles `name` / `number` / `class` / `make` /
    `model` independently (name+number on by default), sourced from the additive per-vehicle fields.
24. **Hand-off** (`waitForLowerThird`, default true): in `/all`, the HUD holds off while the driver
    lower-third (#21) is showing its dwell, then reveals when the lower-third wipes out, so the two
    never overlap. Only applies in `/all`; the standalone `/onboard` route has nothing to wait for.

### Composite & takeover routes

25. **`/all`** composes configured widgets onto the fixed canvas by `z` order (see
    `what/overlay-config.md`); each widget still applies its own visibility/idle logic, and the
    `?class=` field filter (rule 10) applies across the composed field.
26. **`/logos`** cycles sponsor logos (`logoRotation`: images, `perSlotSeconds`, `order`).
27. **`/grid`** (pre-race starting grid) and **`/results`** (final classification) are full-screen
    **opaque takeover** slides — full-bleed but NOT transparent overlay routes. They group the field
    by class in class-registry order (the same sequence the grouped tower uses), order each group by
    `position`, and honor the `?class=` filter. `/results` restarts class positions within each group
    (like the grouped tower); `/grid` shows the overall position in a staggered two-column rake.

### Field filter & auto-hide

28. **`?class=`** is a **cross-route** field filter, not a per-widget knob: `/tower`, `/all`,
    `/grid`, and `/results` all read it from the URL and narrow the rendered field to that class.
    Class-rank badges are still computed from the full field, so a filtered view keeps correct
    `n/total` ranks.
29. A *supporting* widget can be opted into `hideWhenIdle` (default off) to drop out of the render
    while it has nothing meaningful to show. Supporting widgets are those with an idle predicate:
    `battle` (clear air / non-racing mode), `logos` (no valid images), `driver` and `qualifying`
    (no valid subject / no timing). The tower has no predicate — always meaningful, ignores the flag.
    The predicate reads the same snapshot/config the widget renders from, so auto-hide can never
    disagree with what the widget would draw.

## Constraints

- No widget may derive a semantic fact by scanning `vehicles[]`; it reads the producer-set field
  (`notable`, `target_lap`, `gap_to_leader`, `interval_ahead`, `battle_intensity`). The only
  permitted arithmetic is exact math on producer-authored values (e.g. gap-to-class-leader
  subtraction). A class-relative *interval* is explicitly NOT re-derivable — render `interval_ahead`
  verbatim.
- Every widget must render (or cleanly idle) when its optional fields are absent.
- The qualifying/practice race-strategy suppression (rule 8) is a deliberate presentation override
  and takes precedence over both the `towerMetrics` toggles and producer-sent data.
