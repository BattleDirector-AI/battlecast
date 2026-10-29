/* Driver names on the standalone routes — overlay-config.md rule 42, widgets.md rule 111,
 * ADR 0038. Every standalone route that loads a profile and shows a name reads the profile's
 * one `theme.nameStyle` (a profile saved with the tower-only `widgets.tower.nameStyle` keeps its
 * tower's style), renders short names with no profile, and `/onboard`, which loads no profile,
 * renders short. Drives the PAGES, since that is where the setting is sourced; the profile is
 * served by a stubbed `fetch` and the feed by a mocked `connect`.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import TowerPage from './tower/TowerPage.svelte'
import BattlePage from './battle/BattlePage.svelte'
import DriverPage from './driver/DriverPage.svelte'
import QualifyingPage from './qualifying/QualifyingPage.svelte'
import UpdatesPage from './updates/UpdatesPage.svelte'
import GridPage from './grid/GridPage.svelte'
import ResultsPage from './results/ResultsPage.svelte'
import OnBoardHudPage from './onboard/OnBoardHudPage.svelte'
import closeBattle from '../../../spec/v1/fixtures/race-close-battle.json'
import qualifying from '../../../spec/v1/fixtures/qualifying-sector-a.json'
import raceEvents from '../../../spec/v1/fixtures/race-events.json'
import gridMulticlass from '../../../spec/v1/fixtures/grid-multiclass.json'
import raceFinish from '../../../spec/v1/fixtures/race-finish.json'

const sse = vi.hoisted(() => ({ emit: null }))
vi.mock('../lib/sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: (_url, onState) => {
    sse.emit = onState
    return () => {}
  },
}))

beforeEach(() => {
  sse.emit = null
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

async function settle() {
  for (let i = 0; i < 5; i++) await tick()
  flushSync()
}

/** Mount a page at `path` with `profile` served for `?profile=p` (no profile when null), then
 *  push each snapshot in turn. */
async function mount(Page, path, profile, snapshots) {
  window.history.replaceState({}, '', profile ? `${path}?profile=p` : path)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      profile ? { ok: true, status: 200, json: async () => profile } : { ok: false, status: 404, json: async () => ({}) },
    ),
  )
  const view = render(Page)
  await settle()
  expect(sse.emit, `${path}: the page should have opened its feed`).toBeTypeOf('function')
  for (const snap of snapshots) {
    sse.emit(snap)
    await settle()
  }
  return view.container
}

const textOf = (container, selector) => container.querySelector(selector)?.textContent.trim() ?? null
const allText = (container, selector) =>
  Array.from(container.querySelectorAll(selector)).map((el) => el.textContent.trim())

// Names with a first name, so the short and full forms differ visibly.
const battle = {
  ...closeBattle,
  vehicles: closeBattle.vehicles.map((v) => ({ ...v, driver_name: `Max ${v.driver_name}` })),
  subject: { ...closeBattle.subject, driver_name: 'Max Verstappen' },
}
const quali = {
  ...qualifying,
  vehicles: qualifying.vehicles.map((v) => (v.slot_id === 'car-16' ? { ...v, driver_name: 'Charles Leclerc' } : v)),
  subject: { ...qualifying.subject, driver_name: 'Charles Leclerc' },
}
const eventsNew = {
  ...structuredClone(raceEvents),
  race_events: [
    ...structuredClone(raceEvents.race_events),
    { id: 'ev-106', type: 'penalty', driver_name: 'Klaus Bachler', penalty: '+5s' },
  ],
}
const withFirstNames = (snap) => ({
  ...snap,
  vehicles: snap.vehicles.map((v) => ({ ...v, driver_name: `Ann ${v.driver_name}` })),
})

// [route, page, snapshots, read(container) -> the names, short, full]
const ROUTES = [
  ['/tower', TowerPage, [battle], (c) => allText(c, '[data-testid="driver-name"]'), ['M.HAM', 'M.VER', 'M.LEC', 'M.NOR'], ['M. Hamilton', 'M. Verstappen', 'M. Leclerc', 'M. Norris']],
  ['/battle', BattlePage, [battle], (c) => [textOf(c, '.bc-battle__focus-name'), textOf(c, '.bc-battle__slot--ahead .bc-battle__slot-name')], ['M.VER', 'M.HAM'], ['M. Verstappen', 'M. Hamilton']],
  ['/driver', DriverPage, [battle], (c) => [textOf(c, '[data-testid="driver-lt-name"]')], ['M.VER'], ['M. Verstappen']],
  ['/qualifying', QualifyingPage, [quali], (c) => [textOf(c, '[data-testid="qt-name"]')], ['C.LEC'], ['C. Leclerc']],
  ['/updates', UpdatesPage, [raceEvents, eventsNew], (c) => [textOf(c, '[data-testid="update-name"]')], ['K.BAC'], ['K. Bachler']],
]

describe('standalone routes — the profile-wide name style (rules 42, 111)', () => {
  it.each(ROUTES)('%s renders short names with no profile', async (path, Page, snaps, read, short) => {
    const c = await mount(Page, path, null, snaps)
    expect(read(c)).toEqual(short)
  })

  it.each(ROUTES)('%s renders full names when the profile sets theme.nameStyle: full', async (path, Page, snaps, read, _short, full) => {
    const c = await mount(Page, path, { theme: { nameStyle: 'full' } }, snaps)
    expect(read(c)).toEqual(full)
  })

  it.each(ROUTES)("%s keeps a stored tower nameStyle: full as the profile's style", async (path, Page, snaps, read, _short, full) => {
    const c = await mount(Page, path, { widgets: { tower: { nameStyle: 'full' } } }, snaps)
    expect(read(c)).toEqual(full)
  })

  it('/grid and /results follow the style for every name in the field', async () => {
    const grid = withFirstNames(gridMulticlass)
    const shortGrid = await mount(GridPage, '/grid', null, [grid])
    const shortNames = allText(shortGrid, '[data-testid="driver-name"]')
    expect(shortNames.length).toBeGreaterThan(0)
    for (const n of shortNames) expect(n).toMatch(/^A\.[A-Z]{1,3}$/)
    cleanup()

    const fullGrid = await mount(GridPage, '/grid', { theme: { nameStyle: 'full' } }, [grid])
    for (const n of allText(fullGrid, '[data-testid="driver-name"]')) expect(n).toMatch(/^A\. \S/)
    cleanup()

    const results = withFirstNames(raceFinish)
    const shortResults = await mount(ResultsPage, '/results', null, [{ ...results, mode: 'results' }])
    const rNames = allText(shortResults, '[data-testid="driver-name"]')
    expect(rNames.length).toBeGreaterThan(0)
    for (const n of rNames) expect(n).toMatch(/^A\.[A-Z]{1,3}$/)
    cleanup()

    const fullResults = await mount(ResultsPage, '/results', { theme: { nameStyle: 'full' } }, [{ ...results, mode: 'results' }])
    for (const n of allText(fullResults, '[data-testid="driver-name"]')) expect(n).toMatch(/^A\. \S/)
  })

  it('/onboard, which loads no profile, renders short names', async () => {
    window.history.replaceState({}, '', '/onboard')
    const view = render(OnBoardHudPage)
    await settle()
    expect(sse.emit, '/onboard should have opened its feed').toBeTypeOf('function')
    sse.emit(battle)
    await settle()
    expect(textOf(view.container, '[data-testid="onboard-driver-name"]')).toBe('M.VER')
  })
})
