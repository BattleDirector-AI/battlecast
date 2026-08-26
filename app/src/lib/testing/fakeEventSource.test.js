/* The shared `EventSource` doubles' own contract (#164).
 *
 * Rules: `.ai/spec/how/config-editor.md`, the `src/lib/testing/fakeEventSource.js` row.
 *
 * `fakeEventSource.js` exports two doubles and one class-level cleanup entry point,
 * `FakeEventSource.reset()`. Both doubles record into module-level state that survives between
 * tests in a file, so cleanup has to clear both or the second suite to use `RefusingEventSource`
 * inherits the first one's refusals. Today only `ConfigPage.feedStatus.test.js` uses the refusing
 * double, and it clears `refused` by hand — so nothing is broken, and nothing pins it either.
 *
 * These tests run in declared order and deliberately do NOT clear anything themselves: the
 * accumulation this file is about is only visible across a `reset()` boundary.
 */
import { describe, it, expect } from 'vitest'
import { FakeEventSource, RefusingEventSource } from './fakeEventSource.js'

/** Drive the refusing double the way a caller does — it records, then throws synchronously. */
const refuse = (url) => expect(() => new RefusingEventSource(url)).toThrow(SyntaxError)

describe('the shared EventSource doubles', () => {
  it('clears both doubles when reset() is called', () => {
    new FakeEventSource('http://producer.test/events')
    refuse('http://')

    FakeEventSource.reset()

    expect({
      opened: FakeEventSource.opened.map((es) => es.url),
      refused: RefusingEventSource.refused,
    }).toEqual({ opened: [], refused: [] })
  })

  it('leaves a later suite only its own refusals, not the previous one', () => {
    // The exposure the hand-rolled cleanup in `ConfigPage.feedStatus.test.js` hides: a suite that
    // calls the documented `reset()` and nothing else must not see the refusal recorded above.
    FakeEventSource.reset()

    refuse('http://bad-url')

    expect(RefusingEventSource.refused).toEqual(['http://bad-url'])
  })

  it('leaves the derived views reading from the cleared list', () => {
    // Green guard: `reset()` already clears `opened`, and `live`/`last` are computed from it, so a
    // fix that swaps the array for a `length = 0` (or vice versa) must not desync them.
    const closed = new FakeEventSource('http://producer.test/events')
    closed.close()
    new FakeEventSource('http://producer.test/other')

    expect([FakeEventSource.live.map((c) => c.url), FakeEventSource.last.url]).toEqual([
      ['http://producer.test/other'],
      'http://producer.test/other',
    ])

    FakeEventSource.reset()

    expect([FakeEventSource.live, FakeEventSource.last]).toEqual([[], undefined])
  })
})

/* The transport's own state machine (#160, ADR 0007). Green — these pin the double, which is
 * itself part of that issue's deliverable: `what/overlay-config.md` rule 25's two failure states
 * are a `readyState` distinction, and a double that models only `open`/`error` cannot express the
 * failure a broadcaster is most likely to hit. */
describe('the fake models readyState, not just events', () => {
  /** Attach a recorder and return the readyState each listener OBSERVED, in dispatch order. */
  function observing(es) {
    const seen = []
    for (const type of ['open', 'error']) {
      es.addEventListener(type, (ev) => seen.push([type, ev.target.readyState, es.readyState]))
    }
    return seen
  }

  it('starts CONNECTING and carries the browser constants on the class and the instance', () => {
    FakeEventSource.reset()
    const es = new FakeEventSource('http://producer.test/events')

    expect([FakeEventSource.CONNECTING, FakeEventSource.OPEN, FakeEventSource.CLOSED]).toEqual([
      0, 1, 2,
    ])
    expect([es.CONNECTING, es.OPEN, es.CLOSED]).toEqual([0, 1, 2])
    expect(es.readyState).toBe(FakeEventSource.CONNECTING)
  })

  it('is OPEN by the time an `open` listener runs, and CLOSED by the time a bare `error` does', () => {
    FakeEventSource.reset()
    const es = new FakeEventSource('http://producer.test/events')
    const seen = observing(es)

    es.emit('open')
    es.emit('error')

    // Both readings agree: off the event's `target` and off the instance. A client may use either.
    expect(seen).toEqual([
      ['open', FakeEventSource.OPEN, FakeEventSource.OPEN],
      ['error', FakeEventSource.CLOSED, FakeEventSource.CLOSED],
    ])
  })

  it('reports failRetrying() at CONNECTING, every time, however many attempts fail', () => {
    // The refused-connection case: one `error` per attempt, ~5 s apart, forever. A double that
    // only reached CONNECTING on the first failure would let a latching readout pass.
    FakeEventSource.reset()
    const es = new FakeEventSource('http://producer.test/events')
    const seen = observing(es)

    es.failRetrying()
    es.failRetrying()
    es.failRetrying()

    expect(seen.map(([, onEvent]) => onEvent)).toEqual([0, 0, 0])
    expect(es.readyState).toBe(FakeEventSource.CONNECTING)
  })

  it('distinguishes a connection that dropped mid-stream and retries from one that stopped', () => {
    FakeEventSource.reset()
    const dropped = new FakeEventSource('http://producer.test/events')
    const stopped = new FakeEventSource('http://producer.test/nope')
    const droppedSeen = observing(dropped)
    const stoppedSeen = observing(stopped)

    dropped.emit('open')
    dropped.failRetrying()
    stopped.failStopped()

    expect(droppedSeen.at(-1)[1]).toBe(FakeEventSource.CONNECTING)
    expect(stoppedSeen.at(-1)[1]).toBe(FakeEventSource.CLOSED)
  })

  it('leaves a closed connection CLOSED and inert, whichever failure is asked for', () => {
    FakeEventSource.reset()
    const es = new FakeEventSource('http://producer.test/events')
    const seen = observing(es)
    es.emit('open')

    es.close()
    es.failRetrying()
    es.failStopped()

    expect(es.readyState).toBe(FakeEventSource.CLOSED)
    expect(seen.map(([type]) => type)).toEqual(['open'])
  })

  it('keeps caller-supplied event fields while adding type and target', () => {
    // `state` delivery must keep working: `sseClient` reads `ev.data`.
    FakeEventSource.reset()
    const es = new FakeEventSource('http://producer.test/events')
    let received = null
    es.addEventListener('state', (ev) => (received = ev))

    es.emit('state', { data: '{"schemaVersion":"1"}' })

    expect(received.data).toBe('{"schemaVersion":"1"}')
    expect(received.type).toBe('state')
    expect(received.target).toBe(es)
  })
})
