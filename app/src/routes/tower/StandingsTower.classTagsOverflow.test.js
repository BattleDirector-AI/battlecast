/* A grouped tower with its class tags hidden renders the inline layout, and tower overflow then
 * applies to it as to any inline tower (widgets.md rule 61, tower-overflow.md rules 1-5, ADR 0022).
 *
 * happy-dom does no layout, so — as StandingsTower.test.js's overflow block does — the token
 * heights fall back to header 38px / row 44px (40px chrome, 45px rendered rows): slotHeight 400 -> budget floor((400 - 40) / 45) = 8 rows.
 * With pinTop 3 and no subject the first window is cars 1-8; one 8 s page turn later it is pins
 * 1-3 plus cars 9-13. A tower that kept gating overflow on the CONFIGURED `classDisplay` (grouped,
 * clamp-only) renders all 30 rows and never turns.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { flushSync } from 'svelte'
import StandingsTower from './StandingsTower.svelte'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const CYCLE = { enabled: true, perPageSeconds: 8, pinTop: 3, pinScope: 'overall', pinSubject: true }

/** n cars, one shared class, the producer saying single-class (or not saying). */
const singleClassField = (n, session = { multiclass: false }) => ({
  schemaVersion: '1',
  mode: 'race',
  vehicles: Array.from({ length: n }, (_, i) => ({
    slot_id: `car-${i + 1}`,
    driver_name: `D${i + 1}`,
    vehicle_class: 'Default',
    position: i + 1,
    gap_to_leader: i === 0 ? 0 : i,
  })),
  subject: {},
  relationship: {},
  session,
})

const slots = () =>
  Array.from(document.querySelectorAll('[data-testid="tower-row"]')).map((el) => el.getAttribute('data-slot'))
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => `car-${a + i}`)

describe('grouped tower, class tags hidden — overflow as an inline tower (rule 61)', () => {
  it('auto + multiclass false: budgets to 8 rows, pins + window, and the window turns', async () => {
    render(StandingsTower, {
      snapshot: singleClassField(30),
      classDisplay: 'grouped',
      classTags: 'auto',
      slotHeight: 400,
      cycle: CYCLE,
    })
    flushSync()
    expect(document.querySelectorAll('[data-testid="tower-group"]')).toHaveLength(0)
    expect(slots()).toEqual(range(1, 8))

    await vi.advanceTimersByTimeAsync(8000)
    flushSync()
    expect(slots()).toEqual([...range(1, 3), ...range(9, 13)])
  })

  it('an integer maxRows caps a hidden-tag grouped tower with no slot height, and it cycles', async () => {
    render(StandingsTower, {
      snapshot: singleClassField(30),
      classDisplay: 'grouped',
      classTags: 'hide',
      maxRows: 6,
      cycle: CYCLE,
    })
    flushSync()
    // budget 6: pins 1-3, window 4-6; next page 7-9.
    expect(slots()).toEqual(range(1, 6))
    await vi.advanceTimersByTimeAsync(8000)
    flushSync()
    expect(slots()).toEqual([...range(1, 3), ...range(7, 9)])
  })

  it('cycling off: an integer maxRows still caps a hidden-tag grouped tower', () => {
    render(StandingsTower, {
      snapshot: singleClassField(30),
      classDisplay: 'grouped',
      classTags: 'auto',
      maxRows: 6,
      cycle: { ...CYCLE, enabled: false },
    })
    flushSync()
    expect(slots()).toEqual(range(1, 6))
  })

  it('guard: with the tags shown the grouped tower stays clamp-only (all 30 rows, no turn)', async () => {
    render(StandingsTower, {
      snapshot: singleClassField(30, { flag: 'green' }),
      classDisplay: 'grouped',
      classTags: 'auto',
      slotHeight: 400,
      cycle: CYCLE,
    })
    flushSync()
    expect(document.querySelectorAll('[data-testid="tower-group"]')).toHaveLength(1)
    expect(slots()).toHaveLength(30)
    await vi.advanceTimersByTimeAsync(8000)
    flushSync()
    expect(slots()).toEqual(range(1, 30))
  })
})
