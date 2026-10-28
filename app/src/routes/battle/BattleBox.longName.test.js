/* A name too wide for its slot shows its short form — widgets.md rule 108, ADR 0038,
 * how/renderer.md "Battle box short-name fallback".
 *
 * Two halves. The CSS half reads the slot and name rules from the component source (Vite `?raw`),
 * as BattleBox.vintage.test.js does: nothing clips a name (so no glow or extrusion is cut), and the
 * grid keeps the three slots' widths. The fallback half drives race-close-battle.json (subject
 * car-1 at P2, car-44 ahead, car-16 behind) with the widths stubbed at the seam how/renderer.md
 * names, since happy-dom does no layout: `offsetWidth` of each slot's `.bc-battle__measure`
 * element (the full form's width, keyed on its text), each slot's `clientWidth`, the focus slot's
 * computed padding (8px a side, the base look's), and `ResizeObserver`, which the tests fire by
 * hand and only for the one element whose size changed: the slot for a width change, the
 * measuring span for a font load, preset or text-size change. An implementation that does not
 * observe that element never hears it. Each test then reads the visible name. Only a real
 * browser shows the real text widths.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import BattleBox from './BattleBox.svelte'
import source from './BattleBox.svelte?raw'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

/** Flat rules of the component's <style>: [{ selectors: string[], decls: Map }]. */
function styleRules() {
  const css = (/<style>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
  let src = css
  for (let at = src.indexOf('@keyframes'); at !== -1; at = src.indexOf('@keyframes')) {
    let i = src.indexOf('{', at)
    let depth = 0
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}' && --depth === 0) break
    }
    src = src.slice(0, at) + src.slice(i + 1)
  }
  const rules = []
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(/,(?![^(]*\))/).map((s) => s.trim().replace(/\s+/g, ' '))
    const decls = new Map()
    for (const part of m[2].split(';')) {
      const idx = part.indexOf(':')
      if (idx === -1) continue
      decls.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim().replace(/\s+/g, ' '))
    }
    rules.push({ selectors, decls })
  }
  return rules
}
const RULES = styleRules()

/** The declared value of `prop` in the base-look (unthemed) rule whose selector is exactly `target`. */
function base(target, prop) {
  let value
  for (const rule of RULES) {
    if (rule.selectors.includes(target) && rule.decls.has(prop)) value = rule.decls.get(prop)
  }
  return value
}

/** Whether a declaration clips its element's painting or caps its width. A non-`visible`
 *  `overflow-y` counts too: it forces `overflow-x` off `visible`. */
function clips(prop, value) {
  if (prop === 'overflow' || prop === 'overflow-x' || prop === 'overflow-y') return value !== 'visible'
  if (prop === 'text-overflow' || prop === 'max-width') return true
  if (prop === 'contain') return /\b(paint|strict|content)\b/.test(value)
  if (prop === 'clip-path') return value !== 'none'
  return false
}
const SLOTS = ['.bc-battle__slot', '.bc-battle__slot--ahead', '.bc-battle__slot--focus', '.bc-battle__slot--behind']
const compound = (c) => c.split(/(?=[.:[])/)
/** Every clipping or capping declaration, base or themed, that reaches an element carrying `cls`:
 *  a selector whose last compound names the class, or, for an element inside a slot or the body,
 *  one whose last compound names no class (`span`, `*`) under a slot or the body. */
function clipping(cls) {
  const found = []
  for (const rule of RULES) {
    for (const sel of rule.selectors) {
      const compounds = sel.split(/\s*[>+~]\s*|\s+/).filter(Boolean)
      const last = compounds.pop()
      const named = compound(last).includes(cls)
      const inner = cls !== '.bc-battle__body' && !last.includes('.') &&
        compounds.some((c) => compound(c).some((p) => SLOTS.includes(p) || p === '.bc-battle__body'))
      if (!named && !inner) continue
      for (const [prop, value] of rule.decls) if (clips(prop, value)) found.push(`${sel} { ${prop}: ${value} }`)
    }
  }
  return found
}

describe('rule 108 — nothing clips a name (CSS)', () => {
  it('the on-camera name stays on one line and nothing clips it or caps its width, in any preset', () => {
    expect(base('.bc-battle__focus-name', 'white-space')).toBe('nowrap')
    expect(clipping('.bc-battle__focus-name')).toEqual([])
  })

  it('the ahead and behind names stay on one line and nothing clips them or caps their width, in any preset', () => {
    expect(base('.bc-battle__slot-name', 'white-space')).toBe('nowrap')
    expect(clipping('.bc-battle__slot-name')).toEqual([])
  })

  it('nothing caps or clips the measuring span, though it shares the name class', () => {
    expect(clipping('.bc-battle__measure')).toEqual([])
  })

  it('no slot and not the body clips what a name draws past its edge, in any preset', () => {
    for (const cls of [...SLOTS, '.bc-battle__body']) expect(clipping(cls), cls).toEqual([])
  })

  it('the slots keep their widths: fixed grid tracks, and no track grows to its slot\'s name', () => {
    expect(base('.bc-battle__body', 'grid-template-columns')).toBe('1fr 1.15fr 1fr')
    expect(base('.bc-battle__slot', 'min-width')).toBe('0')
  })

  it('the measuring element sits outside the flow, unseen, at its text\'s own width', () => {
    expect(base('.bc-battle__measure', 'position')).toBe('absolute')
    expect(base('.bc-battle__measure', 'visibility')).toBe('hidden')
    expect(base('.bc-battle__measure', 'width')).toBe('max-content')
  })
})

// ---- The fallback, with widths stubbed ----

const FOCUS_PAD = 8
// Full-form widths, keyed on the full form a measuring element holds (100px when not listed).
let fullWidth = {}
// Each slot's clientWidth (padding included), keyed on its modifier.
let slotWidth = {}

/** The getter happy-dom defines for `prop`, wherever on the prototype chain it lives. */
function realGetter(proto, prop) {
  for (let p = proto; p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, prop)
    if (d?.get) return d.get
  }
  return () => 0
}
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

let observers = []
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
/** Fire every observer watching `el`, as the browser does when its size changes. */
function resized(el) {
  for (const o of observers) if (o.targets.has(el)) o.cb([{ target: el }], o)
}

const slotKey = (el) => ['ahead', 'focus', 'behind'].find((k) => el?.classList?.contains(`bc-battle__slot--${k}`))

beforeEach(() => {
  observers = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  fullWidth = {}
  slotWidth = { ahead: 127, focus: 146, behind: 127 }
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      if (this.classList?.contains('bc-battle__measure')) return fullWidth[this.textContent.trim()] ?? 100
      return realOffsetWidth.call(this)
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      const k = slotKey(this)
      return k ? slotWidth[k] : realClientWidth.call(this)
    },
  })
  window.getComputedStyle = (el, pseudo) => {
    const k = slotKey(el)
    if (k === 'focus') return stubStyle(el, { paddingLeft: `${FOCUS_PAD}px`, paddingRight: `${FOCUS_PAD}px` })
    if (k) return stubStyle(el, { paddingLeft: '0px', paddingRight: '0px' })
    return realGetComputedStyle.call(window, el, pseudo)
  }
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  restore('offsetWidth', ownOffsetWidth)
  restore('clientWidth', ownClientWidth)
  window.getComputedStyle = realGetComputedStyle
})

async function settle() {
  for (let i = 0; i < 5; i++) await tick()
  flushSync()
}

const FOCUS = 'Maximilian Featherstonehaugh' // full M. Featherstonehaugh, short M.FEA
const AHEAD = 'Lewis Hamilton' // full L. Hamilton, short L.HAM
const BEHIND = 'Charles Leclerc' // full C. Leclerc, short C.LEC

function snapshot({ focus = FOCUS, ahead = AHEAD, behind = BEHIND } = {}) {
  const snap = structuredClone(closeBattle)
  snap.subject.driver_name = focus
  const at = (p) => snap.vehicles.find((v) => v.position === p)
  at(1).driver_name = ahead
  at(3).driver_name = behind
  return snap
}
const props = (snap) => ({ subject: snap.subject, relationship: snap.relationship, vehicles: snap.vehicles, mode: snap.mode })

async function renderBox(snap) {
  const r = render(BattleBox, { props: props(snap) })
  await settle()
  return r
}

const slot = (c, k) => c.querySelector(`.bc-battle__slot--${k}`)
const VISIBLE = { focus: '.bc-battle__focus-name', ahead: '.bc-battle__slot-name', behind: '.bc-battle__slot-name' }
/** The text the viewer sees in slot `k`: its name element that is not the measuring one. */
const shown = (c, k) => slot(c, k).querySelector(`${VISIBLE[k]}:not(.bc-battle__measure)`)?.textContent.trim()
const names = (c) => ({ ahead: shown(c, 'ahead'), focus: shown(c, 'focus'), behind: shown(c, 'behind') })
const measure = (c, k) => slot(c, k).querySelector('.bc-battle__measure')

describe('rule 108 — full form when it fits, short form when it does not', () => {
  it('every full form fits: all three slots show the full form', async () => {
    const { container } = await renderBox(snapshot())

    expect(names(container)).toEqual({ ahead: 'L. Hamilton', focus: 'M. Featherstonehaugh', behind: 'C. Leclerc' })
  })

  it('the on-camera full form is wider than the focus slot: it shows the short form, the neighbours stay full', async () => {
    fullWidth['M. Featherstonehaugh'] = 200 // focus content is 146 − 2 × 8 = 130
    const { container } = await renderBox(snapshot())

    expect(names(container)).toEqual({ ahead: 'L. Hamilton', focus: 'M.FEA', behind: 'C. Leclerc' })
  })

  it('a full form exactly as wide as the slot\'s content width fits', async () => {
    fullWidth['M. Featherstonehaugh'] = 130
    const { container } = await renderBox(snapshot())

    expect(shown(container, 'focus')).toBe('M. Featherstonehaugh')
  })

  it('a full form one pixel wider than the content width does not fit, though narrower than the slot', async () => {
    fullWidth['M. Featherstonehaugh'] = 131
    const { container } = await renderBox(snapshot())

    expect(shown(container, 'focus')).toBe('M.FEA')
  })

  it('each slot decides on its own: only the too-wide neighbour shortens', async () => {
    fullWidth['L. Hamilton'] = 128 // ahead content is 127
    const { container } = await renderBox(snapshot())

    expect(names(container)).toEqual({ ahead: 'L.HAM', focus: 'M. Featherstonehaugh', behind: 'C. Leclerc' })
  })

  it('both neighbours too wide, the on-camera name fits: both neighbours shorten', async () => {
    fullWidth['L. Hamilton'] = 300
    fullWidth['C. Leclerc'] = 300
    const { container } = await renderBox(snapshot())

    expect(names(container)).toEqual({ ahead: 'L.HAM', focus: 'M. Featherstonehaugh', behind: 'C.LEC' })
  })

  it('the measuring element holds the full form while the short form shows', async () => {
    fullWidth['M. Featherstonehaugh'] = 200
    const { container } = await renderBox(snapshot())

    expect(shown(container, 'focus')).toBe('M.FEA')
    expect(measure(container, 'focus')?.textContent.trim()).toBe('M. Featherstonehaugh')
  })

  it('an empty short form (no letter or digit): the full form shows', async () => {
    fullWidth['!. ???'] = 500
    const { container } = await renderBox(snapshot({ focus: '!!! ???' }))

    expect(shown(container, 'focus')).toBe('!. ???')
  })

  it('a missing neighbour stays — however narrow its slot', async () => {
    slotWidth.ahead = 4
    const { container } = await renderBox(snapshot({ ahead: '' }))

    expect(shown(container, 'ahead')).toBe('—')
    expect(measure(container, 'ahead')).toBeNull()
  })

  it('an on-camera car with no name: the focus slot is empty and holds no measuring element', async () => {
    const snap = snapshot({ focus: '' })
    snap.vehicles.find((v) => v.slot_id === snap.subject.slot_id).driver_name = ''
    const { container } = await renderBox(snap)

    expect(shown(container, 'focus')).toBe('')
    expect(measure(container, 'focus')).toBeNull()
  })
})

describe('rule 108 — the observers end with the box', () => {
  it('unmounting the box leaves no slot or measuring element observed', async () => {
    const { container, unmount } = await renderBox(snapshot())
    const watched = [slot(container, 'focus'), measure(container, 'focus')]
    expect(watched.every((el) => observers.some((o) => o.targets.has(el)))).toBe(true)

    unmount()
    expect(observers.flatMap((o) => [...o.targets])).toEqual([])
  })
})

describe('rule 108 — decided again', () => {
  it('a new on-camera name that fits shows in full again', async () => {
    fullWidth['M. Featherstonehaugh'] = 200
    fullWidth['M. Verstappen'] = 110
    const { container, rerender } = await renderBox(snapshot())
    expect(shown(container, 'focus')).toBe('M.FEA')

    await rerender(props(snapshot({ focus: 'Max Verstappen' })))
    await settle()
    expect(shown(container, 'focus')).toBe('M. Verstappen')
  })

  it('a new on-camera name that does not fit shortens, from a full one', async () => {
    fullWidth['M. Verstappen'] = 110
    fullWidth['M. Featherstonehaugh'] = 200
    const { container, rerender } = await renderBox(snapshot({ focus: 'Max Verstappen' }))
    expect(shown(container, 'focus')).toBe('M. Verstappen')

    await rerender(props(snapshot()))
    await settle()
    expect(shown(container, 'focus')).toBe('M.FEA')
  })

  it('the slot narrows, then widens again: short form, then full form', async () => {
    fullWidth['M. Featherstonehaugh'] = 120
    const { container } = await renderBox(snapshot())
    expect(shown(container, 'focus')).toBe('M. Featherstonehaugh')

    slotWidth.focus = 120 // content 104
    resized(slot(container, 'focus'))
    await settle()
    expect(shown(container, 'focus')).toBe('M.FEA')

    slotWidth.focus = 146
    resized(slot(container, 'focus'))
    await settle()
    expect(shown(container, 'focus')).toBe('M. Featherstonehaugh')
  })

  it('the full form renders wider (a font loads, the preset or text size changes), then narrower', async () => {
    const { container } = await renderBox(snapshot())
    expect(shown(container, 'behind')).toBe('C. Leclerc')

    fullWidth['C. Leclerc'] = 140
    resized(measure(container, 'behind'))
    await settle()
    expect(names(container)).toEqual({ ahead: 'L. Hamilton', focus: 'M. Featherstonehaugh', behind: 'C.LEC' })

    fullWidth['C. Leclerc'] = 100
    resized(measure(container, 'behind'))
    await settle()
    expect(shown(container, 'behind')).toBe('C. Leclerc')
  })
})
