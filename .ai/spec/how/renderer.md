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
| `src/lib/theme.js` | `resolveTheme`, `applyTheme`, `THEME_PRESETS` | Theme preset → `<html data-theme>` (`what/overlay-config.md` rules 58–59). Mirrors `motion.js`: `resolveTheme(search, { preset })` reads `?theme=` (trimmed, lowercased, ignored unless a known preset), then the normalized profile `theme.preset`, then `modern`; `applyTheme` writes the root attribute. `THEME_PRESETS` is the one list (`modern`, `vintage70`, `vintage80`) that `normalizeConfig` and the `/config` select also read. |
| `src/lib/widgetIdle.js` | `IDLE_PREDICATES`, `isWidgetIdle`, `widgetSupportsAutoHide` | Per-widget idle predicates for `hideWhenIdle`. |
| `src/lib/lowerThirdTrigger.js` | — | Edge-triggered camera-cut / dwell state machine for lower-thirds. |
| `src/routes/tower/towerCycle.js` | `computeRowBudget`, `clampPerPageSeconds`, `selectPins`, `selectRows`, `createTowerCycle` | Tower overflow selection + cycling-window stability (see `what/tower-overflow.md`). |
| `src/lib/LowerThirdShell.svelte` | — | Shared reveal/dwell/wipe shell for lower-third widgets. Under a vintage preset it hides its shine bar (`.lt3__bar`, `display: none` under `:global([data-theme='vintage70'])` and the same for `vintage80`, an ancestor scope so the /config preview gets it) and themes nothing else, so the wipe plays as under modern (widgets rule 107). `LogoRotation.svelte` keeps its own copy of the reveal and hides `.bc-logos__shine` the same way. |
| `src/lib/raceEvents.js` | `raceEventCard`, `createRaceUpdateFeed` | Race update box logic, pure and DOM-free (`what/widgets.md` rules 69–73). `raceEventCard(entry)` validates one `race_events` entry and returns `{ id, type, label, name, value, detail }` with the card's exact strings (`value`/`detail` `null` when the card has none), or `null` for an entry rule 69 skips. `createRaceUpdateFeed` owns the seen ids, the baseline, the waiting queue and its cap of 5. |
| `src/routes/updates/RaceUpdateBox.svelte` | props `snapshot`, `dwellSeconds`, `preview` | The race update box: feeds each snapshot to its feed, times the card on screen, renders it inside `LowerThirdShell`, keyed on the event id (`{#key}`) inside a stable `.lt3-anchor`, as `DriverLowerThird` keys its shell on the slot, so a replacement remounts the plate: the old one plays its exit while the new one enters (rule 74). |
| `src/routes/updates/UpdatesPage.svelte` | — | Standalone `/updates` route: `sseClient.connect` + `loadConfig(location.search)` for the `updates` widget's `dwellSeconds`. |
| `src/lib/infoPanel.js` | `eventHeader`, `infoLines`, `createInfoRotation` | Info panel logic, pure and DOM-free (`what/widgets.md` rules 76–80, 88). `eventHeader(event)` returns the header string exactly as rendered (`ROUND 3 · SPA 6 HOURS · SPA-FRANCORCHAMPS`), or `null` when no part holds. `infoLines(infoLinesField, configLines)` returns the text lines: the producer's valid lines, trimmed, then the configured lines, duplicates dropped. `createInfoRotation()` holds the line on screen and its place; it compares list entries by identity (a text line is its text, the weather card one fixed entry whatever its text), so a weather value change is not a changed list (rule 80). `infoPanelSpan({ slotLeft, slotWidth, headerNeed, canvasWidth })` returns the panel's `{ left, width }` in canvas px (rule 78a): `width` is the wider of `slotWidth` and `headerNeed` (`null` when there is no header), `left` is rule 78a's formula. |
| `src/routes/info/InfoPanel.svelte` | props `snapshot`, `dwellSeconds`, `lines`, `weatherCard`, `tempUnit`, `slotLeft`, `slotWidth`, `canvasWidth` | The info panel: builds the header and line list from the snapshot, `lines` and (while `weatherCard` is on) the weather card at the end, runs the rotation timer, renders inside `LowerThirdShell` only while it has something to show (rule 81's wipe on enter/leave), and keys the line element on the entry's identity, not its text, with a 300 ms fade in/out, duration 0 under reduced motion (`prefersReducedMotion()`): a change of line crossfades, and the weather card's text changing re-renders the same element (rule 88). It measures its header's need and sizes and places `.lt3-anchor` from `infoPanelSpan` and its slot props (rule 78a; see "A long header widens the panel"). |
| `src/routes/info/InfoPage.svelte` | — | Standalone `/info` route: `sseClient.connect` + `loadConfig(location.search)` for the `info` widget's `dwellSeconds`, `lines`, `weatherCard` and `tempUnit`; passes the panel its content box as the slot and `window.innerWidth` as the canvas, re-read on the window's `resize` and from a `ResizeObserver` on `.info-page` (rule 78a). |
| `src/lib/weather.js` | `weatherParts`, `formatTemp`, `weatherCardText` | Weather logic, pure and DOM-free (`what/widgets.md` rules 83–84, 88). `weatherParts(weather)` returns `{ air, track, conditions }` (`air`/`track` the °C number or `null`, `conditions` the trimmed string or `null`). `formatTemp(celsius, unit)` returns the shown value (`22°C`, `88°F`). `weatherCardText(weather, unit)` returns the info panel card's text (`AIR 22°C · TRACK 31°C · LIGHT RAIN`), or `null` when no part holds. |
| `src/routes/weather/WeatherBox.svelte` | props `snapshot`, `tempUnit` | The weather box: one row of the parts that hold, drawn only while one does, no transition (rule 86). |
| `src/routes/weather/WeatherPage.svelte` | — | Standalone `/weather` route: `sseClient.connect` + `loadConfig(location.search)` + `watchConfig` for the `weather` widget's `tempUnit`. |
| `src/routes/all/AllView.svelte` | — | Composes configured widgets onto the scaled canvas by `z`. |
| `src/routes/{tower,battle,driver,qualifying,racecontrol,onboard,logos,grid,results,config}/` | `<Name>Page.svelte` + widget | One directory per route. |
| `src/design/` | `tokens/*.css`, `format.js`, `classMeta.js`, `ClassChip.svelte`, `IntensityMeter.svelte`, `sessionProgress.js` | Design tokens + shared presentational primitives. Each token file holds the `modern` values on `:root` and, after them, one `[data-theme="vintage70"]` and one `[data-theme="vintage80"]` block overriding them (ADR 0026). |
| `public/fonts/<family>/` | `*.woff2`, `*.ttf`, `OFL.txt` | Self-hosted typefaces for every preset (modern: Saira Condensed, Saira, JetBrains Mono; vintage: Barlow, Barlow Condensed, VT323, Oswald), each family's licence beside its files. Declared by `@font-face` in `src/design/tokens/fonts.css` with absolute `/fonts/…` URLs; `public/` is copied verbatim into `dist`, so the licences ship too. |

## Data Flow

1. `App.svelte` reads `location.pathname`, picks a `<Name>Page.svelte`, and (on mount) resolves
   motion via `motion.js` and stamps `<html data-motion>`, sets transparent background for overlay
   routes and full-bleed for real routes. On every route except `/config` it also stamps the
   `?theme=`/default baseline on `<html data-theme>` via `theme.js`; profile-loading pages refine
   both from the profile.
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
   `isWidgetIdle`. On `/all` the driver card's one timer runs in `AllView.svelte` and its shown
   flag goes to both the card and the on-board HUD (the hand-off, rule 24); the card times itself
   only on `/driver`.

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
| CSS theme tokens | Boot + profile resolution | `<html data-theme>` attribute (render pages); `data-theme` on the `/config` preview stage. |

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
  `vehicles` as props, so it calls `resolveSubject({ subject, vehicles })` once: `.name` is the focus and idle-line
  name, `.vehicle` supplies the class chip and the position the neighbour lookups read (rule 65),
  and the ahead/behind lookups themselves stay in the box (rules 59, 68).
- **On-board HUD identity** (`what/widgets.md` rules 23, 54–58): `resolveIdentity()` in
  `OnBoardHud.svelte` builds the strip's fields from the subject and its `vehicles[]` match; both
  `/all` (`AllView.svelte`) and `/onboard` (`OnBoardHudPage.svelte`) call it and pass the result in
  as `identity`. The `driverInfo` default has one source, `ONBOARD_DEFAULTS.driverInfo`
  (`overlayConfig.js`); each widget in `DEFAULT_CONFIG` spreads its own copy of it. `normalizeConfig` falls
  back to the widget literal first, and `/onboard` reads `DEFAULT_CONFIG.widgets.onboard`
  directly, without normalizing. The field list is `DRIVER_INFO_FIELDS`; the `/config` checkboxes
  and the `DRIVER_INFO_HELP` coverage test both iterate it.
- **Race update box** (`what/widgets.md` rules 69–75, `what/overlay-config.md` rules 50–51):
  `/updates` joins `OVERLAY_ROUTES` in `App.svelte` (transparent, full-bleed), and `updates`
  joins `DEFAULT_CONFIG.widgets` (so `WIDGET_KEYS`, and with it the `configHelp.js` coverage
  tests), `RENDERABLE` in `AllView.svelte`, `PLATE_WIDGET_KEYS` and `TEXT_WIDGET_KEYS`. It is not a
  `LOWER_THIRD_KEYS` member (no trigger knobs) and has no `IDLE_PREDICATES` entry. Its default
  `dwellSeconds: 8` is the widget literal in `DEFAULT_CONFIG`; `normalizeConfig` applies rule 50's
  `[2, 60]` range to the `updates` key only, every other widget keeping rule 46's `> 0`. The
  editor's dwell input reuses the lower-third dwell field's commit path with rule 50's range.
  The card's strings come from existing formatters, not new ones: the name from `fmtName` after
  `presentName` (rule 14b), the lap time from `fmtLapTime`, the same call the tower's lap flash
  makes. The box's one timer is the card on screen; it reads `dwellSeconds` when a card starts.
- **Info panel** (`what/widgets.md` rules 76–82, `what/overlay-config.md` rules 52–53): `/info`
  joins `OVERLAY_ROUTES` in `App.svelte`, and `info` joins `DEFAULT_CONFIG.widgets` (so
  `WIDGET_KEYS` and the `configHelp.js` coverage tests), `RENDERABLE` in `AllView.svelte`,
  `PLATE_WIDGET_KEYS` and `TEXT_WIDGET_KEYS`. It is not a `LOWER_THIRD_KEYS` member and has no
  `IDLE_PREDICATES` entry. `normalizeDwell` applies rule 50's `[2, 60]` range to `info` as to
  `updates`. `lines` is the one knob that is not normalized onto every widget: `normalizeConfig`
  adds it to the `info` entry only (as `textScaleOrigin` is added only where rule 41b keeps it),
  so the `DEFAULT_CONFIG.widgets.info` literal carries `lines: []` and no other literal has the
  key. The panel's one timer is the line on screen; it reads `dwellSeconds` when a line starts.
  - **A long header widens the panel** (`what/widgets.md` rule 78a,
    `docs/decisions/0037-info-panel-header-widens-panel.md`).
    - **Header CSS.** The base `.bc-info__header` rule is `width: max-content` (so the header's
      box is its text's width whatever the panel's width, in every preset) with `white-space:
      nowrap`. No rule in any preset gives it `max-width`, `overflow`, `overflow-x`,
      `text-overflow` or `text-wrap`, or a `width` other than `max-content`, so it is never cut.
      `.bc-info__line` keeps `nowrap`, `overflow: hidden` and `text-overflow: ellipsis`.
    - **The measure.** The need is `header.offsetWidth` + the `.bc-info` section's computed
      `padding-left` + `padding-right` + the shell plate's (`.lt3`) computed `border-left-width`
      + `border-right-width` (`parseFloat`, a non-number counting 0). `offsetWidth` is in layout
      px, so the `/config` preview's `transform: scale(...)` does not change it (a
      `getBoundingClientRect()` would), and because the header is `max-content` it does not
      depend on the panel's width, so sizing the panel never feeds back into the measure and a
      shorter header measures shorter. With no header element the need is `null`.
    - **When it measures.** In an `$effect` after every header text change (post-DOM), and from a
      `ResizeObserver` on the header element, which fires when the header's rendered size changes
      without its text changing: a font finishing loading, a preset switch, a `textScale`
      change.
    - **Props and placement.** `InfoPanel` takes `slotLeft`, `slotWidth` and `canvasWidth`
      (canvas px). Inside `/all`, `AllView` passes the `info` widget's `w.x`, `w.w` and
      `normalized.canvas.w`, so a geometry or canvas change re-places the panel. On `/info`,
      `InfoPage` reads its `.info-page` element: `slotLeft` is its computed `padding-left`,
      `slotWidth` its `clientWidth` less its computed `padding-left` and `padding-right`, and
      `canvasWidth` is `window.innerWidth`; it re-reads them on the window's `resize` event, so a
      resized Browser Source re-places the panel, and from a `ResizeObserver` on the
      `.info-page` box, because the first read at mount can be stale (headless Chrome measured
      1028 px against a 1184 px content box) with no window `resize` to correct it. The panel applies `infoPanelSpan({ slotLeft,
      slotWidth, headerNeed, canvasWidth })` as an inline style on `.lt3-anchor` (which is
      `position: relative` in the slot): `width: <width>px; left: <left − slotLeft>px`, so a
      panel that fits gets its slot's width and `left: 0px`. `LowerThirdShell`'s `.lt3` is
      `width: 100%` of the anchor, so its `overflow: hidden` plate is exactly as wide as the
      panel. The line row takes no part in the width.
    - **Tests.** happy-dom does no layout. `InfoPanel.header.test.js` pins the header's CSS from
      the source (`?raw`), `infoPanel.span.test.js` the arithmetic, and
      `InfoPanel.width.test.js` the wiring in `/all` and `/info` with `offsetWidth`,
      `clientWidth`, `innerWidth` and the computed paddings and borders stubbed. Only a real
      browser shows the measured text width itself.
- **Weather** (`what/widgets.md` rules 83–88, `what/overlay-config.md` rules 54–57): `/weather`
  joins `OVERLAY_ROUTES`, and `weather` joins `DEFAULT_CONFIG.widgets`, `RENDERABLE`,
  `PLATE_WIDGET_KEYS` and `TEXT_WIDGET_KEYS`, with no `IDLE_PREDICATES` entry. `tempUnit` is
  normalized onto every widget like `speedUnit`; `weatherCard` is added to the `info` entry only,
  as `lines` is. The info panel takes props `weatherCard` and `tempUnit` and puts the card at the
  end of the line list as an entry with a fixed identity (not its text), so `createInfoRotation`
  compares entries by identity and a changed card text re-renders the line element in place: the
  line element is keyed on the entry's identity, not on its text, so the card's text changing
  never crossfades. `infoLines(infoLinesField, configLines)` keeps returning the text lines
  only.
  - **Vintage look** (`what/widgets.md` rules 103–104,
    `docs/decisions/0035-weather-box-vintage-pass.md`), in `WeatherBox.svelte`'s `<style>` under
    `:global([data-theme='…'])`, as the tower's is. `vintage70`: `.bc-weather` is `box-shadow:
    inset 0 -4px 0 var(--bc-accent), var(--bc-shadow-plate)`; `.bc-weather__value` is `color:
    var(--bc-text-2)`; `.bc-weather__conditions` is `color: var(--bc-text)`. `vintage80`:
    `.bc-weather__label` is `color: var(--bc-text-2)` and `font-family: var(--bc-font-display)`.
    That typeface swap is the only themed font property, and it adds no height only because
    `.bc-weather` sets the unitless `line-height: 1.15` that the items and labels inherit (neither
    sets its own); under `normal` the Oswald label would be taller than the VT323 value. These
    five declarations are the whole themed set: no other themed rule or declaration exists, and
    none re-declares a `--bc-size-*` token (which would hide `/all`'s per-slot `textScale`
    values). `WeatherBox.vintage.test.js` reads these rules from the component source (`?raw`),
    since `happy-dom` applies no CSS, and checks the themed declarations as that closed set.
- **Lower-third dwell default** (`what/overlay-config.md` rule 46): the default `6` lives in three
  places that must agree: the per-widget `dwellSeconds` literals in `DEFAULT_CONFIG`,
  `LOWER_THIRD_DEFAULTS` (`overlayConfig.js`), and `DEFAULT_DWELL_SECONDS` (`lowerThirdTrigger.js`).
  The last backs a second `> 0` guard in `DriverLowerThird.svelte`, `QualifyingLowerThird.svelte`
  and `lowerThirdTrigger.js`'s `sync()`.
- **#21's name is never clipped on the block axis** (`what/widgets.md` rule 109): the base
  `.bc-lt__name` rule in `DriverLowerThird.svelte`, so it holds under every preset, is `white-space:
  nowrap`, and its `overflow-y` computes to `visible`. If the rule clips the inline axis, it does
  so with `overflow: clip visible` (`overflow-x: clip`, `overflow-y: visible`), never `hidden`,
  `auto` or `scroll`: any axis that is neither `visible` nor `clip` turns the other axis's
  `visible` into `auto`, which clips at the line box. That line box is the page's inherited
  `line-height` (app.css's `:root`, 145% of 18px: 26.1px), shorter than the display faces'
  descenders and accents at 24px, and more so at a larger `textScale`. `overflow: clip` needs
  Chromium 90+, and the oldest supported engine is OBS 30's CEF 103. No rule on the name, base or
  themed, sets another clipper (`clip-path`, `contain` with `paint`, `content` or `strict`,
  `mask`, `mask-image`). Neither the name nor `.bc-lt`, `.bc-lt__body` or `.bc-lt__meta` sets a
  `line-height` or height, and the name sets no padding or margin, so its line box and the card
  keep their size. `DriverLowerThird.name.test.js` reads the rules from the component source
  (`?raw`).
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
- **Theme presets** (behavior in `what/overlay-config.md` rules 58–64; rationale in
  `docs/decisions/0026-theme-presets.md`). Each page applies the theme exactly where it applies
  motion: `App.svelte` at boot (URL baseline), then each profile-loading page in its `loadConfig`
  callback and its `watchConfig` `onChange`, as
  `applyTheme(resolveTheme(location.search, { preset: config.theme.preset }))`. `ConfigPage` never
  calls `applyTheme`; it binds `data-theme={config.theme.preset}` on the preview stage instead.
  Conventions every theme stylesheet follows:
  - **Select on the bare attribute.** Token overrides and widget styling key off
    `[data-theme="…"]` on an ancestor (in a widget's `<style>`: `:global([data-theme='vintage80'])
    .row { … }`), never `:root[data-theme=…]` alone, which would miss the `/config` preview.
  - **Re-declare derived tokens.** A custom property resolves its `var()` where it is declared, so
    a preset block that overrides an input (`--bc-plate-rgb`) re-declares every token built from
    it (`--bc-plate`), or the preview keeps the `:root` value.
  - **Only existing token names.** A preset block overrides tokens that `:root` defines (new
    tokens get a `modern` value on `:root` first: `--bc-shadow-text: none`, `--bc-font-style:
    normal`). This keeps one vocabulary for a later custom theme.
  - **The subhead colour.** `--bc-subhead` (in `colors.css`) is the colour of a small caption
    line under a title: the info panel's header and the takeover slides' group subheads. `:root`
    declares it as `var(--bc-text-2)`, so it is derived and both presets re-declare it:
    `vintage70` as the 70s mock's teal `#35D4C8` (its `--bc-teal`), `vintage80` as
    `var(--bc-text-2)`. Only the `vintage70` widget rules name it; no component writes the teal as a
    literal. `themeTokens.test.js` pins the three values.
  - **No geometry tokens.** Preset blocks never override `spacing.css` tokens other than the radii:
    row heights feed the tower's row budget (`towerCycle.js`).
  - **Base look on the scope.** One rule on the theme scope sets the inherited `text-shadow:
    var(--bc-shadow-text)` and `font-style: var(--bc-font-style)`, so text in every widget picks up
    the preset's outline/shadow and lean without a per-widget change. An element that sets its own
    `text-shadow` overrides the inherited one: today `BattleBox.svelte` gives the on-camera name
    `text-shadow: 0 0 12px var(--bc-accent-glow)`, so its pass sets the preset's treatment on that
    name itself (e.g. `:global([data-theme='vintage70']) .name { text-shadow: var(--bc-shadow-text)
    }`). The lower-thirds' own glows (#21's name, #22's `BEST` time, both accent bars) are restyled
    under **Lower-thirds** below.
  - **Per-widget passes** add structural styling in the widget's own `<style>` under the theme
    selector, re-tune type only through `--bc-size-*` tokens in that scope (the tower measures
    names from them), and never fork markup per theme.
  - **Tower** (`what/widgets.md` rules 89–90, `docs/decisions/0027-tower-vintage-pass.md`), in
    `StandingsTower.svelte`'s `<style>`, all paint and none of it changing a box size:
    - `vintage70`: `.tower__header` and `.row--oncam` draw their 4px red rule as `box-shadow:
      inset 0 -4px 0 var(--bc-accent)` (an inset shadow takes no layout space);
      `.row--oncam` has `background: none`; `.row__pos` and `.row--oncam .row__pos` are
      `var(--bc-text-2)` (the second because the base on-camera rule outranks the first);
      `.row__class` is `transform: skewX(-8deg)`, `filter: drop-shadow(2px 2px 0 #000)` and
      `font-style: normal`. The chip itself sets its face (`--bc-font-ui`, Barlow, bundled
      italic only, so `font-style: normal` alone still renders italic and the label leans
      twice), so `.row__class :global(.bc-class-chip)` is `font-family: var(--bc-font-display)`
      (Barlow Condensed, bundled upright at the chip's weight, 700) and `font-style: normal`, as
      the on-board HUD's chip is. That is the one themed tower rule that sets a face: the chip hugs its label, so it
      paints at the width its text takes in that face (`overlay-config.md` rule 60), inside the
      `max-content` class column.
    - `vintage80`: `.row--oncam` is `background: var(--bc-accent)` with `box-shadow: none`.
      `.row--oncam > :not(.row__pit--in):not(.row__finish):not(.row__class)` and the nested
      cells that set their own colour, `.row--oncam .row__pit-label` and `.row--oncam
      .row__tire-compound`, are `color: var(--bc-text-on-accent)` and `text-shadow: none`.
      `.row--oncam .row__class`, `.row--oncam .row__finish--dnf` and `.row--oncam
      .row__finish--dq` are `background: #000` with `box-shadow: 0 0 0 2px #000`.
      `.row--oncam .row__finish--flag` sets only `box-shadow: inset 0 0 0 1px rgba(0, 0, 0,
      0.35), 0 0 0 2px #000` (its own edge plus the ring); a `background` there would wipe the
      flag's gradient squares. `.row__gap--flash` is `background:
      var(--bc-text-2)`, `box-shadow: 0 0 0 2px var(--bc-text-2), 0 0 0 3px #000`, `color:
      var(--bc-text-on-accent)` and `text-shadow: none`; the compound selectors
      `.row__gap--flash.row__gap--flash-session-best`, `…-class-best` and `…-personal-best`
      swap the background and the 2px spread colour to `var(--bc-lap-best)` and
      `var(--bc-lap-pb)`. They are compound so they outrank the base flash rule whatever the
      source order.
    - Both presets: `.row__oncam-flash` is `display: none`, so no shine element renders. No
      themed rule sets a property that sizes or positions a box (widths, heights, padding,
      margin, border widths, font size, family or weight, letter spacing, line height, text
      transform, white space, flex, grid, position or offsets), save the `vintage70` chip's
      `font-family` above.
    `StandingsTower.vintage.test.js` reads these rules from the component source (`?raw`), since
    `happy-dom` applies no CSS, and checks the chip's face has a bundled upright cut at its
    weight with `lib/testing/chipFace.js` (it reads `tokens/typography.css` and `tokens/fonts.css`
    from disk, since a `?raw` CSS import is empty under vitest; the weight is the preset's
    `--bc-weight-label` when it sets one, else `:root`'s); `StandingsTower.themeSwitch.test.js`
    covers the re-measure.
  - **Race update box** (`what/widgets.md` rules 99–100,
    `docs/decisions/0033-race-update-box-vintage-pass.md`), in `RaceUpdateBox.svelte`'s
    `<style>`, under exactly `:global([data-theme='vintage70'])` or
    `:global([data-theme='vintage80'])` (quoted, one per selector). These are the box's only
    themed declarations, a closed set; anything else is the base look:
    - Both presets: `.bc-ru__accent` is `border-radius: 0` and `box-shadow: 2px 2px 0 #000`,
      which replaces the base glow; its `background` stays the base rule's accent.
    - `vintage70`: `.bc-ru__value` is `color: var(--bc-text-2)`.
    - `vintage80`: `.bc-ru__label` is `align-self: flex-start` (a flex item of the column body
      stretches to the card's width otherwise, and so would its block; the narrower label box is
      `what/overlay-config.md` rule 60's text-sized-box exception), `font-family:
      var(--bc-font-display)`, `color: var(--bc-text-2)`, `background: var(--bc-header)`,
      `box-shadow: 0 0 0 2px var(--bc-header), 3px 3px 0 2px #000` and `text-shadow: none`.
      `.bc-ru__detail` is `font-family: var(--bc-font-display)`.
    - Nothing in the box touches the shell: `LowerThirdShell.svelte` owns the plate, the frame
      and the bar-wipe for the box and both lower-thirds.
    - **The face swap depends on an inherited line height.** Every line of the card takes the
      line height set by `app/src/app.css`'s `:root { font: 18px/145% … }` shorthand (a
      percentage, so it inherits as a fixed length: 26.1px, or 23.2px under the file's ≤1024px
      `font-size: 16px`). Nothing between it and the card sets `line-height` or a `font`
      shorthand (which would reset it to `normal`, whose height depends on the face). So the label
      and detail can change face with no line box changing. Cleaning that boilerplate out of
      `app.css` would make the 80s card change height; the test pins it.
    `RaceUpdateBox.vintage.test.js` reads these rules from the component source, as the tower's
    test does, asserts the closed set with `toEqual`, and pins the line height (`app.css` read from
    disk).
  - **Race Control** (`what/widgets.md` rules 95–96,
    `docs/decisions/0031-racecontrol-vintage-pass.md`), in `RaceControlStatus.svelte`'s
    `<style>`, all paint and none of it setting a length:
    - `vintage70`: `.bc-racecontrol` is `background: linear-gradient(var(--bc-accent),
      var(--bc-accent)) bottom / 100% 4px no-repeat, var(--bc-header)`. The rule is a background
      layer, not an inset `box-shadow`, because the full-motion caution pulse animates the
      strip's `box-shadow` and would wipe it. `.bc-racecontrol__swatch` is `transform:
      skewX(-8deg)`; no chip selector sets a `transform`. `.bc-racecontrol__badge--fcy` is
      `text-shadow: none` with `filter: drop-shadow(2px 2px 0 #000)`.
    - `vintage80`: `.bc-racecontrol__flag-label` and `.bc-racecontrol__badge` are `font-family:
      var(--bc-font-display)`. `.bc-racecontrol__swatch` sets only `box-shadow: inset 0 0 0 1px
      rgba(0, 0, 0, 0.35), 0 0 0 2px #000` (its own edge plus the ring); a `background` there
      would wipe the flag colour, which is an inline style, and the chequered squares.
      `.bc-racecontrol__badge--fcy` is `text-shadow: none`. `.bc-racecontrol` sets no
      background or shadow, so the base Scoreboard header and hard plate shadow stay.
    - Both presets: `.bc-racecontrol.bc-racecontrol--caution` is `animation: none`, which drops
      the glow-bloom pulse on the strip. It has the same specificity as the base
      `:global(:root:not([data-motion='reduced'])) .bc-racecontrol--caution`, so it sits after
      that rule in the source. The ring's pulse on `.bc-racecontrol--caution::after` and the
      reduced-motion steady ring are untouched. No themed rule sets a length (widths, heights,
      padding, margin, border widths, font size or weight, letter spacing, line height, text
      transform, white space, flex, grid, position or offsets); `font-family` is the one type
      property set, and the strip sizes to its text (`what/overlay-config.md` rule 60's
      text-sized box), so its width follows the typeface while every set length stays.
    These are the only themed rules, and every selector naming `data-theme` is one of the two
    quoted scopes `:global([data-theme='vintage70'])` and `:global([data-theme='vintage80'])`.
    `RaceControlStatus.vintage.test.js` reads them from the component source (`?raw`) and checks
    that each preset's themed selector, property and value set is exactly the one above.
  - **Lower-thirds** (`what/widgets.md` rules 93–94,
    `docs/decisions/0030-lower-thirds-vintage-pass.md`), in `DriverLowerThird.svelte`'s and
    `QualifyingLowerThird.svelte`'s own `<style>`, never in `LowerThirdShell.svelte` (its vintage
    look is rule 107's alone), all paint and none of it changing a set length. Below, `X` is `lt`
    for the driver card and `qt` for the qualifying card.
    - Both presets: `.bc-X__accent` is `border-radius: 0` with `box-shadow: 2px 2px 0 #000`, and
      so is `.bc-qt--flash .bc-qt__accent` (`box-shadow` only), because the base flash rule
      outranks a bare themed `.bc-qt__accent`. `.bc-qt__cell--best .bc-qt__cell-value` is
      `text-shadow: var(--bc-shadow-text)`. `.bc-qt--flash .bc-qt__label` is `background:
      var(--bc-intensity-hot)`, `color: var(--bc-text-on-accent)`, `text-shadow: none` and
      `box-shadow: 0 0 0 3px var(--bc-intensity-hot), 0 0 0 4px #000`.
    - `vintage70`: `.bc-X` is `box-shadow: inset 0 -4px 0 var(--bc-accent)` (the card's own
      padding holds it); `.bc-X__pos` is `color: var(--bc-text-2)`; `.bc-X__name` is `color:
      var(--bc-text)`, and `.bc-lt__name` also `text-shadow: 1px 1px 0 #2a1200, 2px 2px 0
      #1a0b00, 3px 3px 0 #000, 4px 4px 0 #000, 0 0 10px rgba(0, 0, 0, 0.55), 0 0 2px rgba(0, 0,
      0, 0.9)` (the mock's `--bc-shadow-text`; not a token, as only this name uses it).
    - `vintage80`: `.bc-lt__label`, `.bc-qt__label` and `.bc-qt__cell-label` are `font-family:
      var(--bc-font-display)`, the one family a themed lower-third rule sets. `.bc-lt__label` is
      also `color: var(--bc-text-2)`, `background: var(--bc-header)`, `text-shadow: none` and
      `box-shadow: 0 0 0 3px var(--bc-header), 2px 2px 0 3px #000`. `.bc-lt__name` is
      `text-shadow: -2px -2px 0 #000, 0 -2px 0 #000, 2px -2px 0 #000, 2px 0 0 #000, 2px 2px 0
      #000, 0 2px 0 #000, -2px 2px 0 #000, -2px 0 0 #000, 3px 3px 0 #000, 0 0 9px rgba(0, 0, 0,
      0.6)` (the mock's `--bc-outline`). The compound `.bc-qt__cell--delta.bc-qt__cell--ahead
      .bc-qt__cell-value` (as the base rule it outranks) is `background: var(--bc-up)`, `color:
      var(--bc-text-on-accent)`, `text-shadow: none` and `box-shadow: 0 0 0 2px var(--bc-up), 0 0
      0 3px #000`.
    - No themed rule sets a property that sizes or positions a box (the list under **Tower**),
      the 80s labels' `font-family` excepted, and every themed selector is written in the
      canonical `:global([data-theme='vintage70']) <target>` form. `DriverLowerThird.vintage.test.js`
      and `QualifyingLowerThird.vintage.test.js` read these rules from the component source
      (`?raw`) and pin the complete set: the themed selectors, properties and values above and no
      others.
  - **Battle box** (`what/widgets.md` rules 91–92,
    `docs/decisions/0029-battle-box-vintage-pass.md`), in `BattleBox.svelte`'s `<style>`. The
    meter's elements belong to `IntensityMeter.svelte`, a shared design component, so the battle
    box styles them from its own scope as `.bc-battle__meter :global(.bc-intensity__track)` (and
    `__fill`, `__label`); `IntensityMeter.svelte` itself is unchanged.
    - `vintage70`: `.bc-battle__header` is `box-shadow: inset 0 -4px 0 var(--bc-accent)`.
      `.bc-battle__slot--focus` is `background: linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0,
      0, 0.3)), repeating-linear-gradient(180deg, #2FB34A 0 7px, #9BCB2C 7px 14px, #E9B21C 14px
      21px, #DE6A24 21px 28px, #B53C9A 28px 35px, #5A4FCF 35px 42px, #2C8FD8 42px 49px)` with
      `box-shadow: 4px 4px 0 #000`. `.bc-battle__slot--focus .bc-battle__slot-label` and
      `.bc-battle__focus-name` are `color: var(--bc-oncam-text)`; `.bc-battle__focus-name` is
      `text-shadow: 1px 1px 0 #2a1200, 2px 2px 0 #1a0b00, 3px 3px 0 #000, 4px 4px 0 #000, 0 0
      10px rgba(0, 0, 0, 0.55), 0 0 2px rgba(0, 0, 0, 0.9)` (the 70s mock's heavy form). The
      track is `transform: skewX(-14deg)`, and `mask-image` and `-webkit-mask-image` are both
      `repeating-linear-gradient(90deg, #000 0 calc(10% - 4px), transparent calc(10% - 4px)
      10%)` (OBS 30's CEF 103 knows only the prefixed one).
    - `vintage80`: `.bc-battle__title` is `background: #000` with `box-shadow: 0 0 0 2px #000`.
      `.bc-battle__header :global(.bc-class-chip)` is filled by its shadow alone, `box-shadow:
      inset 0 0 0 99px #000, 0 0 0 2px #000`, because `ClassChip` sets its background as an
      inline style, which a stylesheet `background` cannot override. No themed rule sets the title's
      `color`, so the base `.bc-battle--hot .bc-battle__title` keeps the intensity colour. The
      title, the chip, `.bc-battle__slot-label`, `.bc-battle__meter
      :global(.bc-intensity__label)`, `.bc-battle__idle-heading` and `.bc-battle__idle-sub` are
      `font-family: var(--bc-font-display)` (Oswald; the chip's label inherits it).
      `.bc-battle__slot--focus` is `background: var(--bc-accent)` with `box-shadow: 3px 3px 0
      #000`; `.bc-battle__slot--focus .bc-battle__slot-label` and `.bc-battle__focus-name` are
      `color: var(--bc-text-on-accent)` and `text-shadow: none`. The track's two masks are
      `repeating-linear-gradient(90deg, #000 0 calc(100% / 12 - 4px), transparent calc(100% / 12
      - 4px) calc(100% / 12))`, with no transform.
    - Both presets: the track and the fill are `border-radius: 0`. These are the only themed
      rules: every selector that names `data-theme` starts with exactly
      `:global([data-theme='vintage70'])` or `:global([data-theme='vintage80'])`, and the
      (selector, property, value) set under each is exactly the one listed here.
    `BattleBox.vintage.test.js` reads these rules from the component source (`?raw`) and holds
    them to that closed list.
  - **Takeover slides** (`what/widgets.md` rules 105–106,
    `docs/decisions/0036-takeover-slides-vintage-pass.md`), in the `<style>` of
    `GridSlide.svelte` and of `ResultsSlide.svelte`, the same rules in each with the slide's own
    root prefix (`grid` or `results`), all paint and none of it changing a box size:
    - Both presets: the root (`.grid`, `.results`) is `background: var(--bc-plate-solid)`; the
      position numeral (`.cell__pos`, `.row__pos`) is `color: var(--bc-text-2)`.
    - `vintage70`: the header (`.grid__header`, `.results__header`) is `box-shadow: inset 0 -4px
      0 var(--bc-accent)`; `.group__count` (and on `/results` `.group__colhead`, whose spans
      inherit it) is `color: var(--bc-subhead)`; `.group__head :global(.bc-class-chip)` and the
      filter's `.grid__filter :global(.bc-class-chip)` / `.results__filter
      :global(.bc-class-chip)` are `transform: skewX(-8deg)`, `filter: drop-shadow(2px 2px 0
      #000)`, `font-style: normal` and `font-family: var(--bc-font-display)` (Barlow Condensed,
      bundled upright at the chip's weight, 700; the chip's own face, Barlow, is bundled italic
      only, as under **Tower**). No other rule in either component names `--bc-accent`.
    - `vintage80`: the title (`.grid__title`, `.results__title`) is `background:
      var(--bc-header)` with `box-shadow: 0 0 0 6px var(--bc-header)` (a spread shadow takes no
      layout space, and the header's 12px gap keeps it off the filter chip) and `color:
      var(--bc-text-2)`; `.group__count` (and `.group__colhead`) is `color: var(--bc-text-2)`.
    - No themed slide rule sets `text-shadow` or a property that sizes or positions a box (the
      same list as the tower's), save the `vintage70` chips' `font-family` above (the chip hugs
      its label, `overlay-config.md` rule 60).
    `GridSlide.vintage.test.js` and `ResultsSlide.vintage.test.js` read these rules from the
    component source (`?raw`). They hold the themed CSS to a closed set: every selector that names
    `data-theme` starts with the exact quoted scope `:global([data-theme='vintage70'])` or
    `…'vintage80'])`, each preset's sorted `selector | prop: value` list equals the one listed
    here, and a render of the slide checks every themed selector names an element it draws. The
    `vintage70` chips' face is checked with `lib/testing/chipFace.js`, as the tower's is.
  - **Info panel** (`what/widgets.md` rules 101–102, `docs/decisions/0034-info-panel-vintage-pass.md`),
    in `InfoPanel.svelte`'s `<style>`, exactly these themed declarations and no others, every
    one under the `:global([data-theme='vintage70'])` or `:global([data-theme='vintage80'])`
    ancestor selector and no other spelling of a theme selector:
    - `vintage70`: `.bc-info` is `box-shadow: inset 0 -4px 0 var(--bc-accent)` (the red rule,
      drawn inside `.lt3__inner`, so it wipes with the content and takes no layout space);
      `.bc-info__header` is `color: var(--bc-subhead)`, the same token the takeover slides use.
    - `vintage80`: `.bc-info__header` is `align-self: flex-start` (a flex item of the column
      panel stretches to its width otherwise, and so would its block; a long header widens the
      panel instead of being cut, rule 78a), `font-family:
      var(--bc-font-display)`, `color: var(--bc-text-2)`, `background: var(--bc-header)`,
      `box-shadow: 0 0 0 2px var(--bc-header), 3px 3px 0 2px #000` and `text-shadow: none`, as
      the race update box's label tag. The base `line-height: 1.15` is unitless, so the header's
      line box is `1.15 × --bc-size-label` in Oswald as in VT323 and the 72 px slot budget noted
      in the component is unchanged.
    - `LowerThirdShell.svelte` is not themed here: its vintage treatment (no shine,
      `what/widgets.md` rule 107) is the shell's own. `InfoPanel.vintage.test.js` reads the rules
      from the component source (`?raw`), rejects any other theme selector spelling, and pins
      the exact set per preset.
  - **On-board HUD** (`what/widgets.md` rules 97–98, `docs/decisions/0032-onboard-vintage-pass.md`),
    in `OnBoardHud.svelte`'s `<style>`, all paint and none of it changing a box size:
    - `vintage70`: `.bc-onboard` is `box-shadow: inset 0 -4px 0 var(--bc-accent)` (the rule sits
      in the plate's 8px bottom padding). `.bc-onboard__number` is `transform: skewX(-8deg)`,
      `filter: drop-shadow(2px 2px 0 #000)`, `font-style: normal`, `color:
      var(--bc-oncam-text)` and `text-shadow: none`, with no `background` (it keeps the base
      accent fill). `.bc-onboard__class` (the span round `ClassChip`) is `transform:
      skewX(-8deg)` and `filter: drop-shadow(2px 2px 0 #000)`. The chip itself sets its face
      (`--bc-font-ui`, Barlow, bundled italic only, so `font-style: normal` alone still renders
      italic), so `.bc-onboard__class :global(.bc-class-chip)` is `font-family:
      var(--bc-font-display)` (Barlow Condensed, bundled upright at 700) and `font-style:
      normal`. `.bc-onboard__bar-label` and `.bc-onboard__readout-label` are `font-family:
      var(--bc-font-display)` and keep the inherited italic. `.bc-onboard__value--gear` is
      `color: var(--bc-text)`. `.bc-onboard__track` is `-webkit-mask-image` and `mask-image:
      repeating-linear-gradient(104deg, #000 0 10px, transparent 10px 13px)` (a 14° lean).
    - `vintage80`: `.bc-onboard` is `background: var(--bc-plate)` (one of the tokens
      `AllView`'s `plateVars` rescales per slot, so `plateAlpha` still applies).
      `.bc-onboard__label` is `background: var(--bc-live)`, `box-shadow: 0 0 0 4px
      var(--bc-live)`, `color: var(--bc-text-on-accent)` and `text-shadow: none`;
      `.bc-onboard__position` the same with `var(--bc-text-2)` for the block. With the strip's
      `--bc-space-2` gap the two 4px spreads meet. `.bc-onboard__number` is `text-shadow: none`.
      `.bc-onboard__driver` is `color: var(--bc-text)`. `.bc-onboard__track` is
      `-webkit-mask-image` and `mask-image: repeating-linear-gradient(90deg, #000 0 10px,
      transparent 10px 12px)`.
    - Both presets: `.bc-onboard__track` and `.bc-onboard__fill` are `border-radius: 0`. The
      mask on the track clips the fill inside it, so the fill keeps its one `width` and its
      transition. These are the only themed declarations: none recolours a fill or track, sets
      a custom property, a `transition` or `animation`, or a property that sizes or positions a
      box (the label `font-family` swaps are paint, rule 60), and every themed selector starts
      with exactly `:global([data-theme='vintage70']) ` or `:global([data-theme='vintage80']) `.
    `OnBoardHud.vintage.test.js` reads these rules from the component source (`?raw`), pins the
    complete themed set per preset, checks the chip label's face against `tokens/fonts.css`, and
    renders the HUD from `race-onboard-telemetry.json` under each preset to compare content.
  - **Fonts are shipped unmodified** (no re-subsetting, conversion or renaming), each family
    folder with its `OFL.txt` from `google/fonts`. Six families are Google Fonts' pre-built
    `woff2` files with Google's `unicode-range`: the vintage four (latin and latin-ext subsets)
    and Saira and JetBrains Mono (every subset Google serves for them; both are variable, one
    file per subset declared `font-weight: 400 700`). Saira Condensed is the exception: its
    licence reserves the name "Saira", so it ships as the four original static TTFs from
    `google/fonts` (`SairaCondensed-{Regular,Medium,SemiBold,Bold}.ttf`, weights 400–700),
    declared `format('truetype')` with no `unicode-range` (ADR 0028). `server/lib/static.js`
    maps `ttf` to `font/ttf` beside `woff2`. No `@import` or `<link>` loads a font from another
    origin; `fonts.css` holds only local `@font-face` rules.
  - `themeTokens.test.js` and `themeFonts.test.js` (in `src/design/`) read the token CSS from disk
    (a `?raw` CSS import is empty under vitest) and enforce these conventions and the bundled fonts.
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
    sans-serif`**. Every name is measured in this string, the on-camera weight. When the
    first rendered name cell's (or, with no row rendered, the tower root's) computed
    `fontStyle` is anything but `normal` or empty, it leads the string:
    `italic 700 22px 'Barlow Condensed', …` under `vintage70`. A `normal` style is left out, so
    the modern string is unchanged.
  - **Theme switch.** The tower watches the `data-theme` attribute of
    `towerEl.closest('[data-theme]') ?? document.documentElement`, looked up on mount, with a
    `MutationObserver` (`attributeFilter: ['data-theme']`), disconnected on destroy. The
    fallback matters: Svelte runs a child's mount before its parent's, so on a render page the
    tower mounts before `App.svelte` writes the root attribute, and `closest()` finds nothing.
    The last value seen starts as the attribute's value at mount, an absent one read as
    `modern`. A value that differs bumps a reset counter that the measuring `$effect` reads, so
    the effect runs the reset (names, `widestRest`, `namesMeasured`) and measures again at
    once, rows included, without waiting for a snapshot. The same value written again changes
    nothing.
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
    computes no fit width (`N` is the configured width). `check()` returns `true` for a family
    no `@font-face` has registered yet (before the stylesheet applies), so the first
    measurement may be taken in the fallback face; the name-font load below corrects it.
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
