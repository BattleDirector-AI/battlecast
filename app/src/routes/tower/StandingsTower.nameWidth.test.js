/* Tower full-style width — widgets.md rule 48, how/renderer.md "Driver name style", ADR 0018.
 *
 * In full style the tower root carries an inline `min-width` of
 *   max(configuredWidth, ceil(widestName + widestRest + borderX))
 * where a name's width is measureText + code points x the name cell's letter-spacing
 * and in short style none. happy-dom does no layout and has no canvas, so every read the
 * how/ spec names is stubbed here:
 *   - canvas `measureText`: 10px per code point (`pxPerCodePoint`), recording `ctx.font`;
 *   - `document.fonts`: `check`, `load`, `ready`, `loadingdone` / `loadingerror` listeners
 *     (events carry `fontfaces`);
 *   - `getComputedStyle`: the name cell's `letterSpacing` and the tower root's
 *     `borderLeftWidth` / `borderRightWidth` (`computed`; '' by default, as in happy-dom);
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
const computed = { letterSpacing: '', borderLeftWidth: '', borderRightWidth: '' }
// Custom properties the tower root's computed style answers (e.g. '--bc-size-name'); '' falls through.
let tokens = {}
let originalGetComputedStyle

/** getComputedStyle with the three reads the width formula takes overridden. */
function stubComputedStyle() {
  originalGetComputedStyle = window.getComputedStyle
  window.getComputedStyle = function getComputedStyle(el, ...rest) {
    const real = originalGetComputedStyle.call(window, el, ...rest)
    const overrides = el?.matches?.('[data-testid="driver-name"]')
      ? { letterSpacing: computed.letterSpacing }
      : el?.matches?.('[data-testid="standings-tower"]')
        ? { borderLeftWidth: computed.borderLeftWidth, borderRightWidth: computed.borderRightWidth }
        : {}
    const own = (key) => Object.prototype.hasOwnProperty.call(overrides, key)
    return new Proxy(real, {
      get(target, prop) {
        if (own(prop)) return overrides[prop]
        if (prop === 'getPropertyValue') {
          return (name) => {
            if (el?.matches?.('[data-testid="standings-tower"]') && tokens[name]) return tokens[name]
            const camel = String(name).replace(/-([a-z])/g, (_m, c) => c.toUpperCase())
            return own(camel) ? overrides[camel] : target.getPropertyValue(name)
          }
        }
        const value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }
}
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
    load: vi.fn(() => Promise.resolve([])),
    listenerCount: (type) => (listeners[type] ?? []).length,
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
  computed.letterSpacing = ''
  computed.borderLeftWidth = ''
  computed.borderRightWidth = ''
  tokens = {}
  stubComputedStyle()
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
  window.getComputedStyle = originalGetComputedStyle
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

// ---- #244: letter spacing and the tower border ----------------------------------------------
describe('full-style width — letter spacing and border (rule 48, #244)', () => {
  it('adds code points x the name cell letter-spacing to each name', async () => {
    computed.letterSpacing = '0.5px'
    await mount({ snapshot: withLong(), configuredWidth: 100 })
    // 'M. Gonzalez-Hernandez': 21 code points -> 210 + 21 x 0.5 = 220.5 -> 221.
    expect(minWidth()).toBe('221px')
  })

  it('applies the letter spacing to names that are not rendered', async () => {
    computed.letterSpacing = '0.5px'
    await mount({ snapshot: withLong('car-31'), configuredWidth: 100, maxRows: 3 })
    expect(rowFor('car-31'), 'car-31 (P6) should be off screen').toBeNull()
    expect(minWidth()).toBe('221px')
  })

  it('uses a negative letter-spacing as is', async () => {
    computed.letterSpacing = '-0.5px'
    await mount({ snapshot: withLong(), configuredWidth: 100 })
    // 210 - 10.5 = 199.5 -> 200.
    expect(minWidth()).toBe('200px')
  })

  it('adds the left and right border of the tower', async () => {
    computed.borderLeftWidth = '1px'
    computed.borderRightWidth = '2px'
    await mount({ snapshot: withLong(), configuredWidth: 100 })
    expect(minWidth()).toBe('213px')
  })

  it('adds name, letter spacing, rest of row and border together', async () => {
    computed.letterSpacing = '0.5px'
    computed.borderLeftWidth = '1px'
    computed.borderRightWidth = '1px'
    layout.rowScroll['car-1'] = 300
    layout.nameBox['car-1'] = 100
    await mount({ snapshot: withLong(), configuredWidth: 100 })
    // 210 + 10.5 + 200 + 2 = 422.5 -> 423.
    expect(minWidth()).toBe('423px')
  })

  it('does not add the border to the configured width', async () => {
    computed.borderLeftWidth = '1px'
    computed.borderRightWidth = '1px'
    await mount({ snapshot: withNames(NAMES), configuredWidth: 300 })
    // fit 110 + 2 = 112 < 300; the configured width already includes the border.
    expect(minWidth()).toBe('300px')
  })

  it('keeps the letter spacing when a name-font load re-measures', async () => {
    computed.letterSpacing = '0.5px'
    await mount({ snapshot: withLong(), configuredWidth: 100 })
    expect(minWidth()).toBe('221px')
    pxPerCodePoint = 8
    fonts.fire('loadingdone', { fontfaces: [{ family: 'Saira Condensed' }] })
    await settle()
    // 168 + 10.5 = 178.5 -> 179.
    expect(minWidth()).toBe('179px')
  })
})

// ---- #245: a name font that fails to load ---------------------------------------------------
describe('full-style width — a name font that fails to load (rule 48, #245)', () => {
  it('measures in the fallback face once the font request is refused', async () => {
    fonts = stubFonts({ loaded: false })
    fonts.load.mockImplementation(() => Promise.reject(new Error('NetworkError')))
    await mount({ snapshot: withLong(), configuredWidth: 100 })
    expect(fonts.load).toHaveBeenCalledTimes(1)
    // check() stays false for good; the tower must stop waiting and measure.
    expect(minWidth()).toBe('210px')
  })

  it('measures in the fallback face when a face of the name family reports loadingerror', async () => {
    fonts = stubFonts({ loaded: false })
    fonts.load.mockImplementation(() => new Promise(() => {}))
    await mount({ snapshot: withLong(), configuredWidth: 100 })
    expect(minWidth()).toBe('100px')
    fonts.fire('loadingerror', { fontfaces: [{ family: '"Saira Condensed"' }] })
    await settle()
    expect(minWidth()).toBe('210px')
  })

  it('ignores a loadingerror for another family', async () => {
    fonts = stubFonts({ loaded: false })
    fonts.load.mockImplementation(() => new Promise(() => {}))
    await mount({ snapshot: withLong(), configuredWidth: 100 })
    fonts.fire('loadingerror', { fontfaces: [{ family: 'JetBrains Mono' }] })
    await settle()
    expect(minWidth()).toBe('100px')
  })

  it('keeps growing after a failure, and does not request the font again', async () => {
    fonts = stubFonts({ loaded: false })
    fonts.load.mockImplementation(() => Promise.reject(new Error('NetworkError')))
    const view = await mount({ snapshot: withNames(NAMES), configuredWidth: 100 })
    expect(minWidth()).toBe('110px')
    await update(view, { snapshot: withLong() })
    expect(minWidth()).toBe('210px')
    expect(fonts.load, 'no retry after a failed load').toHaveBeenCalledTimes(1)
  })

  it('re-measures in the real face if the family loads after all', async () => {
    fonts = stubFonts({ loaded: false })
    fonts.load.mockImplementation(() => Promise.reject(new Error('NetworkError')))
    await mount({ snapshot: withLong(), configuredWidth: 100 })
    expect(minWidth()).toBe('210px')
    fonts.loaded = true
    pxPerCodePoint = 8
    fonts.fire('loadingdone', { fontfaces: [{ family: 'Saira Condensed' }] })
    await settle()
    expect(minWidth()).toBe('168px')
  })
})

// ---- #245: paths that ship today, pinned ----------------------------------------------------
describe('full-style width — shipped paths pinned (rule 48, #245)', () => {
  it('measures a car that joins while it is paged out of the cycling window', async () => {
    vi.useFakeTimers()
    // 3 rows, no pins: page 1 shows P1-P3. The long name joins at P6, off screen.
    const view = await mount({
      snapshot: withNames(NAMES),
      configuredWidth: 100,
      maxRows: 3,
      cycle: { enabled: true, perPageSeconds: 8, pinTop: 0, pinScope: 'overall', pinSubject: false },
    })
    expect(minWidth()).toBe('110px')
    await update(view, { snapshot: withLong('car-31') })
    expect(rowFor('car-31'), 'car-31 should be paged out').toBeNull()
    expect(minWidth()).toBe('210px')
  })

  it('removes its loadingdone listener on unmount', async () => {
    const view = await mount({ snapshot: withNames(NAMES), configuredWidth: 100 })
    expect(fonts.listenerCount('loadingdone')).toBe(1)
    view.unmount()
    expect(fonts.listenerCount('loadingdone')).toBe(0)
  })

  it('does nothing when document.fonts.ready resolves after unmount', async () => {
    fonts = stubFonts({ loaded: false })
    fonts.load.mockImplementation(() => new Promise(() => {}))
    const view = await mount({ snapshot: withLong(), configuredWidth: 100 })
    view.unmount()
    fonts.check.mockClear()
    measuredFonts = []
    fonts.loaded = true
    fonts.resolveReady()
    await settle()
    expect(fonts.check, 'an unmounted tower must not check the font').not.toHaveBeenCalled()
    expect(measuredFonts, 'an unmounted tower must not measure').toEqual([])
  })

  it('requests the measuring font once, while check() is false', async () => {
    fonts = stubFonts({ loaded: false })
    fonts.load.mockImplementation(() => new Promise(() => {}))
    const view = await mount({ snapshot: withNames(NAMES), configuredWidth: 100 })
    await update(view, { snapshot: withLong() })
    await update(view, { snapshot: withNames(NAMES) })
    expect(fonts.load).toHaveBeenCalledTimes(1)
    expect(fonts.load).toHaveBeenCalledWith(FALLBACK_FONT)
  })

  it('does not request the font when check() is already true', async () => {
    await mount({ snapshot: withNames(NAMES), configuredWidth: 100 })
    expect(fonts.load).not.toHaveBeenCalled()
  })
})

// ---- #260: font-failure lifecycle paths, pinned ---------------------------------------------
describe('full-style width — font-failure lifecycle (rule 48, #260)', () => {
  const REFUSE = () => Promise.reject(new Error('NetworkError'))
  const SIZE_B_FONT = "700 30px 'Saira Condensed', 'Arial Narrow', sans-serif"

  it('removes its loadingerror listener on unmount', async () => {
    const view = await mount({ snapshot: withNames(NAMES), configuredWidth: 100 })
    expect(fonts.listenerCount('loadingerror')).toBe(1)
    view.unmount()
    expect(fonts.listenerCount('loadingerror')).toBe(0)
  })

  it('does nothing when a font request is refused after unmount', async () => {
    fonts = stubFonts({ loaded: false })
    let refuse
    fonts.load.mockImplementation(() => new Promise((_resolve, reject) => (refuse = reject)))
    const view = await mount({ snapshot: withLong(), configuredWidth: 100 })
    expect(minWidth()).toBe('100px')
    view.unmount()
    fonts.check.mockClear()
    measuredFonts = []
    refuse(new Error('NetworkError'))
    await settle()
    expect(fonts.check, 'an unmounted tower must not check the font').not.toHaveBeenCalled()
    expect(measuredFonts, 'an unmounted tower must not measure').toEqual([])
  })

  it('counts a synchronous throw from fonts.load as a failure and measures in the fallback at once', async () => {
    fonts = stubFonts({ loaded: false })
    fonts.load.mockImplementation(() => {
      throw new Error('SyntaxError')
    })
    await mount({ snapshot: withLong(), configuredWidth: 100 })
    expect(fonts.load).toHaveBeenCalledTimes(1)
    expect(minWidth()).toBe('210px')
  })

  it.each([
    ['the configured width', { configuredWidth: 180 }, '210px'],
    ['maxRows', { maxRows: 3 }, '210px'],
  ])('measures at once after a failure when %s resets the settings, with no new request', async (_l, change, expected) => {
    fonts = stubFonts({ loaded: false })
    fonts.load.mockImplementation(REFUSE)
    const view = await mount({ snapshot: withLong(), configuredWidth: 100 })
    expect(minWidth()).toBe('210px')
    expect(fonts.load).toHaveBeenCalledTimes(1)
    await update(view, change)
    expect(minWidth(), 'the reset wiped the names; they must be measured again, not wait for a font').toBe(expected)
    expect(fonts.load, 'no new request after a reset').toHaveBeenCalledTimes(1)
  })

  it('requests a changed font string once after a failure, however often it re-measures', async () => {
    fonts = stubFonts({ loaded: false })
    fonts.load.mockImplementation(REFUSE)
    const view = await mount({ snapshot: withNames(NAMES), configuredWidth: 100 })
    tokens['--bc-size-name'] = '30px'
    await update(view, { snapshot: withLong() })
    await update(view, { snapshot: withNames(NAMES) })
    await update(view, { snapshot: withLong() })
    expect(fonts.load.mock.calls.map((c) => c[0])).toEqual([FALLBACK_FONT, SIZE_B_FONT])
    expect(minWidth()).toBe('210px')
  })

  it('requests font A only once across an A to B to A change', async () => {
    fonts = stubFonts({ loaded: false })
    fonts.load.mockImplementation(() => new Promise(() => {}))
    const view = await mount({ snapshot: withNames(NAMES), configuredWidth: 100 })
    tokens['--bc-size-name'] = '30px'
    await update(view, { snapshot: withLong() })
    tokens['--bc-size-name'] = ''
    await update(view, { snapshot: withNames(NAMES) })
    await update(view, { snapshot: withLong() })
    expect(fonts.load.mock.calls.map((c) => c[0])).toEqual([FALLBACK_FONT, SIZE_B_FONT])
  })
})
