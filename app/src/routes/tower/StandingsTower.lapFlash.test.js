/* Tower lap-time flash (#207): widgets.md rules 40-42, ADR 0014.
 *
 * When a car's own `last_lap` changes between snapshots, its gap cell shows the new lap
 * time for 5 s, then reverts. The tier (`data-lap-flash`) comes from the producer's
 * `notable` flags in the firing snapshot. Timers are faked so the dwell is exact.
 *
 * race-tower-metrics.json: P1 car-44 Hamilton (last 92.418, LEADER), P2 car-1 Verstappen
 * (last 92.061, gap +0.400, interval +0.400), P3 car-16 Leclerc (+2.200), P4 car-4 Norris
 * (+3.700).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import AllView from '../all/AllView.svelte'
import towerMetrics from '../../../../spec/v1/fixtures/race-tower-metrics.json'

const ON = { interval: true, lapFlash: true }

const clone = (o) => JSON.parse(JSON.stringify(o))
/** The fixture with per-car patches, keyed by slot_id. */
function snap(patches = {}) {
  const s = clone(towerMetrics)
  for (const v of s.vehicles) Object.assign(v, patches[v.slot_id] ?? {})
  return s
}

const gapEl = (slot) =>
  document.querySelector(`[data-testid="tower-row"][data-slot="${slot}"] [data-testid="row-gap"]`)
const gap = (slot) => gapEl(slot)?.textContent.trim()
const tier = (slot) => gapEl(slot)?.getAttribute('data-lap-flash') ?? null
const interval = (slot) =>
  document
    .querySelector(`[data-testid="tower-row"][data-slot="${slot}"] [data-testid="row-interval"]`)
    ?.textContent.trim()

function advance(ms) {
  vi.advanceTimersByTime(ms)
  flushSync()
}

/** Mount on the base fixture, then push `next`. */
async function mountThen(next, props = {}) {
  const r = render(StandingsTower, { snapshot: snap(), metrics: ON, ...props })
  flushSync()
  await r.rerender({ snapshot: next, metrics: ON, ...props })
  flushSync()
  return r
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('lap-time flash — trigger and dwell (rule 40)', () => {
  it('shows the new lap time in the gap cell of the car that completed a lap, and only there', async () => {
    await mountThen(snap({ 'car-1': { last_lap: 91.95 } }))
    expect(gap('car-1')).toBe('1:31.950')
    expect(tier('car-1')).toBe('none')
    // Untouched rows keep their gaps, and the flashing row keeps its interval.
    expect(gap('car-44')).toBe('LEADER')
    expect(gap('car-16')).toBe('+2.200')
    expect(gap('car-4')).toBe('+3.700')
    expect(tier('car-16')).toBeNull()
    expect(interval('car-1')).toBe('+0.400')
  })

  it('holds for 5 s with no further snapshots, then reverts to the gap', async () => {
    await mountThen(snap({ 'car-1': { last_lap: 91.95 } }))
    advance(4900)
    expect(gap('car-1')).toBe('1:31.950')
    advance(200)
    expect(gap('car-1')).toBe('+0.400')
    expect(tier('car-1')).toBeNull()
  })

  it('a re-sent unchanged lap does not extend the flash', async () => {
    const { rerender } = await mountThen(snap({ 'car-1': { last_lap: 91.95 } }))
    advance(3000)
    await rerender({ snapshot: snap({ 'car-1': { last_lap: 91.95 } }), metrics: ON })
    advance(2100) // t = 5.1 s from the lap
    expect(gap('car-1')).toBe('+0.400')
  })

  it('a further lap during a flash shows the newer time and restarts the 5 s in place', async () => {
    const { rerender } = await mountThen(snap({ 'car-1': { last_lap: 91.95 } }))
    advance(3000)
    await rerender({ snapshot: snap({ 'car-1': { last_lap: 91.8 } }), metrics: ON })
    flushSync()
    expect(gap('car-1')).toBe('1:31.800')
    advance(4900) // t = 7.9 s
    expect(gap('car-1')).toBe('1:31.800')
    advance(200)
    expect(gap('car-1')).toBe('+0.400')
  })

  it("a car's first completed lap (null -> time) flashes", async () => {
    const r = render(StandingsTower, { snapshot: snap({ 'car-16': { last_lap: null } }), metrics: ON })
    flushSync()
    await r.rerender({ snapshot: snap({ 'car-16': { last_lap: 93.104 } }), metrics: ON })
    flushSync()
    expect(gap('car-16')).toBe('1:33.104')
  })

  it("the leader's LEADER cell flashes too, then reverts to LEADER", async () => {
    await mountThen(snap({ 'car-44': { last_lap: 91.7 } }))
    expect(gap('car-44')).toBe('1:31.700')
    advance(5100)
    expect(gap('car-44')).toBe('LEADER')
  })

  it('flashes in the grouped layout too', async () => {
    await mountThen(snap({ 'car-4': { last_lap: 92.5 } }), { classDisplay: 'grouped' })
    expect(gap('car-4')).toBe('1:32.500')
  })

  it('does not flash on the first snapshot after mount', () => {
    render(StandingsTower, { snapshot: snap(), metrics: ON })
    flushSync()
    for (const slot of ['car-44', 'car-1', 'car-16', 'car-4']) expect(tier(slot)).toBeNull()
    expect(gap('car-1')).toBe('+0.400')
  })

  it('does not flash when last_lap becomes null, or for an unchanged lap', async () => {
    await mountThen(snap({ 'car-1': { last_lap: null } }))
    expect(gap('car-1')).toBe('+0.400')
    expect(gap('car-16')).toBe('+2.200')
    expect(tier('car-1')).toBeNull()
  })

  it('does not flash a car that was not in the previous snapshot', async () => {
    const base = snap()
    base.vehicles = base.vehicles.filter((v) => v.slot_id !== 'car-4')
    const r = render(StandingsTower, { snapshot: base, metrics: ON })
    flushSync()
    await r.rerender({ snapshot: snap(), metrics: ON })
    flushSync()
    expect(gap('car-4')).toBe('+3.700')
  })

  it('keys on slot_id, not array position: reordering vehicles[] fires nothing', async () => {
    const reordered = snap()
    reordered.vehicles.reverse()
    await mountThen(reordered)
    for (const slot of ['car-44', 'car-1', 'car-16', 'car-4']) expect(tier(slot)).toBeNull()
  })
})

describe('lap-time flash — tier from notable (rule 41)', () => {
  it.each([
    ['session-best', { session_best_lap: true, class_best_lap: true, personal_best_lap: true }],
    ['class-best', { class_best_lap: true, personal_best_lap: true }],
    ['personal-best', { personal_best_lap: true }],
    ['none', { session_best_lap: false, class_best_lap: false, personal_best_lap: false }],
  ])('%s', async (expected, notable) => {
    await mountThen(snap({ 'car-1': { last_lap: 91.95, notable } }))
    expect(tier('car-1')).toBe(expected)
  })

  it('stays fixed for the whole flash when later snapshots change the flags', async () => {
    const { rerender } = await mountThen(
      snap({ 'car-1': { last_lap: 91.95, notable: { personal_best_lap: true } } }),
    )
    advance(1000)
    await rerender({
      snapshot: snap({ 'car-1': { last_lap: 91.95, notable: { personal_best_lap: false } } }),
      metrics: ON,
    })
    flushSync()
    expect(tier('car-1')).toBe('personal-best')
  })
})

describe('lap-time flash — toggle (rule 42, overlay-config rule 38)', () => {
  it('lapFlash off: no row flashes', async () => {
    await mountThen(snap({ 'car-1': { last_lap: 91.95 } }), { metrics: { interval: true } })
    expect(gap('car-1')).toBe('+0.400')
    expect(tier('car-1')).toBeNull()
  })

  it('/all flashes with the default config', async () => {
    const r = render(AllView, { snapshot: snap() })
    flushSync()
    await r.rerender({ snapshot: snap({ 'car-1': { last_lap: 91.95 } }) })
    flushSync()
    expect(gap('car-1')).toBe('1:31.950')
  })
})
