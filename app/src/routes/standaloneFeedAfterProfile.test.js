/* A reducedMotion profile's first entrance is reduced on every render page (#354,
 * overlay-config.md rule 10). App.svelte stamps `data-motion=full` at boot; a page refines it
 * from the profile once the profile resolves. A page that opened the producer feed before that
 * could render — and animate — its first snapshot at full motion. Each page therefore opens
 * the feed only after the profile has resolved and the motion mode is final.
 *
 * Each case holds the profile fetch open, mounts the page, checks no feed is open yet,
 * releases the fetch, and records the root `data-motion` at the moment the feed opens.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import TowerPage from './tower/TowerPage.svelte'
import BattlePage from './battle/BattlePage.svelte'
import DriverPage from './driver/DriverPage.svelte'
import QualifyingPage from './qualifying/QualifyingPage.svelte'
import GridPage from './grid/GridPage.svelte'
import ResultsPage from './results/ResultsPage.svelte'
import UpdatesPage from './updates/UpdatesPage.svelte'
import InfoPage from './info/InfoPage.svelte'
import WeatherPage from './weather/WeatherPage.svelte'
import AllPage from './all/AllPage.svelte'

/** The root `data-motion` value at each feed open, in order, and each open's disconnect. */
const opened = []
const disconnects = []

vi.mock('../lib/sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: () => {
    opened.push(document.documentElement.dataset.motion)
    const disconnect = vi.fn()
    disconnects.push(disconnect)
    return disconnect
  },
}))

async function settle() {
  for (let i = 0; i < 5; i++) await tick()
  flushSync()
}

/** Mount with the profile fetch held open; returns a function that serves the profile. */
async function mountHeld(Page, route) {
  let release
  const gate = new Promise((resolve) => (release = resolve))
  window.history.replaceState({}, '', `${route}?profile=p`)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      await gate
      return { ok: true, status: 200, json: async () => ({ reducedMotion: true }) }
    }),
  )
  // The boot baseline App.svelte writes when the URL has no ?motion=.
  document.documentElement.dataset.motion = 'full'
  const view = render(Page)
  await settle()
  return {
    view,
    serve: async () => {
      release()
      await settle()
    },
  }
}

beforeEach(() => {
  opened.length = 0
  disconnects.length = 0
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.motion
  window.history.replaceState({}, '', '/')
})

const PAGES = [
  ['/tower', TowerPage],
  ['/battle', BattlePage],
  ['/driver', DriverPage],
  ['/qualifying', QualifyingPage],
  ['/grid', GridPage],
  ['/results', ResultsPage],
  ['/updates', UpdatesPage],
  ['/info', InfoPage],
  ['/weather', WeatherPage],
  ['/all', AllPage],
]

describe('render pages open the feed only after the profile resolves (#354)', () => {
  for (const [route, Page] of PAGES) {
    it(`${route}: no feed while the profile loads; the feed opens once, already reduced`, async () => {
      const { serve } = await mountHeld(Page, route)
      expect(opened).toEqual([])
      await serve()
      expect(opened).toEqual(['reduced'])
    })

    it(`${route}: unmounted before the profile arrives, it never opens the feed`, async () => {
      const { view, serve } = await mountHeld(Page, route)
      view.unmount()
      await serve()
      expect(opened).toEqual([])
    })

    it(`${route}: unmounted after the profile arrives, it closes the feed it opened`, async () => {
      const { view, serve } = await mountHeld(Page, route)
      await serve()
      expect(disconnects).toHaveLength(1)
      expect(disconnects[0]).not.toHaveBeenCalled()
      view.unmount()
      expect(disconnects[0]).toHaveBeenCalledTimes(1)
    })
  }
})
