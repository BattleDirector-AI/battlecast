/* Tower full-style width — widgets.md rule 48, how/renderer.md "Driver name style", ADR 0018.
 *
 * In full style the tower root carries an inline `min-width` of
 *   max(configuredWidth, ceil(widestName + widestRest))
 * and in short style none. happy-dom does no layout and has no canvas, so every read the
 * how/ spec names is stubbed here:
 *   - canvas `measureText`: 10px per code point (`pxPerCodePoint`), recording `ctx.font`;
 *   - `document.fonts`: `check`, `ready`, `loadingdone` listeners (events carry `fontfaces`);
 *   - the rest of the row: `scrollWidth` of each `[data-testid="tower-row"]` and `clientWidth`
 *     of its `[data-testid="driver-name"]`, per slot (`rest = scrollWidth - clientWidth`).
 * Unstubbed slots read 0, so `rest` is 0 unless a test sets it.
 *
 * Field: grid-multiclass with its names swapped. Order: car-1 P1 GTP, car-14 P2 GT3,
 * car-44 P3 GTP, car-8 P4 LMP2, car-23 P5 GT3, car-31 P6 LMP2. The longest full name in NAMES
 * is 'N. de Vries' (11 code points, 110px); LONG's full form 'M. Gonzalez-Hernandez' is 210px.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'

const NAMES = {
  'car-1': 'Erik Jacobs',
  'car-14': 'Tsunoda',
  'car-44': 'Nyck de Vries',
  'car-8': 'Jean-Eric Vergne',
  'car-23': 'Bo',
  'car-31': 'Erik Li',
}
const LONG = 'Maximilian Gonzalez-Hernandez'
const FALLBACK_FONT = "700 22px 'Saira Condensed', 'Arial Narrow', sans-serif"

function withNames(names, extra = {}) {
  return {
    ...multiClass,
    ...extra,
    vehicles: multiClass.vehicles.map((v) =>
      Object.prototype.hasOwnProperty.call(names, v.slot_id) ? { ...v, driver_name: names[v.slot_id] } : v,
    ),
  }
}
const withLong = (slot = 'car-14', extra = {}) => withNames({ ...NAMES, [slot]: LONG }, extra)
const without = (snapshot, slot) => ({ ...snapshot, vehicles: snapshot.vehicles.filter((v) => v.slot_id !== slot) })

const tower = () => document.querySelector('[data-testid="standings-tower"]')
const minWidth = () => tower().style.minWidth
const rowFor = (slot) => document.querySelector(`[data-testid="tower-row"][data-slot="${slot}"]`)

// ---- stubs ---------------------------------------------------------------------------------
let measuredFonts
let pxPerCodePoint
let originalGetContext
let fonts
const layout = { rowScroll: {}, nameBox: {} }
const originalDescriptors = {}

function stubFonts({ loaded = true } = {}) {
  const listeners = {}
  let resolveReady
  const pending = new Promise((resolve) => (resolveReady = resolve))
  const set = {
    loaded,
    check: vi.fn(() => set.loaded),
    ready: loaded ? Promise.resolve() : pending,
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn)
    },
    fire: (type, detail = {}) => (listeners[type] ?? []).forEach((fn) => fn({ type, ...detail })),
    resolveReady: () => resolveReady(),
  }
  Object.defineProperty(document, 'fonts', { configurable: true, value: set })
  return set
}

function stubLayout(prop, selector, read) {
  originalDescriptors[prop] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop)
  Object.defineProperty(HTMLElement.prototype, prop, {
    configurable: true,
    get() {
      return this.matches?.(selector) ? read(this) : 0
    },
  })
}

beforeEach(() => {
  measuredFonts = []
  pxPerCodePoint = 10
  originalGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function getContext(kind) {
    if (kind !== '2d') return null
    const ctx = {
      font: '10px sans-serif',
      measureText(text) {
        measuredFonts.push(ctx.font)
        return { width: [...String(text)].length * pxPerCodePoint }
      },
    }
    return ctx
  }
  fonts = stubFonts()
  layout.rowScroll = {}
  layout.nameBox = {}
  stubLayout('scrollWidth', '[data-testid="tower-row"]', (el) => layout.rowScroll[el.dataset.slot] ?? 0)
  stubLayout('clientWidth', '[data-testid="driver-name"]', (el) => {
    const slot = el.closest('[data-testid="tower-row"]')?.dataset.slot
    return layout.nameBox[slot] ?? 0
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  HTMLCanvasElement.prototype.getContext = originalGetContext
  delete document.fonts
  for (const prop of ['scrollWidth', 'clientWidth']) {
    if (originalDescriptors[prop]) Object.defineProperty(HTMLElement.prototype, prop, originalDescriptors[prop])
    else delete HTMLElement.prototype[prop]
  }
})

async function settle() {
  for (let i = 0; i < 4; i++) await tick()
  await Promise.resolve()
  flushSync()
}

async function mount(props) {
  const view = render(StandingsTower, { nameStyle: 'full', ...props })
  await settle()
  return view
}

async function update(view, props) {
  await view.rerender(props)
  await settle()
}

// ---- the names part -------------------------------------------------------------------------
describe('full-style width — names (rule 48)', () => {
  it('is never narrower than the configured width', async () => {
    await mount({ snapshot: withNames(NAMES), configuredWidth: 150 })
    expect(minWidth()).toBe('150px')
  })

  it('grows past the configured width to the longest full-form name (not the raw name)', async () => {
    await mount({ snapshot: withLong('car-31'), configuredWidth: 150 })
    // 210 from 'M. Gonzalez-Hernandez'; the raw 29-code-point driver_name would give 290.
    expect(minWidth()).toBe('210px')
  })

  it('counts every car in the class-filtered field, rendered or not', async () => {
    await mount({ snapshot: withLong('car-31'), configuredWidth: 150, maxRows: 3 })
    expect(rowFor('car-31'), 'car-31 (P6) should be off screen at 3 rows').toBeNull()
    expect(minWidth()).toBe('210px')
  })

  it('ignores cars the class filter removes', async () => {
    // GTP is car-1 'E. Jacobs' and car-44 'N. de Vries'; LMP2's long name does not count.
    await mount({ snapshot: withLong('car-31'), configuredWidth: 150, classFilter: 'GTP' })
    expect(minWidth()).toBe('150px')
  })

  it('applies in the grouped layout too', async () => {
    await mount({ snapshot: withLong('car-31'), configuredWidth: 150, classDisplay: 'grouped' })
    expect(minWidth()).toBe('210px')
  })

  it('measures every name at the on-camera weight, in the token fallback font when tokens do not resolve', async () => {
    await mount({ snapshot: withLong('car-31'), configuredWidth: 150 })
    expect(measuredFonts.length, 'no name was measured').toBeGreaterThan(0)
    for (const font of measuredFonts) expect(font).toBe(FALLBACK_FONT)
  })

  it('sets no min-width in short style, however long the names', async () => {
    await mount({ snapshot: withLong('car-31'), configuredWidth: 150, nameStyle: 'short' })
    expect(tower().getAttribute('data-name-style')).toBe('short')
    expect(minWidth()).toBe('')
  })
})

// ---- the rest of the row --------------------------------------------------------------------
describe('full-style width — the rest of the row (rule 48)', () => {
  it('adds the widest non-name content (row scrollWidth less the name box) to the widest name', async () => {
    layout.rowScroll['car-1'] = 300
    layout.nameBox['car-1'] = 100
    await mount({ snapshot: withNames(NAMES), configuredWidth: 150 })
    // widest name 110 + rest 200; a build that leaves the rest out gives 150.
    expect(minWidth()).toBe('310px')
  })

  it('takes the widest rest across rows, even from a row whose name is not the widest', async () => {
    layout.rowScroll['car-23'] = 260 // 'Bo'
    layout.nameBox['car-23'] = 20
    layout.rowScroll['car-44'] = 250 // 'N. de Vries', the widest name
    layout.nameBox['car-44'] = 150
    await mount({ snapshot: withNames(NAMES), configuredWidth: 150 })
    // 110 (widest name) + 240 (car-23's rest), not 110 + 100.
    expect(minWidth()).toBe('350px')
  })

  it('grows at once when a row gets wider, and does not shrink when it gets narrower', async () => {
    layout.rowScroll['car-1'] = 300
    layout.nameBox['car-1'] = 100
    const view = await mount({ snapshot: withNames(NAMES), configuredWidth: 150 })
    expect(minWidth()).toBe('310px')

    layout.rowScroll['car-1'] = 350 // a wider cell value on the next snapshot
    await update(view, { snapshot: withNames(NAMES) })
    expect(minWidth()).toBe('360px')

    layout.rowScroll['car-1'] = 150 // narrower again
    await update(view, { snapshot: withNames(NAMES) })
    expect(minWidth()).toBe('360px')
  })
})

// ---- grow only ------------------------------------------------------------------------------
describe('full-style width — grow only (rule 48)', () => {
  it('grows when a longer name joins, and holds when it leaves or the camera cuts', async () => {
    const view = await mount({ snapshot: withNames(NAMES), configuredWidth: 100 })
    expect(minWidth()).toBe('110px')

    await update(view, { snapshot: withLong() })
    expect(minWidth()).toBe('210px')

    const gone = without(withNames(NAMES), 'car-14')
    await update(view, { snapshot: gone })
    expect(minWidth()).toBe('210px')

    await update(view, { snapshot: { ...gone, subject: { slot_id: 'car-31', driver_name: 'Erik Li' } } })
    expect(minWidth()).toBe('210px')
  })

  it('holds when the long-named car pages out of the cycling window', async () => {
    vi.useFakeTimers()
    // 3 rows, no pins: page 1 is P1-P3 (the long name runs P2), page 2 is P4-P6.
    await mount({
      snapshot: withLong(),
      configuredWidth: 100,
      maxRows: 3,
      cycle: { enabled: true, perPageSeconds: 4, pinTop: 0, pinScope: 'overall', pinSubject: false },
    })
    expect(rowFor('car-14')).not.toBeNull()
    expect(minWidth()).toBe('210px')

    await vi.advanceTimersByTimeAsync(4000)
    flushSync()
    expect(rowFor('car-14'), 'car-14 should have paged out').toBeNull()
    expect(minWidth()).toBe('210px')
  })

  it('holds when a camera cut unpins the long-named car in a cycling tower', async () => {
    vi.useFakeTimers()
    // The long name runs P5 (car-23) and is on camera, so pinSubject keeps it on screen.
    const onCam = (slot) => withLong('car-23', { subject: { slot_id: slot, driver_name: 'x' } })
    const view = await mount({
      snapshot: onCam('car-23'),
      configuredWidth: 100,
      maxRows: 3,
      cycle: { enabled: true, perPageSeconds: 8, pinTop: 0, pinScope: 'overall', pinSubject: true },
    })
    expect(rowFor('car-23'), 'the on-camera car should be pinned').not.toBeNull()
    expect(minWidth()).toBe('210px')

    // Cut to car-31: car-23 loses its pin and is not on the first window page.
    await update(view, { snapshot: onCam('car-31') })
    expect(rowFor('car-23'), 'car-23 should be off screen after the cut').toBeNull()
    expect(minWidth()).toBe('210px')
  })
})

// ---- resets ---------------------------------------------------------------------------------
describe('full-style width — mode resets (rule 48)', () => {
  async function grown() {
    const view = await mount({ snapshot: withLong(), configuredWidth: 100 })
    await update(view, { snapshot: withNames(NAMES) })
    expect(minWidth(), 'grow-only should hold 210 before the reset').toBe('210px')
    return view
  }

  it('resets when the session mode changes', async () => {
    const view = await grown()
    await update(view, { snapshot: withNames(NAMES, { mode: 'results' }) })
    expect(minWidth()).toBe('110px')
  })

  it('compares the mode trimmed and case-insensitively', async () => {
    const view = await grown()
    await update(view, { snapshot: withNames(NAMES, { mode: '  RACE ' }) })
    expect(minWidth()).toBe('210px')
  })

  it('does not reset across a feed drop that returns in the same mode', async () => {
    const view = await grown()
    await update(view, { snapshot: null })
    await update(view, { snapshot: withNames(NAMES) })
    expect(minWidth()).toBe('210px')
  })

  it('skips a snapshot with no mode: neither a reset nor a new remembered mode', async () => {
    const view = await grown()
    await update(view, { snapshot: withNames(NAMES, { mode: undefined }) })
    expect(minWidth()).toBe('210px')
    await update(view, { snapshot: withNames(NAMES, { mode: '   ' }) })
    await update(view, { snapshot: withNames(NAMES) })
    expect(minWidth()).toBe('210px')
    // ...and a real change after it still resets, measured against the remembered 'race'.
    await update(view, { snapshot: withNames(NAMES, { mode: 'qualifying' }) })
    expect(minWidth()).toBe('110px')
  })
})

describe('full-style width — settings resets (rule 48)', () => {
  it.each([
    ['the class filter', { classFilter: 'gtp' }, '110px'],
    ['towerMetrics', { metrics: { interval: true } }, '110px'],
    ['maxRows', { maxRows: 6 }, '110px'],
    ['cycle', { cycle: { enabled: false, perPageSeconds: 8, pinTop: 3, pinScope: 'overall', pinSubject: true } }, '110px'],
    ['classDisplay', { classDisplay: 'grouped' }, '110px'],
    ['the configured width', { configuredWidth: 180 }, '180px'],
    ['textScale', { textScale: 'large' }, '110px'],
  ])('resets when %s changes', async (_label, change, expected) => {
    const view = await mount({ snapshot: withLong(), configuredWidth: 100 })
    await update(view, { snapshot: withNames(NAMES) })
    expect(minWidth(), 'grow-only should hold 210 before the reset').toBe('210px')
    await update(view, change)
    expect(minWidth()).toBe(expected)
  })

  it('resets when nameStyle changes (and short style clears the width)', async () => {
    const view = await mount({ snapshot: withLong(), configuredWidth: 100 })
    await update(view, { snapshot: withNames(NAMES) })
    expect(minWidth()).toBe('210px')
    await update(view, { nameStyle: 'short' })
    expect(minWidth()).toBe('')
    await update(view, { nameStyle: 'full' })
    expect(minWidth()).toBe('110px')
  })
})

describe('full-style width — font loading (rule 48)', () => {
  const nameFace = { fontfaces: [{ family: '"Saira Condensed"' }] }
  const otherFace = { fontfaces: [{ family: 'JetBrains Mono' }] }

  it('measures no names until the name font has loaded, then measures on its loadingdone', async () => {
    fonts = stubFonts({ loaded: false })
    await mount({ snapshot: withLong(), configuredWidth: 100 })
    expect(minWidth(), 'no fit width before the font loads').toBe('100px')

    fonts.loaded = true
    fonts.fire('loadingdone', nameFace)
    await settle()
    expect(minWidth()).toBe('210px')
  })

  it('measures when document.fonts.ready resolves', async () => {
    fonts = stubFonts({ loaded: false })
    await mount({ snapshot: withLong(), configuredWidth: 100 })
    expect(minWidth()).toBe('100px')

    fonts.loaded = true
    fonts.resolveReady()
    await settle()
    expect(minWidth()).toBe('210px')
  })

  it('ignores a loadingdone for another font family', async () => {
    fonts = stubFonts({ loaded: false })
    await mount({ snapshot: withLong(), configuredWidth: 100 })
    fonts.loaded = true
    fonts.fire('loadingdone', otherFace)
    await settle()
    expect(minWidth(), 'a JetBrains Mono load must not trigger name measurement').toBe('100px')

    fonts.fire('loadingdone', nameFace)
    await settle()
    expect(minWidth()).toBe('210px')
  })

  it('ignores a load of another family once measured: nothing is reset or re-measured', async () => {
    layout.rowScroll['car-1'] = 300
    layout.nameBox['car-1'] = 100
    const view = await mount({ snapshot: withLong(), configuredWidth: 100 })
    expect(minWidth()).toBe('410px') // 210 + 200
    layout.rowScroll['car-1'] = 100
    await update(view, { snapshot: without(withLong(), 'car-14') })
    expect(minWidth()).toBe('410px')

    pxPerCodePoint = 5
    fonts.fire('loadingdone', otherFace)
    await settle()
    expect(minWidth()).toBe('410px')
  })

  it('keeps the remembered rest-of-row width on a name-font load', async () => {
    layout.rowScroll['car-1'] = 300
    layout.nameBox['car-1'] = 100
    const view = await mount({ snapshot: withNames(NAMES), configuredWidth: 100 })
    expect(minWidth()).toBe('310px') // 110 + 200
    // The row narrows on a later snapshot; grow-only holds the 200.
    layout.rowScroll['car-1'] = 100
    await update(view, { snapshot: withNames(NAMES) })
    expect(minWidth()).toBe('310px')

    fonts.fire('loadingdone', nameFace)
    await settle()
    // A full reset would re-read the rest as 0 and give 110.
    expect(minWidth()).toBe('310px')
  })

  it('re-measures every remembered name in the loaded face, retired cars included, and may narrow', async () => {
    const view = await mount({ snapshot: withLong(), configuredWidth: 100 })
    expect(minWidth()).toBe('210px')
    // The long-named car retires; grow-only holds its room.
    await update(view, { snapshot: without(withLong(), 'car-14') })
    expect(minWidth()).toBe('210px')

    // The real face is narrower than the one first measured: 8px per code point.
    pxPerCodePoint = 8
    fonts.fire('loadingdone', nameFace)
    await settle()
    // 'M. Gonzalez-Hernandez' re-measured: 21 x 8 = 168. Measuring only the current field
    // would give 'N. de Vries' 11 x 8 = 88, floored to the configured 100.
    expect(minWidth()).toBe('168px')
  })
})
