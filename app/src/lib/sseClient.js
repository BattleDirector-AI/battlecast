/* The single SSE client (#158, ADR 0006). battlecast is the CLIENT: it opens an EventSource
 * against a producer-hosted endpoint and listens for named `state` events (see spec/v1/SPEC.md).
 *
 * One module, in `lib/` rather than a route folder because `/config` imports it and is not an
 * overlay route. Do not add a per-route copy and do not construct an `EventSource` in a page —
 * `sseClient.consolidation.test.js` fails on either. See `.ai/spec/how/renderer.md`.
 */

export const DEFAULT_SRC = 'http://localhost:8080/events'
export const SUPPORTED_SCHEMA_VERSION = '1'

/**
 * Resolve the producer URL from a `location.search` string via `?src=`, else the default.
 *
 * The parameter DEFAULTS to the page's own search string: `BattlePage`, `RaceControlPage` and
 * `OnBoardHudPage` call this bare, so dropping the default would silently kill `?src=` on those
 * routes (`what/overlay-config.md` rule 13).
 */
export function resolveSrc(search = typeof window !== 'undefined' ? window.location.search : '') {
  try {
    const src = new URLSearchParams(search || '').get('src')
    return src && src.trim() ? src.trim() : DEFAULT_SRC
  } catch {
    return DEFAULT_SRC
  }
}

/** Parse one `state` event's JSON `data`. Warns (best-effort) on unknown schemaVersion. */
export function parseState(raw) {
  const snapshot = JSON.parse(raw)
  if (snapshot && snapshot.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    console.warn(
      `[battlecast] Unrecognized schemaVersion "${snapshot && snapshot.schemaVersion}" ` +
        `(expected "${SUPPORTED_SCHEMA_VERSION}"); attempting best-effort render.`,
    )
  }
  return snapshot
}

/**
 * Open an SSE connection, delivering each parsed snapshot to `onState`. Returns a disconnect fn.
 *
 * `onOpen`/`onError` are the TRANSPORT's lifecycle and nothing else: `/config` renders `onError`
 * as "not connected" (`what/overlay-config.md` rule 25), so a payload this client cannot parse is
 * logged and dropped — delivery continues on the next good snapshot — rather than reported as a
 * dead feed on a healthy connection, which rule 26 forbids outright.
 *
 * Only the PARSE is guarded: `onState` is called outside the `try`, so an exception thrown by a
 * page's own state handler propagates rather than being swallowed and mislabelled as a malformed
 * payload. That matches three of the four copies this module merged, but it is a behavior change
 * for the six pages that were on the tower's, which ran `onState(parseState(…))` inside its `try`
 * and logged a handler bug as a parse failure. A handler that must not throw should catch its own.
 */
export function connect(url, onState, { onOpen, onError } = {}) {
  const es = new EventSource(url)
  es.addEventListener('state', (ev) => {
    let snapshot
    try {
      snapshot = parseState(ev.data)
    } catch (err) {
      console.error('[battlecast] failed to parse state event', err)
      return
    }
    onState(snapshot)
  })
  es.addEventListener('open', (event) => {
    if (onOpen) onOpen(event)
  })
  es.addEventListener('error', (event) => {
    if (onError) onError(event)
  })
  return () => es.close()
}
