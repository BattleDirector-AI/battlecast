/* The interval cell keeps its width (widgets.md rule 42b, ADR 0019).
 *
 * happy-dom does no layout, so like rule 42a's check in StandingsTower.lapFlashEdges.test.js this
 * pins the stylesheet contract on the component source, plus the rendered values the slot holds.
 * It reads the plain `.row__interval` rule only: a scoped override (say under a data attribute)
 * would slip past it.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import source from './StandingsTower.svelte?raw'
import towerMetrics from '../../../../spec/v1/fixtures/race-tower-metrics.json'

afterEach(() => cleanup())

function rulesFor(selector) {
  // Comments go first: their commas and braces would otherwise split selectors.
  const css = source.slice(source.indexOf('<style>')).replace(/\/\*[\s\S]*?\*\//g, '')
  const out = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map((s) => s.trim())
    if (selectors.includes(selector)) out.push(m[2])
  }
  return out.join(';')
}
const decl = (body, prop) => body.match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`))?.[1]?.trim()

describe('the interval cell keeps its width (rule 42b)', () => {
  const interval = rulesFor('.row__interval')
  const gap = rulesFor('.row__gap')

  it('finds both rules, so the checks below are not vacuous', () => {
    expect(interval, 'no .row__interval rule found').toContain('font-family')
    expect(gap, 'no .row__gap rule found').toContain('font-family')
  })

  it('reserves the same minimum width as the gap cell', () => {
    expect(decl(gap, 'min-width'), '.row__gap has no min-width').toBeTruthy()
    expect(decl(interval, 'min-width'), '.row__interval has no min-width').toBe(decl(gap, 'min-width'))
  })

  it('sizes that width off the gap type token, not the element font', () => {
    expect(decl(interval, 'min-width') ?? '').toContain('--bc-size-gap')
    expect(decl(interval, 'min-width') ?? '').not.toMatch(/\d(ch|em|ex)\b/)
  })

  it('never wraps, so "+12 LAPS" stays on one line inside the slot', () => {
    expect(decl(interval, 'white-space')).toBe('nowrap')
  })

  it('never shrinks and stays right-aligned', () => {
    const flex = decl(interval, 'flex')
    const shrink = decl(interval, 'flex-shrink')
    expect(shrink === '0' || /^\S+\s+0(\s|$)/.test(flex ?? ''), `.row__interval may shrink (flex: ${flex}, flex-shrink: ${shrink})`).toBe(true)
    expect(decl(interval, 'text-align')).toBe('right')
  })

  it('caps no width, so an 8-character readout is never cut', () => {
    expect(decl(interval, 'max-width')).toBeUndefined()
    expect(decl(interval, 'width')).toBeUndefined()
  })

  it('renders every readout the slot is sized for in the same cell', () => {
    const snap = JSON.parse(JSON.stringify(towerMetrics))
    // The fixture is a short field: extend it with copies so each readout gets its own row.
    const last = snap.vehicles[snap.vehicles.length - 1]
    for (let n = snap.vehicles.length + 1; n <= 7; n++) {
      snap.vehicles.push({ ...JSON.parse(JSON.stringify(last)), slot_id: `car-x${n}`, position: n, driver_name: `Driver ${n}` })
    }
    const cases = [
      [null, 0, '—'],
      [0.4, 0, '+0.400'],
      [12.345, 0, '+12.345'],
      [105, 0, '+105.000'],
      [3, 1, '+1 LAP'],
      [3, 12, '+12 LAPS'],
    ]
    const cars = snap.vehicles.filter((v) => v.position > 1).slice(0, cases.length)
    expect(cars).toHaveLength(cases.length)
    cars.forEach((v, i) => {
      v.interval_ahead = cases[i][0]
      v.laps_behind_ahead = cases[i][1]
    })
    render(StandingsTower, { snapshot: snap, metrics: { interval: true } })
    const cells = cars.map((v) =>
      document.querySelector(`[data-testid="tower-row"][data-slot="${v.slot_id}"] [data-testid="row-interval"]`),
    )
    expect(cells.map((c) => c?.textContent.trim())).toEqual(cases.map((c) => c[2]))
    // No readout swaps in a variant class that could resize the slot.
    for (const c of cells) expect([...c.classList].filter((n) => n.startsWith('row__interval'))).toEqual(['row__interval'])
  })
})
