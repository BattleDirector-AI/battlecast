/* Shared stand-in for the browser's `EventSource` — `happy-dom` has none.
 *
 * `emit()` plays the part the browser plays in production: dispatching a named `state` event, or
 * the transport's own `open` / `error`. A closed connection emits nothing, so a client that calls
 * `close()` but leaves its listeners wired is visible as delivery that keeps arriving.
 *
 * Used by `lib/sseClient.test.js` and `routes/config/ConfigPage.feedStatus.test.js`. Not a
 * `*.test.js` file, so vitest does not collect it.
 */

export class FakeEventSource {
  /** Every connection ever opened, in order, closed or not. */
  static opened = []

  static reset() {
    FakeEventSource.opened = []
  }

  /** The connections still open, in the order they were opened. */
  static get live() {
    return FakeEventSource.opened.filter((es) => !es.closed)
  }

  /** The most recently opened connection, closed or not. */
  static get last() {
    return FakeEventSource.opened.at(-1)
  }

  constructor(url) {
    this.url = url
    this.closed = false
    this.listeners = new Map()
    FakeEventSource.opened.push(this)
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, [])
    this.listeners.get(type).push(fn)
  }

  removeEventListener(type, fn) {
    const fns = this.listeners.get(type)
    if (fns) this.listeners.set(type, fns.filter((f) => f !== fn))
  }

  close() {
    this.closed = true
  }

  emit(type, event = {}) {
    // A real closed EventSource is inert. Modelling that is what makes "the disposer stops
    // delivery" testable rather than merely "close() was called".
    if (this.closed) return
    for (const fn of this.listeners.get(type) ?? []) fn(event)
  }
}

/**
 * An `EventSource` the browser refuses to construct — `new EventSource('http://')` throws a
 * `SyntaxError` synchronously, before any listener can be attached, so the failure arrives as an
 * exception rather than an `error` event (`what/overlay-config.md` rule 25).
 */
export class RefusingEventSource {
  constructor(url) {
    RefusingEventSource.refused.push(url)
    throw new SyntaxError(`Failed to construct 'EventSource': Cannot open '${url}'.`)
  }
}
RefusingEventSource.refused = []
