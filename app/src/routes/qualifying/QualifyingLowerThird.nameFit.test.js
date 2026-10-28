/* #22's name: full form when it fits, rule 47's short form when it does not — widgets.md rule 110,
 * how/renderer.md "#22's head row gives way at the name" (The probe / The measure / The text /
 * When it measures).
 *
 * happy-dom does no layout, so every width here is stubbed. The measure reads fractional used
 * widths from getComputedStyle (`width`, paddings, borders, `box-sizing`, the row's `columnGap`),
 * so those carry the true widths. `offsetWidth` and `clientWidth` return them rounded to whole px
 * (clientWidth with the row's padding, as a browser's does), and getBoundingClientRect returns
 * them at half size (the /config preview's scale), so a measure that reads either picks wrong.
 * The visible name's own width is huge, so a measure that counted it would never fit anything.
 * `ResizeObserver` is a fake the tests fire per watched element. The tests assert the rendered
 * name text. Only a real browser shows the measured text widths themselves.
 *
 * Default widths: row 400, gap 8, `TIMING` 60, `CLASS BEST` 98, position 36, chip 40. With all
 * three shown and `TIMING`, the room is 400 − 60 − 36 − 40 − 3 × 8 = 240.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import QualifyingLowerThird from './QualifyingLowerThird.svelte'
import qualSectorA from '../../../../spec/v1/fixtures/qualifying-sector-a.json'
import racePreClassBest from '../../../../spec/v1/fixtures/race-pre-class-best.json'
import raceClassBest from '../../../../spec/v1/fixtures/race-class-best.json'

let W
let observers
const originalOffset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
const originalClient = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')

/** The stubbed box of `el`: { width, boxSizing, padL, padR, borL, borR }, or null if not stubbed. */
function boxOf(el) {
  const cls = el?.classList
  if (!cls) return null
  const item = (width, extra = {}) => ({ width, boxSizing: 'border-box', padL: 0, padR: 0, borL: 0, borR: 0, ...extra })
  if (cls.contains('bc-qt__head')) return item(W.row, W.head)
  if (cls.contains('bc-qt__name-probe')) return item(W.probe[el.textContent.trim()] ?? 0)
  if (cls.contains('bc-qt__name')) return item(99999)
  if (cls.contains('bc-qt__label')) return item(el.textContent.trim() === 'CLASS BEST' ? W.flashLabel : W.label)
  if (cls.contains('bc-qt__pos')) return item(W.posBy[el.textContent.trim()] ?? W.pos)
  if (cls.contains('bc-class-chip')) return item(W.chip, W.chipBox)
  return null
}
/** The box's border-box width, as a browser's offsetWidth sees it before rounding. */
function outer(b) {
  return b.boxSizing === 'border-box' ? b.width : b.width + b.padL + b.padR + b.borL + b.borR
}

class FakeResizeObserver {
  constructor(cb) {
    this.cb = cb
    this.targets = new Set()
    observers.push(this)
  }
  observe(el) {
    this.targets.add(el)
  }
  unobserve(el) {
    this.targets.delete(el)
  }
  disconnect() {
    this.targets.clear()
  }
}

/** Fire the observers watching `el`, and only those, as `el`'s size changing would. */
async function fireResize(el) {
  expect(el).not.toBeNull()
  for (const o of observers) if (o.targets.has(el)) o.cb([{ target: el }], o)
  await settle()
}

async function settle() {
  await tick()
  await tick()
  await tick()
}

beforeEach(() => {
  vi.useFakeTimers()
  W = { row: 400, gap: '8px', head: {}, label: 60, flashLabel: 98, pos: 36, posBy: {}, chip: 40, chipBox: {}, probe: {} }
  observers = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      const b = boxOf(this)
      return b ? Math.round(outer(b)) : 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      const b = boxOf(this)
      if (!b) return 0
      const inner = b.boxSizing === 'border-box' ? b.width - b.borL - b.borR : b.width + b.padL + b.padR
      return Math.round(inner)
    },
  })
  const realGCS = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
    const style = realGCS(el, pseudo)
    const b = boxOf(el)
    if (!b) return style
    const px = (n) => `${n}px`
    const over = {
      width: px(b.width),
      boxSizing: b.boxSizing,
      'box-sizing': b.boxSizing,
      paddingLeft: px(b.padL),
      paddingRight: px(b.padR),
      'padding-left': px(b.padL),
      'padding-right': px(b.padR),
      borderLeftWidth: px(b.borL),
      borderRightWidth: px(b.borR),
      'border-left-width': px(b.borL),
      'border-right-width': px(b.borR),
      columnGap: W.gap,
      'column-gap': W.gap,
    }
    return new Proxy(style, {
      get(target, prop) {
        if (Object.hasOwn(over, prop)) return over[prop]
        if (prop === 'getPropertyValue') return (p) => (Object.hasOwn(over, p) ? over[p] : target.getPropertyValue(p))
        const v = Reflect.get(target, prop, target)
        return typeof v === 'function' ? v.bind(target) : v
      },
    })
  })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const b = boxOf(this)
    const w = (b ? outer(b) : 0) * 0.5
    return { x: 0, y: 0, left: 0, top: 0, right: w, bottom: 10, width: w, height: 10, toJSON() {} }
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  if (originalOffset) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffset)
  else delete HTMLElement.prototype.offsetWidth
  if (originalClient) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClient)
  else delete HTMLElement.prototype.clientWidth
})

/** qualifying-sector-a with the subject's name (subject and vehicle alike) and, optionally, its
 *  position replaced. */
function withName(name, position) {
  const snap = structuredClone(qualSectorA)
  snap.subject.driver_name = name
  for (const v of snap.vehicles) {
    if (v.slot_id !== snap.subject.slot_id) continue
    v.driver_name = name
    if (position !== undefined) v.position = position
  }
  return snap
}

const nameOf = (c) => c.querySelector('[data-testid="qt-name"]')?.textContent.trim()

async function mount(snapshot, props = {}) {
  const r = render(QualifyingLowerThird, { snapshot, widget: {}, ...props })
  await settle()
  return r
}

describe("#22's name: full form when it fits, short form when it does not (widgets rule 110)", () => {
  it('shows the full form when it is no wider than the room', async () => {
    W.probe = { 'E. Jacobs': 200 }
    const { container } = await mount(withName('Erik Jacobs'))
    expect(container.querySelector('.bc-class-chip')).not.toBeNull()
    expect(nameOf(container)).toBe('E. Jacobs')
  })

  it('the room is exact: a full form exactly as wide as the room shows, 0.3px wider shows the short form', async () => {
    W.probe = { 'E. Jacobs': 240 }
    const a = await mount(withName('Erik Jacobs'))
    expect(nameOf(a.container)).toBe('E. Jacobs')
    cleanup()
    W.probe = { 'E. Jacobs': 240.3 }
    const b = await mount(withName('Erik Jacobs'))
    expect(nameOf(b.container)).toBe('E.JAC')
  })

  it('measures fractional widths: a sub-pixel overflow that whole-px widths would hide picks the short form', async () => {
    // True room: 400 − 60.4 − 36.4 − 40.4 − 24 = 238.8; the probe is 239.2, so it does not fit.
    // Rounded (offsetWidth / clientWidth): 400 − 60 − 36 − 40 − 24 = 240 and 239, which would.
    W.label = 60.4
    W.pos = 36.4
    W.chip = 40.4
    W.probe = { 'E. Jacobs': 239.2 }
    const { container } = await mount(withName('Erik Jacobs'))
    expect(nameOf(container)).toBe('E.JAC')
  })

  it("shows rule 47's short form when the full form is wider than the room", async () => {
    W.probe = { 'N. de Vries': 300 }
    const { container } = await mount(withName('Nyck de Vries'))
    expect(nameOf(container)).toBe('N.DEV')
    // The probe keeps the full form, so the next measure still reads the full form's width.
    expect(container.querySelector('.bc-qt__name-probe').textContent.trim()).toBe('N. de Vries')
  })

  it('counts only the items shown: with the chip hidden, its width and its gap go to the name', async () => {
    // With the chip: 240 room, so 260 would not fit. Without it: 400 − 60 − 36 − 2 × 8 = 288.
    W.probe = { 'E. Jacobs': 260 }
    const { container } = await mount(withName('Erik Jacobs'), { classTags: 'hide' })
    expect(container.querySelector('.bc-class-chip')).toBeNull()
    expect(nameOf(container)).toBe('E. Jacobs')
  })

  it("reads the gap from the head row's computed column-gap", async () => {
    // Gap 20: 400 − 136 − 3 × 20 = 204, so 220 does not fit (it would at the 8px default).
    W.gap = '20px'
    W.probe = { 'E. Jacobs': 220 }
    const { container } = await mount(withName('Erik Jacobs'))
    expect(nameOf(container)).toBe('E.JAC')
  })

  it("leaves the row's padding out of the room, whatever its box-sizing", async () => {
    // content-box, 400 wide with 10px padding each side: room 240 (clientWidth says 420: room 260).
    W.head = { boxSizing: 'content-box', padL: 10, padR: 10 }
    W.probe = { 'E. Jacobs': 250 }
    const a = await mount(withName('Erik Jacobs'))
    expect(nameOf(a.container)).toBe('E.JAC')
    cleanup()
    // border-box, 420 wide with 10px padding each side: content 400, room 240.
    W.row = 420
    W.head = { boxSizing: 'border-box', padL: 10, padR: 10 }
    const b = await mount(withName('Erik Jacobs'))
    expect(nameOf(b.container)).toBe('E.JAC')
    cleanup()
    W.probe = { 'E. Jacobs': 240 }
    const c = await mount(withName('Erik Jacobs'))
    expect(nameOf(c.container)).toBe('E. Jacobs')
  })

  it("counts an item's padding and border when its box-sizing is content-box", async () => {
    // A content-box chip 30 wide with 4px padding and 1px border each side is 40 wide: room 240.
    W.chip = 30
    W.chipBox = { boxSizing: 'content-box', padL: 4, padR: 4, borL: 1, borR: 1 }
    W.probe = { 'E. Jacobs': 245 }
    const { container } = await mount(withName('Erik Jacobs'))
    expect(nameOf(container)).toBe('E.JAC')
  })

  it("measures in layout px: the preview's scale (getBoundingClientRect at half size) changes nothing", async () => {
    // 230 <= 240 fits. Read from the half-size rects instead, the probe (115) would not fit the
    // room they leave (200 − 68 − 24 = 108).
    W.probe = { 'E. Jacobs': 230 }
    const { container } = await mount(withName('Erik Jacobs'))
    expect(nameOf(container)).toBe('E. Jacobs')
  })

  it('counts the flash label: CLASS BEST leaves less room than TIMING', async () => {
    // Room on the flash: 400 − 98 − 36 − 40 − 24 = 202. With TIMING's width it would be 240.
    W.probe = { Alonso: 220 }
    const widget = { trigger: 'dwell', dwellSeconds: 5, fireOnClassBest: true }
    const { container, rerender } = render(QualifyingLowerThird, { snapshot: racePreClassBest, widget })
    await settle()
    await rerender({ snapshot: raceClassBest, widget })
    await settle()
    expect(container.querySelector('[data-testid="qt-label"]').textContent.trim()).toBe('CLASS BEST')
    expect(nameOf(container)).toBe('ALO')
  })

  it('decides again when the name changes', async () => {
    W.probe = { 'E. Jacobs': 200, 'M. Verstappen': 300 }
    const { container, rerender } = await mount(withName('Erik Jacobs'))
    expect(nameOf(container)).toBe('E. Jacobs')
    await rerender({ snapshot: withName('Max Verstappen'), widget: {} })
    await settle()
    expect(nameOf(container)).toBe('M.VER')
    await rerender({ snapshot: withName('Erik Jacobs'), widget: {} })
    await settle()
    expect(nameOf(container)).toBe('E. Jacobs')
  })

  it('decides again when the position changes, with the same name', async () => {
    // P1 is 36 wide (room 240); P10 is 48 (room 228). The full form is 235.
    W.posBy = { P1: 36, P10: 48 }
    W.probe = { 'E. Jacobs': 235 }
    const { container, rerender } = await mount(withName('Erik Jacobs', 1))
    expect(container.querySelector('[data-testid="qt-pos"]').textContent.trim()).toBe('P1')
    expect(nameOf(container)).toBe('E. Jacobs')
    await rerender({ snapshot: withName('Erik Jacobs', 10), widget: {} })
    await settle()
    expect(container.querySelector('[data-testid="qt-pos"]').textContent.trim()).toBe('P10')
    expect(nameOf(container)).toBe('E.JAC')
  })

  it('decides again when the chip appears on a live card', async () => {
    // Hidden: room 288, the 260 full form fits. Shown: room 240, it does not.
    W.probe = { 'E. Jacobs': 260 }
    const snapshot = withName('Erik Jacobs')
    const { container, rerender } = await mount(snapshot, { classTags: 'hide' })
    expect(nameOf(container)).toBe('E. Jacobs')
    await rerender({ snapshot, widget: {}, classTags: 'show' })
    await settle()
    expect(container.querySelector('.bc-class-chip')).not.toBeNull()
    expect(nameOf(container)).toBe('E.JAC')
  })

  it('decides again when the head row resizes with no new data (the card narrowing and widening)', async () => {
    W.probe = { 'E. Jacobs': 200 }
    const { container } = await mount(withName('Erik Jacobs'))
    const head = container.querySelector('.bc-qt__head')
    expect(nameOf(container)).toBe('E. Jacobs')
    W.row = 300 // room 140
    await fireResize(head)
    expect(nameOf(container)).toBe('E.JAC')
    W.row = 400
    await fireResize(head)
    expect(nameOf(container)).toBe('E. Jacobs')
  })

  it('decides again when only the probe resizes (a face loading, a preset switch, textScale)', async () => {
    W.probe = { 'E. Jacobs': 200 }
    const { container } = await mount(withName('Erik Jacobs'))
    expect(nameOf(container)).toBe('E. Jacobs')
    W.probe = { 'E. Jacobs': 250 }
    await fireResize(container.querySelector('.bc-qt__name-probe'))
    expect(nameOf(container)).toBe('E.JAC')
  })

  it('decides again when only the position or only the chip resizes', async () => {
    W.probe = { 'E. Jacobs': 230 }
    const { container } = await mount(withName('Erik Jacobs'))
    expect(nameOf(container)).toBe('E. Jacobs')
    W.pos = 50 // room 226
    await fireResize(container.querySelector('[data-testid="qt-pos"]'))
    expect(nameOf(container)).toBe('E.JAC')
    W.pos = 36 // room 240 again
    await fireResize(container.querySelector('[data-testid="qt-pos"]'))
    expect(nameOf(container)).toBe('E. Jacobs')
    W.chip = 55 // room 225
    await fireResize(container.querySelector('.bc-class-chip'))
    expect(nameOf(container)).toBe('E.JAC')
  })

  it('decides again when only the label resizes', async () => {
    W.probe = { 'E. Jacobs': 230 }
    const { container } = await mount(withName('Erik Jacobs'))
    expect(nameOf(container)).toBe('E. Jacobs')
    W.label = 75 // room 225
    await fireResize(container.querySelector('[data-testid="qt-label"]'))
    expect(nameOf(container)).toBe('E.JAC')
  })

  it('stops watching when the card unmounts: every observer it made is disconnected', async () => {
    W.probe = { 'E. Jacobs': 200 }
    await mount(withName('Erik Jacobs'))
    expect(observers.some((o) => o.targets.size > 0)).toBe(true)
    cleanup()
    await settle()
    for (const o of observers) expect(o.targets.size).toBe(0)
  })

  it('the short form is still shown, and cut by the ellipsis, when even it is wider than the room', async () => {
    W.row = 150 // room −10: nothing fits
    W.probe = { 'E. Jacobs': 200 }
    const { container } = await mount(withName('Erik Jacobs'))
    expect(nameOf(container)).toBe('E.JAC')
  })

  it('a name whose short form is empty shows its full form', async () => {
    W.probe = { '#--#': 400 }
    const { container } = await mount(withName('#--#'))
    expect(nameOf(container)).toBe('#--#')
  })
})
