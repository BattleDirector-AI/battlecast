# Changelog

All notable changes to battlecast will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
