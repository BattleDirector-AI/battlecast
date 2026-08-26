/* `/config` producer feed status (#158) — `.ai/spec/what/overlay-config.md` rules 25–29.
 *
 * Pins the readout's three states, that it tracks the connection rather than the data, that it
 * follows the configured producer URL from any source, where on the page it renders, and that the
 * preview stays on the fixture regardless.
 * Rationale: `docs/decisions/0006-config-producer-feed-status.md`.
 *
 * Environment: `happy-dom` has no `EventSource`, so one is stubbed and `emit()` stands in for the
 * browser dispatching `open` / `error` / `state`. The reopen is debounced, so the whole file runs
 * on fake timers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'
import ConfigPage from './ConfigPage.svelte'
import { DEFAULT_CONFIG } from '../../lib/overlayConfig.js'
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
