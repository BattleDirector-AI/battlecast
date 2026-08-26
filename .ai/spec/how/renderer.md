# Renderer (app/)

The Vite + Svelte 5 frontend that renders every overlay. Behavioral rules: `what/widgets.md`,
`what/overlay-config.md`.

## Module Map

| File | Key Symbols | Responsibility |
|---|---|---|
| `src/App.svelte` | route dispatch, `OVERLAY_ROUTES`, `FULL_BLEED_ROUTES` | Pathname → page component; full-bleed/transparent/motion boot setup. |
| `src/main.js` | — | Mounts the app. |
| `src/lib/sseClient.js` | `connect(url, onState, { onOpen, onError })`, `parseState`, `resolveSrc`, `DEFAULT_SRC`, `SUPPORTED_SCHEMA_VERSION` | **The** SSE client — one module, imported by every route page and by `/config`. Open the `EventSource`, parse `state` events, warn on unknown `schemaVersion`, report transport lifecycle via `{ onOpen, onError }`. |
| `src/routes/{tower,battle,racecontrol,onboard}/sseClient.js` | `connect`, `resolveSrc` (+ `parseState`, `DEFAULT_SRC`, `SUPPORTED_SCHEMA_VERSION` on tower; `resolveSpeedUnit` on onboard) | The four drifted per-route copies still in the tree; five other pages import the tower's across a directory boundary. They **merge into `src/lib/sseClient.js`** (and `resolveSpeedUnit` into `overlayConfig.js`) — see the implementation note below and ADR 0006. |
| `src/lib/overlayConfig.js` | `loadConfig`, `normalizeConfig`, `resolveWidgets`, `pickProducerSrc`, `parseTowerMetricsParam`, `resolveSpeedUnit`, `DEFAULT_CONFIG`, `WIDGET_KEYS` | Config contract: load, normalize, order widgets, pick producer URL, parse `?metrics=` and `?unit=`. `resolveSpeedUnit` is the `?unit=` knob; it arrives here with the SSE merge above. |
| `src/lib/configHelp.js` | `WIDGET_HELP`, `FIELD_HELP`, `TOWER_METRIC_HELP`, `DRIVER_INFO_HELP` | Broadcaster-facing help copy for every `/config` control. Data, not markup — `configHelp.test.js` asserts it covers the config surface exactly. |
| `src/lib/HelpTip.svelte` | — | The ⓘ affordance: click to reveal, Escape/outside-click to dismiss, flips to stay in the viewport, and cancels its own click so it never toggles the control it sits beside. |
| `src/lib/motion.js` | `resolveMotion`, `applyMotion`, `prefersReducedMotion` | Motion policy → `<html data-motion>`. |
| `src/lib/widgetIdle.js` | `IDLE_PREDICATES`, `isWidgetIdle`, `widgetSupportsAutoHide` | Per-widget idle predicates for `hideWhenIdle`. |
| `src/lib/lowerThirdTrigger.js` | — | Edge-triggered camera-cut / dwell state machine for lower-thirds. |
| `src/routes/tower/towerCycle.js` | `computeRowBudget`, `clampPerPageSeconds`, `selectPins`, `selectRows`, `createTowerCycle` | Tower overflow selection + cycling-window stability (see `what/tower-overflow.md`). |
| `src/lib/LowerThirdShell.svelte` | — | Shared reveal/dwell/wipe shell for lower-third widgets. |
| `src/routes/all/AllView.svelte` | — | Composes configured widgets onto the scaled canvas by `z`. |
| `src/routes/{tower,battle,driver,qualifying,racecontrol,onboard,logos,grid,results,config}/` | `<Name>Page.svelte` + widget | One directory per route. |
| `src/design/` | `tokens/*.css`, `format.js`, `classMeta.js`, `ClassChip.svelte`, `IntensityMeter.svelte`, `sessionProgress.js` | Design tokens + shared presentational primitives. |

## Data Flow

1. `App.svelte` reads `location.pathname`, picks a `<Name>Page.svelte`, and (on mount) resolves
   motion via `motion.js` and stamps `<html data-motion>`, sets transparent background for overlay
   routes and full-bleed for real routes.
2. A route shell resolves its producer URL (`resolveSrc` / `pickProducerSrc`) and — for `/all` —
   loads config via `loadConfig(location.search)`.
3. `sseClient.connect(url, onState)` opens the `EventSource`, listens for `state`, `parseState`
   parses JSON and warns on unknown `schemaVersion`, and each snapshot flows into the widget. Today
   the page reaches that `connect` through its route's own `sseClient.js` (or the tower's); after
   the merge every page imports `src/lib/sseClient.js`. Render pages pass `onState` only; `/config`
   is the one caller that also passes `{ onOpen, onError }`, because it renders the connection
   itself (`how/config-editor.md`).
4. Widgets render from the latest snapshot. Lower-thirds run their fire/dwell state machine
   (`lowerThirdTrigger.js` + `LowerThirdShell.svelte`); `/all` applies `hideWhenIdle` via
   `isWidgetIdle`.

## Key Abstractions

- **Pathname routing, not a router.** OBS launches each widget by URL, so `App.svelte` is a manual
  `{#if path === …}` dispatch. `/results` and `/grid` are full-bleed but opaque (takeover slides),
  so they are in `FULL_BLEED_ROUTES` but NOT `OVERLAY_ROUTES` (which forces transparency).
- **One motion source of truth.** `data-motion` on `<html>` is read identically by CSS
  (`:root[data-motion=reduced]`) and JS (`prefersReducedMotion()`). The OS media query is never
  consulted — the historical bug (0.6.0) was gating reveals on `prefers-reduced-motion`, which OBS
  reports as `reduce`, hard-cutting the whole overlay.
- **Config normalizes defensively.** `normalizeConfig` fills every widget/field from
  `DEFAULT_CONFIG`, coerces garbage to sane values, and preserves unknown widget keys hidden — a
  partial or newer profile never blanks `/all`. Knobs are normalized onto every widget but only the
  relevant widget reads each (see `what/overlay-config.md` table).
- **Idle predicates co-locate the decision with the render.** `IDLE_PREDICATES` import the same
  guards the widgets use (`isActiveBattle`, `isDriverSubjectIdle`, `isQualifyingIdle`), so auto-hide
  can never disagree with what the widget would draw. Dwell-mode fire/hide timing lives *in* the
  component, not in these stateless predicates.

## Integration Points

| Consumer | Provider | Mechanism |
|---|---|---|
| Overlay widgets | Producer | Outbound SSE `state` events (`sseClient.js`). |
| `/all`, render pages | Companion server *or* static host | `fetch` config/logos over HTTP (read-only). |
| `/config` UI | Companion server | `fetch` write API (`/api/profiles`, `/api/logos`). |
| CSS + JS motion gating | Boot resolution | `<html data-motion>` attribute. |

## Implementation Notes

- **One SSE client, in `lib/`, not per route.** `src/lib/sseClient.js` is the only one; every route
  page and `/config` import it from there. It sits in `lib/` rather than a route folder because
  `/config` imports it and is not an overlay route. Do **not** add a per-route copy, do **not**
  import an SSE client across route folders, and do **not** construct an `EventSource` **anywhere
  under `src/`** — `sseClient.consolidation.test.js` fails on each. The constructor scan is
  `inlineEventSourceOffenders(srcRoot)` in `src/lib/testing/sourceScan.js`: it walks every `.js` and
  `.svelte` file beneath the root it is given and returns `{ root, offenders }` — the root it
  actually walked, echoed back, and the offending paths relative to that root, sorted. **The root is
  part of the result because where the scan is aimed is the whole of the guard.** A caller that
  names a root of its own and asserts on that name passes just as happily when the scan was handed a
  different one, so the assertion reads the root out of the result. Entries are sorted within each
  directory as the walk goes, so walk order is the same on every filesystem rather than
  `readdirSync`'s (which is filesystem-defined — NTFS returns case-insensitive order, ext4 with
  `dir_index` returns hash order). That walker is exported as `sourceFiles(root)` and is the only
  one: the import half of the guard walks the tree with the same generator.
  **Comments are stripped before matching; strings and regex literals are not.** A literal
  `new EventSource(...)` written in prose is not an offender, while the same call written a
  semicolon after a URL string — or after a regex ending in `\//` — on the same line still is. That
  leaves exactly two exclusions: `lib/sseClient.js` itself, and any `*.test.js`, which stubs the
  global (that is the point) and may hold fixture source in a string constant, which is scanned, not
  stripped. `lib/testing/` is **not** excluded — the doubles there describe the transport in
  comments, which now costs nothing, and a double that opened a real connection would be an offender
  like any other module. `sourceScan.test.js` drives the scan over synthetic trees and then over the
  real `src/`. What still escapes is worth knowing exactly, because the check is text either way,
  and the pattern is an exhaustive list rather than a general rule: the constructor is caught bare or
  reached through `window`, `globalThis`, or `self`, and nothing else. Any other route to it escapes
  — another handle on the same object (`new top.EventSource(...)`,
  `new document.defaultView.EventSource(...)`), an alias (`const E = EventSource`),
  `Reflect.construct`. Only `.js` and `.svelte` are read, so a `.ts` or `.mjs` module would not be
  scanned at all (none exist under `src/`). Seeing `EventSource` beside `new` is *not* sufficient to
  conclude the scan caught it. Closing that needs a parse rather than a longer list. One false
  positive is left, in the other direction: a construction written in a `.svelte` **markup** comment
  (`<!-- -->`), which is not JavaScript comment syntax and is not stripped. It is loud and names the
  file. The import half of the guard reads specifiers through `importedSpecifiers(source)` from the
  same module, which strips comments the same way; it excludes **nothing**, `*.test.js` included, so
  a suite that needs to name an import of a second client assembles the specifier from pieces rather
  than spelling it whole. Excluding suites instead would exempt exactly the files most likely to
  resurrect one.
  `resolveSpeedUnit` (`?unit=`) is a URL-knob resolver, not connection logic: it belongs in
  `overlayConfig.js` beside `pickProducerSrc` and `parseTowerMetricsParam`.
  Rationale: `docs/decisions/0006-config-producer-feed-status.md`.
- **`onError` is the transport's, not the parser's.** The shared client invokes `onError` when the
  `EventSource` itself fails or drops, and never for a payload it cannot parse — a malformed `state`
  event is logged and dropped, and delivery continues. `/config` renders `onError` as "not
  connected" (`what/overlay-config.md` rule 25), so routing a parse failure through it would report
  a dead feed on a healthy connection, which rule 26 forbids outright. The tower's copy does call
  `onError` on a parse failure; the merge deliberately does not carry that over.
- **happy-dom test env defaults `prefers-reduced-motion: reduce` to true.** Motion now gates on
  `data-motion`, not the media query, so this no longer silently disables animation paths — but
  motion tests still stamp `data-motion` explicitly (`*.motion.test.js`).
- **Speed is canonical km/h in the payload;** the on-board HUD converts to mph in the view layer
  (`× 0.621371`), it is never stored/emitted in mph.
- **Tower overflow selection** (`towerCycle.js`, behavior in `what/tower-overflow.md`): the row
  budget is `floor((slotHeight − headerHeight) / rowHeight)`, **measured** from the
  `--bc-widget-header` (38px) and `--bc-row-standard` (44px) design tokens rather than hardcoded, so
  a theme override cannot desync it. `StandingsTower.svelte` measures its slot, feeds the budget to
  the pure selection functions (`selectPins`/`selectRows`), and drives `createTowerCycle` for the
  page cursor + frozen window membership. `happy-dom` does no layout, so the measured budget and the
  CSS clamp are verified in a real browser (as the #118 clamp was); the selection/stability logic is
  unit-tested in `towerCycle.test.js`. **`happy-dom` also pumps no animation frames**, so any path
  that defers to `requestAnimationFrame` is unreachable unless a test stubs the frame and pumps it
  by hand: the resize coalescing shipped in #153 was invisible to the whole suite until #155 stubbed
  it. Treat frame timing like layout — deliberately stubbed here, and confirmed in a real browser.
- **Where `slotHeight` comes from** (behavior in `what/tower-overflow.md` rules 18–20): `/all`
  (`AllView.svelte`) passes the tower widget's configured `h`. The standalone route
  (`TowerPage.svelte`) has no configured slot, so it **derives** one from the viewport:
  `window.innerHeight` less the `.tower-page` safe-area inset top and bottom, floored at zero and
  re-derived on `resize`. `TowerPage.svelte` also resolves the profile (`loadConfig`, as
  `DriverPage`/`QualifyingPage` do) so the tower's `maxRows`/`cycle` reach the standalone route.
  Rationale: `docs/decisions/0005-standalone-tower-slot-height.md`.
- **Measure the resolved padding, not the token**. The inset is read as the page
  element's computed `paddingTop`/`paddingBottom`, which the engine has already resolved to `px`.
  Reading the *custom property* instead (`getPropertyValue('--bc-inset-safe')`) returns its
  **authored text**, so a token authored in any unit but `px` — `3rem` — parses to a plausible,
  wrong number (`3`) that passes a finite-and-positive guard and silently yields a tower taller
  than its Browser Source. Resolved padding also measures what the layout is actually doing rather
  than what a token says it should, and needs no magic fallback constant. This is ADR 0003's
  “measure, don't hardcode” applied one level further down; the header/row tokens
  (`--bc-widget-header` / `--bc-row-standard`) are read as custom properties because they are
  design values with no resolved-layout equivalent to read instead.
- **Re-fitting coalesces to one measurement per frame** (behavior in
  `what/tower-overflow.md` rule 21). A resize burst (an operator dragging the source) would
  otherwise re-measure and reassign the budget on every event, and each budget change returns the
  cycling window to its first page (rule 19). `TowerPage.svelte` coalesces through
  `requestAnimationFrame`: the leading event measures at once, opens a frame-long gate and drops
  every event inside it, and the frame's callback takes the one trailing catch-up measurement, so
  a drag settles on the size it ended at. A queued frame is cancelled on teardown — nothing may
  measure an unmounted page. Covered by `TowerPage.resizeCoalescing.test.js`, which drives the
  gate under a stubbed `requestAnimationFrame` and a hand-pumped frame, because `happy-dom` runs
  none of its own.
- The Vite/Svelte scaffold's `#app` centering and themed background are neutralized at runtime in
  `App.svelte` for real routes; the scaffold landing (`{:else}`) is leftover template and not a
  product route.
- Deep clone uses `structuredClone` with a JSON fallback (`DEFAULT_CONFIG` is frozen).
- **The `?class=` field filter is read per-route**, not via config: `TowerPage`, `AllView`,
  `GridPage`, and `ResultsPage` each read `?class=` from `location.search`. Class-rank badges are
  computed from the *full* field (in `StandingsTower.svelte`) so a filtered view keeps correct
  `n/total` ranks.
- **The tower header renders the session-progress readout** (clock / `LAP X OF Y`) via
  `design/sessionProgress.js` (`sessionProgressText`) — NOT the Race Control widget, which draws
  only flag/FCY/SC. Two separate widgets read the same `session` object for different parts.
- **Richer-tower metrics** (`interval_ahead`, `pit_stops`/`in_pit`, `tire_compound`/`tire_wear`,
  `fuel`) are gated by the per-tower `towerMetrics` toggle (`?metrics=` on the standalone route),
  and `StandingsTower.svelte` suppresses pit/tire-wear/fuel outright in lap-timed modes
  (`hideRaceStrategy`) regardless of the toggles or producer data.
