/* A theme switch resets the full-name tower's fit width — widgets.md rule 48 (Reset, Width),
 * overlay-config.md rule 60, ADR 0027, how/renderer.md "Theme switch".
 *
 * happy-dom resolves no custom properties and does no layout, so the reads the width formula
 * takes are stubbed per theme, keyed on the `data-theme` of the tower's nearest ancestor that
 * carries one (as a real browser resolves the tokens there):
 *   - the tower root's `--bc-font-display` (Saira Condensed / Barlow Condensed / Oswald);
 *   - the name cell's `fontStyle` (`italic` under vintage70, `normal` otherwise);
 *   - canvas `measureText`: px per code point by family (Saira 10, Barlow 8, Oswald 12);
 *   - `document.fonts`: every face loaded unless a test says otherwise;
 *   - the rest of the row: `scrollWidth` of each row and `clientWidth` of its name cell.
 * So the stub stands in for the browser's resolution of the tokens; what is under test is that
 * the tower notices the switch and measures again, which no stub can do for it.
 *
 * Field: grid-multiclass with car-14 renamed. Its full form 'M. Gonzalez-Hernandez' is the
 * widest name: 21 code points, so 210px in modern, 168px in vintage70, 252px in vintage80.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'

const LONG = 'Maximilian Gonzalez-Hernandez'
const snapshot = {
  ...multiClass,
  vehicles: multiClass.vehicles.map((v) => (v.slot_id === 'car-14' ? { ...v, driver_name: LONG } : v)),
}

const FAMILY = {
  modern: "'Saira Condensed', 'Arial Narrow', sans-serif",
  vintage70: "'Barlow Condensed', 'Arial Narrow', sans-serif",
  vintage80: "'Oswald', 'Arial Narrow', sans-serif",
}
const PX = { Saira: 10, Barlow: 8, Oswald: 12 }

const tower = () => document.querySelector('[data-testid="standings-tower"]')
const minWidth = () => tower().style.minWidth
const themeOf = (el) => el?.closest?.('[data-theme]')?.getAttribute('data-theme') ?? 'modern'

let measuredFonts
let originalGetContext
let originalGetComputedStyle
let fonts
let rest // px of non-name content every row reports
const originalDescriptors = {}

function stubFonts() {
  const listeners = {}
  const set = {
    unloaded: new Set(), // families (first word) whose check() is false
    check: vi.fn((font) => ![...set.unloaded].some((f) => font.includes(f))),
    ready: Promise.resolve(),
    load: vi.fn(() => new Promise(() => {})),
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn)
    },
    fire: (type, detail = {}) => (listeners[type] ?? []).forEach((fn) => fn({ type, ...detail })),
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
  rest = 0
  originalGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function getContext(kind) {
    if (kind !== '2d') return null
    const ctx = {
      font: '10px sans-serif',
      measureText(text) {
        measuredFonts.push(ctx.font)
        const family = Object.keys(PX).find((f) => ctx.font.includes(f))
        return { width: [...String(text)].length * (PX[family] ?? 10) }
      },
    }
    return ctx
  }
  fonts = stubFonts()
  originalGetComputedStyle = window.getComputedStyle
  window.getComputedStyle = function getComputedStyle(el, ...more) {
    const real = originalGetComputedStyle.call(window, el, ...more)
    const theme = themeOf(el)
    const isName = el?.matches?.('[data-testid="driver-name"]')
    const isTower = el?.matches?.('[data-testid="standings-tower"]')
    return new Proxy(real, {
      get(target, prop) {
        if (prop === 'fontStyle' && (isName || isTower)) return theme === 'vintage70' ? 'italic' : 'normal'
        if (prop === 'getPropertyValue') {
          return (name) => (isTower && name === '--bc-font-display' ? FAMILY[theme] : target.getPropertyValue(name))
        }
        const value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }
  stubLayout('scrollWidth', '[data-testid="tower-row"]', () => rest)
  stubLayout('clientWidth', '[data-testid="driver-name"]', () => 0)
})

afterEach(() => {
  cleanup()
  HTMLCanvasElement.prototype.getContext = originalGetContext
  window.getComputedStyle = originalGetComputedStyle
  delete document.fonts
  for (const prop of ['scrollWidth', 'clientWidth']) {
    if (originalDescriptors[prop]) Object.defineProperty(HTMLElement.prototype, prop, originalDescriptors[prop])
    else delete HTMLElement.prototype[prop]
  }
  document.documentElement.removeAttribute('data-theme')
  document.body.innerHTML = ''
})

async function settle() {
  for (let i = 0; i < 4; i++) await tick()
  await Promise.resolve()
  flushSync()
}

async function mount({ theme = 'modern', target } = {}) {
  if (theme === null) document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
  const view = render(StandingsTower, {
    props: { snapshot, nameStyle: 'full', configuredWidth: 100 },
    ...(target ? { target } : {}),
  })
  await settle()
  return view
}

async function switchTheme(theme, el = document.documentElement) {
  el.setAttribute('data-theme', theme)
  await settle()
}

describe('a theme switch resets the fit width (rule 48)', () => {
  it('modern -> vintage80: measures again in the new face, with no font event', async () => {
    await mount()
    expect(minWidth()).toBe('210px')
    await switchTheme('vintage80')
    expect(minWidth()).toBe('252px')
  })

  it('vintage70 -> modern, a face that loaded earlier: measures again at once', async () => {
    await mount({ theme: 'vintage70' })
    expect(minWidth()).toBe('168px')
    await switchTheme('modern')
    expect(minWidth()).toBe('210px')
  })

  it('a reset can narrow the tower: modern -> vintage70', async () => {
    await mount()
    expect(minWidth()).toBe('210px')
    await switchTheme('vintage70')
    expect(minWidth()).toBe('168px')
  })

  it('forgets the remembered rest-of-row width: the rows on screen decide it again', async () => {
    rest = 40
    await mount()
    expect(minWidth()).toBe('250px')
    rest = 30 // the new preset's numerals are narrower
    await switchTheme('vintage80')
    // A name-font load would keep the old 40 (292px); a reset reads 30 off the rows.
    expect(minWidth()).toBe('282px')
  })

  it('the same value written again is not a switch: nothing is reset', async () => {
    rest = 40
    await mount()
    rest = 30
    await switchTheme('modern')
    expect(minWidth()).toBe('250px')
  })

  it('a new face that has not loaded: no fit width until it loads, then measures in it', async () => {
    await mount()
    fonts.unloaded.add('Oswald')
    await switchTheme('vintage80')
    expect(minWidth(), 'the reset clears the fit width; Oswald is not loaded yet').toBe('100px')
    expect(fonts.load).toHaveBeenCalledWith(`700 22px ${FAMILY.vintage80}`)

    fonts.unloaded.delete('Oswald')
    fonts.fire('loadingdone', { fontfaces: [{ family: 'Oswald' }] })
    await settle()
    expect(minWidth()).toBe('252px')
  })

  it('in the /config preview, follows the preview stage, not the document root', async () => {
    const stage = document.createElement('div')
    stage.setAttribute('data-theme', 'modern')
    document.body.appendChild(stage)
    await mount({ target: stage })
    expect(minWidth()).toBe('210px')

    await switchTheme('vintage80', stage)
    expect(document.documentElement.getAttribute('data-theme'), 'the editor root stays modern').toBe('modern')
    expect(minWidth()).toBe('252px')
  })

  it('mounted before the page writes the root attribute: still follows the root', async () => {
    // On a render page the tower mounts before App.svelte stamps <html data-theme>.
    await mount({ theme: null })
    expect(minWidth()).toBe('210px')
    await switchTheme('vintage80')
    expect(minWidth()).toBe('252px')
  })

  it('the root attribute appearing as modern is not a switch', async () => {
    rest = 40
    await mount({ theme: null })
    rest = 30
    await switchTheme('modern')
    expect(minWidth(), 'an absent attribute already counts as modern').toBe('250px')
  })

  it('disconnects its observer on unmount', async () => {
    const observed = []
    const disconnected = []
    const Real = window.MutationObserver
    window.MutationObserver = class extends Real {
      observe(target, options) {
        if (options?.attributeFilter?.includes('data-theme')) observed.push(this)
        return super.observe(target, options)
      }
      disconnect() {
        disconnected.push(this)
        return super.disconnect()
      }
    }
    try {
      const view = await mount()
      expect(observed.length, 'the tower watches data-theme').toBeGreaterThan(0)
      view.unmount()
      for (const observer of observed) expect(disconnected).toContain(observer)
      const before = measuredFonts.length
      await switchTheme('vintage80')
      expect(measuredFonts.length, 'no measurement after unmount').toBe(before)
    } finally {
      window.MutationObserver = Real
    }
  })
})

describe('the measuring font carries the name font style (rule 48, Width)', () => {
  it('measures italic under vintage70', async () => {
    await mount({ theme: 'vintage70' })
    expect(measuredFonts.length, 'no name was measured').toBeGreaterThan(0)
    for (const font of measuredFonts) expect(font).toBe(`italic 700 22px ${FAMILY.vintage70}`)
  })

  it('leaves a normal style out of the font string', async () => {
    await mount({ theme: 'vintage80' })
    expect(measuredFonts.length).toBeGreaterThan(0)
    for (const font of measuredFonts) expect(font).toBe(`700 22px ${FAMILY.vintage80}`)
  })
})
