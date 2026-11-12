/* Standalone `/event` teardown (widgets.md rule 123, overlay-config.md rules 22, 59), added after
 * review of #467, as ReplayPage.test.js does for `/replay`: the page stops following the profile
 * on unmount, and a profile that arrives after unmount applies nothing and starts no reload poll.
 * Timers are faked so the live-reload poll can run.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import EventPage from './EventPage.svelte'

const root = () => document.documentElement.dataset
let served = null

async function settle() {
  for (let i = 0; i < 5; i++) await tick()
  flushSync()
}

beforeEach(() => {
  vi.useFakeTimers()
  delete document.documentElement.dataset.theme
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
  delete document.documentElement.dataset.theme
})

describe('/event teardown', () => {
  it('stops following the profile on unmount', async () => {
    served = { slides: { series: 'GT Cup' }, theme: { preset: 'vintage70' } }
    window.history.replaceState({}, '', '/event?profile=p')
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => structuredClone(served) }))
    vi.stubGlobal('fetch', fetchMock)
    render(EventPage)
    await settle()
    expect(root().theme).toBe('vintage70')

    cleanup()
    const loads = fetchMock.mock.calls.length
    served = { slides: { series: 'GT Cup' }, theme: { preset: 'vintage80' } }
    await vi.advanceTimersByTimeAsync(15000) // three reload intervals
    await settle()
    expect(root().theme, 'a reload after unmount applied the new preset').toBe('vintage70')
    expect(fetchMock.mock.calls.length, 'the reload poll ran after unmount').toBe(loads)
  })

  it('applies nothing and starts no reload poll when unmounted before the profile arrives', async () => {
    window.history.replaceState({}, '', '/event?profile=p')
    let release
    const gate = new Promise((resolve) => (release = resolve))
    const fetchMock = vi.fn(async () => {
      await gate
      return { ok: true, status: 200, json: async () => ({ theme: { preset: 'vintage70' } }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(EventPage)
    await tick()
    expect(fetchMock, 'the page must start loading the named profile').toHaveBeenCalled()

    cleanup() // unmount while the profile load is still in flight
    release()
    await settle()
    const loads = fetchMock.mock.calls.length

    await vi.advanceTimersByTimeAsync(15000) // three reload intervals
    await settle()
    expect(root().theme, 'a late profile applied its preset').toBeUndefined()
    expect(fetchMock.mock.calls.length, 'a late profile started the reload poll').toBe(loads)
  })
})
