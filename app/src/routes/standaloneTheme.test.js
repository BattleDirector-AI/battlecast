/* The theme preset on every profile-loading render page (overlay-config.md rule 59, ADR 0026).
 * The theme resolves `?theme=` -> profile `theme.preset` -> modern and is written to
 * `<html data-theme>`. Each page writes it from the URL and its profile on the initial load and
 * again on every live reload (rule 22), as it does `data-motion` (standaloneMotion.test.js).
 *
 * Each case drives one page: serve a profile, mount, read the root `data-theme`, swap the served
 * profile, run the 5 s watch interval, and read it again. The root attribute is cleared before and
 * after every case so no case inherits another's theme, and `undefined` (never written) is a
 * failure, not a stand-in for `modern`: the attribute is always present on a render page.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import AllPage from './all/AllPage.svelte'
import TowerPage from './tower/TowerPage.svelte'
import BattlePage from './battle/BattlePage.svelte'
import DriverPage from './driver/DriverPage.svelte'
import QualifyingPage from './qualifying/QualifyingPage.svelte'
import GridPage from './grid/GridPage.svelte'
import ResultsPage from './results/ResultsPage.svelte'
import LogosPage from './logos/LogosPage.svelte'
import UpdatesPage from './updates/UpdatesPage.svelte'
import InfoPage from './info/InfoPage.svelte'
import WeatherPage from './weather/WeatherPage.svelte'
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

const theme = () => document.documentElement.dataset.theme

function clearTheme() {
  delete document.documentElement.dataset.theme
}

beforeEach(() => {
  clearTheme()
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  clearTheme()
  window.history.replaceState({}, '', '/')
})

const PAGES = [
  ['/all', AllPage],
  ['/tower', TowerPage],
  ['/battle', BattlePage],
  ['/driver', DriverPage],
  ['/qualifying', QualifyingPage],
  ['/grid', GridPage],
  ['/results', ResultsPage],
  ['/logos', LogosPage],
  ['/updates', UpdatesPage],
  ['/info', InfoPage],
  ['/weather', WeatherPage],
  ['/racecontrol', RaceControlPage],
]

describe("render pages apply the profile's theme.preset (overlay-config rule 59)", () => {
  for (const [route, Page] of PAGES) {
    it(`${route}: data-theme follows the profile on load and on each live reload`, async () => {
      await mount(Page, route, { theme: { preset: 'vintage70' } })
      expect(theme(), 'profile preset vintage70 on the initial load').toBe('vintage70')

      await editProfile({ theme: { preset: 'vintage80' } })
      expect(theme(), 'live reload to vintage80').toBe('vintage80')

      // A profile that drops the key renders modern, written explicitly.
      await editProfile({ theme: { classTags: 'hide' } })
      expect(theme(), 'live reload to a profile without a preset').toBe('modern')
    })

    it(`${route}: a profile with no theme writes data-theme="modern" on load`, async () => {
      await mount(Page, route, { reducedMotion: false })
      expect(theme()).toBe('modern')
    })

    it(`${route}: ?theme=vintage80 wins over the profile's vintage70, on load and on reload`, async () => {
      await mount(Page, route, { theme: { preset: 'vintage70' } }, '&theme=vintage80')
      expect(theme()).toBe('vintage80')

      // A reload that changes the profile (so onChange runs) still keeps the URL's choice.
      await editProfile({ theme: { preset: 'modern', classTags: 'hide' } })
      expect(theme()).toBe('vintage80')
    })

    it(`${route}: an unknown ?theme= is ignored and the profile decides`, async () => {
      await mount(Page, route, { theme: { preset: 'vintage70' } }, '&theme=retro')
      expect(theme()).toBe('vintage70')

      await editProfile({ theme: { preset: 'vintage80' } })
      expect(theme()).toBe('vintage80')
    })
  }
})
