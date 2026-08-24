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
| `src/lib/configHelp.js` | `WIDGET_HELP`, `FIELD_HELP`, `TOWER_METRIC_HELP`, `DRIVER_INFO_HELP` | Broadcaster-facing help copy for every control — data, not markup. |
| `src/lib/HelpTip.svelte` | — | The ⓘ affordance: click to reveal, `Escape`/outside-click to dismiss, flips to stay in the viewport, cancels its own click. |
| `src/lib/overlayConfig.js` | `normalizeConfig`, `DEFAULT_CONFIG`, `WIDGET_KEYS`, `TOWER_METRIC_FIELDS`, `DRIVER_INFO_FIELDS`, `isLowerThird` | The config contract the editor edits and the render path loads (see `how/renderer.md`). |
| `src/routes/config/ConfigPage.{test,help,upload}.test.js` | Vitest | Editor behavior, help coverage, and logo-upload suites. |
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

## Integration Points

| Consumer | Provider | Mechanism |
|---|---|---|
| `ConfigPage` | companion server | `configApi.js` → `GET/PUT/POST/DELETE /api/profiles`, `/api/logos`. |
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
  instead of the markup. The plate-opacity control (`what/overlay-config.md` rule 23,
  `[PLANNED: #145]`) follows the same shape: a `plateAlpha` control shown only for the six
  plate-rendering widgets, driven by a predicate exported alongside `isLowerThird` rather than a
  `{#if key === …}` chain.
- **The editor is the only writer.** Render pages must never `PUT` config. If a new setting needs to
  be tunable, it gets a control here plus a `configHelp.js` entry — not a second write path.
