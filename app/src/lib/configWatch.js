/* Live config reload (#115 / .ai/spec overlay-config rule 15) — SPEC-FIRST SKELETON.
 *
 * Declares the API surface the failing test in configWatch.test.js pins down; the
 * implementation (poll the profile on an interval, apply only real changes, immediately
 * and without transition) comes after spec approval. Until then this throws so the test
 * is RED. Do NOT ship as-is.
 */

/**
 * Poll the resolved config for `search` and invoke `onChange(newConfig)` whenever it
 * differs from the last-seen config, starting from `opts.initial`. Returns a `stop()`
 * that ends polling.
 * @param {string} search - a `location.search` string (`?profile=…`).
 * @param {(config: object) => void} onChange
 * @param {{intervalMs?: number, initial?: object, loadImpl?: Function}} [opts]
 * @returns {() => void} stop
 */
export function watchConfig(search, onChange, opts) {
  void search
  void onChange
  void opts
  throw new Error(
    'not implemented: watchConfig — implement against .ai/spec overlay-config rule 15',
  )
}
