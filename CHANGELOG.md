# Changelog

All notable changes to battlecast will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Richer per-vehicle metrics in spec v1 — optional strategy fields on `vehicle` (#110,
  slice 3 of #20).** Five new **optional** fields carrying the data an endurance tower
  needs: `interval_ahead` (gap to the car ahead, distinct from the existing gap-to-leader),
  `pit_stops` and `in_pit` (stop count and a currently-in-pit flag), `tire_compound`,
  `tire_wear`, and `fuel`. Additive and backward-compatible — every field is optional,
  `additionalProperties` stays `true`, and a payload carrying none of them still validates,
  so **`schemaVersion` stays `"1"`** (same precedent as `session` / `subject.telemetry`).
  Two deliberate contract choices: `tire_compound` is a **free-form string rendered
  verbatim** (producers name their own compounds — `"S"`, `"soft"`, `"C3"` — so the overlay
  makes no compound-vocabulary claim), while `tire_wear` and `fuel` are **normalized to
  [0, 1]**, letting the consumer draw a bar without a unit claim — the same discipline the
  throttle/brake bars take. `fuel` is deliberately **one** field covering combustion fuel
  *or* hybrid/EV energy, rendered as a neutral resource bar that makes no ICE-vs-EV claim;
  a producer measuring in litres or percent converts before emitting. `spec/v1/schema.json`
  + `SPEC.md` + compliance fixtures (full and partial), with the reference mock producer
  emitting all five. See `docs/plans/0.7.0-richer-tower.md`.

- **LMU-style richer standings tower (#111).** The tower gains an **interval column**
  (`interval_ahead`) plus opt-in endurance-strategy indicators: pit-stop count with an
  in-pit marker, tire compound and a wear bar, and a fuel/energy bar. Controlled by a new
  `towerMetrics` widget block — `{ interval, pit, tire, fuel }` — with **`interval` on by
  default and the strategy indicators off**, so existing profiles render as they did and
  the extra density is an explicit opt-in. The standalone tower route takes the same knobs
  via a `?metrics=interval,pit,tire,fuel` URL parameter, matching the existing `?src=` /
  `?class=` idiom. These are **race-only**: pit, tire-wear and fuel are suppressed in
  qualifying, where they carry no meaning.

- **`make dev-live` — run the overlay stack against a real producer (#113).** Starts the
  companion server (`:7397`) and the Vite app (`:5173`) *without* the mock producer, for
  driving the overlays from a real producer where `:8080` would just be a second, unused
  SSE server. Implemented as a `--no-mock` flag on `scripts/dev.mjs`, which already built
  the stack from a process list. Also adds a `PHASE=qualifying|grid|race|results` lock to
  the mock producer, so a single session type can be eye-tested without waiting for the
  cycle to come round.

### Fixed

- **The standings tower no longer renders past its slot — or off the canvas (#116).** The
  tower draws a row per car, so a large field grew the widget past the bottom of the screen.
  The configured `h` was sizing only the drag box in the config editor, not the render, so
  the height a broadcaster set was effectively a lie. The tower is now bounded by its
  configured slot height; rows that don't fit are clipped rather than escaping the box.
  This is the clamp only — choosing *which* cars keep a row (pinned leaders plus a cycling
  window over the rest of the field) is specified in
  `docs/decisions/0003-tower-overflow-pinning-and-cycling.md` and lands separately.

## [0.6.0] - 2026-07-07

### Fixed

- **Overlay animations no longer hard-cut in OBS.** OBS's Browser Source runs Chromium
  offscreen (CEF), which reports `prefers-reduced-motion: reduce` — and every widget gated
  its reveals/pulses on that media query, so the whole overlay dropped to its static
  fallbacks (hard cuts) in OBS. The overlay now **animates by default** regardless of the
  render host's setting (the OBS machine isn't the audience): motion is resolved once into a
  root `data-motion` attribute (`lib/motion.js`) that CSS and JS both read, instead of the OS
  media query. Reduced motion is now an explicit opt-in — a `?motion=reduced` URL knob per
  Browser Source (like `?src=`), or a "reduced motion" toggle + `reducedMotion` profile field
  in `/config`. Affects the lower-thirds, standings-tower re-cut shine, battle-box and
  Race-Control caution pulses, logo carousel, and the on-board HUD bar.

### Added

- **Live-input telemetry in spec v1 — optional `subject.telemetry` object (#102, slice 2
  of #20).** A new **optional `telemetry` sub-object on `subject`** carrying the on-camera
  driver's live inputs: `throttle` (0–1), `brake` (0–1), `speed` (canonical km/h),
  and `gear` (integer; `0` neutral, `-1` reverse by convention). Additive and
  backward-compatible — every field is optional, `additionalProperties` stays `true`, and a
  payload with **no** `subject.telemetry` still validates, so **`schemaVersion` stays
  `"1"`** (same precedent as `session` / `notable` / `gap_to_leader`). Grouped under its own
  sub-object to isolate the high-churn, every-tick input channel from the stable `subject`
  identity fields. *Dumb overlay, smart producer*: the producer owns every value; the widget
  renders it verbatim. `spec/v1/schema.json` + `SPEC.md` + compliance fixtures (`telemetry`
  present / partial, and the no-`telemetry` backward-compat case asserted in the harness);
  the reference mock producer emits `subject.telemetry` for the on-camera subject each
  running-phase tick (parked phases omit it). See `docs/plans/0.6.0-onboard-hud.md`.

- **Vehicle identity fields in spec v1 — optional `car_number` / `make` / `model`.** Three
  additive, optional string fields on each `vehicle`: `car_number` (rendered verbatim as a
  string so leading zeros survive; distinct from the opaque `slot_id`), `make` (manufacturer),
  and `model` (chassis). Backward-compatible — all optional, `additionalProperties` stays
  `true`, a payload without them still validates, **`schemaVersion` stays `"1"`**. Consumed by
  the on-board HUD's configurable identity (below). `schema.json` + `SPEC.md` + compliance
  assertion; the mock producer emits them for a full multi-class field.

- **On-board HUD widget (#26).** An over-camera on-board HUD
  (`app/src/routes/onboard/OnBoardHud.svelte`) on its own **`/onboard`** route and composed
  into `/all`. It reads the on-camera subject's **live inputs every tick** (unlike the
  cut-driven lower-thirds): throttle/brake fill bars (green/red per broadcast convention), a
  rounded **speed** readout, and a **GEAR** indicator (`N` for neutral, `R` for reverse).
  A per-widget **`speedUnit` toggle** switches the speed readout between **km/h** (default)
  and **mph** — surfaced as a "Speed in mph" checkbox in the `/config` editor, or `?unit=mph`
  on the standalone `/onboard` route; the producer emits canonical km/h and the widget
  converts (`mph = km/h × 0.621371`).
  - **Configurable driver/vehicle identity.** An optional identity strip shows the on-camera
    driver's **name / number / class / make / model**, each toggled independently (name +
    number on by default) via a "driver info shown" control in `/config`. Name is from
    `subject.driver_name`; number/class/make/model from the matching `vehicles[]` entry.
  - **Driver lower-third hand-off (#21).** So the driver name never shows in two places at
    once, the HUD holds off while the driver lower-third plays its "now on camera" dwell and
    reveals when it wipes out (a `waitForLowerThird` toggle, on by default; the HUD mirrors the
    lower-third's own dwell timing). Only applies on `/all`; the standalone `/onboard` route
    has no lower-third to wait for.
  - Tolerates absent / partial / garbage `telemetry` and identity without rendering an empty
    plate (idles in parked phases); the bar transition is gated to real motion (snaps under
    reduced motion).

## [0.5.0] - 2026-07-07

### Added

- **Session state in spec v1 — optional `session` object (#90, slice 1 of #20).** A new
  **optional, top-level `session` object** on the spec-v1 payload carrying session-level
  broadcast state: `flag` (free-form: green/yellow/red/checkered/white/none),
  `full_course_yellow`, `safety_car`, the timed clock (`time_remaining` /
  `session_length`), the lap counter (`laps_remaining` / `total_laps` /
  **producer-owned `current_lap`**), and an optional `basis` (`"time"` | `"laps"`)
  override. Additive and backward-compatible — every field is optional,
  `additionalProperties` stays `true`, and a payload with **no** `session` still
  validates, so **`schemaVersion` stays `"1"`** (same precedent as `notable` /
  `gap_to_leader`). *Dumb overlay, smart producer*: the producer owns every judgment —
  in particular the lap number is producer-owned (`current_lap`), rendered verbatim, never
  derived from `total_laps` − `laps_remaining`. `spec/v1/schema.json` + `SPEC.md` +
  compliance fixtures (`session` present / partial, and the no-`session` backward-compat
  case asserted in the harness); the reference mock producer emits `session` across its
  phase cycle (FCY + Safety-Car windows, timed and lap-limited legs, the endurance
  `basis:"laps"` flip). See `docs/plans/0.5.0-spec-fields-session-status.md`.

- **Race Control status widget (#25).** A compact, content-sized flag / Full Course
  Yellow / Safety-Car status pill (`app/src/routes/racecontrol/RaceControlStatus.svelte`)
  on its own **`/racecontrol`** route and composed into `/all`. It renders the current
  flag as a coloured square + label, with distinct **FCY** and **Safety Car** chips that
  appear only when active (the pill grows to fit); a cautionary pulsing ring (with a
  static reduced-motion fallback, mirroring the battle box) marks FCY/SC. Driving these
  from producer state is a reliability win — in LMU the FCY/SC labels ship manual-only.
  Tolerates absent / partial / unknown `session` data without rendering an empty plate.

- **Session clock and qualifying pole time in the standings tower (#93, #94).** The
  standings tower header now shows the session **countdown clock or lap counter** next to
  the mode (e.g. `QUALIFYING · 4:32`, `RACE · LAP 47 OF 58`) — the native "Session Info"
  readout — with automatic timed-vs-lap selection (honor `basis`; else `time_remaining` →
  clock; else the lap fields → counter; else nothing), the producer-owned `current_lap`
  rendered verbatim. In a lap-timed session (qualifying / practice) the leader's cell now
  shows its **pole / benchmark lap time** instead of the word `LEADER`, while the field
  shows deltas; a race keeps reading `LEADER`. Progress logic lives in the shared,
  unit-tested `app/src/design/sessionProgress.js`.

## [0.4.0] - 2026-07-05

### Added

- **Class-aware standings tower (#28, spec-v1 scope).** The standings tower
  (`app/src/routes/tower/StandingsTower.svelte`) now understands a multi-class
  field. A new additive per-widget knob **`classDisplay: 'inline' | 'grouped'`
  (default `'inline'`)** selects the layout: **inline** keeps the single
  overall-position list but badges each row with its position within its class
  (e.g. `1/7`); **grouped** splits the field into per-class sections in
  class-registry order (like the grid/results slides), with positions restarting
  within each class. The header now reflects the session — derived from
  `snapshot.mode` (RACE / QUALIFYING / PRACTICE, unknown modes uppercased),
  falling back to the `label` prop when absent. A `?class=<VClass>` URL knob
  narrows the tower to one class (case-insensitive; absent = all), mirroring the
  slides — read by `TowerPage` and `AllView`, with a distinct "No cars in this
  class" empty state. `classDisplay` is surfaced in the `/config` editor for the
  tower widget and round-trips through saved profiles (no `configVersion` bump).
  The on-camera re-cut flash (#68) and reduced-motion gating are preserved in both
  layouts. Each row's timing column now reads its **gap to the leader** (#28, via
  the additive spec-#20 `gap_to_leader` field) — to the overall leader in the inline
  layout and to the class leader in the grouped layout (`LEADER` on top, `—` when
  undetermined) — replacing the former last-lap placeholder.

- **Full results / standings slide (#23).** A full-screen, opaque takeover board
  (`app/src/routes/results/ResultsSlide.svelte` + `ResultsPage.svelte`) on its own
  `/results` route, for showing end- or mid-session results. Every vehicle is
  listed strictly in `position` order with its class chip, driver name, and best
  lap. A `?class=<VClass>` URL knob narrows the board to a single class
  (case-insensitive; absent = all classes), mirroring the `?show=` / `?hide=`
  convention. Explicit idle states — "Waiting for results…" with no snapshot, and
  a distinct "No cars in this class" when a class filter matches nothing — so the
  board never blanks.

- **Starting-order / grid slide (#24).** A full-screen, opaque takeover board
  (`app/src/routes/grid/GridSlide.svelte` + `GridPage.svelte`) on its own `/grid`
  route, for showing the pre-race starting grid. Cars are grouped per class (in
  class-registry order) and laid out in a conventional staggered two-column grid,
  strictly in `position` order within each class, each cell showing its class bar,
  grid position, and driver. A `?class=<VClass>` URL knob narrows the board to a
  single class (case-insensitive; absent = all classes grouped), mirroring the
  `?show=` / `?hide=` convention. Explicit idle states — "Waiting for grid…" with
  no snapshot, and a distinct "No cars in this class" when a class filter matches
  nothing — so the board never blanks.

### Changed

- **Reference mock producer auto-cycles the session phases (#66, dev tooling).** The
  zero-dependency mock producer's `simulate` mode
  (`producers/mock/simulate.js` / `server.js`) no longer emits one endless green-flag
  race; it now loops through a full session — **qualifying → grid → race → results** —
  so a single live mock exercises the whole overlay set. Each phase classifies
  `position` on its own terms (qualifying by best lap, grid frozen to the qualifying
  result, race by distance, results frozen to the final order), the director keeps
  cutting the on-camera `subject` throughout so the lower-thirds fire in every phase,
  and qualifying surfaces `notable.class_best_lap` false→true edges. Every tick of
  every phase stays spec-v1 valid (`schemaVersion:"1"`; no schema change — `mode` is a
  free string). Phase durations are env-configurable (`QUALI_SECONDS`, `GRID_SECONDS`,
  `RACE_SECONDS`, `RESULTS_SECONDS`); transitions are logged to stdout;
  `validate-simulator` now asserts every phase is visited and validated. Producer-only;
  no app or spec change. See `producers/mock/README.md`.

- **Re-cut reveal for lower-thirds and the standings tower (#64).** When the camera
  cuts to a new on-camera driver while a lower-third is already up, the plate now
  replays the full skewed bar-wipe — the old driver's plate plays its exit and the
  new driver's plays its entrance — instead of silently swapping the name in place.
  The driver name-tag (#21) keys its shell on the on-camera `slot_id`; the
  qualifying/sector timing bar (#22) keys on the displayed card identity so both a
  camera cut and a fresh class-best flash re-reveal (the class-best flash still
  freezes the earning driver). The standings tower's on-camera highlight now sweeps
  an on-brand mint shine — a raked bar-wipe, not the original box-shadow glow (#73) —
  across the newly-selected row. Reduced-motion viewers keep an instant swap.

- **Logo / sponsor carousel switches with the bar-wipe reveal (#82).** The logo
  rotation widget (`app/src/routes/logos/LogoRotation.svelte`) no longer cross-fades
  between sponsors — it now uses the same skewed bar-wipe vocabulary as the
  lower-thirds and tower re-cut: the outgoing logo wipes **out** under a raked mint
  shine bar, then the incoming one wipes **in**. The reveal is confined to the logo
  box — not the full slot, so the shine never sweeps empty space beside a smaller
  mark — and its bar sweeps the full width; the wrapper translates only (never skews)
  so a brand mark is never sheared (#85). Reduced-motion viewers keep a plain fade
  with no shine.

- **Reference mock producer emits realistic lap times (#76, dev tooling).** The
  mock's simulated lap times now derive from per-class pace baselines plus relative
  per-driver noise instead of uniform placeholder values, so the timing columns and
  gap-to-leader readouts exercise plausible data. Producer-only; no app or spec
  change.

### Fixed

- **Lower-third exit and tower highlight now animate under real motion (#68).** Two
  shipped animations never fired for viewers with `prefers-reduced-motion:
  no-preference`. (1) The lower-third's skewed bar-wipe **exit** was skipped — the
  plate just vanished — because the shell's `out:` transition was local while the
  plate is torn down by the parent widget's `{#if}` / `{#key}` block, and a local
  out does not play on ancestor teardown; it is now `out:…|global`, so a plain hide
  wipes out and a driver change plays wipe-out → wipe-in. (2) The standings tower's
  on-camera **glow-in never replayed** when the highlight moved to a new driver,
  because it relied on a CSS animation restarting when a persistent, re-sorted row
  merely gained `.row--oncam`; the reveal now plays on a fresh, subject-keyed flash
  overlay rendered only for the on-camera row, so it replays on every switch.
  Reduced-motion behavior is unchanged (instant, no motion). New tests exercise the
  real-motion (`no-preference`) path, which the suite's global reduced-motion stub
  had previously left unexercised.

- **Lower-third shine bar sweeps on exit, not just entrance (#71).** The skewed mint
  shine that sweeps across a lower-third on entrance now also sweeps on the exit
  wipe-out; previously the plate's content wiped out but the bar stayed parked at its
  entrance end-frame (a `both`-fill animation is not restarted under the same name),
  so the exit read as a plain wipe. A distinct exit keyframe restarts the sweep.

- **Battle box: intensifying border wraps the whole widget and is gated to racing
  modes (#80, #81).** The proximity-driven intensifying border now frames the entire
  battle box instead of an inner element, and no longer renders in known non-racing
  sessions (qualifying / practice / grid / results), where "fighting for position"
  has no meaning — a denylist, so custom/unknown race modes still show it and a
  blank/absent mode shows nothing.

## [0.3.0] - 2026-07-03

### Added

- **Skewed bar-wipe reveal for the lower-thirds.** Both lower-third widgets — the
  driver identity name-tag (#21) and the qualifying/sector timing bar (#22) — now
  share a presentational shell (`app/src/lib/LowerThirdShell.svelte`) that owns the
  smoked-glass plate frame, an angled mint shine bar, and a clipped content wrapper.
  On a camera cut the plate skew-slides in and the content wipes in behind the raked
  bar (~0.5s); on hide the content wipes out under the bar and the emptied plate
  skews off (~0.6s, a Svelte `out:` transition). Each widget renders its own inner
  layout through the shell, so all fire/dwell/hide and #22's class-best flash logic
  is unchanged. Honors `prefers-reduced-motion`: reduced-motion viewers get a plain
  quick fade in and an instant unmount (no lingering node).

- **Spec v1.x — producer notability + target-lap fields (additive, no
  `schemaVersion` bump).** A minor revision of spec v1 adds OPTIONAL, additive
  per-vehicle fields the producer computes and the overlay renders (dumb overlay,
  smart producer): `vehicles[].notable` — an open object of producer-set booleans
  (`class_best_lap`, `session_best_lap`, `personal_best_lap`) — plus
  `vehicles[].target_lap` (the reference "time to beat", seconds) and optional
  `delta_to_target`. These gate #22's class-best flash. Because `schemaVersion` is
  reserved for breaking changes and `schema.json` sets `additionalProperties: true`
  at every level, the version string stays `"1"`: old consumers ignore the fields,
  new consumers tolerate their absence. Documented in `spec/v1/schema.json` and
  `spec/v1/SPEC.md`; new fixtures `spec/v1/fixtures/race-class-best.json` and
  `qualifying-target.json`; the reference mock producer (`producers/mock/simulate.js`)
  now emits them. See `docs/decisions/0002-lower-third-widgets.md`.
- **Driver lower-third widget (#21)** — a broadcast-style identity name-tag for the
  on-camera driver (`subject`): driver name, position, and class chip, rendered from
  the resolved `vehicles[]` entry. It has its own `/driver` Browser Source route and
  composes into `/all` as the new `driver` widget. Unlike the always-on tower/battle
  widgets it is **subject-driven and edge-triggered** — it fires on a camera cut
  rather than rendering continuously:
  - **Trigger modes** (per-widget config): `dwell` (default) shows the card on each
    subject change then auto-hides after `dwellSeconds` (default 6) even if the camera
    stays; a new cut re-fires and **resets the dwell in place** (no hide→show flicker).
    `persistent` shows whenever the subject is valid and hides when it isn't (no timer).
  - **Fire-once on connect** (`showOnConnect`, default true) so opening the source
    shows the current driver briefly; **edge-triggered** so an unchanged subject
    repeated every snapshot never re-fires; `A → null → A` re-fires as a genuine cut.
  - **Subject resolution**: valid (slot_id resolves to a vehicle → full card),
    degraded (name only when the slot is unresolved), idle (no subject → renders
    nothing). The overlay reacts only to producer state changes and its own dwell
    timer — it computes nothing about the race.
  - The fire/dwell/hide logic lives in a **reusable, unit-tested trigger module**
    (`app/src/lib/lowerThirdTrigger.js`) that the qualifying/sector lower-third (#22)
    will reuse. Config adds per-widget `trigger` / `dwellSeconds` / `showOnConnect`
    (defaulted, additive — no `configVersion` bump), surfaced in the `/config` editor
    for lower-third widgets.
- **Qualifying / sector lower-third widget (#22)** — a broadcast timing bar for the
  on-camera driver (`subject`): best & last lap, per-sector times (S1/S2/S3), and —
  when the producer provides them — `target_lap` / `delta_to_target`, rendered from
  the resolved `vehicles[]` entry. It has its own `/qualifying` Browser Source route
  and composes into `/all` as the new `qualifying` widget (offset above the driver
  name-tag so the two bottom lower-thirds don't overlap).
  - **Mode-gating (Decision C):** by default the bar only shows/fires on a camera cut
    when `mode ∈ {qualifying, practice}` (per-widget config `modes`); in other modes a
    plain cut does not fire.
  - **Class-best flash (Decision C extension):** independent of `modes`, when the
    **producer** flips the subject's `notable.class_best_lap` flag false→true, the bar
    flashes the "fastest lap" moment for a dwell (config `fireOnClassBest`, default on).
    Per the dumb-overlay principle the overlay **only tracks whether that producer flag
    changed vs. the previous snapshot** — it never scans lap times to compute a class
    best — and it does not fire for a pre-existing flag on the baseline snapshot.
  - **Reuses the #21 `lowerThirdTrigger`** (dwell / persistent / showOnConnect) via a
    composite trigger key that changes on a mode-eligible cut OR a fresh class-best
    edge; #21's module behavior and tests are unchanged. Config adds per-widget `modes`
    and `fireOnClassBest` (defaulted, additive — no `configVersion` bump), surfaced in
    the `/config` editor for the qualifying widget.
- **Mock producer — prompt emit on camera cuts.** The reference simulator now
  sub-steps and emits a `state` snapshot promptly on a `subject` change (within one
  sub-step, ≤ ~150 ms) instead of only on the fixed cadence, honoring the spec's
  non-normative latency SHOULD so the lower-thirds fire crisply against the live mock.
  Total sim-time per real second and the director's (now time-based) on-camera dwell
  are unchanged. New fixtures `spec/v1/fixtures/race-pre-class-best.json`,
  `qualifying-sector-a.json`, and `qualifying-no-timing.json`.

### Changed

- The lower-third plate chrome (background, blur, border, radius, shadow,
  `overflow:hidden`) moved out of `DriverLowerThird.svelte` /
  `QualifyingLowerThird.svelte` into the shared `LowerThirdShell`; the widgets now
  own only their inner card layout. No visual or behavioral change to the cards
  themselves.

## [0.2.0] - 2026-07-03

### Added

- **Per-widget "hide when idle"** — a widget can be configured to drop out of the
  overlay while it has nothing meaningful to show, instead of rendering an idle
  placeholder. Opt-in per widget (`config.widgets.<key>.hideWhenIdle`, default off)
  and only offered for widgets that define an idle predicate: the **battle box**
  (hidden in clear air — no car ahead or behind the on-camera driver) and the
  **logo rotation** (hidden when no images are configured). The spec stays a pure
  data feed — this is a consumer/config presentation choice, driven by the same
  `relationship` data the battle box already renders from.
- **Delete profiles** — the companion server now supports `DELETE /api/profiles/<name>`,
  and the `/config` editor has a Delete button that removes the named profile from
  the server (with a confirm).
- **Configurable canvas size** — the overlay config now carries a `canvas` size
  (`{ w, h }`, default 1920×1080). The `/config` editor exposes a Canvas Size
  control (width/height + 1920×1080 / 1280×720 presets), the `/all` render scales
  the configured canvas to the Browser Source, and widgets re-clamp onto a smaller
  canvas. Lets you tighten the canvas so `/all` isn't a mostly-empty 1920-wide area.
- **One-command dev stack** — `make dev` runs the app, the reference mock producer,
  and the companion server together under one prefixed log (Ctrl+C stops all of
  them); `make help` lists every target, with `dev-app` / `dev-mock` / `dev-server`
  to run a piece on its own. Backed by a zero-dependency launcher
  (`scripts/dev.mjs`).
- **Config UI — the overlay editor at `/config` (#34, part 2 of 2)** — a WYSIWYG
  editor to arrange the overlay without touching code or CSS, completing epic #19.
  A live 1920×1080 preview (the real `/all` render) with **drag-to-move and
  resize handles** per widget; a panel to toggle visibility and set exact
  geometry/z-order; **logo management** (upload via the companion server, add/
  reorder/remove rotation images, set per-slot duration + order); a producer-URL
  field; and **named profiles** — save/load through the server, with a generated
  OBS Browser Source URL to copy. Degrades to client-only authoring (**export
  `config.json`**) when no server is running. Config **round-trips**: save a
  profile → reload it → an identical `/all` render (covered by a behavioral test).
- **Companion server — `battlecast serve` (#34, part 1 of 2)** — an optional,
  zero-dependency Node server (built-in `http`, Node ≥ 22, same stack as
  `producers/mock`) that serves the built overlay app with **SPA fallback** (so
  `/tower`, `/battle`, `/all`, `/logos`, `/config` all resolve) plus a small
  **config + asset API**: `GET/PUT/POST /api/profiles[/<name>]` persists layout
  profiles as `data/profiles/<name>.json`, and `GET/POST/DELETE /api/logos[/<file>]`
  + `GET /logos/<file>` store and serve uploaded logo images under `data/logos/`.
  This is the write/serve side of the overlay-config contract (counterpart to the
  #16 read side). Binds to `localhost` by default; uploads are validated (allowed
  image types only, ≤ 5 MiB, sanitized filenames) and profile names are restricted
  to prevent path traversal. Served logo assets carry `nosniff` + a locked-down CSP,
  so an uploaded SVG can't execute as active content (it still renders via `<img>`).
  The render path still works as a pure static deploy —
  the server is optional. The config-UI editor (`/config`) lands in the next part.
- **Logo / sponsor rotation widget (#33)** — a new widget that cycles a set of
  branding images on a per-slot timer with a fade, driven entirely by the overlay
  config's `logoRotation` block (`{ images, perSlotSeconds, order }`, where `order`
  is `sequential` or `shuffle`) — nothing is hardcoded. Matches rF2's native timed
  sponsor carousel (a gap in LMU). It has its own `/logos` Browser Source route and
  composes into `/all` as the `logos` widget. Renders an explicit idle state when no
  images are configured. Images load by URL (`/logos/<file>`), backed by the
  companion server or a static folder (#34).
- **Configurable `/all` layout (#16)** — the `/all` overlay now honors a per-profile
  layout config instead of a hardcoded side-by-side arrangement. A new
  `loadConfig()` loader (`app/src/lib/overlayConfig.js`) resolves the layout with
  precedence **explicit URL params → fetched profile JSON (`?profile=<name>` →
  `/api/profiles/<name>`, falling back to `/config/<name>.json`) → built-in
  default**, so existing `/all` users are unbroken. This is the read side of the
  overlay-config contract pinned by the #32 decision — the source of truth for the
  `configVersion: "1"` shape (per-widget `{visible, x, y, w, h, z}` geometry on a
  fixed 1920×1080 canvas, `logoRotation`, `producer`, `theme`) that #33 and #34
  build against. Widgets can be positioned, sized, hidden, and z-ordered; `?show=`/
  `?hide=` URL params toggle a widget without editing the profile.

### Fixed

- **`/all` (and `/config`) rendered offset and boxed-in on wide windows.** The
  Vite scaffold styles the `#app` mount as a centered, max-width, side-bordered
  column, which pushed the overlay ~400px right (off the right edge, with the
  border drawn as a visible box) on any window wider than the column. Real routes
  now neutralize that constraint and render full-bleed; overlay routes stay
  transparent. This is the actual cause of the "weirdly wide" `/all`.
- **`/config` editor polish.** The Load-profile dropdown is always visible (disabled
  with a reason when there are no saved profiles), so you can pick a profile to load
  as easily as you save one. Panel inputs no longer overflow past the right edge
  (border-box sizing + non-blowout flex/grid children). Widget drag boxes now match
  what renders: widgets fill their configured slot width, and the default widget
  widths match each component's intrinsic size (tower 380px, battle 440px) instead of
  a 640px box that dwarfed the battle widget. Server-side logos can be deleted from
  the server (not just removed from the rotation). Clicking the OBS Browser Source
  URL copies it to the clipboard.
- **Companion server no longer collides with rF2.** The default port moved from
  `5397` to **`7397`**. rFactor 2 runs its own control panel on `5397`, so on a real
  broadcast machine `battlecast serve` failed to bind it (`EACCES`) — the very
  reason the config UI often had no server to talk to. `7397` keeps the sim `_397`
  mnemonic (rF2 `5397`, LMU `6397`) but sits above both. Override with `--port` /
  `PORT` as before. (If you saved an OBS Browser Source URL with `:5397`, update the
  port.)
- **`/config` Save and logo upload now work in dev.** Vite dev now proxies `/api`
  and `/logos/` to the companion server, so the editor reaches the config/asset API
  on `localhost:5173` instead of leaving **Save** and **Upload** permanently
  disabled. Both controls now also carry a tooltip explaining they need the
  companion server (run `make dev`) when it isn't reachable. The bare `/logos`
  overlay route is unaffected — only `/logos/<file>` asset requests are proxied.
