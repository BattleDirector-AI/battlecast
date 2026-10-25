/* The profile's `reducedMotion` on every standalone render page (#350, overlay-config.md
 * rule 10). Motion resolves `?motion=` -> profile `reducedMotion` -> full and is written to
 * `<html data-motion>`. Each page that loads a profile refines the motion mode from it on the
 * initial load and on every live reload (rule 22), as /all does; an explicit `?motion=` URL
 * param still wins over the profile.
 *
 * Each case drives one page: serve a profile, mount, read the root `data-motion`, swap the
 * served profile, run the 5 s watch interval, and read it again. The root attribute is cleared
 * before and after every case so no case inherits another's motion mode.
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
import LogosPage from './logos/LogosPage.svelte'
import UpdatesPage from './updates/UpdatesPage.svelte'
import InfoPage from './info/InfoPage.svelte'
import RaceControlPage from './racecontrol/RaceControlPage.svelte'

vi.mock('../lib/sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: () => () => {},
}))

/** The profile the fake companion server currently serves; a test swaps it mid-run. */
let served = null

async function settle() {
  for (let i = 0; i < 5; i++) await tick()
  flushSync()
}

async function mount(Page, route, profile, query = '') {
  served = profile
  window.history.replaceState({}, '', `${route}?profile=p${query}`)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => structuredClone(served) })),
  )
  render(Page)
  await settle()
}

/** Edit the served profile, then run the 5 s watch interval so the page re-reads it. */
async function editProfile(profile) {
  served = profile
  await vi.advanceTimersByTimeAsync(5000)
  await settle()
}

const motion = () => document.documentElement.dataset.motion

function clearMotion() {
  delete document.documentElement.dataset.motion
}

beforeEach(() => {
  clearMotion()
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  clearMotion()
  window.history.replaceState({}, '', '/')
})

const PAGES = [
  ['/tower', TowerPage],
  ['/battle', BattlePage],
  ['/driver', DriverPage],
  ['/qualifying', QualifyingPage],
  ['/grid', GridPage],
  ['/results', ResultsPage],
  ['/logos', LogosPage],
  ['/updates', UpdatesPage],
  ['/info', InfoPage],
  ['/racecontrol', RaceControlPage],
]

describe("standalone pages apply the profile's reducedMotion (overlay-config rule 10)", () => {
  for (const [route, Page] of PAGES) {
    it(`${route}: data-motion follows the profile on load and on each live reload`, async () => {
      await mount(Page, route, { reducedMotion: true })
      expect(motion(), 'profile reducedMotion: true on the initial load').toBe('reduced')

      await editProfile({ reducedMotion: false })
      expect(motion(), 'live reload to reducedMotion: false').toBe('full')

      await editProfile({ reducedMotion: true })
      expect(motion(), 'live reload back to reducedMotion: true').toBe('reduced')
    })

    it(`${route}: ?motion=full wins over a profile reducedMotion: true, on load and on reload`, async () => {
      await mount(Page, route, { reducedMotion: true }, '&motion=full')
      expect(motion()).toBe('full')

      // A reload that changes the profile (so onChange runs) still keeps the URL's choice.
      await editProfile({ reducedMotion: true, theme: { classTags: 'hide' } })
      expect(motion()).toBe('full')
    })
  }
})
