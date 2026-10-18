/* Tower driver name style inside /all — widgets.md rules 46-48, overlay-config.md rule 42,
 * ADR 0018. /all passes the tower's normalized `nameStyle`, so with no profile setting the
 * tower renders short names, while the other widgets keep their own name format.
 *
 * Full style's growth past the slot's `w` is asserted through the tower root's inline
 * `min-width` (how/renderer.md), with the canvas text measurement stubbed below.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'

afterEach(() => cleanup())

// Full-style width hook (rule 48, how/renderer.md): names are measured with a canvas 2D
// context, which happy-dom lacks, so it is stubbed at 10px per code point. Non-name row
// content measures 0 here (no layout).
let originalGetContext
beforeEach(() => {
  // The name font counts as loaded (rule 48 measures only once it is).
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { check: () => true, ready: Promise.resolve(), addEventListener() {}, removeEventListener() {} },
  })
  originalGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function getContext(kind) {
    if (kind !== '2d') return null
    return { font: '', measureText: (text) => ({ width: [...String(text)].length * 10 }) }
  }
})
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext
  delete document.fonts
})

const towerNames = (container) =>
  Array.from(
    container.querySelectorAll('[data-testid="widget-tower"] [data-testid="driver-name"]'),
  ).map((el) => el.textContent.trim())

const towerRoot = (container) => container.querySelector('[data-testid="standings-tower"]')

/** race-close-battle with first names added, so short and full forms differ visibly.
 *  Fixture order: car-44 Hamilton P1, car-1 Verstappen P2 (on camera), car-16 Leclerc P3,
 *  car-4 Norris P4. */
const FIRST = { 'car-44': 'Lewis', 'car-1': 'Max', 'car-16': 'Charles', 'car-4': 'Lando' }
const named = {
  ...closeBattle,
  vehicles: closeBattle.vehicles.map((v) =>
    FIRST[v.slot_id] ? { ...v, driver_name: `${FIRST[v.slot_id]} ${v.driver_name}` } : v,
  ),
  subject: { ...closeBattle.subject, driver_name: `Max ${closeBattle.subject.driver_name}` },
}

describe('AllView — tower name style (rules 46-48)', () => {
  it('renders short names by default, with no nameStyle in the profile', () => {
    const { container } = render(AllView, { snapshot: closeBattle })
    expect(towerNames(container)).toEqual(['HAM', 'VER', 'LEC', 'NOR'])
    expect(towerRoot(container).getAttribute('data-name-style')).toBe('short')
  })

  it('renders initial + last name short for multi-word names', () => {
    const { container } = render(AllView, { snapshot: named, config: normalizeConfig({}) })
    expect(towerNames(container)).toEqual(['L.HAM', 'M.VER', 'C.LEC', 'L.NOR'])
  })

  it('renders full names when the profile sets nameStyle: full', () => {
    const cfg = normalizeConfig({ widgets: { tower: { nameStyle: 'full' } } })
    const { container } = render(AllView, { snapshot: named, config: cfg })
    expect(towerNames(container)).toEqual(['L. Hamilton', 'M. Verstappen', 'C. Leclerc', 'L. Norris'])
    expect(towerRoot(container).getAttribute('data-name-style')).toBe('full')
  })

  it('applies to the grouped layout too', () => {
    const cfg = normalizeConfig({ widgets: { tower: { classDisplay: 'grouped' } } })
    const { container } = render(AllView, { snapshot: multiClass, config: cfg })
    // Grouped: GTP (Verstappen, Hamilton), LMP2 (Rossi, Bourdais), GT3 (Alonso, Albon).
    expect(towerNames(container)).toEqual(['VER', 'HAM', 'ROS', 'BOU', 'ALO', 'ALB'])
    expect(towerRoot(container).getAttribute('data-name-style')).toBe('short')
  })

  it('leaves the battle box and the driver lower-third on their own name format', async () => {
    const { container } = render(AllView, { snapshot: named })
    await tick()
    // The tower is short...
    expect(towerNames(container)).toContain('M.VER')
    // ...the battle box and the lower-third still read the full format, and never the code.
    const battle = container.querySelector('[data-testid="widget-battle"]').textContent
    expect(battle).toContain('M. Verstappen')
    expect(battle).not.toContain('M.VER')
    const lt = container.querySelector('[data-testid="widget-driver"] [data-testid="driver-lt-name"]')
    expect(lt.textContent.trim()).toBe('M. Verstappen')
  })
})

describe('AllView — full-style tower width (rule 48)', () => {
  const minWidth = (container) => towerRoot(container).style.minWidth
  async function settle() {
    for (let i = 0; i < 4; i++) await tick()
    await Promise.resolve()
  }
  const LONG_NAMED = {
    ...named,
    vehicles: named.vehicles.map((v) =>
      v.slot_id === 'car-4' ? { ...v, driver_name: 'Maximilian Gonzalez-Hernandez' } : v,
    ),
  }

  it('sets no min-width in the default (short) style', async () => {
    const { container } = render(AllView, { snapshot: named })
    await settle()
    expect(minWidth(container)).toBe('')
  })

  it("uses the tower widget's w as the configured width", async () => {
    // Longest full name 'M. Verstappen' = 130px, under the 380 default w.
    const cfg = normalizeConfig({ widgets: { tower: { nameStyle: 'full' } } })
    const { container } = render(AllView, { snapshot: named, config: cfg })
    await settle()
    expect(minWidth(container)).toBe('380px')
  })

  it("grows past the slot's w when a full name needs more", async () => {
    const cfg = normalizeConfig({ widgets: { tower: { nameStyle: 'full', w: 100 } } })
    const { container } = render(AllView, { snapshot: named, config: cfg })
    await settle()
    // The slot keeps its configured w; only the tower inside it grows.
    expect(container.querySelector('[data-testid="widget-tower"]').style.width).toBe('100px')
    expect(minWidth(container)).toBe('130px')
  })

  it("resets when the tower's textScale changes", async () => {
    const cfg = normalizeConfig({ widgets: { tower: { nameStyle: 'full', w: 100 } } })
    const view = render(AllView, { snapshot: LONG_NAMED, config: cfg })
    await settle()
    // 'M. Gonzalez-Hernandez' = 210px; it holds after the car leaves (grow only).
    expect(minWidth(view.container)).toBe('210px')
    await view.rerender({ snapshot: named })
    await settle()
    expect(minWidth(view.container)).toBe('210px')

    // A text-size preset with the same w (set directly, not through the editor's widening).
    await view.rerender({ config: normalizeConfig({ widgets: { tower: { nameStyle: 'full', w: 100, textScale: 'large' } } }) })
    await settle()
    expect(minWidth(view.container)).toBe('130px')
  })
})
