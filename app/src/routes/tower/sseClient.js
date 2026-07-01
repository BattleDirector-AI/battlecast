/* SSE client for the standings tower.
 * battlecast is the CLIENT: it opens an EventSource against a producer-hosted
 * endpoint and listens for named `state` events (see spec/v1/SPEC.md). */

export const DEFAULT_SRC = 'http://localhost:8080/events'
export const SUPPORTED_SCHEMA_VERSION = '1'

/** Resolve the producer URL from a location.search string via ?src=, else default. */
export function resolveSrc(search) {
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

/** Open an SSE connection, delivering each parsed snapshot to onState. Returns a disconnect fn. */
export function connect(url, onState, { onError } = {}) {
  const es = new EventSource(url)
  es.addEventListener('state', (ev) => {
    try {
      onState(parseState(ev.data))
    } catch (err) {
      console.error('[battlecast] failed to parse state event', err)
      onError && onError(err)
    }
  })
  es.addEventListener('error', (err) => {
    onError && onError(err)
  })
  return () => es.close()
}
