/* Motion policy for the overlay.
 *
 * Broadcast overlays render in OBS's Browser Source, which runs Chromium offscreen
 * (CEF) and reports `prefers-reduced-motion: reduce`. Honoring the render HOST's
 * preference therefore turns every transition into a hard cut in OBS — even though the
 * overlay's audience is the stream viewer, not the machine running OBS. So the overlay
 * **animates by default** and only reduces motion when the broadcaster explicitly opts
 * in, via a `?motion=reduced` URL knob (per Browser Source, like `?src=`) or the
 * `/config` "reduced motion" toggle.
 *
 * The resolved mode is written once to a root attribute, `data-motion="full" |
 * "reduced"`, so CSS gates on `:root[data-motion=...]` and JS reads the same value —
 * one overridable, testable source of truth. Note the CSS default (attribute absent, or
 * `full`) is to ANIMATE; only an explicit `reduced` turns motion down. The OS
 * `prefers-reduced-motion` media query is intentionally NOT consulted, so an OBS/CEF
 * host (or a broadcast PC set to reduce motion) does not silently kill the overlay.
 */

export const MOTION_FULL = 'full'
export const MOTION_REDUCED = 'reduced'

const REDUCED_TOKENS = new Set(['reduced', 'reduce', 'off', 'min', 'low', 'none', '0', 'false'])
const FULL_TOKENS = new Set(['full', 'on', 'yes', 'motion', '1', 'true'])

/**
 * Resolve the motion mode. Precedence (highest first):
 *   1. an explicit `?motion=` URL param (`reduced`/`off`/... => reduced; `full`/`on`/...
 *      => full),
 *   2. the config `reducedMotion` boolean (from a saved profile / the `/config` toggle),
 *   3. the default, **full** (animate).
 *
 * @param {string} [search] - a `location.search` string.
 * @param {{ reducedMotion?: boolean }} [opts]
 * @returns {'full'|'reduced'}
 */
export function resolveMotion(search = '', { reducedMotion = false } = {}) {
  let raw
  try {
    raw = new URLSearchParams(search || '').get('motion')
  } catch {
    raw = null
  }
  if (raw != null) {
    const v = String(raw).trim().toLowerCase()
    if (REDUCED_TOKENS.has(v)) return MOTION_REDUCED
    if (FULL_TOKENS.has(v)) return MOTION_FULL
  }
  return reducedMotion ? MOTION_REDUCED : MOTION_FULL
}

/** Write the resolved motion mode to the document root (`<html data-motion=...>`), the
 *  hook every widget's CSS and JS reads. No-op without a document (SSR / tests w/o DOM). */
export function applyMotion(mode) {
  if (typeof document === 'undefined' || !document.documentElement) return
  document.documentElement.dataset.motion = mode === MOTION_REDUCED ? MOTION_REDUCED : MOTION_FULL
}

/** True when motion should be reduced — reads the root attribute set at boot. Defaults
 *  to false (animate) when unset, so the overlay animates unless explicitly reduced. */
export function prefersReducedMotion() {
  if (typeof document === 'undefined' || !document.documentElement) return false
  return document.documentElement.dataset.motion === MOTION_REDUCED
}
