/* `/config` names the demo fallback (#183) — `.ai/spec/what/overlay-config.md` rule 31.
 *
 * `DEFAULT_CONFIG.producer.src` (and rule 27's blank-field fallback) both resolve to the same
 * literal address as the bundled demo producer, `http://localhost:8080/events`. A profile that
 * never set its own producer therefore shows a URL field that looks exactly like one a
 * broadcaster deliberately configured. This pins the always-visible note the Producer section
 * renders whenever the *resolved* URL is that literal default, regardless of whether the field
 * itself is empty or already holds the string. Rationale:
 * `docs/decisions/0008-producer-src-default-visibility.md`.
 *
 * Environment: same as `ConfigPage.feedStatus.test.js` — `happy-dom` has no `EventSource`, so one
 * is stubbed; the producer-URL effect is debounced, so the file runs on fake timers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'
import ConfigPage from './ConfigPage.svelte'
import { DEFAULT_CONFIG } from '../../lib/overlayConfig.js'
import { FakeEventSource } from '../../lib/testing/fakeEventSource.js'

const DEFAULT_FEED = DEFAULT_CONFIG.producer.src // 'http://localhost:8080/events'
const DEBOUNCE_MS = 500

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
  )
}

async function mount() {
  const view = render(ConfigPage)
  await vi.advanceTimersByTimeAsync(0)
  await tick()
  return view
}

/** The demo-fallback note, or `null` — pinned as its own testid so it can't be confused with the
 *  feed-status readout (rule 31 forbids exactly that conflation). */
const defaultNotice = (view) => view.queryByTestId('producer-default-notice')

beforeEach(() => {
  vi.useFakeTimers()
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
  stubFetch()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('rule 31 — the Producer section names the bundled demo address', () => {
  it('shows the note for an untouched profile, naming the demo producer and its address', async () => {
    const view = await mount()
    const notice = defaultNotice(view)

    if (!notice) {
      throw new Error(
        'the editor renders no notice that an untouched profile is on the demo producer (rule 31)',
      )
    }
    expect(notice.textContent.toLowerCase()).toMatch(/demo/)
    expect(notice.textContent).toContain(DEFAULT_FEED)
  })

  it('sits in the Producer section, after the URL field and before the feed-status readout, and is not that readout', async () => {
    const view = await mount()
    const notice = defaultNotice(view)
    if (!notice) throw new Error('the demo-producer notice never rendered (rule 31)')

    const producerSrc = view.getByTestId('producer-src')
    const feedStatus = view.getByTestId('feed-status')
    const producerSection = producerSrc.closest('section')
    expect(producerSection).not.toBeNull()
    expect(producerSection.contains(notice)).toBe(true)

    // Containment alone would pass a notice dropped anywhere in the section (e.g. below the
    // Reconnect control, or with feed-status deleted). Pin the actual DOM order instead: the URL
    // field, then this notice, then the feed-status readout (rule 29's adjacency).
    expect(producerSrc.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(notice.compareDocumentPosition(feedStatus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(notice.textContent.trim().startsWith('Producer feed:')).toBe(false)
  })

  it('disappears once the field holds a real, distinct producer address', async () => {
    const view = await mount()
    if (!defaultNotice(view)) {
      throw new Error('the demo-producer notice never rendered for the untouched default (rule 31)')
    }

    await fireEvent.input(view.getByTestId('producer-src'), {
      target: { value: 'http://race-pc.lan:9100/events' },
    })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await tick()

    expect(defaultNotice(view)).toBeNull()
  })

  it('reappears once the field is cleared back to blank, because it resolves to the same default', async () => {
    const view = await mount()
    if (!defaultNotice(view)) {
      throw new Error('the demo-producer notice never rendered for the untouched default (rule 31)')
    }

    await fireEvent.input(view.getByTestId('producer-src'), {
      target: { value: 'http://race-pc.lan:9100/events' },
    })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await tick()
    if (defaultNotice(view)) {
      throw new Error('the notice should have cleared once a distinct address was typed (rule 31)')
    }

    await fireEvent.input(view.getByTestId('producer-src'), { target: { value: '   ' } })
    await tick()

    const notice = defaultNotice(view)
    if (!notice) {
      throw new Error(
        'a whitespace-only field resolves to the demo default (rule 27) and must show the notice again (rule 31)',
      )
    }
    expect(notice.textContent).toContain(DEFAULT_FEED)
  })

  it('also shows the note when a saved profile explicitly carries the literal demo address', async () => {
    // Same resolved URL as the untouched default, reached a different way — a profile saved
    // before rule 31 shipped, or one a broadcaster saved while still pointed at the demo. The
    // condition is a value comparison, not an "was this ever edited" flag (ADR 0008).
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path) => {
        const url = String(path)
        if (url === '/api/profiles') {
          return { ok: true, status: 200, json: async () => ({ profiles: ['race'] }) }
        }
        if (url === '/api/profiles/race') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ...DEFAULT_CONFIG, name: 'race', producer: { src: DEFAULT_FEED } }),
          }
        }
        if (url.startsWith('/api/logos')) return { ok: true, status: 200, json: async () => ({ logos: [] }) }
        return { ok: false, status: 404, json: async () => ({}) }
      }),
    )

    const view = await mount()
    await fireEvent.change(view.getByTestId('load'), { target: { value: 'race' } })
    await vi.advanceTimersByTimeAsync(0)
    await tick()

    const notice = defaultNotice(view)
    if (!notice) {
      throw new Error('a loaded profile carrying the literal demo address must still show the notice (rule 31)')
    }
    expect(notice.textContent).toContain(DEFAULT_FEED)
  })
})
