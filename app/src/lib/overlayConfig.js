/* Overlay configuration contract + loader for the `/all` render page.
 *
 * This module is the SOURCE OF TRUTH for the battlecast overlay config contract
 * pinned by the #32 spike decision
 * (docs/decisions/0001-overlay-config-and-asset-persistence.md). It is the READ
 * side (#16): the render page only ever reads config; the config UI (#34) is the
 * only writer. #33 (logo rotation) consumes the same contract.
 *
 * Design notes:
 * - Geometry model is ABSOLUTE PX against a fixed 1920x1080 canvas (LMU's supported
 *   resolution). The stage is scaled uniformly to the viewport by the render page,
 *   so a broadcaster gets the same layout at any Browser Source size.
 * - `loadConfig()` mirrors `resolveSrc()` in ../routes/tower/sseClient.js and
 *   resolves with precedence: explicit URL params -> fetched profile JSON ->
 *   built-in default. Nothing provided => default layout, so existing `/all` users
 *   are unbroken.
 * - Loading follows the spec's best-effort ethos: a missing/malformed profile logs
 *   a warning and falls back rather than rendering blank or throwing.
 */

import { DEFAULT_SRC } from '../routes/tower/sseClient.js'

/** Config contract version, numbered independently of the app release and the
 *  spec `schemaVersion`. */
export const CONFIG_VERSION = '1'

/** The DEFAULT layout canvas (LMU's documented resolution). Widget geometry is
 *  absolute px within the canvas. The canvas size is configurable per profile
 *  (`config.canvas`), defaulting to this; render pages scale it to the viewport. */
export const OVERLAY_CANVAS = Object.freeze({ w: 1920, h: 1080 })

/** Smallest sensible canvas edge — guards the scale math against zero/absurd sizes. */
export const MIN_CANVAS = 320

/** Built-in default layout — reproduces today's side-by-side `/all` arrangement
 *  (tower in the left column, battle box as an upper band to its right) so existing
 *  users are not broken when no configuration is supplied. `logos` defaults hidden. */
export const DEFAULT_CONFIG = Object.freeze({
  configVersion: CONFIG_VERSION,
  name: 'default',
  producer: { src: DEFAULT_SRC },
  canvas: { w: OVERLAY_CANVAS.w, h: OVERLAY_CANVAS.h },
  widgets: {
    // Default widget widths match each component's intrinsic width (tower 380px,
    // battle 440px) so the config editor's drag box lines up with what renders.
    // `hideWhenIdle` defaults off, so widgets that support it keep showing their
    // idle placeholder unless the broadcaster opts in.
    // Every widget carries the full field set — geometry + `hideWhenIdle` + the
    // lower-third trigger knobs (`trigger`, `dwellSeconds`, `showOnConnect`) — so
    // the normalized shape matches this default exactly. Only the lower-third
    // widgets (driver #21, qualifying #22) actually read the trigger knobs.
    tower: {
      visible: true, x: 24, y: 24, w: 380, h: 900, z: 1, hideWhenIdle: false,
      trigger: 'dwell', dwellSeconds: 6, showOnConnect: true,
      modes: ['qualifying', 'practice'], fireOnClassBest: true,
      classDisplay: 'inline', speedUnit: 'kmh',
      waitForLowerThird: true,
      driverInfo: { name: true, number: true, class: false, make: false, model: false },
    },
    battle: {
      visible: true, x: 428, y: 24, w: 440, h: 220, z: 2, hideWhenIdle: false,
      trigger: 'dwell', dwellSeconds: 6, showOnConnect: true,
      modes: ['qualifying', 'practice'], fireOnClassBest: true,
      classDisplay: 'inline', speedUnit: 'kmh',
      waitForLowerThird: true,
      driverInfo: { name: true, number: true, class: false, make: false, model: false },
    },
    logos: {
      visible: false, x: 1560, y: 900, w: 320, h: 140, z: 3, hideWhenIdle: false,
      trigger: 'dwell', dwellSeconds: 6, showOnConnect: true,
      modes: ['qualifying', 'practice'], fireOnClassBest: true,
      classDisplay: 'inline', speedUnit: 'kmh',
      waitForLowerThird: true,
      driverInfo: { name: true, number: true, class: false, make: false, model: false },
    },
    // Driver lower-third (#21): a wide, short identity name-tag near the bottom of
    // the canvas. It self-manages fire/dwell/hide, so it renders nothing between
    // camera cuts even while `visible`.
    driver: {
      visible: true, x: 48, y: 900, w: 620, h: 96, z: 4, hideWhenIdle: false,
      trigger: 'dwell', dwellSeconds: 6, showOnConnect: true,
      modes: ['qualifying', 'practice'], fireOnClassBest: true,
      classDisplay: 'inline', speedUnit: 'kmh',
      waitForLowerThird: true,
      driverInfo: { name: true, number: true, class: false, make: false, model: false },
    },
    // Qualifying / sector lower-third (#22): a wide timing bar for the on-camera
    // subject (best/last lap, sectors, and target/delta when present). Offset
    // vertically above the driver name-tag so the two bottom lower-thirds don't
    // overlap. Mode-gated (`modes`) with an independent class-best flash
    // (`fireOnClassBest`); it self-manages fire/dwell/hide like the driver card.
    qualifying: {
      visible: true, x: 48, y: 788, w: 840, h: 100, z: 5, hideWhenIdle: false,
      trigger: 'dwell', dwellSeconds: 6, showOnConnect: true,
      modes: ['qualifying', 'practice'], fireOnClassBest: true,
      classDisplay: 'inline', speedUnit: 'kmh',
      waitForLowerThird: true,
      driverInfo: { name: true, number: true, class: false, make: false, model: false },
    },
    // Race Control — flag / FCY / Safety-Car status (#25): a top-of-canvas status
    // bar, clear of the left-column tower and the battle box beside it. Not a
    // lower-third and not class-aware: the trigger knobs (trigger/dwellSeconds/
    // showOnConnect/fireOnClassBest), `modes`, and `classDisplay` are all INERT
    // for this widget — carried only for a uniform widget shape. It renders
    // whenever visible and there is session content, in every mode.
    racecontrol: {
      visible: true, x: 900, y: 24, w: 360, h: 44, z: 6, hideWhenIdle: false,
      trigger: 'dwell', dwellSeconds: 6, showOnConnect: true,
      modes: ['race', 'qualifying', 'practice'], fireOnClassBest: true,
      classDisplay: 'inline', speedUnit: 'kmh',
      waitForLowerThird: true,
      driverInfo: { name: true, number: true, class: false, make: false, model: false },
    },
    // On-board HUD — the on-camera subject's live inputs (#26): a bottom-centre,
    // content-sized over-camera strip (throttle/brake bars + speed + gear). Not a
    // lower-third and not class-aware: the trigger knobs (trigger/dwellSeconds/
    // showOnConnect/fireOnClassBest), `modes`, and `classDisplay` are all INERT for
    // this widget — carried only for a uniform widget shape. It reads the subject's
    // telemetry every tick and renders whenever visible and there is telemetry
    // content (its own guard), so it idles automatically in parked phases. `speedUnit`
    // is the one onboard-specific knob it DOES read: the display unit for the `speed`
    // readout (`'kmh'` | `'mph'`); the producer emits canonical km/h and the widget
    // converts to mph when selected.
    onboard: {
      visible: true, x: 760, y: 960, w: 400, h: 96, z: 7, hideWhenIdle: false,
      trigger: 'dwell', dwellSeconds: 6, showOnConnect: true,
      modes: ['race', 'qualifying', 'practice'], fireOnClassBest: true,
      classDisplay: 'inline', speedUnit: 'kmh',
      waitForLowerThird: true,
      driverInfo: { name: true, number: true, class: false, make: false, model: false },
    },
  },
  logoRotation: { images: [], perSlotSeconds: 8, order: 'sequential' },
  theme: {},
})

/** Lower-third trigger defaults (see docs/decisions/0002-lower-third-widgets.md).
 *  Normalized onto every widget like `hideWhenIdle`, but only the lower-third
 *  widgets (driver #21, qualifying #22) read them; the geometry-only widgets
 *  ignore them. Additive + defaulted, so no `configVersion` bump. */
export const LOWER_THIRD_DEFAULTS = Object.freeze({
  trigger: 'dwell',
  dwellSeconds: 6,
  showOnConnect: true,
})

/** #22 qualifying/sector lower-third extras (see docs/decisions/0002-…). `modes`
 *  are the session modes it dwells on every camera cut; `fireOnClassBest` toggles
 *  the independent "fastest lap" flash the producer's `notable.class_best_lap`
 *  flag drives. Normalized onto every widget (like the trigger knobs), but only the
 *  qualifying widget reads them. */
export const QUALIFYING_DEFAULTS = Object.freeze({
  modes: Object.freeze(['qualifying', 'practice']),
  fireOnClassBest: true,
})

/** #28 standings-tower extra: `classDisplay` selects how the tower lays out a
 *  multi-class field — `'inline'` (one overall-position list, each row badged with
 *  its class position) or `'grouped'` (per-class sections in registry order, with
 *  positions restarting within each class). Normalized onto every widget for a
 *  uniform shape, but only the tower reads it. Additive + defaulted, so no
 *  `configVersion` bump. */
export const TOWER_DEFAULTS = Object.freeze({
  classDisplay: 'inline',
})

/** Widgets whose class-aware layout the config UI surfaces a `classDisplay` control
 *  for. Just the standings tower today. */
export const TOWER_KEYS = Object.freeze(['tower'])

/** Whether a widget is the class-aware standings tower (so the config UI surfaces
 *  its `classDisplay` control). */
export function isTower(key) {
  return TOWER_KEYS.includes(key)
}

/** #26 on-board HUD extras — only the on-board HUD reads these, but they're normalized
 *  onto every widget (like `classDisplay`) for a uniform shape. Additive + defaulted, so
 *  no `configVersion` bump.
 *   - `speedUnit`: display unit for the speed readout, `'kmh'` (default) or `'mph'`. The
 *     producer emits `speed` in canonical km/h (spec/v1/SPEC.md `subject.telemetry`); the
 *     widget converts to mph when selected.
 *   - `driverInfo`: which on-camera driver/vehicle identity fields the HUD shows — each of
 *     `name` / `number` / `class` / `make` / `model` toggled independently (name+number on
 *     by default). `number`/`make`/`model` come from the additive `vehicle` spec fields.
 *   - `waitForLowerThird`: when true (default), the HUD holds off while the driver
 *     lower-third (#21) is showing its "now on camera" dwell, so the two never overlap;
 *     it reveals when the lower-third wipes out. Only applies in `/all` (where both
 *     widgets coexist); the standalone `/onboard` route has no lower-third to wait for. */
export const ONBOARD_DEFAULTS = Object.freeze({
  speedUnit: 'kmh',
  waitForLowerThird: true,
  driverInfo: Object.freeze({
    name: true,
    number: true,
    class: false,
    make: false,
    model: false,
  }),
})

/** The driver/vehicle identity fields the on-board HUD can show, in render order. */
export const DRIVER_INFO_FIELDS = Object.freeze(['name', 'number', 'class', 'make', 'model'])

/** Coerce an arbitrary `driverInfo` into the full `{name,number,class,make,model}`
 *  boolean shape, filling missing/garbage fields from `fallback`. */
function normalizeDriverInfo(value, fallback) {
  const src = value && typeof value === 'object' ? value : {}
  const out = {}
  for (const field of DRIVER_INFO_FIELDS) {
    out[field] = typeof src[field] === 'boolean' ? src[field] : !!fallback[field]
  }
  return out
}

/** Valid `speedUnit` display values. */
export const SPEED_UNITS = Object.freeze(['kmh', 'mph'])

/** Widgets whose speed-unit the config UI surfaces a control for. Just the on-board
 *  HUD today. */
export const ONBOARD_KEYS = Object.freeze(['onboard'])

/** Whether a widget is the on-board HUD (so the config UI surfaces its `speedUnit`
 *  control). */
export function isOnboard(key) {
  return ONBOARD_KEYS.includes(key)
}

/** Canonical widget keys in the layout contract, DERIVED from DEFAULT_CONFIG so it
 *  cannot drift from the real source of truth. `logos` is part of the contract for
 *  #33/#34 even though `/all` renders no logos component until #33 lands. */
export const WIDGET_KEYS = Object.freeze(Object.keys(DEFAULT_CONFIG.widgets))

/** Widgets that are subject-driven lower-thirds and therefore read the trigger
 *  knobs (`trigger`, `dwellSeconds`, `showOnConnect`). Driver (#21) today; the
 *  qualifying/sector lower-third (#22) joins here when it lands. */
export const LOWER_THIRD_KEYS = Object.freeze(['driver', 'qualifying'])

/** Whether a widget is a lower-third (so the config UI surfaces its trigger knobs). */
export function isLowerThird(key) {
  return LOWER_THIRD_KEYS.includes(key)
}

/** Deep clone that works in Node >=17 / happy-dom (structuredClone) with a JSON
 *  fallback. DEFAULT_CONFIG is frozen, so callers must clone before mutating. */
function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

/** Coerce to a finite number, else the provided default. */
function num(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Coerce a `modes` value to a clean string array, falling back to `fallback`.
 *  Accepts an array (trimmed non-empty strings) or a comma list; anything empty
 *  or malformed yields a fresh copy of the fallback so gating still works. */
function normalizeModes(value, fallback) {
  const list = Array.isArray(value) ? value : value != null ? String(value).split(',') : []
  const cleaned = list.map((s) => String(s).trim()).filter(Boolean)
  return cleaned.length ? cleaned : [...fallback]
}

/** Split a comma list (`?hide=battle,logos`) into trimmed non-empty tokens. */
function splitList(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Normalize an arbitrary (possibly malformed / partial) config into the full
 * contract shape: every widget has a boolean `visible` and finite geometry, with
 * missing pieces filled from the default. Unknown widget keys from a newer profile
 * are preserved (best-effort forward-compat), defaulting hidden.
 */
export function normalizeConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = clone(DEFAULT_CONFIG)

  out.configVersion = src.configVersion != null ? String(src.configVersion) : CONFIG_VERSION
  if (src.name != null) out.name = String(src.name)
  if (src.producer && typeof src.producer === 'object') {
    out.producer = { ...out.producer, ...src.producer }
  }
  if (src.logoRotation && typeof src.logoRotation === 'object') {
    out.logoRotation = { ...out.logoRotation, ...src.logoRotation }
  }
  if (src.theme && typeof src.theme === 'object') {
    out.theme = { ...out.theme, ...src.theme }
  }

  const canvasSrc = src.canvas && typeof src.canvas === 'object' ? src.canvas : {}
  out.canvas = {
    w: Math.max(MIN_CANVAS, Math.round(num(canvasSrc.w, OVERLAY_CANVAS.w))),
    h: Math.max(MIN_CANVAS, Math.round(num(canvasSrc.h, OVERLAY_CANVAS.h))),
  }

  const widgets = src.widgets && typeof src.widgets === 'object' ? src.widgets : {}
  const keys = new Set([...Object.keys(out.widgets), ...Object.keys(widgets)])
  const normalizedWidgets = {}
  for (const key of keys) {
    const w = widgets[key] && typeof widgets[key] === 'object' ? widgets[key] : {}
    const d = DEFAULT_CONFIG.widgets[key] || { visible: false, x: 0, y: 0, w: 0, h: 0, z: 0 }
    normalizedWidgets[key] = {
      visible: typeof w.visible === 'boolean' ? w.visible : d.visible,
      x: num(w.x, d.x),
      y: num(w.y, d.y),
      w: num(w.w, d.w),
      h: num(w.h, d.h),
      z: num(w.z, d.z),
      // Opt-in: when true, a widget that supports it (see widgetIdle.js) is removed
      // from the render while it has nothing meaningful to show (e.g. the battle box
      // in clear air). Defaults false, so existing profiles keep showing the idle
      // placeholder.
      hideWhenIdle: typeof w.hideWhenIdle === 'boolean' ? w.hideWhenIdle : d.hideWhenIdle ?? false,
      // Lower-third trigger knobs — normalized onto every widget (like
      // hideWhenIdle), but only the lower-third widgets read them. Applies the
      // per-widget default first, then the shared LOWER_THIRD_DEFAULTS.
      trigger:
        w.trigger === 'dwell' || w.trigger === 'persistent'
          ? w.trigger
          : d.trigger ?? LOWER_THIRD_DEFAULTS.trigger,
      dwellSeconds:
        Number(w.dwellSeconds) > 0
          ? num(w.dwellSeconds, d.dwellSeconds ?? LOWER_THIRD_DEFAULTS.dwellSeconds)
          : d.dwellSeconds ?? LOWER_THIRD_DEFAULTS.dwellSeconds,
      showOnConnect:
        typeof w.showOnConnect === 'boolean'
          ? w.showOnConnect
          : d.showOnConnect ?? LOWER_THIRD_DEFAULTS.showOnConnect,
      // #22 qualifying extras — `modes` (session modes it dwells on cuts) and
      // `fireOnClassBest` (the producer-flag class-best flash). Only the qualifying
      // widget reads them; normalized onto every widget for a uniform shape.
      modes: normalizeModes(w.modes, d.modes ?? QUALIFYING_DEFAULTS.modes),
      fireOnClassBest:
        typeof w.fireOnClassBest === 'boolean'
          ? w.fireOnClassBest
          : d.fireOnClassBest ?? QUALIFYING_DEFAULTS.fireOnClassBest,
      // #28 tower class-aware layout — only the standings tower reads it, but it's
      // normalized onto every widget (like the trigger knobs) for a uniform shape.
      // An unknown value falls back to the default so a stale/typo'd profile still
      // renders a valid layout.
      classDisplay:
        w.classDisplay === 'inline' || w.classDisplay === 'grouped'
          ? w.classDisplay
          : d.classDisplay ?? TOWER_DEFAULTS.classDisplay,
      // #26 on-board HUD display unit — only the on-board HUD reads it, but it's
      // normalized onto every widget (like classDisplay) for a uniform shape. An
      // unknown value falls back to the default so a stale/typo'd profile still
      // renders a valid unit.
      speedUnit:
        w.speedUnit === 'kmh' || w.speedUnit === 'mph'
          ? w.speedUnit
          : d.speedUnit ?? ONBOARD_DEFAULTS.speedUnit,
      // #26 on-board HUD hand-off + identity — only the HUD reads these; normalized
      // onto every widget for a uniform shape (like classDisplay / speedUnit).
      waitForLowerThird:
        typeof w.waitForLowerThird === 'boolean'
          ? w.waitForLowerThird
          : typeof d.waitForLowerThird === 'boolean'
            ? d.waitForLowerThird
            : ONBOARD_DEFAULTS.waitForLowerThird,
      driverInfo: normalizeDriverInfo(
        w.driverInfo,
        d.driverInfo ?? ONBOARD_DEFAULTS.driverInfo,
      ),
    }
  }
  out.widgets = normalizedWidgets
  return out
}

/** Apply explicit URL-param overrides (highest precedence). Supported today:
 *  `?show=` / `?hide=` comma lists toggle per-widget visibility — a quick OBS knob
 *  to flip a widget without editing the saved profile. */
function applyUrlOverrides(config, params) {
  const out = clone(config)
  const setVisible = (raw, visible) => {
    for (const key of splitList(raw)) {
      if (out.widgets[key]) out.widgets[key].visible = visible
    }
  }
  if (params.has('show')) setVisible(params.get('show'), true)
  if (params.has('hide')) setVisible(params.get('hide'), false)
  return out
}

/** Fetch a named profile, trying server mode (`/api/profiles/<name>`) first and
 *  falling back to static mode (`/config/<name>.json`). Returns the parsed JSON, or
 *  null if neither is reachable/ok. */
async function fetchProfile(name, fetchImpl) {
  const candidates = [
    `/api/profiles/${encodeURIComponent(name)}`,
    `/config/${encodeURIComponent(name)}.json`,
  ]
  for (const url of candidates) {
    try {
      const res = await fetchImpl(url)
      if (res && res.ok) return await res.json()
    } catch {
      // try the next candidate (server not running, offline, etc.)
    }
  }
  return null
}

/**
 * Resolve the overlay config for a render page from `location.search`.
 *
 * Precedence (highest wins): explicit URL params -> fetched profile JSON ->
 * built-in default. `?profile=<name>` selects a saved profile; if it cannot be
 * loaded we warn and keep the default (best-effort, never blank).
 *
 * @param {string} search - a `location.search` string (e.g. `?profile=race`).
 * @param {{ fetchImpl?: typeof fetch }} [opts] - injectable fetch for testing.
 * @returns {Promise<object>} the normalized config.
 */
export async function loadConfig(search, { fetchImpl } = {}) {
  const params = new URLSearchParams(search || '')
  const doFetch = fetchImpl || (typeof globalThis !== 'undefined' ? globalThis.fetch : undefined)

  let raw = null
  const profileName = params.get('profile')
  if (profileName && profileName.trim()) {
    raw = doFetch ? await fetchProfile(profileName.trim(), doFetch) : null
    if (!raw) {
      console.warn(
        `[battlecast] profile "${profileName.trim()}" could not be loaded; using default layout.`,
      )
    }
  }

  // Normalize first — this fills every widget/field from the default (so a partial
  // profile is completed and `/all` is never blank) — then let explicit URL params
  // override, so ?show=/?hide= win over both the profile and the default.
  const config = normalizeConfig(raw ?? DEFAULT_CONFIG)
  return applyUrlOverrides(config, params)
}

/**
 * The ordered list of widgets to render, sorted by z (ascending = painted first /
 * lowest). Callers filter on `visible` and on whether a component exists yet.
 */
export function resolveWidgets(config) {
  const c = normalizeConfig(config)
  return Object.entries(c.widgets)
    .map(([key, w]) => ({ key, ...w }))
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
}

/**
 * Pick the producer SSE URL for `/all`: an explicit `?src=` wins (trimmed, matching
 * resolveSrc's semantics), else the profile's `producer.src`, else the default. This
 * lets a saved profile carry its producer while `?src=` still overrides per Browser
 * Source.
 */
export function pickProducerSrc(search, config) {
  const explicit = new URLSearchParams(search || '').get('src')
  if (explicit && explicit.trim()) return explicit.trim()
  const fromProfile = config?.producer?.src
  if (fromProfile && String(fromProfile).trim()) return String(fromProfile).trim()
  return DEFAULT_SRC
}
