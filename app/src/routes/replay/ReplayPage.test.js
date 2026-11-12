/* Standalone `/replay` route (#60): widgets.md rule 120; overlay-config.md rules 10, 22, 59.
 * ADR 0039.
 *
 * Drives the PAGE, because motion and the theme preset come from the loaded profile. The SSE
 * client is mocked so a test pushes snapshots at the page. Timers are faked so the live-reload
 * poll can run (as WeatherPage.test.js does). The page is loaded through a non-static specifier,
 * so while it does not exist each test fails with a message that names it. */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import base from '../../../../spec/v1/fixtures/race-close-battle.json'

const sse = vi.hoisted(() => ({ emit: null, connects: 0, url: null, disconnects: 0 }))
vi.mock('../../lib/sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: (url, onState) => {
    sse.connects += 1
    sse.url = url
    sse.emit = onState
    return () => {
      sse.disconnects += 1
    }
  },
}))

const MODULE = './ReplayPage.svelte'
async function loadPage() {
  try {
    return (await import(/* @vite-ignore */ MODULE)).default
  } catch (err) {
    throw new Error(
      `could not load app/src/routes/replay/ReplayPage.svelte: ${String(err?.message).split('\n')[0]}`,
      { cause: err },
    )
  }
}

const withMode = (mode) => ({ ...structuredClone(base), mode })
const badge = () => document.querySelector('[data-testid="replay-badge"]')
const root = () => document.documentElement.dataset

let served = null
async function settle() {
  for (let i = 0; i < 5; i++) await tick()
  flushSync()
}
async function mountPage(profile = null) {
  const Page = await loadPage()
  served = profile
  window.history.replaceState({}, '', profile ? '/replay?profile=p' : '/replay')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      served
        ? { ok: true, status: 200, json: async () => structuredClone(served) }
        : { ok: false, status: 404, json: async () => ({}) },
    ),
  )
  render(Page)
  await settle()
}
function push(snapshot) {
  sse.emit(snapshot)
  flushSync()
}

beforeEach(() => {
  sse.emit = null
  sse.connects = 0
  sse.url = null
  sse.disconnects = 0
  delete document.documentElement.dataset.theme
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
  document.documentElement.dataset.motion = 'reduced'
  window.history.replaceState({}, '', '/')
})

describe('/replay standalone route (rule 120)', () => {
  it('connects to the producer and shows the badge only while mode is replay', async () => {
    // Reduced motion, so the badge leaves at once (rule 119) and the last check can see it go.
    await mountPage({ reducedMotion: true })
    expect(sse.connects, 'the page did not connect to the producer').toBe(1)
    expect(sse.url).toBe('http://producer.test/events')

    push(withMode('race'))
    expect(badge()).toBeNull()
    push(withMode('replay'))
    expect(badge(), 'no badge during a replay').not.toBeNull()
    expect(document.querySelector('[data-testid="replay-label"]')?.textContent.trim()).toBe('REPLAY')
    push(withMode('race'))
    expect(badge(), 'the badge stayed after the replay (reduced motion: no exit)').toBeNull()
  })

  it("takes the theme preset from the profile, and follows it on live reload", async () => {
    await mountPage({ theme: { preset: 'vintage70' } })
    expect(root().theme).toBe('vintage70')

    served = { theme: { preset: 'vintage80' } }
    await vi.advanceTimersByTimeAsync(5000)
    await settle()
    expect(root().theme, 'the live reload did not reach /replay').toBe('vintage80')
  })

  it('writes data-theme="modern" with no profile', async () => {
    await mountPage()
    expect(root().theme).toBe('modern')
  })

  it("takes motion from the profile's reducedMotion", async () => {
    await mountPage({ reducedMotion: false })
    expect(root().motion).toBe('full')
    cleanup()
    await mountPage({ reducedMotion: true })
    expect(root().motion).toBe('reduced')
  })
})

// #453: teardown. The page closes the feed, stops the config watch, and ignores a profile that
// arrives after unmount.
describe('/replay teardown', () => {
  it('closes the producer feed on unmount', async () => {
    await mountPage({ reducedMotion: true })
    push(withMode('replay'))
    expect(badge(), 'no badge during a replay').not.toBeNull()

    cleanup()
    expect(sse.disconnects, 'the feed stayed open after unmount').toBe(1)
  })

  it('stops following the profile on unmount', async () => {
    await mountPage({ theme: { preset: 'vintage70' } })
    expect(root().theme).toBe('vintage70')

    cleanup()
    const loads = fetch.mock.calls.length
    served = { theme: { preset: 'vintage80' } }
    await vi.advanceTimersByTimeAsync(15000) // three reload intervals
    await settle()
    expect(root().theme, 'a reload after unmount applied the new preset').toBe('vintage70')
    expect(fetch.mock.calls.length, 'the reload poll ran after unmount').toBe(loads)
  })

  it('applies nothing, opens no feed and starts no reload poll when unmounted before the profile arrives', async () => {
    const Page = await loadPage()
    window.history.replaceState({}, '', '/replay?profile=p')
    let release
    const gate = new Promise((resolve) => (release = resolve))
    const fetchMock = vi.fn(async () => {
      await gate
      return { ok: true, status: 200, json: async () => ({ theme: { preset: 'vintage70' } }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(Page)
    await tick()
    expect(fetchMock, 'the page must start loading the named profile').toHaveBeenCalled()

    cleanup() // unmount while the profile load is still in flight
    release()
    await settle()
    const loads = fetchMock.mock.calls.length

    await vi.advanceTimersByTimeAsync(15000) // three reload intervals
    await settle()
    expect(root().theme, 'a late profile applied its preset').toBeUndefined()
    expect(sse.connects, 'a late profile opened the feed').toBe(0)
    expect(fetchMock.mock.calls.length, 'a late profile started the reload poll').toBe(loads)
    expect(badge()).toBeNull()
  })
})
