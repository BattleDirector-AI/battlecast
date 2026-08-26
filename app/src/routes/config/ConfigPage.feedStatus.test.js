/* `/config` producer feed status (#158, #160) — `.ai/spec/what/overlay-config.md` rules 25–30.
 *
 * Pins the readout's four states, that it tracks the connection rather than the data, that it
 * follows the configured producer URL from any source, where on the page it renders, that the
 * preview stays on the fixture regardless, and the Reconnect control that re-arms it.
 * Rationale: `docs/decisions/0006-config-producer-feed-status.md` (the readout) and
 * `docs/decisions/0007-config-feed-reconnect.md` (the two failure states, the control).
 *
 * Environment: `happy-dom` has no `EventSource`, so one is stubbed and `emit()` stands in for the
 * browser dispatching `open` / `error` / `state`. The two failure states are a `readyState`
 * distinction rather than an event one, so the double models the transport's state machine too and
 * the failures are driven through `failRetrying()` / `failStopped()`. The reopen is debounced, so
 * the whole file runs on fake timers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'
import ConfigPage from './ConfigPage.svelte'
import { DEFAULT_CONFIG } from '../../lib/overlayConfig.js'
import { FIELD_HELP } from '../../lib/configHelp.js'
import { FakeEventSource, RefusingEventSource } from '../../lib/testing/fakeEventSource.js'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

const DEFAULT_FEED = DEFAULT_CONFIG.producer.src // 'http://localhost:8080/events'
// Pinned in `.ai/spec/how/config-editor.md`, not exported by any module the editor ships — there is
// nothing to import until the implementation names it.
const DEBOUNCE_MS = 500

/** No companion server by default — these tests are about the producer feed, not the server. */
function stubFetch({ profiles = null, profile = null } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path) => {
      const url = String(path)
      if (profile && /^\/api\/profiles\/.+/.test(url)) {
        return { ok: true, status: 200, json: async () => profile }
      }
      if (profiles && url.startsWith('/api/profiles')) {
        return { ok: true, status: 200, json: async () => ({ profiles }) }
      }
      if (profiles && url.startsWith('/api/logos')) {
        return { ok: true, status: 200, json: async () => ({ logos: [] }) }
      }
      return { ok: false, status: 404, json: async () => ({}) }
    }),
  )
}

/** The editor's producer connection, named so a missing one fails as itself, not as a cascade. */
function feed() {
  const es = FakeEventSource.last
  if (!es) throw new Error('the editor opened no producer connection (rule 25)')
  return es
}
/** The rendered feed-status text — what a broadcaster actually reads. */
const feedText = (getByTestId) => getByTestId('feed-status').textContent.trim()
/** Driver names as drawn in the live preview. */
const previewNames = (container) =>
  Array.from(container.querySelectorAll('[data-testid="driver-name"]')).map((el) =>
    el.textContent.trim(),
  )

/* The four rendered readouts, pinned in `.ai/spec/how/config-editor.md`. `RETRYING` contains
 * `STOPPED` as a substring, which is why every assertion below is an exact `toBe`. */
const CONNECTING = 'Producer feed: connecting…'
const CONNECTED = 'Producer feed: connected'
const RETRYING = 'Producer feed: not connected — retrying…'
const STOPPED = 'Producer feed: not connected'

/** The Reconnect control, or `null` — the rule-30 states where it must be absent are assertions. */
const reconnectControl = (view) => view.queryByTestId('feed-reconnect')

/** Press it, failing by name rather than as `null.click is not a function`. */
function pressReconnect(view) {
  const el = reconnectControl(view)
  if (!el) {
    throw new Error(
      'the editor renders no Reconnect control while the producer feed is not connected (rule 30)',
    )
  }
  return fireEvent.click(el)
}

/** Mount and let onMount's server probe settle. */
async function mount() {
  const view = render(ConfigPage)
  await vi.advanceTimersByTimeAsync(0)
  await tick()
  return view
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeEventSource.reset()
  RefusingEventSource.refused = []
  vi.stubGlobal('EventSource', FakeEventSource)
  stubFetch()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('rule 25 — the editor reports live feed status from its own connection', () => {
  it('opens a connection to the configured producer URL on mount and reads "connecting…"', async () => {
    const { getByTestId } = await mount()

    expect(FakeEventSource.live).toHaveLength(1)
    expect(FakeEventSource.last.url).toBe(DEFAULT_FEED)
    expect(feedText(getByTestId)).toBe('Producer feed: connecting…')
  })

  it('renders the readout beside the URL field, not beside the server line', async () => {
    // Rule 29's adjacency requirement: the whole issue starts with a status line about the
    // companion server being read as a claim about the race feed. A readout dropped anywhere on
    // the page satisfies `getByTestId`, including right next to the line it must not be confused
    // with — so assert *where* it lands.
    const { getByTestId } = await mount()
    const producerSection = getByTestId('producer-src').closest('section')

    expect(producerSection).not.toBeNull()
    expect(producerSection.contains(getByTestId('feed-status'))).toBe(true)
    expect(producerSection.contains(getByTestId('status'))).toBe(false)
  })

  it('reads "connected" once the connection opens', async () => {
    const { getByTestId } = await mount()

    feed().emit('open')
    await tick()

    expect(feedText(getByTestId)).toBe('Producer feed: connected')
  })

  it('reads "not connected" when the connection errors', async () => {
    const { getByTestId } = await mount()

    feed().emit('error')
    await tick()

    expect(feedText(getByTestId)).toBe('Producer feed: not connected')
  })

  it('shows a feed that drops after connecting, then recovers', async () => {
    const { getByTestId } = await mount()
    const es = feed()
    const seen = []

    es.emit('open')
    await tick()
    seen.push(feedText(getByTestId))

    es.emit('error')
    await tick()
    seen.push(feedText(getByTestId))

    es.emit('open')
    await tick()
    seen.push(feedText(getByTestId))

    expect(seen).toEqual([
      'Producer feed: connected',
      'Producer feed: not connected',
      'Producer feed: connected',
    ])
  })

  it('reads "not connected" for a URL the browser refuses to open, and keeps working', async () => {
    // `new EventSource('http://')` throws a SyntaxError synchronously — no listener is ever
    // attached, so the failure arrives as an exception rather than an `error` event. A half-typed
    // URL that settles past the debounce is exactly this, and it is the failure the readout exists
    // to surface: it must render "not connected", not escape into the editor.
    const { getByTestId } = await mount()
    const first = feed()
    vi.stubGlobal('EventSource', RefusingEventSource)

    await fireEvent.input(getByTestId('producer-src'), { target: { value: 'http://' } })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await tick()

    expect(RefusingEventSource.refused).toEqual(['http://'])
    expect(first.closed).toBe(true)
    expect(feedText(getByTestId)).toBe('Producer feed: not connected')
    // The editor is still an editor: the field still holds what was typed and still accepts input.
    expect(getByTestId('producer-src').value).toBe('http://')
    await fireEvent.input(getByTestId('producer-src'), { target: { value: 'http://x/events' } })
    await tick()
    expect(getByTestId('producer-src').value).toBe('http://x/events')
  })

  it('closes the connection on teardown and never reopens from an unmounted editor', async () => {
    const { getByTestId } = await mount()
    const es = feed()
    es.emit('open')
    await tick()
    expect(feedText(getByTestId)).toBe('Producer feed: connected')

    cleanup()
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 4)

    expect(es.closed).toBe(true)
    expect(FakeEventSource.live).toHaveLength(0)
  })

  it('drops a debounce still in flight when the editor unmounts', async () => {
    // Unmounting with nothing pending catches no timer at all. The leak is the edit that is still
    // waiting out its debounce when the page goes away — that callback must not open a connection
    // from an editor that no longer exists.
    const { getByTestId } = await mount()
    const mounted = feed()
    const openedBefore = FakeEventSource.opened.length

    await fireEvent.input(getByTestId('producer-src'), {
      target: { value: 'http://race-pc.lan:9100/events' },
    })
    await tick()

    cleanup()
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 4)

    expect(mounted.closed).toBe(true)
    expect(FakeEventSource.opened.length).toBe(openedBefore)
    expect(FakeEventSource.live).toHaveLength(0)
  })
})

describe('rule 25 — the two not-connected states, told apart by the transport (#160)', () => {
  /* Measured in headless Chromium (ADR 0007): a refused connection retries ~every 5 s with
   * `readyState` CONNECTING and heals itself; a host that answers with a 404 fires one `error` at
   * CLOSED and never tries again. Both read "not connected" on air, and only one resolves itself,
   * so the readout has to say which. */

  it('reads "not connected — retrying…" for a failure the transport will re-attempt', async () => {
    const { getByTestId } = await mount()

    feed().failRetrying()
    await tick()

    expect(feedText(getByTestId)).toBe(RETRYING)
  })

  it('reads a bare "not connected" for a failure the transport has abandoned', async () => {
    // Green guard: this is the state the three-state readout already had, and it must not become
    // the retrying one when the retrying one is added.
    const { getByTestId } = await mount()

    feed().failStopped()
    await tick()

    expect(feedText(getByTestId)).toBe(STOPPED)
    expect(feedText(getByTestId)).not.toMatch(/retry/i)
  })

  it('tells the two apart on the same page, from the transport alone', async () => {
    // The test a hardcoded readout cannot pass: one page, both failures, different words. The
    // second is the failure this issue exists for — a host that answers, but not with a stream.
    const { getByTestId } = await mount()
    const seen = []

    feed().failRetrying()
    await tick()
    seen.push(feedText(getByTestId))

    await fireEvent.input(getByTestId('producer-src'), {
      target: { value: 'http://race-pc.lan:9100/wrong-path' },
    })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await tick()
    seen.push(feedText(getByTestId))

    feed().failStopped()
    await tick()
    seen.push(feedText(getByTestId))

    expect(seen).toEqual([RETRYING, CONNECTING, STOPPED])
  })

  it('re-reads the state from every failure instead of latching the first', async () => {
    // A retrying transport reports each attempt separately. A readout that latched on the first
    // `error` would be stuck in whichever state the transport happened to be in seconds ago.
    const { getByTestId } = await mount()
    const es = feed()
    const seen = []

    for (let attempt = 0; attempt < 4; attempt += 1) {
      es.failRetrying()
      await tick()
      seen.push(feedText(getByTestId))
    }

    expect(seen).toEqual([RETRYING, RETRYING, RETRYING, RETRYING])
  })

  it('never decays from retrying to stopped on its own — rule 26 still bans timers', async () => {
    // "It has been retrying a while, it is probably dead" is exactly the invented number rule 26
    // forbids, and it would be wrong: a refused connection retries correctly and indefinitely.
    const { getByTestId } = await mount()

    feed().failRetrying()
    await tick()
    await vi.advanceTimersByTimeAsync(300_000)
    await tick()

    expect(feedText(getByTestId)).toBe(RETRYING)
  })

  it('shows a mid-stream drop as retrying, then reads connected when it heals', async () => {
    // The measured second case: the producer dies, the browser retries, and ~3 s later `open`
    // fires again. Nothing is pressed and nothing is reloaded — the page just has to say so.
    const { getByTestId } = await mount()
    const es = feed()
    const seen = [feedText(getByTestId)]

    es.emit('open')
    await tick()
    seen.push(feedText(getByTestId))

    es.failRetrying()
    await tick()
    seen.push(feedText(getByTestId))

    es.emit('open')
    await tick()
    seen.push(feedText(getByTestId))

    expect(seen).toEqual([CONNECTING, CONNECTED, RETRYING, CONNECTED])
  })

  it('reads stopped, not retrying, for a URL the browser refuses to construct', async () => {
    // Green guard, and the one that kills "default to retrying unless proved otherwise": nothing
    // was constructed, so there is no connection in existence to re-attempt anything.
    const { getByTestId } = await mount()
    vi.stubGlobal('EventSource', RefusingEventSource)

    await fireEvent.input(getByTestId('producer-src'), { target: { value: 'http://' } })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await tick()

    expect(RefusingEventSource.refused).toEqual(['http://'])
    expect(feedText(getByTestId)).toBe(STOPPED)
    expect(feedText(getByTestId)).not.toMatch(/retry/i)
  })
})

describe('rule 30 — the Reconnect control (#160)', () => {
  it('renders no Reconnect control while connecting or connected', async () => {
    // Green guard. The control is ABSENT in these states, not present-and-inert: an operator
    // watching a healthy feed must not be offered a button that would reset it.
    const view = await mount()
    expect(feedText(view.getByTestId)).toBe(CONNECTING)
    expect(reconnectControl(view)).toBeNull()

    feed().emit('open')
    await tick()
    expect(feedText(view.getByTestId)).toBe(CONNECTED)
    expect(reconnectControl(view)).toBeNull()
  })

  it('renders it in BOTH not-connected states, not only the abandoned one', async () => {
    // Gating on "stopped" would make the control appear and vanish as the transport cycles, and
    // would force the broadcaster to diagnose which failure they are in before pressing anything.
    const view = await mount()

    feed().failRetrying()
    await tick()
    expect(reconnectControl(view), 'no Reconnect control while the transport is retrying').not.toBeNull()

    await fireEvent.input(view.getByTestId('producer-src'), {
      target: { value: 'http://race-pc.lan:9100/wrong-path' },
    })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await tick()
    expect(reconnectControl(view), 'the control must go while connecting').toBeNull()

    feed().failStopped()
    await tick()
    expect(reconnectControl(view), 'no Reconnect control after the transport stopped').not.toBeNull()
  })

  it('closes the dead connection, opens a new one against the URL in the field, and resets the readout', async () => {
    const view = await mount()
    const first = feed()
    first.failStopped()
    await tick()
    const openedBefore = FakeEventSource.opened.length

    await pressReconnect(view)
    await tick()

    expect(first.closed).toBe(true)
    expect(FakeEventSource.opened.length - openedBefore).toBe(1)
    expect(FakeEventSource.live).toHaveLength(1)
    expect(FakeEventSource.last).not.toBe(first)
    expect(FakeEventSource.last.url).toBe(DEFAULT_FEED)
    expect(feedText(view.getByTestId)).toBe(CONNECTING)
    expect(reconnectControl(view), 'the control must go with the reset to connecting').toBeNull()
  })

  it('opens immediately — rule 27’s debounce governs a changed URL, not a button press', async () => {
    // Not one timer is advanced before the assertion. A reconnect wired into the debounced reopen
    // would leave the operator looking at an unchanged readout for half a second.
    const view = await mount()
    feed().failStopped()
    await tick()
    const openedBefore = FakeEventSource.opened.length

    await pressReconnect(view)
    await tick()

    expect(FakeEventSource.opened.length - openedBefore).toBe(1)

    // ...and it does not fire a second time once the debounce window would have elapsed.
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 3)
    await tick()
    expect(FakeEventSource.opened.length - openedBefore).toBe(1)
    expect(FakeEventSource.live).toHaveLength(1)
  })

  it('uses the URL just typed and cancels the reopen rule 27 still has pending', async () => {
    // The natural sequence is "fix the URL, then press Reconnect" — which leaves a rule-27 reopen
    // counting down. Ignoring it costs a second connection to the same place moments later.
    const view = await mount()
    feed().failStopped()
    await tick()
    const openedBefore = FakeEventSource.opened.length

    await fireEvent.input(view.getByTestId('producer-src'), {
      target: { value: 'http://race-pc.lan:9100/events' },
    })
    await tick()
    await pressReconnect(view)
    await tick()

    expect(FakeEventSource.last.url).toBe('http://race-pc.lan:9100/events')
    expect(FakeEventSource.opened.length - openedBefore).toBe(1)

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 3)
    await tick()

    expect(FakeEventSource.opened.length - openedBefore).toBe(1)
    expect(FakeEventSource.live).toHaveLength(1)
    expect(FakeEventSource.last.url).toBe('http://race-pc.lan:9100/events')
  })

  it('is an ordinary connection afterwards — it can fail again and the control comes back', async () => {
    const view = await mount()
    feed().failStopped()
    await tick()

    await pressReconnect(view)
    await tick()
    expect(feedText(view.getByTestId)).toBe(CONNECTING)

    feed().failStopped()
    await tick()

    expect(feedText(view.getByTestId)).toBe(STOPPED)
    expect(reconnectControl(view), 'the control must return when the reconnect fails too').not.toBeNull()
  })

  it('leaves rule 27 working — a later URL edit still reopens the connection', async () => {
    // The reconnect has to record the URL it opened against, exactly as an edit does. If it left
    // stale bookkeeping behind, the next edit would look like "no change" and never reopen.
    const view = await mount()
    feed().failStopped()
    await tick()
    await pressReconnect(view)
    await tick()
    const reconnected = FakeEventSource.last

    await fireEvent.input(view.getByTestId('producer-src'), {
      target: { value: 'http://race-pc.lan:9100/events' },
    })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await tick()

    expect(reconnected.closed).toBe(true)
    expect(FakeEventSource.live).toHaveLength(1)
    expect(FakeEventSource.last.url).toBe('http://race-pc.lan:9100/events')
    expect(feedText(view.getByTestId)).toBe(CONNECTING)
  })

  it('writes nothing — the URL field, the OBS URL and the exported profile are untouched', async () => {
    const view = await mount()
    const urlBefore = view.getByTestId('producer-src').value
    const obsBefore = view.getByTestId('obs-url').textContent
    feed().failStopped()
    await tick()

    await pressReconnect(view)
    await tick()

    expect(view.getByTestId('producer-src').value).toBe(urlBefore)
    expect(view.getByTestId('obs-url').textContent).toBe(obsBefore)

    let exported = null
    vi.stubGlobal(
      'Blob',
      class {
        constructor(parts) {
          exported = String(parts[0])
        }
      },
    )
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:captured')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    await fireEvent.click(view.getByTestId('export'))

    const profile = JSON.parse(exported)
    expect(profile.configVersion).toBe('1')
    expect(profile.producer.src).toBe(urlBefore)
    expect(exported).not.toMatch(/reconnect|feedStatus|Producer feed/i)
  })

  it('carries help copy and an ⓘ, because it is a control and not a readout (rules 16-19)', async () => {
    const view = await mount()
    feed().failStopped()
    await tick()

    expect(
      typeof FIELD_HELP.feedReconnect,
      'no configHelp entry for the Reconnect control (rules 16-19)',
    ).toBe('string')
    // Written for a broadcaster with no repo: rule 16 bans codebase and protocol identifiers.
    expect(FIELD_HELP.feedReconnect).not.toMatch(/readyState|EventSource|SSE|rule \d|#\d/i)
    expect(FIELD_HELP.feedReconnect.toLowerCase()).toMatch(/connect/)

    const tip = view.queryByTestId('help-reconnect')
    expect(tip, 'no ⓘ beside the Reconnect control (rules 16-19)').not.toBeNull()
    expect(view.queryByTestId('help-reconnect-text')).toBeNull()

    await fireEvent.click(tip)
    await tick()

    expect(view.getByTestId('help-reconnect-text').textContent.trim()).toBe(FIELD_HELP.feedReconnect)
  })
})

describe('rule 26 — connection state, never data flow (no stall detection)', () => {
  it('stays "connected" while an open connection delivers no snapshots at all', async () => {
    const { getByTestId } = await mount()

    feed().emit('open')
    await tick()
    // A paused sim, a replay, or a producer between sessions looks exactly like this.
    await vi.advanceTimersByTimeAsync(120_000)
    await tick()

    expect(feedText(getByTestId)).toBe('Producer feed: connected')
  })

  it('a snapshot arriving is not itself a state change — the connection is what is reported', async () => {
    const { getByTestId } = await mount()
    const es = feed()

    // Snapshots before `open` must not fabricate a "connected" reading...
    es.emit('state', { data: JSON.stringify(closeBattle) })
    await tick()
    expect(feedText(getByTestId)).toBe('Producer feed: connecting…')

    // ...and after an error, a straggling snapshot must not undo the drop.
    es.emit('open')
    es.emit('error')
    es.emit('state', { data: JSON.stringify(closeBattle) })
    await tick()
    expect(feedText(getByTestId)).toBe('Producer feed: not connected')
  })

  it('stays "connected" when a snapshot arrives that cannot be parsed', async () => {
    // The transport is fine; one payload is not. Reporting a dead feed here would be a lie the
    // broadcaster acts on — and it is what the tower's copy of the client would do if the merge
    // kept its parse-failure `onError` (ADR 0006).
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getByTestId } = await mount()
    const es = feed()

    es.emit('open')
    es.emit('state', { data: '{not json' })
    await tick()

    expect(feedText(getByTestId)).toBe('Producer feed: connected')
  })
})

describe('rule 27 — the connection follows the configured producer URL, debounced', () => {
  it('reopens against the edited URL after the field settles, closing the old connection', async () => {
    const { getByTestId } = await mount()
    const first = feed()
    first.emit('open')
    await tick()

    await fireEvent.input(getByTestId('producer-src'), {
      target: { value: 'http://race-pc.lan:9100/events' },
    })
    await tick()

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await tick()

    expect(first.closed).toBe(true)
    expect(FakeEventSource.live).toHaveLength(1)
    expect(FakeEventSource.last.url).toBe('http://race-pc.lan:9100/events')
    expect(feedText(getByTestId)).toBe('Producer feed: connecting…')
  })

  it('waits out the full debounce before reopening', async () => {
    // Pins the lower bound too: a "debounce" of 0 ms satisfies the settle-then-reopen test above.
    const { getByTestId } = await mount()
    feed() // the mount connection must exist before "does it reopen?" means anything
    const openedAfterMount = FakeEventSource.opened.length

    await fireEvent.input(getByTestId('producer-src'), {
      target: { value: 'http://race-pc.lan:9100/events' },
    })
    await tick()

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1)
    await tick()
    expect(FakeEventSource.opened.length - openedAfterMount).toBe(0)

    await vi.advanceTimersByTimeAsync(1)
    await tick()
    expect(FakeEventSource.opened.length - openedAfterMount).toBe(1)
    expect(FakeEventSource.last.url).toBe('http://race-pc.lan:9100/events')
  })

  it('typing a URL costs one connection, not one per keystroke', async () => {
    const { getByTestId } = await mount()
    feed()
    const openedAfterMount = FakeEventSource.opened.length
    const field = getByTestId('producer-src')

    for (const value of [
      'http://race-pc.lan:9100/e',
      'http://race-pc.lan:9100/ev',
      'http://race-pc.lan:9100/eve',
      'http://race-pc.lan:9100/even',
      'http://race-pc.lan:9100/event',
      'http://race-pc.lan:9100/events',
    ]) {
      await fireEvent.input(field, { target: { value } })
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 5)
    }
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await tick()

    expect(FakeEventSource.opened.length - openedAfterMount).toBe(1)
    expect(FakeEventSource.last.url).toBe('http://race-pc.lan:9100/events')
    expect(FakeEventSource.live).toHaveLength(1)
  })

  it('an empty or whitespace field connects to the default URL, so the readout describes what OBS would use', async () => {
    const { getByTestId } = await mount()
    const field = getByTestId('producer-src')

    for (const value of ['   ', '']) {
      await fireEvent.input(field, { target: { value: 'http://race-pc.lan:9100/events' } })
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
      await tick()
      expect(feed().url).toBe('http://race-pc.lan:9100/events')

      await fireEvent.input(field, { target: { value } })
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
      await tick()

      expect(FakeEventSource.live).toHaveLength(1)
      expect(feed().url).toBe(DEFAULT_FEED)
    }
  })

  it('follows a profile load, which replaces producer.src without any field edit', async () => {
    // `loadProfile()` assigns a whole new config. The rule is about the configured URL, not about
    // the input event: a connection wired to `oninput` alone keeps talking to the old producer
    // while the editor — and the OBS URL it builds — point somewhere else.
    stubFetch({
      profiles: ['race-pc'],
      profile: {
        ...DEFAULT_CONFIG,
        name: 'race-pc',
        producer: { src: 'http://race-pc.lan:9100/events' },
      },
    })
    const { getByTestId } = await mount()
    await vi.advanceTimersByTimeAsync(0)
    await tick()
    const first = feed()
    expect(first.url).toBe(DEFAULT_FEED)

    await fireEvent.change(getByTestId('load'), { target: { value: 'race-pc' } })
    await vi.advanceTimersByTimeAsync(0)
    await tick()
    expect(getByTestId('producer-src').value).toBe('http://race-pc.lan:9100/events')

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await tick()

    expect(first.closed).toBe(true)
    expect(FakeEventSource.live).toHaveLength(1)
    expect(FakeEventSource.last.url).toBe('http://race-pc.lan:9100/events')
    expect(feedText(getByTestId)).toBe('Producer feed: connecting…')
  })

  it('leaves a healthy connection alone when an edit is reverted inside the debounce window', async () => {
    // A typed edit that is undone before it settles must cost nothing. The pending reopen has to
    // be cancelled by the revert itself — "the URL is back where it started, so there is nothing
    // to do" is only true if the timer armed for the abandoned URL is also dropped. Otherwise it
    // fires, closes a connection that was fine, and reopens against a URL the config no longer
    // holds — and nothing corrects it, because `producer.src` never changes again.
    const { getByTestId } = await mount()
    const original = feed()
    original.emit('open')
    await tick()
    const field = getByTestId('producer-src')

    await fireEvent.input(field, { target: { value: 'http://race-pc.lan:9100/events' } })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 100) // still pending
    await fireEvent.input(field, { target: { value: DEFAULT_FEED } })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 3) // well past both windows
    await tick()

    // Nothing was ever opened against the abandoned URL, and the original is still the live one.
    expect(FakeEventSource.opened.map((es) => es.url)).toEqual([DEFAULT_FEED])
    expect(original.closed).toBe(false)
    expect(FakeEventSource.live).toEqual([original])
    // Still reading the state of the connection that never dropped — not a fresh "connecting…".
    expect(feedText(getByTestId)).toBe('Producer feed: connected')
  })

  it('reconnects when a URL the browser refused is edited back to one that worked', async () => {
    // The refused URL still has to be recorded as the one currently open, even though opening it
    // threw. If the failure left the LAST GOOD url recorded instead, typing that url back would
    // look like "no change" and the editor would sit disconnected forever with a URL that works
    // in the field — the exact misdiagnosis rule 25's readout exists to prevent.
    const { getByTestId } = await mount()
    const first = feed()
    first.emit('open')
    await tick()
    const field = getByTestId('producer-src')

    vi.stubGlobal('EventSource', RefusingEventSource)
    await fireEvent.input(field, { target: { value: 'http://' } })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await tick()
    expect(first.closed).toBe(true)
    expect(feedText(getByTestId)).toBe('Producer feed: not connected')

    // Back to the URL that was working a moment ago.
    vi.stubGlobal('EventSource', FakeEventSource)
    await fireEvent.input(field, { target: { value: DEFAULT_FEED } })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await tick()

    expect(FakeEventSource.live).toHaveLength(1)
    expect(FakeEventSource.last.url).toBe(DEFAULT_FEED)
    expect(FakeEventSource.last).not.toBe(first) // a NEW connection, not the closed one
    expect(feedText(getByTestId)).toBe('Producer feed: connecting…')

    FakeEventSource.last.emit('open')
    await tick()
    expect(feedText(getByTestId)).toBe('Producer feed: connected')
  })
})

describe('rule 28 — the preview never renders live data', () => {
  it('keeps drawing the sample fixture before, during, and after a live connection', async () => {
    const { container } = await mount()
    const expected = ['Hamilton', 'Verstappen', 'Leclerc', 'Norris']
    expect(previewNames(container)).toEqual(expected)

    const es = feed()
    es.emit('open')
    // A snapshot with a completely different field — if it reached the preview, it would show.
    es.emit('state', {
      data: JSON.stringify({
        ...closeBattle,
        vehicles: [
          { slot_id: 'car-77', driver_name: 'Bottas', vehicle_class: 'GT3', position: 1 },
          { slot_id: 'car-99', driver_name: 'Giovinazzi', vehicle_class: 'GT3', position: 2 },
        ],
        subject: { slot_id: 'car-77', driver_name: 'Bottas' },
      }),
    })
    await tick()

    expect(previewNames(container)).toEqual(expected)
  })
})

describe('rule 29 — each status readout names its own subject', () => {
  it('never renders a bare "Connected." for the companion server', async () => {
    stubFetch({ profiles: ['default'] })
    const { getByTestId } = await mount()
    await vi.advanceTimersByTimeAsync(0)
    await tick()

    const serverStatus = getByTestId('status').textContent.trim()
    expect(serverStatus).not.toBe('Connected.')
    expect(serverStatus).toBe('Profile server connected.')
  })

  it('names the server in the no-server message too', async () => {
    const { getByTestId } = await mount()

    expect(getByTestId('status').textContent.trim()).toBe(
      'No profile server — changes can be exported as config.json.',
    )
  })

  it('renders the server line and the feed line as two separate readouts', async () => {
    stubFetch({ profiles: ['default'] })
    const { getByTestId } = await mount()
    await vi.advanceTimersByTimeAsync(0)
    const es = feed()
    es.emit('error')
    await tick()

    // The failure this whole issue is about: server up, feed down, and the page saying so.
    expect(getByTestId('status').textContent.trim()).toBe('Profile server connected.')
    expect(feedText(getByTestId)).toBe('Producer feed: not connected')
  })

  it('keeps feed status out of the config it exports', async () => {
    // Transient UI state. If it leaked into the profile it would be saved, reloaded, and shipped
    // to a Browser Source — and `configVersion` would owe a migration.
    const { getByTestId } = await mount()
    feed().emit('error')
    await tick()

    // Capture what `exportJson()` serializes, without going near the download.
    let exported = null
    vi.stubGlobal(
      'Blob',
      class {
        constructor(parts) {
          exported = String(parts[0])
        }
      },
    )
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:captured')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    await fireEvent.click(getByTestId('export'))

    expect(feedText(getByTestId)).toBe('Producer feed: not connected')
    const profile = JSON.parse(exported)
    expect(profile.configVersion).toBe('1')
    expect(Object.keys(profile).filter((k) => /feed|connect/i.test(k))).toEqual([])
    expect(exported).not.toMatch(/feedStatus|Producer feed/)
  })
})
