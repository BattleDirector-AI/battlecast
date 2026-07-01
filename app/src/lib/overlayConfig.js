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

import { resolveSrc, DEFAULT_SRC } from '../routes/tower/sseClient.js'

/** Config contract version, numbered independently of the app release and the
 *  spec `schemaVersion`. */
export const CONFIG_VERSION = '1'

/** The fixed layout canvas. Widget geometry is absolute px within this box. */
export const OVERLAY_CANVAS = Object.freeze({ w: 1920, h: 1080 })

/** Widget keys known to the `/all` layout contract. `logos` is reserved for the
 *  logo-rotation widget (#33); it is part of the contract now so profiles and the
 *  config UI (#34) can target a stable shape, even though `/all` does not render a
 *  logos component until #33 lands. */
export const WIDGET_KEYS = Object.freeze(['tower', 'battle', 'logos'])

/** Built-in default layout — reproduces today's side-by-side `/all` arrangement
 *  (tower top-left column, battle box as a lower band) so existing users are not
 *  broken when no configuration is supplied. `logos` defaults hidden. */
export const DEFAULT_CONFIG = Object.freeze({
  configVersion: CONFIG_VERSION,
  name: 'default',
  producer: { src: DEFAULT_SRC },
  widgets: {
    tower: { visible: true, x: 24, y: 24, w: 360, h: 900, z: 1 },
    battle: { visible: true, x: 408, y: 24, w: 640, h: 220, z: 2 },
    logos: { visible: false, x: 1560, y: 900, w: 320, h: 140, z: 3 },
  },
  logoRotation: { images: [], perSlotSeconds: 8, order: 'sequential' },
  theme: {},
})

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

  out.configVersion = String(src.configVersion || CONFIG_VERSION)
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
    }
  }
  out.widgets = normalizedWidgets
  return out
}

/** Merge a fetched profile over a base config (per-widget shallow merge so a
 *  profile can override just `visible` or just a coordinate). */
function mergeProfile(base, profile) {
  const out = clone(base)
  if (!profile || typeof profile !== 'object') return out

  if (profile.configVersion != null) out.configVersion = String(profile.configVersion)
  if (profile.name != null) out.name = String(profile.name)
  if (profile.producer && typeof profile.producer === 'object') {
    out.producer = { ...out.producer, ...profile.producer }
  }
  if (profile.logoRotation && typeof profile.logoRotation === 'object') {
    out.logoRotation = { ...out.logoRotation, ...profile.logoRotation }
  }
  if (profile.theme && typeof profile.theme === 'object') {
    out.theme = { ...out.theme, ...profile.theme }
  }
  if (profile.widgets && typeof profile.widgets === 'object') {
    for (const [key, w] of Object.entries(profile.widgets)) {
      if (w && typeof w === 'object') out.widgets[key] = { ...(out.widgets[key] || {}), ...w }
    }
  }
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

  let config = clone(DEFAULT_CONFIG)

  const profileName = params.get('profile')
  if (profileName && profileName.trim()) {
    const raw = doFetch ? await fetchProfile(profileName.trim(), doFetch) : null
    if (raw) {
      config = mergeProfile(config, raw)
    } else {
      console.warn(
        `[battlecast] profile "${profileName.trim()}" could not be loaded; using default layout.`,
      )
    }
  }

  config = applyUrlOverrides(config, params)
  return normalizeConfig(config)
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
 * Pick the producer SSE URL for `/all`: an explicit `?src=` wins (via resolveSrc's
 * exact semantics), else the profile's `producer.src`, else the default. This lets
 * a saved profile carry its producer while `?src=` still overrides per Browser
 * Source.
 */
export function pickProducerSrc(search, config) {
  const explicit = new URLSearchParams(search || '').get('src')
  if (explicit && explicit.trim()) return resolveSrc(search)
  const fromProfile = config?.producer?.src
  if (fromProfile && String(fromProfile).trim()) return String(fromProfile).trim()
  return DEFAULT_SRC
}
