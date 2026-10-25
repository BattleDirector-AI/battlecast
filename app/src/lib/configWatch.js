/* Live config reload (#115 / .ai/spec overlay-config rule 22).
 *
 * A render page re-reads its profile on a modest interval and applies a change without a
 * manual Browser Source refresh. Best-effort: a failed poll just delays the change; the
 * producer feed and widget state are untouched (the caller swaps only the config).
 *
 * A failed poll is one whose load rejects. The default load is `loadConfig` in strict mode,
 * which rejects when the named profile cannot be fetched (network error, non-OK status — a
 * deleted profile included — or unparseable JSON) instead of resolving to the default layout,
 * so a companion-server blip leaves the page on its last good config (#353). The first failed
 * poll after a good one logs one warning; later failures stay quiet until a poll succeeds. */

import { loadConfig } from './overlayConfig.js'

const loadStrict = (search) => loadConfig(search, { strict: true })

/** Deterministic deep-equality for two resolved (normalized) configs. */
function sameConfig(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Poll the resolved config for `search` and invoke `onChange(newConfig)` whenever it
 * differs from the last-seen config (starting from `opts.initial`). Returns a `stop()`
 * that ends polling.
 *
 * Uses a self-rescheduling timer (not `setInterval`) so the next poll is only scheduled
 * after the current one settles — a slow load can never overlap a newer one and apply a
 * stale config out of order.
 *
 * @param {string} search - a `location.search` string (`?profile=…`).
 * @param {(config: object) => void} onChange
 * @param {{intervalMs?: number, initial?: object, loadImpl?: (s: string) => Promise<object>}} [opts]
 * @returns {() => void} stop
 */
export function watchConfig(search, onChange, opts = {}) {
  const { intervalMs = 5000, initial = null, loadImpl = loadStrict } = opts
  let last = initial
  let stopped = false
  let timer = null
  let failing = false // the last poll failed — warn once per outage, not every interval

  const tick = async () => {
    let next
    try {
      next = await loadImpl(search)
    } catch {
      next = undefined // best-effort: a failed poll is skipped, then rescheduled below
    }
    if (stopped) return // stopped while the load was in flight — suppress + don't reschedule
    if (next === undefined && !failing) {
      console.warn('[battlecast] profile poll failed; keeping the current layout.')
    }
    failing = next === undefined
    if (next !== undefined && !sameConfig(last, next)) {
      last = next
      onChange(next)
    }
    timer = setTimeout(tick, intervalMs)
  }

  timer = setTimeout(tick, intervalMs)

  return () => {
    stopped = true
    clearTimeout(timer)
  }
}
