/**
 * Theme preset — the overlay-wide look (overlay-config rules 58–60, ADR 0026).
 *
 * Mirrors lib/motion.js: the resolved preset is written to one root attribute,
 * `<html data-theme="modern|vintage70|vintage80">`, and the token stylesheets key each preset's
 * overrides off that attribute (bare `[data-theme=…]`, so the /config preview stage can carry its
 * own). The attribute is always written on a render page, `modern` included.
 */

export const THEME_MODERN = 'modern'
export const THEME_PRESETS = ['modern', 'vintage70', 'vintage80']

/**
 * Resolve the preset. Precedence (highest first):
 *   1. an explicit `?theme=` URL param naming a preset (trimmed, case-insensitive; an unknown
 *      value is ignored so a typo cannot blank the look),
 *   2. the profile's `theme.preset` (already normalized to an exact preset name),
 *   3. the default, `modern`.
 *
 * @param {string} [search] - a `location.search` string.
 * @param {{ preset?: string }} [opts]
 * @returns {'modern'|'vintage70'|'vintage80'}
 */
export function resolveTheme(search = '', { preset } = {}) {
  let raw
  try {
    raw = new URLSearchParams(search || '').get('theme')
  } catch {
    raw = null
  }
  if (raw != null) {
    const v = String(raw).trim().toLowerCase()
    if (THEME_PRESETS.includes(v)) return v
  }
  return THEME_PRESETS.includes(preset) ? preset : THEME_MODERN
}

/** Write the resolved preset to the document root (`<html data-theme=...>`). No-op without a
 *  document (SSR / tests w/o DOM). */
export function applyTheme(preset) {
  if (typeof document === 'undefined' || !document.documentElement) return
  document.documentElement.dataset.theme = THEME_PRESETS.includes(preset) ? preset : THEME_MODERN
}
