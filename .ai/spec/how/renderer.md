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
  component, not in these stateless predicates. The battle box's exit grace (`what/widgets.md`
  rules 37–39) is the exception that needs time: a stateless snapshot predicate cannot see it, and
  `/all` unmounting the slot on the first idle snapshot would kill the hold. The grace state has to
  live where both `BattleBox` and the `/all` auto-hide filter can read it (or `/all` keeps the
  battle slot mounted and lets the box report its own idleness) so the two still cannot disagree.
- **The battle box's neighbour names use the rule 14b presence test** (`what/widgets.md` rule 68).
  `presentName()` in `routes/driver/DriverLowerThird.svelte`'s module script is that exact test, exported
  from the module script; `BattleBox` imports it rather than writing a second copy.

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
  file. The stripper reads a whole `.svelte` file as JavaScript, which costs two more: markup text
  carrying a bare `//` (`<p>see https://x</p>`) is stripped from there to the end of that line, and
  a backtick inside a string inside a `${...}` interpolation ends the template early. Both are
  bounded — the first by the line, the second by the next backtick — and neither has an instance
  under `src/`. A delimiter with no partner on its line, and a comment opener that never closes, are
  each treated as a lone character rather than running on, so a stray apostrophe in prose cannot
  invert the parity of every string after it — which would both revive prose as an offender and
  hide a real construction behind a URL literal that is no longer a string. Telling a regex literal
  from division is what makes "strings and regex literals are not stripped" true, and it is decided
  by the token in front of the `/`: any of a list of punctuators, or any of a list of keywords
  (`return`, `typeof`, `case`, `await` and the rest). The keyword list is needed because the
  character before the regex is otherwise just a letter — `return /^https?:\/\//.test(u)` reads as
  division, and the `\/\/` inside then reads as a comment and takes the construction on that line.
  Both lists are explicit, so a keyword outside the second one reopens exactly that gap; failing to
  recognise a regex is the unsafe direction, and over-recognising one is not, since a recognised
  regex is kept verbatim. The import half of the guard reads specifiers through
  `importedSpecifiers(source)` from the same module, which strips comments the same way; it excludes
  **nothing**, `*.test.js` included, so a suite that needs to name an import of a second client
  assembles the specifier from pieces rather than spelling it whole. Excluding suites instead would
  exempt exactly the files most likely to resurrect one.
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
- **Subject resolution** (`what/widgets.md` rules 14–14b): `resolveSubject()` in
  `DriverLowerThird.svelte`'s module script is the one resolver for #21, #22
  (`QualifyingLowerThird.svelte` imports it), `/all`'s hand-off (`AllView.svelte`), and the
  persistent-mode auto-hide in `lib/widgetIdle.js` (via `isDriverSubjectIdle`, and
  `isQualifyingIdle` for #22). `resolveIdentity()` (below) calls `resolveSubject()` for its vehicle
  and name too, so the malformed-entry skip (14a) and the name pick (14b) live in one place and
  the HUD and the lower-thirds cannot drift apart. `BattleBox.svelte` takes `subject` and
  `vehicles` as props, so it calls `resolveSubject({ subject, vehicles })` for the focus and idle-line
  name (rule 65) and keeps its own `vehicles[]` lookups for the ahead/behind neighbours (rule 59).
- **On-board HUD identity** (`what/widgets.md` rules 23, 54–58): `resolveIdentity()` in
  `OnBoardHud.svelte` builds the strip's fields from the subject and its `vehicles[]` match; both
  `/all` (`AllView.svelte`) and `/onboard` (`OnBoardHudPage.svelte`) call it and pass the result in
  as `identity`. The `driverInfo` default has one source, `ONBOARD_DEFAULTS.driverInfo`
  (`overlayConfig.js`); each widget in `DEFAULT_CONFIG` spreads its own copy of it. `normalizeConfig` falls
  back to the widget literal first, and `/onboard` reads `DEFAULT_CONFIG.widgets.onboard`
  directly, without normalizing. The field list is `DRIVER_INFO_FIELDS`; the `/config` checkboxes
  and the `DRIVER_INFO_HELP` coverage test both iterate it.
- **Lower-third dwell default** (`what/overlay-config.md` rule 46): the default `6` lives in three
  places that must agree: the per-widget `dwellSeconds` literals in `DEFAULT_CONFIG`,
  `LOWER_THIRD_DEFAULTS` (`overlayConfig.js`), and `DEFAULT_DWELL_SECONDS` (`lowerThirdTrigger.js`).
  The last backs a second `> 0` guard in `DriverLowerThird.svelte`, `QualifyingLowerThird.svelte`
  and `lowerThirdTrigger.js`'s `sync()`.
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
- **Class tags** (behavior in `what/widgets.md` rules 60–64, `what/overlay-config.md` rules
  47–48; rationale in `docs/decisions/0022-single-class-tags.md`): `theme.classTags` is
  normalized in `normalizeConfig` like `theme.classColors` and threaded the same way, from
  `AllView` and each profile-loading standalone page, into every widget that draws a class tag
  as a `classTags` prop (`'auto' | 'show' | 'hide'`, default `'auto'`). Each widget resolves it
  against the `session` it already receives (`snapshot.session`, or BattleBox's `session` prop)
  with one shared helper, so every site gives the same answer: shown unless the setting is
  `hide`, or it is `auto` and `session.multiclass === false`. The on-board HUD's class field is
  dropped where `AllView` resolves its identity. Only the tag rendering changes: the class bars
  keep reading `classColor()`. With the tags hidden, the grouped tower renders its inline branch,
  and `GridSlide` and `ResultsSlide` render one list in overall position order.
- **The tower header renders the session-progress readout** (clock / `LAP X OF Y`) via
  `design/sessionProgress.js` (`sessionProgressText`) — NOT the Race Control widget, which draws
  only flag/FCY/SC. Two separate widgets read the same `session` object for different parts.
- **Richer-tower metrics** (`interval_ahead`, `pit_stops`/`in_pit`, `tire_compound`/`tire_wear`,
  `fuel`) are gated by the per-tower `towerMetrics` toggle (the profile's, overridden by
  `?metrics=` on the standalone route),
  and `StandingsTower.svelte` suppresses pit/tire-wear/fuel outright in lap-timed modes
  (`hideRaceStrategy`) regardless of the toggles or producer data.
- **Driver name style** (behavior in `what/widgets.md` rules 46–48, `what/overlay-config.md`
  rule 42; rationale in `docs/decisions/0018-tower-driver-name-style.md`).
  - **Props.** `StandingsTower.svelte` takes `nameStyle` (`'short'` | `'full'`; the bare
    component's default is `'short'`, the style that never changes width), `configuredWidth`
    (canvas px) and `textScale`. It stamps `data-name-style` on its root. `AllView.svelte`
    passes `normalized.widgets.tower.nameStyle`, the tower's `w` as `configuredWidth`, and its
    `textScale` (only a reset trigger; the type tokens on the slot already scale the text).
    `TowerPage.svelte` passes `config.widgets.tower.nameStyle` from the profile it already
    loads for `maxRows`/`cycle`, and no `configuredWidth`; the component then uses the resolved
    `--bc-tower-width`, and `400` when that does not resolve to a px number (as in `happy-dom`).
  - **Formatters.** Full is `fmtName` (`design/format.js`), the formatter the battle box,
    lower-thirds, HUD and grid/results slides use, applied to string names only (a non-string
    gives `''`). Short is a separate formatter beside it that only the tower calls.
  - **The width hook.** In full style the tower root carries an **inline `min-width: <N>px`**,
    `N = max(configuredWidth, ceil(widestName + widestRest + borderX))`, where `borderX` is the
    tower root's `parseFloat(borderLeftWidth) + parseFloat(borderRightWidth)` from its computed
    style, each non-finite value (`''`, as in `happy-dom`) counting `0`. `.tower` is
    `box-sizing: border-box`, so the border is inside `min-width` and must be in the fit; the
    configured width already includes it. Its CSS `width` stays what it is
    in short style (`100%` of the `/all` slot, `--bc-tower-width` standalone), so the inline
    minimum is what widens it past the slot; nothing else may pin its width. `.tower` keeps
    `overflow: hidden`, so a minimum that comes out too small clips the row; rows never wrap.
    In short style the root has **no** inline `min-width`. `widestName` and `widestRest` are
    running maxima, cleared only by a reset (rule 48). The tower also keeps the set of
    full-form names it has measured since the last reset, so a font load can re-measure them
    all, including cars that have left the field.
  - **The measuring font.** One CSS font string, built from the tower root's computed style as
    `` `${--bc-weight-leader} ${--bc-size-name} ${--bc-font-display}` ``. Each token that does
    not resolve (empty, as in `happy-dom`) takes its default from `tokens/typography.css`, so
    the fully unresolved string is exactly **`700 22px 'Saira Condensed', 'Arial Narrow',
    sans-serif`**. Every name is measured in this string, the on-camera weight.
  - **Measuring names.** With a 2D canvas context from
    `document.createElement('canvas').getContext('2d')`: set `ctx.font` to the measuring font,
    then a name's width is `ctx.measureText(fullName).width + [...fullName].length ×
    letterSpacing`, for every car in the class-filtered field. Canvas `measureText` ignores CSS
    `letter-spacing`, so it is added per code point; the tower does **not** set
    `ctx.letterSpacing`. `letterSpacing` is `parseFloat(getComputedStyle(cell).letterSpacing)`
    of the first rendered `[data-testid="driver-name"]`, or of the tower root when no row is
    rendered; a non-finite value (`normal`, `''`) counts `0`, and a negative value is used as
    is. It is read at each measurement, and a name already measured keeps its width until the
    next reset or name-font load. When `getContext('2d')` returns `null`, every name measures
    `0` before the letter spacing is added.
  - **Font readiness.** When `document.fonts` exists, names are measured only while
    `document.fonts.check(measuringFont)` returns `true`; while it returns `false`, the tower
    computes no fit width (`N` is the configured width). `check()` can return `true` before
    the stylesheet has registered the family (while the Google Fonts `@import` is still
    loading), so the first measurement may be taken in the fallback face; the name-font load
    below corrects it.
  - **Requesting the font, once.** While `check(measuringFont)` is `false`, the tower calls
    `document.fonts.load(measuringFont)` **once per measuring font** (the measuring weight may
    be one no rendered text uses, so it would never load by itself). It never calls it again
    for the same font string, including after a failure: there is no retry.
  - **A failed font.** The font has failed when that `load()` promise rejects, or when a
    `loadingerror` event's `fontfaces` include a face of the name family (matched as for
    `loadingdone` below). On failure the tower marks that measuring font failed, treats it as
    loaded from then on (names are measured even though `check()` stays `false`), and measures
    the names at once, as a name-font load does. The canvas then measures in the browser's
    fallback face, which is the face the rows render in. A later `loadingdone` for the family
    is an ordinary name-font load. A `loadingerror` for another family changes nothing.
  - **Font load = name re-measure, not a reset.** The tower listens for `document.fonts`'
    `loadingdone` event and reacts only when the event's `fontfaces` include a face whose
    `family`, with surrounding quotes stripped and compared case-insensitively, is the first
    family of `--bc-font-display` (`Saira Condensed` by default). It also awaits
    `document.fonts.ready`, which carries no face list, and treats it as a name-font load.
    On a name-font load: if `check(measuringFont)` is `true`, re-measure every name in the
    remembered set and set `widestName` to the widest of them, which may be smaller than
    before; `widestRest` is untouched. The listener is removed on unmount. When
    `document.fonts` does not exist, names are measured at once.
  - **Measuring the rest of the row.** After every render of the rows (each snapshot, each
    page turn), for each rendered row: `rest = row.scrollWidth − nameCell.clientWidth`, where
    `row` is `[data-testid="tower-row"]` and `nameCell` is its `[data-testid="driver-name"]`,
    floored at `0`. `scrollWidth` is the row's full content extent, padding and gaps
    included, even when the row overflows the tower; it does not under-read the way a rect of
    an overflowing row does. The name cell's `clientWidth` is the box the name was given, so
    the difference is everything else. For that to hold, in full style the non-name cells do
    not shrink (`flex-shrink: 0`); only the name cell flexes. Absolutely positioned decoration
    (the on-camera flash, the local-yellow edge) does not extend `scrollWidth`. In `happy-dom`
    both reads are `0`, so `rest` is `0` unless a test stubs them.
  - **What the tests stub.**
    - `HTMLCanvasElement.prototype.getContext`: a context whose `measureText(t)` returns
      `{ width: 10 × [...t].length }` and records `ctx.font`.
    - `document.fonts`: `check`, `load`, `ready`, `addEventListener` /
      `removeEventListener`; a fired `loadingdone` or `loadingerror` carries
      `fontfaces: [{ family }]`.
    - `window.getComputedStyle`, for the name cell's `letterSpacing` and the tower root's
      `borderLeftWidth` / `borderRightWidth` (everything else passes through).
    - The `scrollWidth` of `[data-testid="tower-row"]` and the `clientWidth` of
      `[data-testid="driver-name"]` (getters on `HTMLElement.prototype`).

    What remains for a one-time headless-Chromium check is real glyph widths, the inline
    `min-width` beating the `/all` slot's `width: 100%`, and the row CSS that makes the rest
    read exact (the shared tracks below; in the flex fallback, non-name cells `flex-shrink: 0`
    and the name cell `flex: 1 0 auto`): `happy-dom` does no layout, so no unit test can see it.
- **Tower columns** (behavior in `what/widgets.md` rules 49–53; rationale in
  `docs/decisions/0020-tower-table-columns.md`). The columns are **CSS grid tracks shared by
  every row**, with no measuring in JS.
  - **The grid.** One element per tower is the grid, `[data-testid="tower-grid"]`. In the
    inline layout that is the rows list, `ol.tower__rows`. In the grouped layout it is
    `.tower__groups`, so the tracks are shared across every group. It carries:
    - `data-columns`: the shown columns' names in order, space-separated, e.g.
      `pos class classpos name gap interval`.
    - An inline `grid-template-columns` with one track per column, in the same order:
      `minmax(max-content, 1fr)` for `name`, `max-content` for every other column. The track
      list is built in JS because the column set varies (rule 49).
    - Every element between the grid and the cells spans all tracks (`grid-column: 1 / -1`)
      and passes them down with `grid-template-columns: subgrid`. That is each row (`li`),
      and in the grouped layout each group (`section.group`) and its list (`ol`). Group
      headers span all tracks and are not subgrids of the columns.
  - **Cells.** Each row's in-flow children are exactly one cell per column, in column order,
    each carrying `data-col="<column>"`. The class chip sits inside its `data-col="class"`
    cell, since `ClassChip` is shared and stays as it is. An empty cell (rule 49) is a bare
    element carrying `data-col` only. The absolutely positioned decorations (class bar,
    local-yellow edge, on-camera flash) carry no `data-col` and are not grid items. The name
    cell has no fixed `min-width` of its own: the `name` track's `max-content` minimum is the
    only floor (rule 53). A `max-content` track
    never shrinks below its content, so rule 48's `flex-shrink: 0` requirement on the non-name
    cells is met by the grid itself.
  - **Older Chromium.** `subgrid` needs Chromium 117+ (OBS 31's CEF has it; OBS 30's CEF 103
    does not). Under `@supports not (grid-template-columns: subgrid)` each row is a
    flex row instead: every cell still renders, but the columns line up only as far as
    their contents happen to. In that branch the name cell is `flex: 1 0 auto` with
    `min-width: max-content`, the same floor the grid track gives it: a flex item with
    `overflow: hidden` would otherwise have an automatic minimum of `0` and be squeezed and
    ellipsized, breaking rule 47. The `data-col` cells, sizer rows and hooks are the same
    either way.
  - **Rows that are not on screen** (rule 50). In the inline layout the grid also holds one
    **sizer row** for every car of the class-filtered field that the cycling window or
    `maxRows` leaves out: `li[data-testid="tower-sizer-row"][data-slot][aria-hidden="true"]`,
    after the rendered rows. It has the same cells, with the same content, as that car's row
    would have (its `name` cell reads the car's name in the current name style, its `classpos`
    cell the car's class rank), and no `data-testid` on any cell, so selectors such as `driver-name` and
    `class-pos` see only rendered rows. It is zero-height, invisible and not
    pointer-reachable (`height: 0`, `visibility: hidden`, no border, no padding block), but
    it stays in the grid so its content sizes the tracks. The grid has a `column-gap` and **no
    row gap** (never the `gap` shorthand), so sizer rows add no height and nothing counts
    against the tower's height bound (`tower-overflow.md` rule 1). `[data-testid="tower-row"]`
    is on rendered rows only, so the overflow rules count only rendered rows. The bottom
    divider is dropped on the last **rendered** row (the last `[data-testid="tower-row"]`),
    not on `.row:last-child`, which would be a sizer row. The grouped layout renders every
    car (only the height clamp hides rows), so it has no sizer rows.
  - **Rule 48's rest-of-row read still holds.** `row.scrollWidth` of a subgrid row is its
    tracks plus gaps plus padding, and the name cell's `clientWidth` is the name track.
  - **What the tests can see.** `happy-dom` does no layout and applies no component CSS, so
    the suite asserts `data-columns`, the inline track list, the per-row `data-col` order
    (rendered rows and sizer rows), empty cells, and the sizer rows' slots. These cannot be
    checked outside a browser, so they are a headless-Chromium check at implementation time:
    - that the tracks really are shared (subgrid), which needs Chromium 117 or later;
    - the 72px chip cap and its end ellipsis;
    - the right-aligned gap and interval;
    - that sizer rows take no height, and the last rendered row has no divider;
    - the measured slack at 400px.
