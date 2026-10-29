/* A short-style tower is never narrower than its names — widgets.md rule 116, ADR 0038,
 * how/renderer.md "Driver name style" (short-style minimum width).
 *
 * In short style the tower root carries an inline `min-width: <N>px` only when
 *   N = ceil(lead + borderLeft + borderRight)
 * exceeds the configured width, where `lead` is the largest `offsetLeft + offsetWidth` of the
 * rendered rows' `[data-testid="driver-name"]` cells: the name column's right edge, measured
 * from the row's (the tower's inner) left edge. happy-dom does no layout, so those reads and the
 * root's borders are stubbed here, per slot. Unstubbed reads are 0.
 *
 * Field: grid-multiclass. Order: car-1 P1 GTP, car-14 P2 GT3, car-44 P3 GTP, car-8 P4 LMP2,
 * car-23 P5 GT3, car-31 P6 LMP2.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'

const tower = () => document.querySelector('[data-testid="standings-tower"]')
const minWidth = () => tower().style.minWidth

// name cell offsetLeft / offsetWidth per slot; the root's computed borders.
let nameLeft
let nameWidth
const border = { left: '', right: '' }
const own = {}
let originalGetComputedStyle

function stubLayout(prop, read) {
  own[prop] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop)
  Object.defineProperty(HTMLElement.prototype, prop, {
    configurable: true,
    get() {
      if (!this.matches?.('[data-testid="driver-name"]')) return 0
      return read(this.closest('[data-testid="tower-row"]')?.dataset.slot) ?? 0
    },
  })
}

beforeEach(() => {
  nameLeft = {}
  nameWidth = {}
  border.left = ''
  border.right = ''
  stubLayout('offsetLeft', (slot) => nameLeft[slot])
  stubLayout('offsetWidth', (slot) => nameWidth[slot])
  originalGetComputedStyle = window.getComputedStyle
  window.getComputedStyle = function getComputedStyle(el, ...rest) {
    const real = originalGetComputedStyle.call(window, el, ...rest)
    if (!el?.matches?.('[data-testid="standings-tower"]')) return real
    const overrides = { borderLeftWidth: border.left, borderRightWidth: border.right }
    return new Proxy(real, {
      get(target, prop) {
        if (prop in overrides) return overrides[prop]
        if (prop === 'getPropertyValue') {
          return (name) =>
            name === 'border-left-width' ? border.left : name === 'border-right-width' ? border.right : target.getPropertyValue(name)
        }
        const value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }
})
afterEach(() => {
  cleanup()
  for (const [prop, d] of Object.entries(own)) {
    if (d) Object.defineProperty(HTMLElement.prototype, prop, d)
    else delete HTMLElement.prototype[prop]
  }
  window.getComputedStyle = originalGetComputedStyle
})

async function settle() {
  for (let i = 0; i < 4; i++) await tick()
  await Promise.resolve()
  flushSync()
}

/** Every row's name cell ends at `right` px except the overrides. */
function nameColumn(right, overrides = {}) {
  for (const v of multiClass.vehicles) {
    const r = overrides[v.slot_id] ?? right
    nameLeft[v.slot_id] = 60
    nameWidth[v.slot_id] = r - 60
  }
}

describe('short style — the tower is never narrower than its name column (rule 116)', () => {
  it('sets no min-width while the configured width holds the name column', async () => {
    nameColumn(150)
    render(StandingsTower, { props: { snapshot: multiClass, nameStyle: 'short', configuredWidth: 400 } })
    await settle()
    expect(minWidth()).toBe('')
  })

  it('widens a tower set narrower than the name column to the end of it, borders included', async () => {
    nameColumn(150, { 'car-44': 163.4 })
    border.left = '1px'
    border.right = '1px'
    render(StandingsTower, { props: { snapshot: multiClass, nameStyle: 'short', configuredWidth: 100 } })
    await settle()
    // ceil(163.4 + 1 + 1) = 166.
    expect(minWidth()).toBe('166px')
  })

  it('follows the rows with no hold: a narrower name column narrows it again', async () => {
    nameColumn(150, { 'car-44': 180 })
    const view = render(StandingsTower, { props: { snapshot: multiClass, nameStyle: 'short', configuredWidth: 100 } })
    await settle()
    expect(minWidth()).toBe('180px')

    nameColumn(120)
    await view.rerender({ snapshot: { ...multiClass, vehicles: multiClass.vehicles.slice() } })
    await settle()
    expect(minWidth()).toBe('120px')

    nameColumn(90)
    await view.rerender({ snapshot: { ...multiClass, vehicles: multiClass.vehicles.slice() } })
    await settle()
    expect(minWidth()).toBe('')
  })
})
