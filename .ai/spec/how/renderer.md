# Renderer (app/)

The Vite + Svelte 5 frontend that renders every overlay. Behavioral rules: `what/widgets.md`,
`what/overlay-config.md`.

## Module Map

| File | Key Symbols | Responsibility |
|---|---|---|
| `src/App.svelte` | route dispatch, `OVERLAY_ROUTES`, `FULL_BLEED_ROUTES` | Pathname → page component; full-bleed/transparent/motion boot setup. |
| `src/main.js` | — | Mounts the app. |
| `src/routes/<w>/sseClient.js` | `connect` (all routes); **tower** also exports `parseState`, `resolveSrc`, `DEFAULT_SRC`, `SUPPORTED_SCHEMA_VERSION`; battle/racecontrol/onboard inline the parse + a local `KNOWN_SCHEMA_VERSION` + the default URL string (onboard adds `resolveSpeedUnit`) | Open EventSource, parse `state` events, warn on unknown `schemaVersion`. Same behavior across routes; only the tower client is factored into named exports. |
| `src/lib/overlayConfig.js` | `loadConfig`, `normalizeConfig`, `resolveWidgets`, `pickProducerSrc`, `parseTowerMetricsParam`, `DEFAULT_CONFIG`, `WIDGET_KEYS` | Config contract: load, normalize, order widgets, pick producer URL, parse `?metrics=`. |
| `src/lib/motion.js` | `resolveMotion`, `applyMotion`, `prefersReducedMotion` | Motion policy → `<html data-motion>`. |
| `src/lib/widgetIdle.js` | `IDLE_PREDICATES`, `isWidgetIdle`, `widgetSupportsAutoHide` | Per-widget idle predicates for `hideWhenIdle`. |
| `src/lib/lowerThirdTrigger.js` | — | Edge-triggered camera-cut / dwell state machine for lower-thirds. |
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
   parses JSON and warns on unknown `schemaVersion`, and each snapshot flows into the widget.
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

- **happy-dom test env defaults `prefers-reduced-motion: reduce` to true.** Motion now gates on
  `data-motion`, not the media query, so this no longer silently disables animation paths — but
  motion tests still stamp `data-motion` explicitly (`*.motion.test.js`).
- **Speed is canonical km/h in the payload;** the on-board HUD converts to mph in the view layer
  (`× 0.621371`), it is never stored/emitted in mph.
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
