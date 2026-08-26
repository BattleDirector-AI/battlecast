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
| `src/lib/testing/sourceScan.js` | `inlineEventSourceOffenders(srcRoot)` | The constructor half of that guard, as a function so it can be aimed somewhere other than the real tree. Walks all `.js`/`.svelte` under `srcRoot`, returns sorted root-relative offenders, excludes `lib/sseClient.js`, `*.test.js`, and `lib/testing/**` (see `how/renderer.md`). |
| `src/lib/testing/sourceScan.test.js` | Vitest | Drives the scan over synthetic trees whose offenders sit in `lib/`, `components/`, and a route — the real tree is clean either way, so only a fixture tree can tell a wide scan from a narrow one — then over the real `src/`. |
| `src/lib/testing/fakeEventSource.js` | `FakeEventSource`, `RefusingEventSource` | The stand-in the two suites above share — `happy-dom` has no `EventSource`. `emit()` plays the browser's part; a closed connection emits nothing; `RefusingEventSource` is the URL the browser will not construct. It also models `readyState` and the `CONNECTING`/`OPEN`/`CLOSED` constants, and dispatches events carrying `type`/`target` — the transport's state machine, not just its events, is what rule 25's two failure states turn on. `failRetrying()` and `failStopped()` are the two failure policies; a bare `emit('error')` is the stopped one, because a double with no retry loop dispatching one error *is* the abandoned failure. `FakeEventSource.reset()` is the single cleanup entry point and clears **both** doubles — `opened` and `refused` — so a suite calls it and nothing else. Not a `*.test.js`, so vitest does not collect it. |
| `src/lib/testing/fakeEventSource.test.js` | Vitest | The doubles' own contract: `reset()` clears both, a later suite inherits no earlier refusal, `live`/`last` follow the cleared list, and the `readyState` a listener observes for each failure policy. |
| `src/lib/config{Editor,Api,Watch,Help}.test.js` | Vitest | Unit suites for each module above — pure functions, injected `fetch`, fake timers. |

## Data Flow

**Editing (write path).** `ConfigPage` holds one `config = $state(normalizeConfig(DEFAULT_CONFIG))`.
Every control and every preview drag calls a `configEditor.*` function and **reassigns** the result
— `config = editor.moveWidget(config, key, x, y)` — so Svelte 5 reactivity is driven by whole-object
replacement, not mutation. `saveProfile()` then `PUT`s that object to `/api/profiles/<name>`.

**Preview.** The editor renders the real `AllView` against a fixture snapshot, scaled by
`previewScale` (`fitPreview()` fits the canvas into the panel, capped at 0.6). Pointer deltas are
divided by that scale before reaching `moveWidget`/`resizeWidget`, so a drag moves the widget by
canvas pixels, not screen pixels.

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

**Live reload (read path, rule 22).** `AllPage.svelte` calls `watchConfig(location.search, …,
{ initial: resolved })` after its initial `loadConfig`. Each tick re-resolves the config through the
same precedence chain and compares; on a difference it assigns the new config, re-applies motion, and
re-fits the stage. The SSE feed is **not** touched — a config edit never reconnects the producer.

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
| `AllPage` (render path) | `configWatch.js` → `overlayConfig.loadConfig` | 5 s poll → swap layout without a refresh. |
| Broadcaster → OBS | `buildObsUrl()` | `<origin>/all?profile=<name>&src=<producer>`, copied from the UI. |

## Implementation Notes

- **The preview fixture is copied, never edited.** `race-close-battle.json` is the canonical
  *no-telemetry* fixture — the compliance harness and an `AllLayout` idle test depend on it having no
  `subject.telemetry`. The editor spreads a **copy** and adds telemetry plus richer-tower fields so
  the HUD and the metric toggles show representative data. Never push those fields into the shared
  fixture.
- **Drag listeners live on `window`,** attached in `startDrag` and removed in `endDrag`, so a pointer
  that leaves the preview box still tracks and still releases.
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
