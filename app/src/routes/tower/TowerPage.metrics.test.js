/* Standalone /tower — the loaded profile's tower metrics are the base and `?metrics=` overrides
 * them as a whole (overlay-config.md rules 13, 38, 49; tower-overflow.md rule 20). Same profile
 * fetch mock as TowerPage.classTags.test.js; the assertion is which metric columns
 * (`[data-col=interval|pit|tire|fuel]`) the rendered rows carry, driven by the
 * race-tower-metrics fixture, which sends every metric field. The lap-time flash is the one
 * toggle with no column: it is read off car-1's gap cell after car-1 completes a lap.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import TowerPage from './TowerPage.svelte'
import towerMetrics from '../../../../spec/v1/fixtures/race-tower-metrics.json'

const sse = vi.hoisted(() => ({ emit: null }))
vi.mock('../../lib/sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: (_url, onState) => {
    sse.emit = onState
    return () => {}
  },
}))

const METRIC_COLS = ['interval', 'pit', 'tire', 'fuel']
const rows = () => document.querySelectorAll('[data-testid="tower-row"]')
// The metric columns present, in render order, taken from the first row.
const columns = () =>
  Array.from(rows()[0].querySelectorAll('[data-col]'))
    .map((el) => el.getAttribute('data-col'))
    .filter((c) => METRIC_COLS.includes(c))
const gapEl = (slot) =>
  document.querySelector(`[data-testid="tower-row"][data-slot="${slot}"] [data-testid="row-gap"]`)
const gapText = (slot) => gapEl(slot)?.textContent.trim()
const flashTier = (slot) => gapEl(slot)?.getAttribute('data-lap-flash') ?? null

// The fixture again with car-1 having completed a lap (last_lap 92.061 -> 91.95).
const lapCompleted = () => {
  const s = JSON.parse(JSON.stringify(towerMetrics))
  s.vehicles.find((v) => v.slot_id === 'car-1').last_lap = 91.95
  return s
}

async function mountTower(url, profile) {
  window.history.replaceState({}, '', url)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      profile
        ? { ok: true, status: 200, json: async () => profile }
        : { ok: false, status: 404, json: async () => ({}) },
    ),
  )
  render(TowerPage)
  for (let i = 0; i < 5; i++) await tick()
  expect(sse.emit, 'the page should have opened its state feed on mount').toBeTypeOf('function')
  sse.emit(towerMetrics)
  flushSync()
  await tick()
  expect(rows().length, 'the tower should have rendered rows').toBeGreaterThan(0)
}

beforeEach(() => {
  sse.emit = null
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

// interval off, pit + tire on: differs from the default on every column except fuel.
const PROFILE = {
  widgets: { tower: { towerMetrics: { interval: false, pit: true, tire: true, fuel: false } } },
}

const FLASH_ON = { widgets: { tower: { towerMetrics: { lapFlash: true } } } }
const FLASH_OFF = { widgets: { tower: { towerMetrics: { lapFlash: false } } } }

describe('standalone /tower — the profile supplies the metrics (overlay-config rule 49)', () => {
  it('a profile with metrics and no ?metrics=: the profile columns show, and only those', async () => {
    await mountTower('/tower?profile=p', PROFILE)
    expect(columns()).toEqual(['pit', 'tire'])
  })

  it('a blank ?metrics= is no list: the profile columns show', async () => {
    await mountTower('/tower?profile=p&metrics=', PROFILE)
    expect(columns()).toEqual(['pit', 'tire'])
  })

  it('a profile plus ?metrics=: the list is the complete set, the profile contributes nothing', async () => {
    await mountTower('/tower?profile=p&metrics=fuel', PROFILE)
    expect(columns()).toEqual(['fuel'])
  })

  it('?metrics= naming a toggle the profile turned off shows it; one it omits is off', async () => {
    await mountTower('/tower?profile=p&metrics=interval,pit', PROFILE)
    expect(columns()).toEqual(['interval', 'pit'])
  })

  it('?metrics= naming no known toggle is ignored: the profile columns show', async () => {
    await mountTower('/tower?profile=p&metrics=bogus', PROFILE)
    expect(columns()).toEqual(['pit', 'tire'])
  })

  it('?metrics=, (only empty entries) is ignored: the profile columns show', async () => {
    await mountTower('/tower?profile=p&metrics=,', PROFILE)
    expect(columns()).toEqual(['pit', 'tire'])
  })

  it('a list naming one valid toggle among unknown ones is a list: only the valid one is on', async () => {
    await mountTower('/tower?profile=p&metrics=bogus,fuel', PROFILE)
    expect(columns()).toEqual(['fuel'])
  })

  it('no profile loaded and no ?metrics=: the default (interval only)', async () => {
    await mountTower('/tower', null)
    expect(columns()).toEqual(['interval'])
  })

  it('a ?profile= that fails to load is no profile: the default (interval only)', async () => {
    await mountTower('/tower?profile=missing', null)
    expect(columns()).toEqual(['interval'])
  })

  it('no profile loaded and an unknown-only ?metrics=: the default (interval only)', async () => {
    await mountTower('/tower?metrics=bogus', null)
    expect(columns()).toEqual(['interval'])
  })

  it('no profile loaded plus ?metrics=: the list alone', async () => {
    await mountTower('/tower?metrics=tire,fuel', null)
    expect(columns()).toEqual(['tire', 'fuel'])
  })
})

describe('standalone /tower — the profile lapFlash (overlay-config rules 38, 49)', () => {
  it('profile lapFlash false and no ?metrics=: a completed lap does not flash', async () => {
    await mountTower('/tower?profile=p', FLASH_OFF)
    expect(gapText('car-1')).toBe('+0.400')
    sse.emit(lapCompleted())
    flushSync()
    await tick()
    expect(gapText('car-1')).toBe('+0.400')
    expect(flashTier('car-1')).toBeNull()
  })

  it('profile lapFlash false plus ?metrics=interval,lapflash: the list wins and a completed lap flashes', async () => {
    await mountTower('/tower?profile=p&metrics=interval,lapflash', FLASH_OFF)
    sse.emit(lapCompleted())
    flushSync()
    await tick()
    expect(gapText('car-1')).toBe('1:31.950')
    expect(flashTier('car-1')).not.toBeNull()
  })
})

describe('standalone /tower — ?metrics= leaving lapFlash out (overlay-config rules 38, 49)', () => {
  it('profile lapFlash on plus ?metrics=interval: a completed lap does not flash', async () => {
    await mountTower('/tower?profile=p&metrics=interval', FLASH_ON)
    expect(gapText('car-1')).toBe('+0.400')
    sse.emit(lapCompleted())
    flushSync()
    await tick()
    expect(gapText('car-1')).toBe('+0.400')
    expect(flashTier('car-1')).toBeNull()
  })
})

describe('standalone /tower — before the profile loads (overlay-config rule 49)', () => {
  it('shows the default metrics until the profile resolves, then the profile metrics replace them', async () => {
    window.history.replaceState({}, '', '/tower?profile=p')
    let resolveProfile
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveProfile = () => resolve({ ok: true, status: 200, json: async () => PROFILE })
          }),
      ),
    )
    render(TowerPage)
    for (let i = 0; i < 5; i++) await tick()
    sse.emit(towerMetrics)
    flushSync()
    await tick()
    expect(columns()).toEqual(['interval'])
    resolveProfile()
    for (let i = 0; i < 5; i++) await tick()
    flushSync()
    expect(columns()).toEqual(['pit', 'tire'])
  })
})
