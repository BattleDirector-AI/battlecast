/* Live config reload (#115 / .ai/spec overlay-config rule 16).
 *
 * A render page re-reads its profile on a modest interval and applies a change without a
 * manual Browser Source refresh. Best-effort: a failed poll just delays the change; the
 * producer feed and widget state are untouched (the caller swaps only the config). */

import { loadConfig } from './overlayConfig.js'

/** Deterministic deep-equality for two resolved (normalized) configs. */
function sameConfig(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Poll the resolved config for `search` and invoke `onChange(newConfig)` whenever it
 * differs from the last-seen config (starting from `opts.initial`). Returns a `stop()`
 * that ends polling.
 *
 * @param {string} search - a `location.search` string (`?profile=…`).
 * @param {(config: object) => void} onChange
 * @param {{intervalMs?: number, initial?: object, loadImpl?: (s: string) => Promise<object>}} [opts]
 * @returns {() => void} stop
 */
export function watchConfig(search, onChange, opts = {}) {
  const { intervalMs = 5000, initial = null, loadImpl = loadConfig } = opts
  let last = initial
  let stopped = false

  const id = setInterval(async () => {
    if (stopped) return
    let next
    try {
      next = await loadImpl(search)
    } catch {
      return // best-effort: a failed poll just delays the next successful one
    }
    if (stopped || sameConfig(last, next)) return
    last = next
    onChange(next)
  }, intervalMs)

  return () => {
    stopped = true
    clearInterval(id)
  }
}
