# Overlay Configuration

The layout/visibility/rotation/motion contract that render pages read and the `/config` UI writes.
Decision record: `docs/decisions/0001-overlay-config-and-asset-persistence.md`; implementation in
`how/renderer.md`.

## Behavioral Rules

### Contract & versioning

1. Config carries its own **`configVersion`** (`"1"`), numbered independently of the spec
   `schemaVersion` and the app release version.
2. Config additions are **additive + defaulted** — new per-widget knobs are normalized onto every
   widget and do not bump `configVersion`. Existing profiles keep working unchanged.
3. **Split read from write:** render pages only *read* config over HTTP; the `/config` UI is the
   only writer. The render path is identical whether config/assets come from the companion server or
   a static host.

### Loading & precedence

4. Config resolution follows precedence **explicit URL params → fetched profile JSON → built-in
   default**. Nothing provided ⇒ default layout, so existing `/all` users are never broken.
5. `?profile=<name>` fetches server mode (`/api/profiles/<name>`) first, then static mode
   (`/config/<name>.json`). A missing/malformed profile **logs a warning and falls back to default**
   — best-effort, never blank, never thrown (mirrors the spec's tolerance ethos).
6. Normalization coerces any partial/malformed config into the full shape: every widget gets a
   boolean `visible`, finite geometry, and all defaulted knobs. **Unknown widget keys from a newer
   profile are preserved** (forward-compat), defaulting hidden.
7. `?show=` / `?hide=` comma lists are the **highest-precedence** visibility override, applied after
   normalization so they win over both profile and default.
8. Producer SSE URL for `/all` is picked as `?src=` → profile `producer.src` → default
   (`http://localhost:8080/events`).

### Geometry

9. Geometry is **absolute px against a fixed canvas** (default 1920×1080, LMU's supported
   resolution; configurable per profile via `config.canvas`, min edge 320). The render page scales
   the canvas uniformly to the viewport, so a broadcaster gets the same layout at any Browser Source
   size. Widgets paint in ascending `z` order.

### Motion

10. The overlay animates by default; `reducedMotion` (profile, default false) turns transitions
    down. Resolution precedence: `?motion=` URL param → `reducedMotion` config → default full. The
    resolved mode is written once to `<html data-motion="full"|"reduced">`, the single source both
    CSS (`:root[data-motion=…]`) and JS read. The OS `prefers-reduced-motion` media query is NOT
    consulted (OBS/CEF reports `reduce` and would otherwise hard-cut every transition).

### Per-widget knob applicability

11. Knobs are normalized onto every widget for a uniform shape, but only certain widgets **read**
    each one:

    | Knob | Read by | Meaning |
    |---|---|---|
    | `visible`, `x/y/w/h/z` | all | geometry + visibility |
    | `hideWhenIdle` | supporting widgets (battle, logos, driver, qualifying) | auto-hide when idle |
    | `trigger`, `dwellSeconds`, `showOnConnect` | lower-thirds (driver, qualifying) | fire/dwell timing |
    | `modes`, `fireOnClassBest` | qualifying | mode-gating + class-best flash |
    | `classDisplay` | tower | inline vs grouped multi-class layout |
    | `towerMetrics` | tower | `{interval,pit,tire,fuel}` indicator toggles (interval on, rest off by default) |
    | `speedUnit`, `driverInfo`, `waitForLowerThird` | onboard | unit, identity fields, hand-off |

12. **URL-only knobs** (not stored in a profile) layer on top of the loaded config per Browser
    Source: `?class=<vehicle_class>` is a **cross-route field filter** read by `/tower`, `/all`,
    `/grid`, and `/results` (narrows the rendered field to one class); `?metrics=` on the standalone
    `/tower` route selects which `towerMetrics` are on (comma list; the analogue of `?unit=mph` on
    `/onboard`); `?show=`/`?hide=` (rule 7) and `?motion=` (rule 10) as above.

## Configuration Surface

Profile shape: `configVersion`, `name`, `producer.src`, `canvas{w,h}`,
`widgets.<key>{…}`, `logoRotation{images,perSlotSeconds,order}`, `theme{}`, `reducedMotion`.
Widget keys: `tower`, `battle`, `logos`, `driver`,
`qualifying`, `racecontrol`, `onboard`. Each widget carries the full normalized knob set (geometry +
`hideWhenIdle` + `trigger`/`dwellSeconds`/`showOnConnect` + `modes`/`fireOnClassBest` +
`classDisplay` + `towerMetrics` + `speedUnit`/`driverInfo`/`waitForLowerThird`), but only the
widget noted in the rule-11 table actually reads each.

URL-only knobs (per Browser Source, not stored in a profile): `?src=`, `?profile=`, `?show=`,
`?hide=`, `?motion=`, `?class=` (cross-route field filter), `?unit=mph` (standalone `/onboard`),
`?metrics=` (standalone `/tower`).

## Constraints

- Config/assets are a battlecast-app concern, **orthogonal to `spec/v1`** — changing config must not
  touch the producer contract or the compliance harness.
- Additive-only: never make an existing knob required or change its default in a way that alters a
  saved profile's rendered layout without a `configVersion` bump.
