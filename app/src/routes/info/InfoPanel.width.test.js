/* A long header widens the info panel: the wiring — widgets.md rule 78a, ADR 0037,
 * how/renderer.md "A long header widens the panel".
 *
 * happy-dom does no layout, so the header's measured width is stubbed at the seam how/renderer.md
 * names: the header element's `offsetWidth` (layout px, unaffected by the /config preview's
 * scale), plus the `.bc-info` section's computed horizontal padding and the `.lt3` plate's
 * computed side borders. The stubs give the padding 16 px a side and the border 1 px a side, so a
 * header of `need − 34` px has a need of `need`. Each test then reads what the panel did with it:
 * the inline `width` and `left` of `.lt3-anchor`, the box the shell plate fills. `/info`'s slot
 * comes from its `.info-page` element (`clientWidth` less its computed padding) and its canvas
 * from `window.innerWidth`, both stubbed too. Expected values are worked from the rule, as in
 * infoPanel.span.test.js.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import AllView from '../all/AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import fixture from '../../../../spec/v1/fixtures/event-info.json'

const sse = vi.hoisted(() => ({ emit: null }))
vi.mock('../../lib/sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: (_url, onState) => {
    sse.emit = onState
    return () => {}
  },
}))

const SHORT = 'ROUND 3 · SPA 6 HOURS · SPA-FRANCORCHAMPS' // the fixture's header
const LONG_EVENT = { round: 3, name: 'Total 6 Hours of Spa-Francorchamps', track: 'Circuit de Spa-Francorchamps' }
const LONG = 'ROUND 3 · TOTAL 6 HOURS OF SPA-FRANCORCHAMPS · CIRCUIT DE SPA-FRANCORCHAMPS'
const MID_EVENT = { round: 3, name: 'Total 6 Hours of Spa', track: 'Spa-Francorchamps' }
const MID = 'ROUND 3 · TOTAL 6 HOURS OF SPA · SPA-FRANCORCHAMPS'

// The need (header + 32 px padding + 2 px border) each header text measures at.
let needs = {}
// The `.info-page` element's clientWidth (the /info Browser Source width).
let pageWidth = 1280
const PAD = 16
const BORDER = 1

/** The getter happy-dom defines for `prop`, wherever on the prototype chain it lives. */
function realGetter(proto, prop) {
  for (let p = proto; p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, prop)
    if (d?.get) return d.get
  }
  return () => 0
}
// Own descriptors to restore, or undefined when the getter lives further up the chain.
const ownOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
const ownClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const realOffsetWidth = realGetter(HTMLElement.prototype, 'offsetWidth')
const realClientWidth = realGetter(HTMLElement.prototype, 'clientWidth')
function restore(prop, own) {
  if (own) Object.defineProperty(HTMLElement.prototype, prop, own)
  else delete HTMLElement.prototype[prop]
}
const realGetComputedStyle = window.getComputedStyle

function stubStyle(el, overrides) {
  const real = realGetComputedStyle.call(window, el)
  const kebab = Object.fromEntries(
    Object.entries(overrides).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), v]),
  )
  return new Proxy(real, {
    get(target, prop) {
      if (prop in overrides) return overrides[prop]
      if (prop === 'getPropertyValue') return (name) => kebab[name] ?? target.getPropertyValue(name)
      const v = target[prop]
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
}

beforeEach(() => {
  sse.emit = null
  needs = { [SHORT]: 410, [LONG]: 900, [MID]: 700 }
  pageWidth = 1280
  vi.useFakeTimers()
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      if (this.getAttribute('data-testid') === 'info-header') {
        const need = needs[this.textContent.trim()]
        if (need === undefined) throw new Error(`no stubbed need for header "${this.textContent.trim()}"`)
        return need - 2 * PAD - 2 * BORDER
      }
      return realOffsetWidth.call(this)
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return this.classList?.contains('info-page') ? pageWidth : realClientWidth.call(this)
    },
  })
  window.getComputedStyle = (el, pseudo) => {
    const cls = el?.classList
    if (cls?.contains('bc-info')) return stubStyle(el, { paddingLeft: `${PAD}px`, paddingRight: `${PAD}px` })
    if (cls?.contains('lt3')) return stubStyle(el, { borderLeftWidth: `${BORDER}px`, borderRightWidth: `${BORDER}px` })
    if (cls?.contains('info-page')) return stubStyle(el, { paddingLeft: '48px', paddingRight: '48px' })
    return realGetComputedStyle.call(window, el, pseudo)
  }
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  restore('offsetWidth', ownOffsetWidth)
  restore('clientWidth', ownClientWidth)
  window.getComputedStyle = realGetComputedStyle
  window.history.replaceState({}, '', '/')
})

async function settle() {
  for (let i = 0; i < 5; i++) await tick()
  flushSync()
}

/** The panel's sizing box, and its inline width / left. */
function anchorIn(root) {
  const a = root.querySelector('.lt3-anchor')
  expect(a, 'no .lt3-anchor: the panel did not draw').not.toBeNull()
  return { width: a.style.width, left: a.style.left }
}

describe('/all: the info slot widens and re-places the panel (rule 78a)', () => {
  let view
  const slot = () => view.container.querySelector('[data-testid="widget-info"]')
  async function mount(snapshot, config) {
    view = render(AllView, { snapshot, ...(config ? { config: normalizeConfig(config) } : {}) })
    await settle()
  }

  it('a header that fits leaves the panel at its slot width, with no offset', async () => {
    await mount(fixture)
    expect(anchorIn(slot())).toEqual({ width: '696px', left: '0px' })
  })

  it('a header needing 700 px widens the panel to the right, keeping the left edge', async () => {
    await mount({ ...fixture, event: MID_EVENT })
    expect(anchorIn(slot())).toEqual({ width: '700px', left: '0px' })
  })

  it('a header needing 900 px makes the panel 900 px wide, its right edge on the canvas edge', async () => {
    // 1200 + 900 = 2100: 180 px past 1920, taken on the left (canvas left 1020).
    await mount({ ...fixture, event: LONG_EVENT })
    expect(anchorIn(slot())).toEqual({ width: '900px', left: '-180px' })
  })

  it('a shorter header later shrinks the panel back to its slot', async () => {
    await mount({ ...fixture, event: LONG_EVENT })
    expect(anchorIn(slot()).width).toBe('900px')
    await view.rerender({ snapshot: fixture })
    await settle()
    expect(anchorIn(slot())).toEqual({ width: '696px', left: '0px' })
  })

  it('a panel with lines and no header is its slot width', async () => {
    await mount({ ...fixture, event: null })
    expect(view.container.querySelector('[data-testid="info-header"]')).toBeNull()
    expect(anchorIn(slot())).toEqual({ width: '696px', left: '0px' })
  })

  it("follows the info widget's configured slot, not the default one", async () => {
    // Slot 1400..1800: a 900 px panel would end at 2300, 380 px past 1920, so it starts at 1020.
    await mount({ ...fixture, event: LONG_EVENT }, { widgets: { info: { x: 1400, w: 400 } } })
    expect(anchorIn(slot())).toEqual({ width: '900px', left: '-380px' })
  })

  it("measures the canvas edge on the profile's canvas, not a fixed 1920", async () => {
    // A 1280 px canvas, slot 600..1200: a 900 px panel would end at 1500, 220 px past 1280, so
    // it starts at 380. On a 1920 canvas it would keep its left edge (left 0px).
    await mount(
      { ...fixture, event: LONG_EVENT },
      { canvas: { w: 1280, h: 720 }, widgets: { info: { x: 600, w: 600 } } },
    )
    expect(anchorIn(slot())).toEqual({ width: '900px', left: '-220px' })
  })
})

describe('/info: the content box is the slot and the viewport the canvas (rule 78a)', () => {
  async function mountPage() {
    const Page = (await import('./InfoPage.svelte')).default
    window.history.replaceState({}, '', '/info?motion=reduced')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    )
    vi.stubGlobal('innerWidth', pageWidth)
    const view = render(Page)
    await settle()
    return view
  }
  function push(snapshot) {
    sse.emit(snapshot)
    flushSync()
  }

  it('a header too wide for a 1280 px Browser Source widens the panel and moves it left', async () => {
    // Slot 48..1232 (1280 less 48 px a side). A 1250 px panel from 48 ends at 1298, 18 px past
    // 1280, so it starts at 30: 18 px left of the slot.
    needs[LONG] = 1250
    const view = await mountPage()
    push({ ...fixture, event: LONG_EVENT })
    await settle()
    expect(anchorIn(view.container)).toEqual({ width: '1250px', left: '-18px' })
  })

  it('a resized Browser Source re-places the panel', async () => {
    needs[LONG] = 1250
    const view = await mountPage()
    push({ ...fixture, event: LONG_EVENT })
    await settle()
    expect(anchorIn(view.container).width).toBe('1250px')
    // Widened to 1920: the slot is 1824 px, wider than the header needs.
    pageWidth = 1920
    vi.stubGlobal('innerWidth', 1920)
    window.dispatchEvent(new Event('resize'))
    await settle()
    expect(anchorIn(view.container)).toEqual({ width: '1824px', left: '0px' })
  })
})
