/* Shared stand-in for the browser's `EventSource` — `happy-dom` has none.
 *
 * `emit()` plays the part the browser plays in production: dispatching a named `state` event, or
 * the transport's own `open` / `error`. A closed connection emits nothing, so a client that calls
 * `close()` but leaves its listeners wired is visible as delivery that keeps arriving.
 *
 * It also models `readyState`, because the transport's own state machine — not the events — is
 * what separates a failure the browser will retry from one it has abandoned
 * (`what/overlay-config.md` rule 25, ADR 0007). The browser sets `readyState` *before* it
 * dispatches `error`, and the event carries the connection as its `target`, so a client can read
 * the policy off either. Both are modelled; neither is enforced — a test drives the sequence it
 * means to drive, and the double does not police which transitions a real browser would allow.
 *
 * Used by `lib/sseClient.test.js` and `routes/config/ConfigPage.feedStatus.test.js`. Not a
 * `*.test.js` file, so vitest does not collect it.
 */

export class FakeEventSource {
  /** The browser's `readyState` values, on the constructor as the real `EventSource` has them. */
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2

  /** Every connection ever opened, in order, closed or not. */
  static opened = []

  /** The single cleanup entry point for *both* doubles — see `RefusingEventSource` below. */
  static reset() {
    FakeEventSource.opened = []
    RefusingEventSource.refused = []
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
    /** Mirrors the real instance properties, which exist alongside the static ones. */
    this.CONNECTING = FakeEventSource.CONNECTING
    this.OPEN = FakeEventSource.OPEN
    this.CLOSED = FakeEventSource.CLOSED
    /** A fresh connection is CONNECTING until it opens or fails — same as the browser's. */
    this.readyState = FakeEventSource.CONNECTING
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
    this.readyState = FakeEventSource.CLOSED
  }

  /**
   * Dispatch one event as the browser would.
   *
   * `open` moves the connection to OPEN first; a bare `error` moves it to CLOSED, because this
   * double has no retry loop — one `error` and nothing ever again *is* the abandoned failure, and
   * it is what every caller of `emit('error')` has always meant. The retrying failure is the one
   * that has to be asked for by name: see `failRetrying()`.
   *
   * The dispatched object carries `type` and `target`, as a real event does, so a client can read
   * the connection's state off the event rather than off the instance. Caller-supplied fields
   * (`data`) are merged in on top.
   */
  emit(type, event = {}) {
    // A real closed EventSource is inert. Modelling that is what makes "the disposer stops
    // delivery" testable rather than merely "close() was called".
    if (this.closed) return
    if (type === 'open') this.readyState = FakeEventSource.OPEN
    else if (type === 'error') this.readyState = FakeEventSource.CLOSED
    const dispatched = { type, target: this, ...event }
    for (const fn of this.listeners.get(type) ?? []) fn(dispatched)
  }

  /**
   * The failure the browser will re-attempt unaided: connection refused, or a live stream whose
   * producer dies. `readyState` is back at CONNECTING by the time `error` is dispatched, and the
   * browser fires one of these per attempt — so call it more than once to model a transport that
   * is still cycling.
   */
  failRetrying() {
    if (this.closed) return
    // Set BEFORE dispatching: the listener has to observe CONNECTING, which is the whole point.
    this.readyState = FakeEventSource.CONNECTING
    for (const fn of this.listeners.get('error') ?? []) fn({ type: 'error', target: this })
  }

  /**
   * The failure the browser abandons: the host answered, but not with an event stream (404,
   * `text/plain`). One `error` at CLOSED and it never tries again. Same as a bare `emit('error')`,
   * named so a test that means *this* failure says so beside one that means the other.
   */
  failStopped() {
    this.emit('error')
  }
}

/**
 * An `EventSource` the browser refuses to construct — `new EventSource('http://')` throws a
 * `SyntaxError` synchronously, before any listener can be attached, so the failure arrives as an
 * exception rather than an `error` event (`what/overlay-config.md` rule 25).
 */
export class RefusingEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2

  constructor(url) {
    RefusingEventSource.refused.push(url)
    throw new SyntaxError(`Failed to construct 'EventSource': Cannot open '${url}'.`)
  }
}
RefusingEventSource.refused = []
