/* Row budget reads the tower root's top/bottom border widths (#320). happy-dom does no layout, so
 * the root's computed border widths are stubbed (same Proxy idiom as StandingsTower.nameWidth.test.js).
 * Unmeasurable (happy-dom's '') falls back to 1px per edge, so the token defaults give
 * budget = floor((slot - (38 + borderY)) / 45), borderY = 2 by default.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'

const field = {
  mode: 'race',
  vehicles: Array.from({ length: 12 }, (_, i) => ({
    slot_id: `car-${i + 1}`,
    driver_name: `D${i + 1}`,
    position: i + 1,
    gap_to_leader: i === 0 ? 0 : i,
  })),
  subject: {},
  relationship: {},
}
const rowCount = () => document.querySelectorAll('[data-testid="tower-row"]').length

let original
function stubBorders(top, bottom) {
  original = window.getComputedStyle
  window.getComputedStyle = function getComputedStyle(el, ...rest) {
    const real = original.call(window, el, ...rest)
    if (!el?.matches?.('[data-testid="standings-tower"]')) return real
    return new Proxy(real, {
      get(target, prop) {
        if (prop === 'borderTopWidth') return top
        if (prop === 'borderBottomWidth') return bottom
        const value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }
}
afterEach(() => {
  cleanup()
  if (original) window.getComputedStyle = original
  original = undefined
  vi.restoreAllMocks()
})

describe('StandingsTower — row budget follows the measured root border (#320)', () => {
  it('unmeasurable borders keep the 1px-per-edge budget: slot 175 -> 3 rows', () => {
    render(StandingsTower, { snapshot: field, slotHeight: 175 })
    expect(rowCount()).toBe(3)
  })
  it('3px top and bottom borders cost a row: slot 175 -> 2 rows', () => {
    stubBorders('3px', '3px')
    render(StandingsTower, { snapshot: field, slotHeight: 175 })
    expect(rowCount()).toBe(2)
  })
  it('0px borders gain a row: slot 173 -> 3 rows (2 with the 1px fallback)', () => {
    stubBorders('0px', '0px')
    render(StandingsTower, { snapshot: field, slotHeight: 173 })
    expect(rowCount()).toBe(3)
  })
})
