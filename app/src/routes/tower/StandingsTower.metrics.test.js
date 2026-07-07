import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import towerMetrics from '../../../../spec/v1/fixtures/race-tower-metrics.json'
import towerPartial from '../../../../spec/v1/fixtures/race-tower-partial.json'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

afterEach(() => cleanup())

// Every metric column is config-gated (the `metrics` prop) so a broadcaster chooses the
// tower's density (slice 3 of #20 → follow-on to #28). The producer owns each value; the
// tower renders whatever subset it is handed and tolerates absence without crashing.
const ALL_ON = { interval: true, pit: true, tire: true, fuel: true }

const rowFor = (slot) =>
  document.querySelector(`[data-testid="tower-row"][data-slot="${slot}"]`)
const cell = (slot, testid) =>
  rowFor(slot)?.querySelector(`[data-testid="${testid}"]`)
const cellText = (slot, testid) => cell(slot, testid)?.textContent.trim()
const fillWidth = (slot, testid) =>
  rowFor(slot)?.querySelector(`[data-testid="${testid}"]`)?.style.width

describe('StandingsTower metrics — config gating', () => {
  it('renders no metric cells when metrics is unset (backward-compatible bare component)', () => {
    render(StandingsTower, { snapshot: towerMetrics })
    for (const t of ['row-interval', 'row-pit', 'row-tire', 'row-fuel']) {
      expect(document.querySelectorAll(`[data-testid="${t}"]`)).toHaveLength(0)
    }
  })

  it('interval off hides the interval column even when the producer sent interval_ahead', () => {
    render(StandingsTower, { snapshot: towerMetrics, metrics: { pit: true } })
    expect(document.querySelectorAll('[data-testid="row-interval"]')).toHaveLength(0)
    // …but the enabled pit column is present.
    expect(document.querySelectorAll('[data-testid="row-pit"]').length).toBeGreaterThan(0)
  })

  it('each toggle surfaces only its own column', () => {
    render(StandingsTower, { snapshot: towerMetrics, metrics: { interval: true } })
    expect(document.querySelectorAll('[data-testid="row-interval"]').length).toBe(4)
    expect(document.querySelectorAll('[data-testid="row-pit"]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-testid="row-tire"]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-testid="row-fuel"]')).toHaveLength(0)
  })
})

describe('StandingsTower metrics — interval column', () => {
  it('renders interval_ahead verbatim; the leader (no one ahead) reads an em dash', () => {
    render(StandingsTower, { snapshot: towerMetrics, metrics: { interval: true } })
    // race-tower-metrics: car-44 P1 (interval null), car-1 +0.4, car-16 +1.8, car-4 +1.5.
    expect(cellText('car-44', 'row-interval')).toBe('—')
    expect(cellText('car-1', 'row-interval')).toBe('+0.400')
    expect(cellText('car-16', 'row-interval')).toBe('+1.800')
    expect(cellText('car-4', 'row-interval')).toBe('+1.500')
  })

  it('renders the interval verbatim in the grouped layout too', () => {
    render(StandingsTower, {
      snapshot: towerMetrics,
      classDisplay: 'grouped',
      metrics: { interval: true },
    })
    // Single class (F1), so grouped order matches; producer values render as-is.
    expect(cellText('car-1', 'row-interval')).toBe('+0.400')
    expect(cellText('car-16', 'row-interval')).toBe('+1.800')
  })

  it('shows an em dash for an interval column when the producer omits interval_ahead', () => {
    // race-close-battle carries no interval_ahead: the column is present (enabled) but
    // every cell reads '—', and no crash.
    render(StandingsTower, { snapshot: closeBattle, metrics: ALL_ON })
    expect(document.querySelectorAll('[data-testid="row-interval"]').length).toBe(4)
    expect(cellText('car-1', 'row-interval')).toBe('—')
    // The strategy cells (gated on presence) are absent — no data to show.
    expect(document.querySelectorAll('[data-testid="row-pit"]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-testid="row-tire"]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-testid="row-fuel"]')).toHaveLength(0)
  })
})

describe('StandingsTower metrics — pit', () => {
  it('shows the stop count, and flips to an IN PIT badge with a data hook when in the pits', () => {
    render(StandingsTower, { snapshot: towerMetrics, metrics: { pit: true } })
    // car-16 has pit_stops 2 (on track); car-4 is in_pit.
    expect(cellText('car-16', 'row-pit')).toContain('2')
    expect(rowFor('car-16').getAttribute('data-in-pit')).toBeNull()

    expect(cellText('car-4', 'row-pit')).toBe('PIT')
    expect(rowFor('car-4').getAttribute('data-in-pit')).toBe('true')
    expect(rowFor('car-4').classList.contains('row--inpit')).toBe(true)
  })
})

describe('StandingsTower metrics — tire + fuel bars', () => {
  it('renders the compound label and a wear-bar fill width tracking tire_wear', () => {
    render(StandingsTower, { snapshot: towerMetrics, metrics: { tire: true } })
    // car-44: compound M, wear 0.34.
    expect(cellText('car-44', 'row-tire-compound')).toBe('M')
    expect(fillWidth('car-44', 'row-tire-wear-fill')).toBe('34%')
    // car-16: compound S, wear 0.62.
    expect(cellText('car-16', 'row-tire-compound')).toBe('S')
    expect(fillWidth('car-16', 'row-tire-wear-fill')).toBe('62%')
  })

  it('renders a fuel-bar fill width tracking fuel', () => {
    render(StandingsTower, { snapshot: towerMetrics, metrics: { fuel: true } })
    expect(fillWidth('car-44', 'row-fuel-fill')).toBe('61%')
    expect(fillWidth('car-16', 'row-fuel-fill')).toBe('44%')
  })

  it('clamps out-of-range / garbage wear + fuel into [0, 1] without throwing', () => {
    const snap = {
      ...towerMetrics,
      vehicles: towerMetrics.vehicles.map((v) =>
        v.slot_id === 'car-44'
          ? { ...v, tire_wear: 1.4, fuel: -0.3 }
          : v.slot_id === 'car-1'
            ? { ...v, tire_wear: 'nope', fuel: null }
            : v,
      ),
    }
    render(StandingsTower, { snapshot: snap, metrics: { tire: true, fuel: true } })
    expect(fillWidth('car-44', 'row-tire-wear-fill')).toBe('100%')
    expect(fillWidth('car-44', 'row-fuel-fill')).toBe('0%')
    // Garbage wear → no wear bar; null fuel → no fuel cell; but a present compound still shows.
    expect(cell('car-1', 'row-tire-wear-fill')).toBeNull()
    expect(cell('car-1', 'row-fuel')).toBeNull()
  })
})

describe('StandingsTower metrics — partial producer feed', () => {
  it('renders only the fields each vehicle actually carries', () => {
    render(StandingsTower, { snapshot: towerPartial, metrics: ALL_ON })
    // car-1: tire_compound + tire_wear present, NO fuel, NO pit.
    expect(cellText('car-1', 'row-tire-compound')).toBe('M')
    expect(fillWidth('car-1', 'row-tire-wear-fill')).toBe('28%')
    expect(cell('car-1', 'row-fuel')).toBeNull()
    expect(cell('car-1', 'row-pit')).toBeNull()
    // car-16: in_pit true + pit_stops, no tire, no fuel.
    expect(cellText('car-16', 'row-pit')).toBe('PIT')
    expect(cell('car-16', 'row-tire')).toBeNull()
    // car-4: only fuel present.
    expect(fillWidth('car-4', 'row-fuel-fill')).toBe('73%')
    expect(cell('car-4', 'row-tire')).toBeNull()
    expect(cell('car-4', 'row-pit')).toBeNull()
  })
})
