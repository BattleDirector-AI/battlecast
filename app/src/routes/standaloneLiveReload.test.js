/* Live config reload on every standalone render page (#348, overlay-config.md rule 22).
 *
 * A render page re-reads its profile at runtime and applies a change without a Browser Source
 * refresh — immediately, no transition — and a config edit never reopens the producer feed.
 * /all has done this since #115 (AllPage → lib/configWatch.js); each case below drives one
 * standalone page: serve profile A, mount, push a snapshot, swap the served profile to B, run the
 * 5 s watch interval, and assert the RENDERED output now reflects B and that SSE was not
 * reconnected.
 *
 * race-single-class.json: one class, `session.multiclass: false`, Jacobs (car-1) on camera — so
 * `theme.classTags` 'show' draws a DEFAULT chip and 'hide' draws none.
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
import singleClass from '../../../spec/v1/fixtures/race-single-class.json'
import raceEvents from '../../../spec/v1/fixtures/race-events.json'

const sse = vi.hoisted(() => ({ emit: null, connects: 0 }))
vi.mock('../lib/sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: (_url, onState) => {
    sse.connects += 1
    sse.emit = onState
    return () => {}
  },
}))

/** The profile the fake companion server currently serves; a test swaps it mid-run. */
let served = null

async function settle() {
  for (let i = 0; i < 5; i++) await tick()
  flushSync()
}

async function mount(Page, route, profile) {
  served = profile
  window.innerHeight = 800
  window.history.replaceState({}, '', `${route}?profile=p`)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => structuredClone(served) })),
  )
  render(Page)
  await settle()
}

function push(snapshot) {
  sse.emit(snapshot)
  flushSync()
}

/** Edit the served profile, then run the 5 s watch interval so the page re-reads it. */
async function editProfile(profile) {
  served = profile
  await vi.advanceTimersByTimeAsync(5000)
  await settle()
}

const chips = () => Array.from(document.querySelectorAll('.bc-class-chip')).map((el) => el.textContent.trim())

beforeEach(() => {
  sse.emit = null
  sse.connects = 0
  vi.useFakeTimers()
})
const originalInnerHeight = window.innerHeight
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.innerHeight = originalInnerHeight
  window.history.replaceState({}, '', '/')
})

// Pages whose class-tags knob (theme.classTags) is the visible change: 'show' -> 'hide'.
// The lower-thirds use the persistent trigger so the card stays up across the 5 s interval.
const CLASS_TAG_PAGES = [
  { name: '/battle', Page: BattlePage, route: '/battle', snapshot: singleClass, widgets: {} },
  {
    name: '/driver',
    Page: DriverPage,
    route: '/driver',
    snapshot: singleClass,
    widgets: { driver: { trigger: 'persistent' } },
  },
  {
    name: '/qualifying',
    Page: QualifyingPage,
    route: '/qualifying',
    snapshot: { ...singleClass, mode: 'qualifying' },
    widgets: { qualifying: { trigger: 'persistent' } },
  },
  { name: '/grid', Page: GridPage, route: '/grid', snapshot: singleClass, widgets: {} },
  { name: '/results', Page: ResultsPage, route: '/results', snapshot: singleClass, widgets: {} },
]

describe('standalone pages live-reload their profile (overlay-config rule 22)', () => {
  for (const { name, Page, route, snapshot, widgets } of CLASS_TAG_PAGES) {
    it(`${name}: a classTags edit hides the class chip without a refresh or a reconnect`, async () => {
      await mount(Page, route, { theme: { classTags: 'show' }, widgets })
      push(snapshot)
      expect(chips(), 'profile A shows the class chip').toEqual(['DEFAULT'])

      await editProfile({ theme: { classTags: 'hide' }, widgets })
      expect(chips(), 'profile B hides it').toEqual([])
      expect(sse.connects, 'a config edit must not reopen the producer feed').toBe(1)
    })
  }

  it('/tower: a nameStyle edit switches the tower to full names without a refresh or a reconnect', async () => {
    await mount(TowerPage, '/tower', { widgets: { tower: { nameStyle: 'short' } } })
    push(singleClass)
    const tower = () => document.querySelector('[data-testid="standings-tower"]')
    expect(tower().getAttribute('data-name-style')).toBe('short')

    await editProfile({ widgets: { tower: { nameStyle: 'full' } } })
    expect(tower().getAttribute('data-name-style')).toBe('full')
    expect(sse.connects).toBe(1)
  })

  it('/logos: an images edit swaps the rotation to the new logo without a refresh', async () => {
    await mount(LogosPage, '/logos', { logoRotation: { images: ['/logos/a.png'], perSlotSeconds: 30 } })
    const src = () => document.querySelector('[data-testid="logo-image"]')?.getAttribute('src')
    expect(src()).toBe('/logos/a.png')

    await editProfile({ logoRotation: { images: ['/logos/b.png'], perSlotSeconds: 30 } })
    expect(src()).toBe('/logos/b.png')
    expect(sse.connects, '/logos is not feed-driven').toBe(0)
  })

  it('/updates: a dwellSeconds edit changes how long the next update shows, without a reconnect', async () => {
    await mount(UpdatesPage, '/updates', { widgets: { updates: { dwellSeconds: 3 } } })
    push(raceEvents) // baseline: the listed events never show

    await editProfile({ widgets: { updates: { dwellSeconds: 10 } } })
    push({
      ...structuredClone(raceEvents),
      race_events: [
        ...structuredClone(raceEvents.race_events),
        { id: 'ev-106', type: 'penalty', driver_name: 'Mike Conway', penalty: '+5s', detail: 'Track limits' },
      ],
    })
    const card = () => document.querySelector('[data-testid="race-update"]')
    expect(card().getAttribute('data-event-id')).toBe('ev-106')

    vi.advanceTimersByTime(9999)
    flushSync()
    expect(card(), 'profile B dwell (10 s) — still up past profile A dwell (3 s)').not.toBeNull()
    vi.advanceTimersByTime(1)
    flushSync()
    expect(card()).toBeNull()
    expect(sse.connects).toBe(1)
  })
})

// Every standalone page, for the stop-on-unmount guards: a torn-down Browser Source must not
// keep polling the companion server.
const ALL_PAGES = [
  ['/tower', TowerPage],
  ['/battle', BattlePage],
  ['/driver', DriverPage],
  ['/qualifying', QualifyingPage],
  ['/grid', GridPage],
  ['/results', ResultsPage],
  ['/logos', LogosPage],
  ['/updates', UpdatesPage],
]

describe('standalone pages stop the profile watch on unmount', () => {
  for (const [route, Page] of ALL_PAGES) {
    it(`${route}: unmounted after the initial load, it polls no more`, async () => {
      await mount(Page, route, { theme: { classTags: 'show' } })
      const initialFetches = fetch.mock.calls.length
      expect(initialFetches, 'the page must load its profile on mount').toBeGreaterThan(0)

      cleanup()
      served = { theme: { classTags: 'hide' } }
      await vi.advanceTimersByTimeAsync(15000)
      await settle()
      expect(fetch.mock.calls.length, 'no poll after unmount').toBe(initialFetches)
    })

    it(`${route}: unmounted before the initial load resolves, it never starts polling`, async () => {
      served = { theme: { classTags: 'show' } }
      window.history.replaceState({}, '', `${route}?profile=p`)
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, status: 200, json: async () => structuredClone(served) })),
      )
      render(Page)
      cleanup() // the profile fetch is still in flight
      const initialFetches = fetch.mock.calls.length
      expect(initialFetches, 'the page must start loading its profile on mount').toBeGreaterThan(0)

      await settle()
      await vi.advanceTimersByTimeAsync(15000)
      await settle()
      expect(fetch.mock.calls.length, 'no poll from a page torn down mid-load').toBe(initialFetches)
    })
  }
})
