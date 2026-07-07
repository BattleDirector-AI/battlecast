// On-board HUD SSE client — battlecast is the CLIENT; the producer is the server.
// We open an EventSource against the producer's endpoint and listen for the named
// `state` event (NOT the default unnamed `message`). Each `state` event's `data` is
// one complete JSON snapshot conforming to spec/v1/schema.json.
//
// Identical in behavior to ../racecontrol/sseClient.js — the connection/parse logic
// is the same per route (see SPEC.md "Transport and message framing"). The HUD reads
// the on-camera subject's LIVE inputs from every snapshot, so unlike the cut-driven
// lower-thirds it just re-renders on each `state` event with no dwell machinery.

const KNOWN_SCHEMA_VERSION = '1'

/**
 * Resolve the producer SSE URL. OBS Browser Sources are launched by URL, so the
 * endpoint is configurable via a `?src=` query param, falling back to the local
 * mock producer.
 */
export function resolveSrc(search = typeof window !== 'undefined' ? window.location.search : '') {
  const params = new URLSearchParams(search)
  const src = params.get('src')
  return src && src.trim() ? src.trim() : 'http://localhost:8080/events'
}

/**
 * Resolve the speed display unit for the standalone `/onboard` route from a `?unit=`
 * query param (`kmh` | `mph`, case-insensitive), defaulting to `kmh`. On `/all` the
 * unit comes from the saved overlay config instead; this is the per-Browser-Source
 * knob for the standalone route, mirroring `?src=` / `?class=`.
 */
export function resolveSpeedUnit(search = typeof window !== 'undefined' ? window.location.search : '') {
  const raw = new URLSearchParams(search).get('unit')
  return String(raw || '').trim().toLowerCase() === 'mph' ? 'mph' : 'kmh'
}

/**
 * Open an EventSource to `url` and invoke `onState(snapshot)` with each parsed
 * `state` snapshot. Returns a disposer that closes the connection.
 */
export function connect(url, onState, { onError } = {}) {
  const es = new EventSource(url)

  es.addEventListener('state', (event) => {
    let snapshot
    try {
      snapshot = JSON.parse(event.data)
    } catch (err) {
      console.warn('[battlecast] failed to parse state event:', err)
      return
    }
    if (snapshot && snapshot.schemaVersion !== KNOWN_SCHEMA_VERSION) {
      // Best-effort render on unrecognized schemaVersion (see SPEC.md versioning).
      console.warn(
        `[battlecast] unrecognized schemaVersion "${snapshot.schemaVersion}" ` +
          `(expected "${KNOWN_SCHEMA_VERSION}"); attempting best-effort render.`
      )
    }
    onState(snapshot)
  })

  es.addEventListener('error', (event) => {
    if (onError) onError(event)
  })

  return () => es.close()
}
