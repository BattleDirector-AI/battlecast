// A junk `vehicles` on the tower's lap-flash and page-cycling paths: protocol-contract.md rule 21,
// widgets.md rule 66. A non-object `vehicles[]` entry is absent wherever it sits; a `vehicles` that
// is not an array is an empty field. StandingsTower.malformed.test.js covers the static render;
// these cover the paths that read the field over time. Fixtures: race-tower-metrics.json
// (car-44 P1, car-1 P2, car-16 P3, car-4 P4) for lap-flash, a synthetic 30-car field for cycling.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import towerMetrics from '../../../../spec/v1/fixtures/race-tower-metrics.json'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const clone = (o) => JSON.parse(JSON.stringify(o))
const JUNK = [null, 7, 'car-1', true, ['x']]
const slots = () =>
  Array.from(document.querySelectorAll('[data-testid="tower-row"]')).map((el) => el.getAttribute('data-slot'))
const gapEl = (slot) =>
  document.querySelector(`[data-testid="tower-row"][data-slot="${slot}"] [data-testid="row-gap"]`)
const gapText = (slot) => gapEl(slot).textContent.trim()
const REAL = ['car-44', 'car-1', 'car-16', 'car-4']

/** The fixture with junk spliced around its real cars and car-1's last lap optionally changed. */
function withJunk(lap) {
  const s = clone(towerMetrics)
  if (lap !== undefined) s.vehicles.find((v) => v.slot_id === 'car-1').last_lap = lap
  s.vehicles = [JUNK[0], s.vehicles[0], JUNK[1], JUNK[3], ...s.vehicles.slice(1), JUNK[4], JUNK[2]]
  return s
}

const ON = { interval: true, lapFlash: true }

describe('rule 66: lap-flash with junk vehicles[] entries', () => {
  it('flashes the real car that completed a lap and no other row, without crashing', async () => {
    const r = render(StandingsTower, { snapshot: withJunk(), metrics: ON })
    flushSync()
    await r.rerender({ snapshot: withJunk(91.95), metrics: ON })
    flushSync()
    expect(slots()).toEqual(REAL)
    expect(gapText('car-1')).toBe('1:31.950')
    expect(gapText('car-44')).toBe('LEADER')
    expect(gapText('car-16')).toBe('+2.200')
    expect(gapText('car-4')).toBe('+3.700')
    vi.advanceTimersByTime(5100)
    flushSync()
    expect(gapText('car-1')).toBe('+0.400')
  })

  it('does not flash any car merely because junk entries joined the array', async () => {
    const r = render(StandingsTower, { snapshot: clone(towerMetrics), metrics: ON })
    flushSync()
    await r.rerender({ snapshot: withJunk(), metrics: ON })
    flushSync()
    expect(REAL.map((s) => gapEl(s).getAttribute('data-lap-flash'))).toEqual([null, null, null, null])
  })
})

describe('rule 66: page cycling with junk vehicles[] entries', () => {
  const CYCLE = { enabled: true, perPageSeconds: 8, pinTop: 3, pinScope: 'overall', pinSubject: true }
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => `car-${a + i}`)
  /** 30 real cars with a junk entry first and after every third car. */
  const field = () => {
    const vehicles = [null]
    for (let i = 1; i <= 30; i++) {
      vehicles.push({
        slot_id: `car-${i}`,
        driver_name: `D${i}`,
        vehicle_class: 'Default',
        position: i,
        gap_to_leader: i === 1 ? 0 : i,
      })
      if (i % 3 === 0) vehicles.push(JUNK[(i / 3) % JUNK.length])
    }
    return { schemaVersion: '1', mode: 'race', vehicles, subject: {}, relationship: {}, session: { multiclass: false } }
  }

  it('budgets and pages on the real cars only: junk takes no row and no page slot', async () => {
    render(StandingsTower, { snapshot: field(), slotHeight: 400, cycle: CYCLE })
    flushSync()
    // Budget 8 (40px chrome / 45px rows under happy-dom): pins 1-3 + window 4-8.
    expect(slots()).toEqual(range(1, 8))
    await vi.advanceTimersByTimeAsync(8000)
    flushSync()
    expect(slots()).toEqual([...range(1, 3), ...range(9, 13)])
    await vi.advanceTimersByTimeAsync(8000)
    flushSync()
    expect(slots()).toEqual([...range(1, 3), ...range(14, 18)])
  })

  it('wraps back to the first window after the last page', async () => {
    render(StandingsTower, { snapshot: field(), slotHeight: 400, cycle: CYCLE })
    flushSync()
    // 27 non-pinned cars, window 5 -> 6 pages; the 6th turn is back to the first.
    await vi.advanceTimersByTimeAsync(8000 * 6)
    flushSync()
    expect(slots()).toEqual(range(1, 8))
  })
})

describe('rule 66: other primitive shapes', () => {
  const rows = () => document.querySelectorAll('[data-testid="tower-row"]').length
  const empty = () => document.querySelector('[data-testid="tower-empty"]')

  it('an array carrying vehicle fields is not a row, and does not take the leader slot', () => {
    const decoy = Object.assign(['x'], { slot_id: 'ghost', driver_name: 'Ghost', position: 0, vehicle_class: 'ZZ' })
    const s = clone(towerMetrics)
    s.vehicles = [decoy, ...s.vehicles]
    render(StandingsTower, { snapshot: s })
    expect(slots()).toEqual(REAL)
  })

  it('`true` as an entry is not a row', () => {
    const s = clone(towerMetrics)
    s.vehicles = [true, ...s.vehicles, true]
    render(StandingsTower, { snapshot: s })
    expect(slots()).toEqual(REAL)
  })

  it.each([
    ['a number', 7],
    ['true', true],
  ])('vehicles as %s is the empty field with the no-state placeholder', (_l, junk) => {
    render(StandingsTower, { snapshot: { ...clone(towerMetrics), vehicles: junk } })
    expect(rows()).toBe(0)
    expect(empty()?.getAttribute('data-reason')).toBe('no-state')
  })
})
