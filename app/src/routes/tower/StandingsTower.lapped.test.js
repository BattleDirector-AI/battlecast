import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import lapped from '../../../../spec/v1/fixtures/race-tower-lapped.json'
import towerMetrics from '../../../../spec/v1/fixtures/race-tower-metrics.json'

afterEach(() => cleanup())

// Lapped cars (widgets.md rules 33-35, ADR 0012). The producer sends the lap deficit as
// `laps_behind_leader` / `laps_behind_ahead` / `laps_behind_class_leader`; the tower shows
// `+1 LAP` / `+N LAPS` in place of the matching time and never derives a deficit itself.
//
// race-tower-lapped.json (multi-class, GT3 leader lapped by the GTPs):
//   P1 car-6  GTP  gap 0                     — overall leader
//   P2 car-7  GTP  gap 3.2   int 3.2         — no lap fields at all
//   P3 car-92 GT3  gap 101.4 int 98.2        — lapsLeader 1, lapsAhead 1, lapsClass 0 (GT3 leader)
//   P4 car-77 GT3  gap 104.9 int 3.5         — lapsLeader 1, lapsAhead 0, lapsClass 0
//   P5 car-85 GT3  gap 205.0 int 100.1       — lapsLeader 2, lapsAhead 1, lapsClass 1

const rowFor = (slot) =>
  document.querySelector(`[data-testid="tower-row"][data-slot="${slot}"]`)
const cellText = (slot, testid) =>
  rowFor(slot)?.querySelector(`[data-testid="${testid}"]`)?.textContent.trim()

/** A deep copy of the lapped fixture with one vehicle's fields overridden. */
function withVehicle(slot, patch) {
  const snap = structuredClone(lapped)
  Object.assign(
    snap.vehicles.find((v) => v.slot_id === slot),
    patch,
  )
  return snap
}

describe('StandingsTower lapped cars — inline gap cell (rule 33)', () => {
  it('shows the overall lap deficit in place of the time gap for lapped rows', () => {
    render(StandingsTower, { snapshot: lapped })
    expect(cellText('car-6', 'row-gap')).toBe('LEADER')
    expect(cellText('car-7', 'row-gap')).toBe('+3.200')
    expect(cellText('car-92', 'row-gap')).toBe('+1 LAP')
    expect(cellText('car-77', 'row-gap')).toBe('+1 LAP')
    expect(cellText('car-85', 'row-gap')).toBe('+2 LAPS')
  })

  it('the lap deficit wins over a 0 placeholder gap (the +0.000 report)', () => {
    render(StandingsTower, { snapshot: withVehicle('car-92', { gap_to_leader: 0 }) })
    expect(cellText('car-92', 'row-gap')).toBe('+1 LAP')
  })

  it('the lap deficit wins over a null gap', () => {
    render(StandingsTower, { snapshot: withVehicle('car-85', { gap_to_leader: null }) })
    expect(cellText('car-85', 'row-gap')).toBe('+2 LAPS')
  })

  it('a fractional deficit renders its whole part', () => {
    render(StandingsTower, { snapshot: withVehicle('car-85', { laps_behind_leader: 1.6 }) })
    expect(cellText('car-85', 'row-gap')).toBe('+1 LAP')
  })

  it.each([
    ['0', 0],
    ['null', null],
    ['a negative number', -1],
    ['a numeric string', '2'],
    ['a fraction below one', 0.9],
    ['NaN', Number.NaN],
  ])('laps_behind_leader of %s renders the time gap', (_label, value) => {
    render(StandingsTower, { snapshot: withVehicle('car-85', { laps_behind_leader: value }) })
    expect(cellText('car-85', 'row-gap')).toBe('+205.000')
  })

  it('a fixture without any lap field renders exactly as before', () => {
    render(StandingsTower, { snapshot: towerMetrics })
    expect(cellText('car-44', 'row-gap')).toBe('LEADER')
    expect(cellText('car-1', 'row-gap')).toBe('+0.400')
    expect(cellText('car-16', 'row-gap')).toBe('+2.200')
    expect(cellText('car-4', 'row-gap')).toBe('+3.700')
  })
})

describe('StandingsTower lapped cars — interval column (rule 34)', () => {
  it('shows laps_behind_ahead in place of interval_ahead when 1 or more', () => {
    render(StandingsTower, { snapshot: lapped, metrics: { interval: true } })
    expect(cellText('car-6', 'row-interval')).toBe('—')
    expect(cellText('car-7', 'row-interval')).toBe('+3.200')
    expect(cellText('car-92', 'row-interval')).toBe('+1 LAP')
    // Lapped overall, but on the same lap as the car ahead: the interval stays a time.
    expect(cellText('car-77', 'row-interval')).toBe('+3.500')
    expect(cellText('car-85', 'row-interval')).toBe('+1 LAP')
  })

  it('the grouped layout renders the interval lap deficit identically', () => {
    render(StandingsTower, {
      snapshot: lapped,
      classDisplay: 'grouped',
      metrics: { interval: true },
    })
    expect(cellText('car-92', 'row-interval')).toBe('+1 LAP')
    expect(cellText('car-77', 'row-interval')).toBe('+3.500')
    expect(cellText('car-85', 'row-interval')).toBe('+1 LAP')
  })

  it('pluralizes the interval deficit', () => {
    render(StandingsTower, {
      snapshot: withVehicle('car-85', { laps_behind_ahead: 3 }),
      metrics: { interval: true },
    })
    expect(cellText('car-85', 'row-interval')).toBe('+3 LAPS')
  })
})

describe('StandingsTower lapped cars — grouped layout (rule 35)', () => {
  it('reads the CLASS lap deficit, never the overall one', () => {
    render(StandingsTower, { snapshot: lapped, classDisplay: 'grouped' })
    // GTP section, unaffected.
    expect(cellText('car-6', 'row-gap')).toBe('LEADER')
    expect(cellText('car-7', 'row-gap')).toBe('+3.200')
    // GT3 leader is a lap down overall but leads its class.
    expect(cellText('car-92', 'row-gap')).toBe('LEADER')
    // A lap down overall, on the class lead lap: the class time gap, 104.9 − 101.4.
    expect(cellText('car-77', 'row-gap')).toBe('+3.500')
    // Two laps down overall, ONE down on the class leader.
    expect(cellText('car-85', 'row-gap')).toBe('+1 LAP')
  })

  it('pluralizes the class deficit', () => {
    render(StandingsTower, {
      snapshot: withVehicle('car-85', { laps_behind_class_leader: 2 }),
      classDisplay: 'grouped',
    })
    expect(cellText('car-85', 'row-gap')).toBe('+2 LAPS')
  })

  it('an absent class field falls back to the class time gap, even when lapped overall', () => {
    const snap = structuredClone(lapped)
    delete snap.vehicles.find((v) => v.slot_id === 'car-85').laps_behind_class_leader
    render(StandingsTower, { snapshot: snap, classDisplay: 'grouped' })
    // 205.0 − 101.4 = 103.6: no derivation from laps_behind_leader (2) or the leader's (1).
    expect(cellText('car-85', 'row-gap')).toBe('+103.600')
  })
})
