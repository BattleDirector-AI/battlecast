# Config Editor (`/config`) & Live Reload

The WYSIWYG layout editor at `/config` — the **only writer** of the overlay-config contract — plus
the client-side pieces that read config back on the render path. Behavioral rules:
`what/overlay-config.md` (contract, editor control surface, help content, live reload) and
`what/companion-server.md` (the write API it calls). Server side: `how/server.md`.

## Module Map

| File | Key Symbols | Responsibility |
|---|---|---|
| `src/routes/config/ConfigPage.svelte` | `startDrag`/`onDrag`/`endDrag`, `saveProfile`, `loadProfile`, `deleteProfile`, `onUpload`, `exportJson`, `copyObsUrl`, `fitPreview` | The editor itself: live preview, drag/resize, every widget control, profile + logo management, OBS-URL copy. The largest single component in the app. |
| `src/lib/configEditor.js` | `setWidgetField`, `moveWidget`, `resizeWidget`, `setCanvas`, `setWidgetVisible`, `setWidgetHideWhenIdle`, `setLogoRotation`, `addLogoImage`/`removeLogoImage`/`moveLogoImage`, `setProducerSrc`, `setProfileName`, `buildObsUrl` | **Pure** edit operations over a config. Each returns a *new* normalized config; no DOM, no I/O. |
| `src/lib/configApi.js` | `serverAvailable`, `listProfiles`, `getProfile`, `saveProfile`, `deleteProfile`, `listLogos`, `uploadLogo`, `deleteLogo` | Thin client for the companion server's config/asset API. Every call takes an injectable `fetchImpl`. |
| `src/lib/configWatch.js` | `watchConfig` | Live reload on the **render** path: poll the resolved config, fire `onChange` only when it actually differs. |
| `src/lib/sseClient.js` | `connect(url, onState, { onOpen, onError })`, `DEFAULT_SRC` | The shared SSE client (`how/renderer.md`). `/config` is its only caller that passes `onOpen`/`onError`, because it renders the connection state rather than the snapshots. |
| `src/lib/configHelp.js` | `WIDGET_HELP`, `FIELD_HELP`, `TOWER_METRIC_HELP`, `DRIVER_INFO_HELP` | Broadcaster-facing help copy for every control — data, not markup. |
| `src/lib/HelpTip.svelte` | — | The ⓘ affordance: click to reveal, `Escape`/outside-click to dismiss, flips to stay in the viewport, cancels its own click. |
| `src/lib/overlayConfig.js` | `normalizeConfig`, `DEFAULT_CONFIG`, `WIDGET_KEYS`, `TOWER_METRIC_FIELDS`, `DRIVER_INFO_FIELDS`, `isLowerThird` | The config contract the editor edits and the render path loads (see `how/renderer.md`). |
| `src/routes/config/ConfigPage.{test,help,upload,plate}.test.js` | Vitest | Editor behavior, help coverage, logo-upload, and plate-opacity suites. |
| `src/routes/config/ConfigPage.feedStatus.test.js` | Vitest | Feed-status readout: four states, the retrying/stopped split driven off the transport's `readyState`, where it renders, debounced reopen on a typed edit *and* on a profile load, a URL the browser refuses, fixture-only preview, teardown with a debounce in flight, and the Reconnect control (both failure states, immediate, cancels a pending reopen, writes nothing, has help). Stubs `EventSource` (happy-dom has none) and uses fake timers for the debounce. |
| `src/lib/sseClient.test.js` | Vitest | The shared client's behavior: `state` delivery from a fixture, `onOpen`/`onError` lifecycle, disposer. |
| `src/lib/sseClient.consolidation.test.js` | Vitest | Structural guard — one client, no per-route copies, no cross-route SSE imports. Reads the tree, imports no module under test, so it runs whether or not the shared client exists. |
| `src/lib/testing/sourceScan.js` | `inlineEventSourceOffenders(srcRoot)`, `sourceFiles(root)`, `importedSpecifiers(source)` | Source reading for that guard, as functions so they can be aimed somewhere other than the real tree. `sourceFiles` is the one tree walker both halves share, sorted within each directory so walk order does not vary by filesystem. Comments are stripped before either match; strings and regex literals are not. `inlineEventSourceOffenders` returns `{ root, offenders }` — the root it walked plus sorted root-relative paths — and excludes `lib/sseClient.js` and `*.test.js` only (see `how/renderer.md`). |
| `src/lib/testing/sourceScan.test.js` | Vitest | Drives the scan over synthetic trees whose offenders sit in `lib/`, `components/`, and a route — the real tree is clean either way, so only a fixture tree can tell a wide scan from a narrow one — then over the real `src/`. |
| `src/lib/testing/fakeEventSource.js` | `FakeEventSource`, `RefusingEventSource` | The stand-in the two suites above share — `happy-dom` has no `EventSource`. `emit()` plays the browser's part; a closed connection emits nothing; `RefusingEventSource` is the URL the browser will not construct. It also models `readyState` and the `CONNECTING`/`OPEN`/`CLOSED` constants, and dispatches events carrying `type`/`target` — the transport's state machine, not just its events, is what rule 25's two failure states turn on. `failRetrying()` and `failStopped()` are the two failure policies; a bare `emit('error')` is the stopped one, because a double with no retry loop dispatching one error *is* the abandoned failure. `FakeEventSource.reset()` is the single cleanup entry point and clears **both** doubles — `opened` and `refused` — so a suite calls it and nothing else. Not a `*.test.js`, so vitest does not collect it. |
| `src/lib/testing/fakeEventSource.test.js` | Vitest | The doubles' own contract: `reset()` clears both, a later suite inherits no earlier refusal, `live`/`last` follow the cleared list, and the `readyState` a listener observes for each failure policy. |
| `src/lib/config{Editor,Api,Watch,Help}.test.js` | Vitest | Unit suites for each module above — pure functions, injected `fetch`, fake timers. |

## Data Flow

**Editing (write path).** `ConfigPage` holds one `config = $state(normalizeConfig(DEFAULT_CONFIG))`.
Every control and every preview drag calls a `configEditor.*` function and **reassigns** the result
— `config = editor.moveWidget(config, key, x, y)` — so Svelte 5 reactivity is driven by whole-object
replacement, not mutation. `saveProfile()` then `PUT`s that object to `/api/profiles/<name>`.

**Preview.** The preview stage (`[data-testid="preview-stage"]`) carries
`data-theme={config.theme.preset}`, so the token overrides keyed off `[data-theme=…]` restyle the
preview subtree while the editor's own panel, whose root carries no vintage theme, stays modern
(`what/overlay-config.md` rule 62). The theme select (`data-testid="theme-preset"`) sits beside the
class-tags select, writes through `configEditor.setThemePreset`, and its help is
`FIELD_HELP.themePreset`.
The driver-names select (`data-testid="name-style"`, `what/overlay-config.md` rule 43) sits with
these overlay-wide selects, not in the tower row, writes through `configEditor.setNameStyle`
(`theme.nameStyle` only), and its help is `FIELD_HELP.nameStyle` (behind
`data-testid="help-name-style"`). The tower row's former `name-style-tower` select and its
`setWidgetField(…, 'nameStyle', …)` path are gone. The preview is an `AllView`, so every widget in
it re-renders in the chosen style.
Every widget reaches the preset through the stage (rule 63): `AllView`'s widget slots carry no
`data-theme` of their own, widget styles key off the bare `[data-theme=…]` ancestor
(`how/renderer.md`, "Theme presets"), and the tower's theme-switch reset finds its scope with
`closest('[data-theme]')`. `ConfigPage.previewTheme.test.js` holds all three: the rendered scope
of every widget, and a source scan of every component `<style>` (no `:root[data-theme…]` /
`html[data-theme…]` selector) and every module (no theme read off `document.documentElement`).
Rule 63's re-measure clause, a `full`-name tower measuring its fit width again when the preview's
preset changes, is held by `routes/tower/StandingsTower.themeSwitch.test.js` ("in the /config
preview, follows the preview stage, not the document root").
The handles (rule 64) are plain editor CSS in `ConfigPage.svelte`: literal colours, no `--bc-*`
token and no `[data-theme]` selector, and `.handle__label` sets `text-shadow: none` and
`font-style: normal` against the stage's inherited base-look rule (`design/tokens/effects.css`).
Any inherited text property a token file's theme-scope rule sets, the label overrides with a
literal value; the test derives that list from the token files, so a property added to the base
look later must gain an override here. The label sets no `font-family`, so it inherits the editor
root's typeface; the stage scopes the `--bc-font-*` tokens but sets no font itself.
The key labels (rules 65–66) are not children of the handles. After the handles' `{#each}`,
`.preview__canvas` renders one label layer, `<div class="handle-labels"
data-testid="handle-labels">`, with an inline `z-index` of `101 + max(z)` over the visible
widgets, one more than the highest handle's `100 + z`. It holds one
`<span class="handle__label" data-testid="label-{key}">{key}</span>` per visible widget, and
each label has its own `onpointerdown={(e) => startDrag(e, key, 'move')}`. Its placement is
decided in the markup, not by measuring: `data-placement="above"` when the widget's `y` is at
least 24, `"inside"` otherwise. Its position is inline canvas pixels, in the same way the handle's
`left`/`top` are: `left: {x}px; top: {y - 24}px` above, and `left: {x}px; top: {y}px` inside. The
label also gets an inline `z-index: {100 + z}` for the order within the layer. The layer is
the canvas's stacking context, not a handle, so there is no border offset: the label's left edge
is the handle's outer left, and an above label's bottom is the handle's outer top.
CSS: `.handle-labels` is `position: absolute; inset: 0; pointer-events: none`, so the layer
blocks no handle. `.handle__label` is `position: absolute; height: 24px; line-height: 24px;
padding: 0 8px; font-size: 22px; white-space: nowrap; pointer-events: auto; cursor: move`, with
rule 64's colours and text overrides. Nothing sets `pointer-events: none` on a label. The
layer's `position: absolute` is what makes its inline `z-index` apply at all: a static layer
ignores `z-index` and paints under the positioned handles. Its `inset: 0` makes the canvas the
labels' coordinate box. The label's own `position: absolute` makes the inline `left`/`top`
apply.
`ConfigPage.handleLabel.test.js` holds the placement, the inline offsets, the layer's `z-index`
against every handle, the position, size and pointer-events declarations (from `?raw`), the press
and the single look. happy-dom does no layout, so the painted edges are checked in a real browser.
There, with the label above, its bounding rect's bottom equals the handle's top and the lefts
are equal. With the label inside, the tops and lefts are equal. `elementFromPoint` at the label's
centre returns the label itself. In the default layout, `elementFromPoint` at canvas (60, 880),
the upper half of the `driver` label where it lies over `qualifying`'s handle, returns the
`driver` label.
The editor renders the real `AllView` against a fixture snapshot, scaled by
`previewScale` (`fitPreview()` fits the canvas into the panel, capped at 0.6). Pointer deltas are
divided by that scale before reaching `moveWidget`/`resizeWidget`, so a drag moves the widget by
canvas pixels, not screen pixels. `startDrag` snapshots the widget as `drag.orig`; every
`pointermove` computes the new geometry from it, and the `textScaleOrigin` bookkeeping
(`trackOrigin` in `configEditor.js`) must compare with that drag-start widget and its origin, not
with the previous step's config (`what/overlay-config.md` rule 41c). Because `drag.orig` is a copy
taken at `pointerdown`, a drag must not outlive a change it does not know about (rule 41d):
`endDrag()` is the one way a drag ends, and it runs from `pointerup`, from `pointercancel`, from
window `blur`, from `onDrag` when the drag's pointer moves with `event.buttons === 0` (checked after
the `pointerId` filter, before any geometry is placed), from `setTextScale` before the preset is applied, and from `loadProfile` right after the loaded profile
is assigned to `config` (not when the load is requested, and not on a failed or not-found load).
Every code path that assigns a config not derived from the current one (a loaded or imported
profile) calls `endDrag()` the same way; ordinary edits, which derive the next config from the
current one, do not.

**Typed number fields (rules 44–44c).** Every `type="number"` input in `ConfigPage.svelte` commits
through the one `numberField(apply, stored)` attachment (`{@attach}`), on `change`, on Enter, and on
a keyboard arrow step (both below), never from a plain `oninput`; an unconditional `oninput` write
stays only on the plate-opacity `type="range"` slider (and on the non-number text/color fields).

Enter is handled explicitly, never left to the browser's `change`: the attachment's `keydown` with
`key === 'Enter'` (modifiers ignored) and `!event.isComposing` runs the same commit function the
`change` handler runs. That function compares the field's text with `String(stored() ?? '')` (what
the config holds now, so a profile load or preview drag cannot leave it stale), and does nothing
when they match — so the `change` (Chromium fires one on Enter) or blur that follows an Enter is
a no-op rather than a second commit. That matters beyond tidiness:
rule 44c counts one commit as one rule 41a edit, and a second pass through `setWidgetField` must not
be what decides the origin.

Steps must not depend on the browser firing `change` per step. Chromium fires `input` + `change`
for a spinner click and for an Up/Down arrow step; Firefox fires only `input` for an arrow step and
holds `change` until blur. So the field also commits on a keyboard step itself: the attachment's
`keydown` with `ArrowUp`/`ArrowDown` marks the field as stepping, the `input` event the browser
fires after it has applied the step commits the stepped value and clears the mark, and any other
key, the `keyup`, or a blur (a step at min/max fires no `input`) clears it — so typing after a
step is ordinary typing again (rule 44a). A spinner click is covered by its `change`
(confirm in Firefox and Chromium when changing this). happy-dom has no spinner and does not step on
a synthetic keydown, so tests fire the sequence a browser produces: `keydown` → `input` with the
stepped value → `keyup` for an arrow step, and `input` + `change` for a spinner click.

The fields bind `value={…}` one-way, and Svelte skips the DOM write when the bound number is
unchanged — so a blank commit, a refused commit, an Escape, or a commit whose clamp lands on the
already-stored number would leave stale text in the field. The commit handler therefore writes the
stored value back to the field itself after it commits or refuses; the `keydown` Escape does the
same write-back without committing, after which a blur's `change` finds the stored value and is a
no-op. Blank is `el.value === ''` (a number input reports unreadable
text as `''`); `Number('')` is `0`, which is why a blank must be caught before conversion. Rule
44b's two outcomes are decided at commit: a value normalization would clamp is clamped there (so the
field shows what a reload of the saved profile would show — `setWidgetField` alone clamps geometry
but stores `idleGraceSeconds` raw), and a value it would replace with the default (dwell or seconds
per page `<= 0`, `pinTop < 0`) is refused like a blank. Today `setCycleField` stores the cycle raw,
so a blank seconds per page or pin top N writes `0` until the next load.

**Server presence.** `onMount` → `refreshFromServer()` → `serverAvailable()`. True ⇒ profile list and
logo list load and the write controls are live. False ⇒ the editor degrades to client-only authoring
(`exportJson()` downloads a `config.json` to commit for static mode); the status line says so.

**Producer feed status (rules 25–30).** `onMount` also calls
`sseClient.connect(feedUrl, () => {}, { onOpen, onError })` — an `onState` that throws the snapshot
away, because the editor renders the *connection*, not the data. `feedStatus` is a four-valued
`$state` (`'connecting' | 'connected' | 'retrying' | 'stopped'`) set to `'connecting'` at open and
`'connected'` by `onOpen`. `onError` picks between the two failure values by the transport's
`readyState` at the moment it fires: `EventSource.CLOSED` (`2`) is `'stopped'` — the browser has
abandoned the connection — and anything else is `'retrying'`. A refused `EventSource` constructor
is `'stopped'`: nothing exists to retry. The Producer section renders its label from that into
`[data-testid="feed-status"]`, inside the same `<section>` as `[data-testid="producer-src"]` — and
deliberately *not* beside the header's `[data-testid="status"]` server line, which is the adjacency
rule 29 exists to prevent.

The rendered strings, which `what/` states the constraint on rather than pinning:

| Readout | State | Text |
|---|---|---|
| feed — `[data-testid="feed-status"]` | `connecting` | `Producer feed: connecting…` |
| | `connected` | `Producer feed: connected` |
| | `retrying` | `Producer feed: not connected — retrying…` |
| | `stopped` | `Producer feed: not connected` |
| companion server — `[data-testid="status"]` | server answers | `Profile server connected.` |
| | no server answers | `No profile server — changes can be exported as config.json.` |

`retrying` contains `stopped` as a substring, so assertions on this readout are exact-match, never
`toContain`.

The feed URL is `config.producer.src` (falling back to `DEFAULT_SRC` when it is empty or
whitespace), read from the config rather than from the input event, so a profile load — which
replaces the whole config, `producer.src` included — moves the connection exactly as a typed edit
does. A change is debounced **500 ms** before the old disposer runs and a new `connect` opens, so a
typed URL costs one connection, not one per keystroke. `new EventSource('http://')` throws
synchronously, so the `connect` call is guarded: a URL the browser refuses to open leaves the
readout `'stopped'` rather than propagating out of mount or an edit handler. Teardown runs the
disposer *and* clears any pending debounce timer, so unmounting mid-edit opens nothing. Two
independent concerns share the page and must not be conflated: this readout is the **race feed**;
the header status line is the **companion server**.

**Reconnect (rule 30).** `[data-testid="feed-reconnect"]` renders in the Producer section beside the
readout, `{#if}`-gated on `feedStatus` being `'retrying'` or `'stopped'` — absent otherwise, not
disabled. Its handler clears the pending rule-27 debounce timer and calls the same `openFeed(url)`
the debounce would have, with no timer of its own, against the current `feedUrl` — so `openedFeedUrl`
stays accurate and a later edit still reopens. It is a control, so rule 16 applies: help copy is
`FIELD_HELP.feedReconnect`, the ⓘ is `[data-testid="help-reconnect"]`.

**Live reload (read path, rule 22).** Every render page — `AllPage.svelte` and each standalone
page (`TowerPage`, `BattlePage`, `DriverPage`, `QualifyingPage`, `GridPage`, `ResultsPage`,
`LogosPage`, `UpdatesPage`, `InfoPage`, `WeatherPage`) — calls `watchConfig(location.search, …, { initial: resolved })`
after its initial `loadConfig`, and stops it on unmount. Each tick re-resolves the config through the
same precedence chain and compares; on a difference the page applies the new config exactly as its
initial load did, including `applyMotion(resolveMotion(location.search, { reducedMotion }))` so the
profile's `reducedMotion` refines `App.svelte`'s boot baseline (a `?motion=` param still wins;
likewise `applyTheme(resolveTheme(location.search, { preset: theme.preset }))` for the theme,
`what/overlay-config.md` rule 59;
`AllPage` also re-fits the stage). The SSE feed is **not** touched — a config edit never reconnects
the producer. The poll loads with `loadConfig(search, { strict: true })`, which **rejects** when the
named profile cannot be fetched (network error, non-OK from both the API and the static path — a
deleted profile's 404 included — or unparseable JSON) where the initial load falls back to the
default; the watcher skips a rejected tick, so a companion-server blip keeps the last good config
instead of snapping to the default layout (#353). The first failed tick after a good one logs one
`console.warn`; further failures stay quiet until a tick succeeds.

## Key Abstractions

- **Pure ops + reassignment.** All editing logic lives in `configEditor.js` as pure
  `(config, …) → newConfig` functions that run `normalizeConfig` on the way out. The component stays
  a thin shell (event → op → assign), and every rule is unit-testable with no DOM.
- **Geometry is clamped at the op, not the control.** `clampGeometry` keeps a widget ≥16 px and
  inside the canvas, so drag, resize, numeric entry, and a canvas resize all inherit the same bounds
  — there is no separate validation layer to keep in sync.
- **`serverAvailable()` validates shape, not status.** A pure-static host answers unknown paths with
  a `200` SPA `index.html`; checking `Array.isArray(data.profiles)` is what distinguishes a real
  companion server from that fallback. Do not weaken this to a status check.
- **Injectable `fetchImpl` everywhere.** Every `configApi` function takes `{ fetchImpl }`, so tests
  drive the whole write path (including upload) without a network or a server.
- **Self-rescheduling poll, not `setInterval`.** `watchConfig` schedules the next tick only after the
  current load settles, so a slow load can never overlap a newer one and apply a stale config out of
  order. A `stop()` during an in-flight load suppresses the result and does not reschedule.
- **Change detection by deep value.** `watchConfig` compares serialized normalized configs, so an
  unchanged profile re-fetched every 5 s produces zero swaps — the poll is invisible until something
  actually changed.
- **Help copy is data.** `configHelp.js` is keyed by widget and logical field name; the editor
  renders from it and tests assert the maps match the iterated config surface exactly. Adding a knob
  without help is a failing test (rules 18-19).
- **Feed status is transport state, never data state.** It is derived from `open`, `error` and the
  `readyState` that accompanies them, on the `EventSource` alone. Do not wire it to `state`-event
  arrival, a last-snapshot timestamp, or any timer — `what/overlay-config.md` rule 26 forbids stall
  detection outright, and that includes ageing `'retrying'` into `'stopped'`. This is also why
  the shared client's `onError` fires for transport errors only (`how/renderer.md`): a snapshot the
  editor cannot parse would otherwise read as a dropped feed on a connection that is perfectly
  healthy. The snapshots the editor receives are discarded; the preview stays on the fixture
  (rule 28).

## Integration Points

| Consumer | Provider | Mechanism |
|---|---|---|
| `ConfigPage` | companion server | `configApi.js` → `GET/PUT/POST/DELETE /api/profiles`, `/api/logos`. |
| `ConfigPage` | producer | `sseClient.connect(…, { onOpen, onError })` — status readout only, snapshots discarded. |
| `ConfigPage` | `AllView` | Renders the real composite widget tree as the live preview. |
| `ConfigPage` | `spec/v1/fixtures/race-close-battle.json` | Preview snapshot, **augmented on a copy** (see notes). |
| `AllPage` + standalone render pages | `configWatch.js` → `overlayConfig.loadConfig` | 5 s poll → swap config without a refresh. |
| Broadcaster → OBS | `buildObsUrl()` | `<origin>/all?profile=<name>&src=<producer>`, copied from the UI. |

## Implementation Notes

- **The preview fixture is copied, never edited.** `race-close-battle.json` is the canonical
  *no-telemetry* fixture — the compliance harness and an `AllLayout` idle test depend on it having no
  `subject.telemetry`. The editor spreads a **copy** and adds telemetry plus richer-tower fields so
  the HUD and the metric toggles show representative data. Never push those fields into the shared
  fixture.
  The copy also carries a `race_events` list (taken from `race-events.json`'s entries) so the
  preview's race update box has cards to show (`what/overlay-config.md` rule 51); `AllView` is
  rendered with `preview`, which it passes to `RaceUpdateBox` so the box takes no baseline.
  It also always carries `race-weather.json`'s `session.weather` (unlike the sample `info_lines`,
  it does not leave when the `info` widget gains lines), so the preview's weather box always has
  values and, with the card on, the info panel shows a weather card (`what/overlay-config.md`
  rules 53, 56–57). Both preview snapshots (with and without the sample lines) carry it.
  It also carries `event-info.json`'s `event`, and its `info_lines` only while the `info`
  widget's `lines` is empty, so the preview's info panel has a header and lines and a
  broadcaster's own line replaces the samples at once (`what/overlay-config.md` rule 53). The
  preview snapshot is therefore derived from `config`, not a constant.
- **The info lines list** (`what/overlay-config.md` rule 53) follows the Class Colors pattern: the
  new-line input is local UI state, not config, until Add; each stored line's input holds a local
  draft that is written through a `configEditor.js` helper only on commit (Enter or `change`),
  then re-shows the stored line, as the typed number fields do. The add/edit/remove helpers apply
  rule 52's trimming, 120-character cut, duplicate and 10-line limits, so the editor can never
  hold a `lines` value normalization would change.
- **Drag listeners live on `window`,** attached in `startDrag` and removed in `endDrag`, so a pointer
  that leaves the preview box still tracks and still releases. There are four — `pointermove` →
  `onDrag`, `pointerup` → `onPointerEnd`, `pointercancel` → `onPointerEnd`, `blur` → `endDrag` —
  and `endDrag` and the `onMount` cleanup each remove all four, so none outlives a drag or an unmount mid-drag. Being on `window`
  they hear every pointer, so `startDrag` stores `event.pointerId` in `drag`, and while one is live
  it still calls `event.preventDefault()` first, as it does for every press today, then returns
  without touching `drag`; the move, up and cancel listeners ignore an event whose `pointerId` is
  not the drag's (`what/overlay-config.md` rule 41e). `onDrag` ends the drag instead of placing
  when the drag's own pointer reports `buttons === 0` (rule 41d); `blur` carries no pointer and
  ends it unconditionally. `startDrag` does not filter by `pointerType`:
  a touch or pen press starts a drag like a mouse press. The calls to `endDrag()` from
  `setTextScale` and `loadProfile` carry no pointer and end the drag unconditionally. `.handle` and
  `.handle__resize` deliberately set no `touch-action`, so the browser keeps touch (and, where it
  scrolls with one, pen) gestures and cancels such a drag (rule 41e's second paragraph).
- **Config swaps are deliberately un-animated** on the render path — a layout change is an operator
  action, not a broadcast reveal. Do not route a live-reload swap through a transition.
- **Live reload relies on the API's `no-cache` headers** (`what/companion-server.md` rule 15, set in
  `server/lib/respond.js`); without them a poll would keep seeing a stale cached profile.
- **Per-widget controls are gated by a shared predicate, never by an inline key list.**
  `widgetSupportsAutoHide(key)` (`widgetIdle.js`) gates "hide when idle" and `isLowerThird(key)`
  (`overlayConfig.js`) gates the trigger knobs, so the applicability rule lives in one testable place
  instead of the markup. The plate-opacity control (`what/overlay-config.md` rule 23) follows the same
  shape: `rendersPlate(key)` (`overlayConfig.js`, exported alongside `isLowerThird`) gates a
  `plateAlpha` control onto the six plate-rendering widgets, rather than a `{#if key === …}` chain.
- **The editor is the only writer.** Render pages must never `PUT` config. If a new setting needs to
  be tunable, it gets a control here plus a `configHelp.js` entry — not a second write path.
