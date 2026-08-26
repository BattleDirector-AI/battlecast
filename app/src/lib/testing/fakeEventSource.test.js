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
