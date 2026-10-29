/* Driver names inside /all — widgets.md rules 46-48 and 111-115, overlay-config.md rule 42,
 * ADRs 0018 and 0038. /all passes the profile's one `theme.nameStyle` to every widget that
 * shows a name, so with no profile setting every widget shows short names, and a profile saved
 * with the tower-only `widgets.tower.nameStyle` keeps its tower's style, now everywhere.
 *
 * Full style's tower growth past the slot's `w` is asserted through the tower root's inline
 * `min-width` (how/renderer.md "Driver name style"), with the canvas text measurement stubbed
 * below. The other widgets' growth is CSS (how/renderer.md "Driver names in every widget") and
 * only a real browser lays it out; what /all does with a grown widget, its placement on the
 * canvas (rule 115), is asserted with the slot child's `offsetWidth` stubbed: the slot's inline
 * `transform` is the read.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick, flushSync } from 'svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'
import qualifying from '../../../../spec/v1/fixtures/qualifying-sector-a.json'
import raceEvents from '../../../../spec/v1/fixtures/race-events.json'

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

async function settle() {
  for (let i = 0; i < 4; i++) await tick()
  await Promise.resolve()
  flushSync()
}

const towerNames = (container) =>
  Array.from(
    container.querySelectorAll('[data-testid="widget-tower"] [data-testid="driver-name"]'),
  ).map((el) => el.textContent.trim())
const towerRoot = (container) => container.querySelector('[data-testid="standings-tower"]')
const textOf = (container, selector) => container.querySelector(selector)?.textContent.trim() ?? null

// The single-name elements of rule 113, by widget.
const SEL = {
  focus: '[data-testid="widget-battle"] .bc-battle__focus-name',
  ahead: '[data-testid="widget-battle"] .bc-battle__slot--ahead .bc-battle__slot-name',
  behind: '[data-testid="widget-battle"] .bc-battle__slot--behind .bc-battle__slot-name',
  driver: '[data-testid="widget-driver"] [data-testid="driver-lt-name"]',
  hud: '[data-testid="widget-onboard"] [data-testid="onboard-driver-name"]',
  qualifying: '[data-testid="widget-qualifying"] [data-testid="qt-name"]',
  update: '[data-testid="widget-updates"] [data-testid="update-name"]',
}

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
const LONG = 'Maximilian Gonzalez-Hernandez'
/** The on-camera car (car-1) renamed to LONG, in its vehicle entry and on the subject. */
const longOnCamera = {
  ...named,
  vehicles: named.vehicles.map((v) => (v.slot_id === 'car-1' ? { ...v, driver_name: LONG } : v)),
  subject: { ...named.subject, driver_name: LONG },
}

// The HUD holds back while the driver lower-third's card is up (widgets rule 24); turn the hold
// off so the strip renders beside the card.
const cfg = (theme, widgets = {}) =>
  normalizeConfig({
    ...(theme === undefined ? {} : { theme }),
    widgets: { ...widgets, onboard: { waitForLowerThird: false, ...(widgets.onboard ?? {}) } },
  })

describe('AllView — one name style in every widget (rules 111, 46)', () => {
  it('renders short names in every widget with no name style in the profile', async () => {
    const { container } = render(AllView, { snapshot: named, config: cfg() })
    await settle()
    expect(towerNames(container)).toEqual(['L.HAM', 'M.VER', 'C.LEC', 'L.NOR'])
    expect(towerRoot(container).getAttribute('data-name-style')).toBe('short')
    expect(textOf(container, SEL.focus)).toBe('M.VER')
    expect(textOf(container, SEL.ahead)).toBe('L.HAM')
    expect(textOf(container, SEL.behind)).toBe('C.LEC')
    expect(textOf(container, SEL.driver)).toBe('M.VER')
    expect(textOf(container, SEL.hud)).toBe('M.VER')
  })

  it('renders short names with no profile at all', async () => {
    const { container } = render(AllView, { snapshot: named })
    await settle()
    expect(towerNames(container)).toEqual(['L.HAM', 'M.VER', 'C.LEC', 'L.NOR'])
    expect(textOf(container, SEL.focus)).toBe('M.VER')
    expect(textOf(container, SEL.driver)).toBe('M.VER')
  })

  it('renders full names in every widget when theme.nameStyle is full', async () => {
    const { container } = render(AllView, { snapshot: named, config: cfg({ nameStyle: 'full' }) })
    await settle()
    expect(towerNames(container)).toEqual(['L. Hamilton', 'M. Verstappen', 'C. Leclerc', 'L. Norris'])
    expect(towerRoot(container).getAttribute('data-name-style')).toBe('full')
    expect(textOf(container, SEL.focus)).toBe('M. Verstappen')
    expect(textOf(container, SEL.ahead)).toBe('L. Hamilton')
    expect(textOf(container, SEL.behind)).toBe('C. Leclerc')
    expect(textOf(container, SEL.driver)).toBe('M. Verstappen')
    expect(textOf(container, SEL.hud)).toBe('M. Verstappen')
  })

  it("a profile saved with the tower-only nameStyle: full shows full names in every widget", async () => {
    const { container } = render(AllView, { snapshot: named, config: cfg(undefined, { tower: { nameStyle: 'full' } }) })
    await settle()
    expect(towerNames(container)).toContain('M. Verstappen')
    expect(textOf(container, SEL.focus)).toBe('M. Verstappen')
    expect(textOf(container, SEL.driver)).toBe('M. Verstappen')
    expect(textOf(container, SEL.hud)).toBe('M. Verstappen')
  })

  it("theme.nameStyle short wins over a stored tower full", async () => {
    const { container } = render(AllView, {
      snapshot: named,
      config: cfg({ nameStyle: 'short' }, { tower: { nameStyle: 'full' } }),
    })
    await settle()
    expect(towerNames(container)).toContain('M.VER')
    expect(textOf(container, SEL.focus)).toBe('M.VER')
    expect(textOf(container, SEL.driver)).toBe('M.VER')
  })

  it('in full style a long on-camera name shows its whole full form in every widget, never the short form', async () => {
    const { container } = render(AllView, { snapshot: longOnCamera, config: cfg({ nameStyle: 'full' }) })
    await settle()
    expect(textOf(container, SEL.focus)).toBe('M. Gonzalez-Hernandez')
    expect(textOf(container, SEL.driver)).toBe('M. Gonzalez-Hernandez')
    expect(textOf(container, SEL.hud)).toBe('M. Gonzalez-Hernandez')
    expect(towerNames(container)).toContain('M. Gonzalez-Hernandez')
  })

  it('in short style a long on-camera name shows its short form in every widget', async () => {
    const { container } = render(AllView, { snapshot: longOnCamera, config: cfg({ nameStyle: 'short' }) })
    await settle()
    expect(textOf(container, SEL.focus)).toBe('M.GON')
    expect(textOf(container, SEL.driver)).toBe('M.GON')
    expect(textOf(container, SEL.hud)).toBe('M.GON')
    expect(towerNames(container)).toContain('M.GON')
  })

  it('the battle box idle line follows the style', async () => {
    const idle = {
      ...named,
      relationship: { gap_ahead: null, gap_behind: null, battle_intensity: 0 },
    }
    const short = render(AllView, { snapshot: idle, config: cfg({ nameStyle: 'short' }) })
    await settle()
    expect(textOf(short.container, '[data-testid="widget-battle"] .bc-battle__idle-sub')).toBe('CLEAR AIR — M.VER')
    cleanup()
    const full = render(AllView, { snapshot: idle, config: cfg({ nameStyle: 'full' }) })
    await settle()
    expect(textOf(full.container, '[data-testid="widget-battle"] .bc-battle__idle-sub')).toBe('CLEAR AIR — M. Verstappen')
  })

  it('the qualifying lower-third follows the style', async () => {
    // qualifying-sector-a: car-16 on camera with timing, mode qualifying.
    const snap = {
      ...qualifying,
      vehicles: qualifying.vehicles.map((v) => (v.slot_id === 'car-16' ? { ...v, driver_name: 'Charles Leclerc' } : v)),
      subject: { ...qualifying.subject, driver_name: 'Charles Leclerc' },
    }
    const short = render(AllView, { snapshot: snap, config: cfg({ nameStyle: 'short' }) })
    await settle()
    expect(textOf(short.container, SEL.qualifying)).toBe('C.LEC')
    cleanup()
    const full = render(AllView, { snapshot: snap, config: cfg({ nameStyle: 'full' }) })
    await settle()
    expect(textOf(full.container, SEL.qualifying)).toBe('C. Leclerc')
  })

  it('the race update card follows the style', async () => {
    const withNew = {
      ...structuredClone(raceEvents),
      race_events: [
        ...structuredClone(raceEvents.race_events),
        { id: 'ev-106', type: 'fastest_lap', driver_name: 'Klaus Bachler', vehicle_class: 'GT3', lap_time: 227.12 },
      ],
    }
    for (const [style, expected] of [
      ['short', 'K.BAC'],
      ['full', 'K. Bachler'],
    ]) {
      const view = render(AllView, { snapshot: raceEvents, config: cfg({ nameStyle: style }) })
      await settle()
      await view.rerender({ snapshot: withNew })
      await settle()
      expect(textOf(view.container, SEL.update), style).toBe(expected)
      cleanup()
    }
  })

  it('applies to the grouped tower layout too', () => {
    const { container } = render(AllView, {
      snapshot: multiClass,
      config: normalizeConfig({ widgets: { tower: { classDisplay: 'grouped' } } }),
    })
    // Grouped: GTP (Verstappen, Hamilton), LMP2 (Rossi, Bourdais), GT3 (Alonso, Albon).
    expect(towerNames(container)).toEqual(['VER', 'HAM', 'ROS', 'BOU', 'ALO', 'ALB'])
    expect(towerRoot(container).getAttribute('data-name-style')).toBe('short')
  })
})

describe('AllView — the reference short form (rule 113)', () => {
  const SINGLE = ['focus', 'ahead', 'behind', 'driver', 'hud']

  it('in short style every single-name element reserves the reference (class bc-name-ref)', async () => {
    const { container } = render(AllView, { snapshot: named, config: cfg({ nameStyle: 'short' }) })
    await settle()
    for (const key of SINGLE) {
      const el = container.querySelector(SEL[key])
      expect(el, `${key}: no name element`).not.toBeNull()
      expect(el.classList.contains('bc-name-ref'), `${key} reserves no reference short form`).toBe(true)
      // The reference is not text: the element still reads the short form alone.
      expect(el.textContent.trim(), key).not.toContain('W.WWW')
    }
  })

  it('a battle slot showing — keeps the reference', async () => {
    // Hamilton (P1) is ahead; with Verstappen moved to P1 there is no car ahead.
    const snap = {
      ...named,
      vehicles: named.vehicles.map((v) =>
        v.slot_id === 'car-1' ? { ...v, position: 1 } : v.slot_id === 'car-44' ? { ...v, position: 2 } : v,
      ),
    }
    const { container } = render(AllView, { snapshot: snap, config: cfg({ nameStyle: 'short' }) })
    await settle()
    const ahead = container.querySelector(SEL.ahead)
    expect(ahead.textContent.trim()).toBe('—')
    expect(ahead.classList.contains('bc-name-ref')).toBe(true)
  })

  it('the qualifying and update names reserve it too', async () => {
    const q = render(AllView, { snapshot: qualifying, config: cfg({ nameStyle: 'short' }) })
    await settle()
    expect(q.container.querySelector(SEL.qualifying)?.classList.contains('bc-name-ref')).toBe(true)
    cleanup()
    const withNew = {
      ...structuredClone(raceEvents),
      race_events: [...structuredClone(raceEvents.race_events), { id: 'ev-106', type: 'penalty', driver_name: 'Klaus Bachler', penalty: '+5s' }],
    }
    const u = render(AllView, { snapshot: raceEvents, config: cfg({ nameStyle: 'short' }) })
    await settle()
    await u.rerender({ snapshot: withNew })
    await settle()
    expect(u.container.querySelector(SEL.update)?.classList.contains('bc-name-ref')).toBe(true)
  })

  it('in full style nothing in the overlay reserves it', async () => {
    const { container } = render(AllView, { snapshot: named, config: cfg({ nameStyle: 'full' }) })
    await settle()
    expect(container.querySelectorAll('.bc-name-ref')).toHaveLength(0)
  })

  it('the tower names and the idle line never reserve it', async () => {
    const { container } = render(AllView, { snapshot: named, config: cfg({ nameStyle: 'short' }) })
    await settle()
    expect(container.querySelectorAll('[data-testid="widget-tower"] .bc-name-ref')).toHaveLength(0)
    cleanup()
    const idle = { ...named, relationship: { gap_ahead: null, gap_behind: null, battle_intensity: 0 } }
    const v = render(AllView, { snapshot: idle, config: cfg({ nameStyle: 'short' }) })
    await settle()
    expect(v.container.querySelector('.bc-battle__idle-sub')?.classList.contains('bc-name-ref')).toBe(false)
  })
})

describe('AllView — where a grown widget sits (rule 115)', () => {
  // The width each widget renders at, by slot key: the slot's first element child's
  // offsetWidth, in layout px (how/renderer.md "Placement in /all"). Unstubbed keys read the
  // real (0) value.
  let widths
  const own = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  function realGetter(proto, prop) {
    for (let p = proto; p; p = Object.getPrototypeOf(p)) {
      const d = Object.getOwnPropertyDescriptor(p, prop)
      if (d?.get) return d.get
    }
    return () => 0
  }
  const realOffsetWidth = realGetter(HTMLElement.prototype, 'offsetWidth')
  beforeEach(() => {
    widths = {}
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() {
        const parent = this.parentElement
        if (parent?.classList?.contains('widget-slot') && parent.firstElementChild === this) {
          const w = widths[parent.getAttribute('data-widget')]
          if (w !== undefined) return w
        }
        return realOffsetWidth.call(this)
      },
    })
  })
  afterEach(() => {
    if (own) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', own)
    else delete HTMLElement.prototype.offsetWidth
  })

  const slot = (container, key) => container.querySelector(`[data-testid="widget-${key}"]`)
  const transformOf = (container, key) => slot(container, key).style.transform

  it('a widget no wider than its slot is not moved', async () => {
    widths = { battle: 440, driver: 620, updates: 520 }
    const { container } = render(AllView, { snapshot: named, config: cfg({ nameStyle: 'full' }) })
    await settle()
    for (const key of ['battle', 'driver']) expect(transformOf(container, key), key).toBe('')
  })

  it('a grown widget that still fits the canvas keeps its left edge', async () => {
    // Default driver slot: x 48, w 620. 900 px ends at 948, well inside 1920.
    widths = { driver: 900, battle: 700 }
    const { container } = render(AllView, { snapshot: longOnCamera, config: cfg({ nameStyle: 'full' }) })
    await settle()
    expect(transformOf(container, 'driver')).toBe('')
    expect(transformOf(container, 'battle')).toBe('')
    // The stored geometry is untouched.
    expect(slot(container, 'driver').style.left).toBe('48px')
    expect(slot(container, 'driver').style.width).toBe('620px')
  })

  it('a grown widget that would pass the canvas edge shifts left by the overflow', async () => {
    // Battle slot moved to x 1700 (w 440, ends 2140): a 600 px box would end at 2300; the
    // slot itself already ends past 1920, so the box keeps the slot's right edge: 1540.
    // L = max(min(1700, 0), 1700 - max(0, 1700 + 600 - max(1920, 2140))) = 1540.
    widths = { battle: 600 }
    const { container } = render(AllView, {
      snapshot: longOnCamera,
      config: cfg({ nameStyle: 'full' }, { battle: { x: 1700 } }),
    })
    await settle()
    expect(transformOf(container, 'battle')).toBe('translateX(-160px)')
    expect(slot(container, 'battle').style.left).toBe('1700px')
    expect(slot(container, 'battle').style.width).toBe('440px')
  })

  it('the race update card at its default slot shifts left to stay on the canvas', async () => {
    // Default updates slot: x 1376, w 520 (ends 1896). 600 px: 1376 - (1976 - 1920) = 1320.
    widths = { updates: 600 }
    const withNew = {
      ...structuredClone(raceEvents),
      race_events: [...structuredClone(raceEvents.race_events), { id: 'ev-106', type: 'penalty', driver_name: LONG, penalty: '+5s' }],
    }
    const view = render(AllView, { snapshot: raceEvents, config: cfg({ nameStyle: 'full' }) })
    await settle()
    await view.rerender({ snapshot: withNew })
    await settle()
    expect(transformOf(view.container, 'updates')).toBe('translateX(-56px)')
  })

  it('places a widget that grew in short style the same way (a short form wider than W.WWW)', async () => {
    // Rules 113-115: a short form wider than the reference widens its widget, and placement
    // does not depend on the style.
    widths = { updates: 600 }
    const withNew = {
      ...structuredClone(raceEvents),
      race_events: [...structuredClone(raceEvents.race_events), { id: 'ev-106', type: 'penalty', driver_name: 'Jan Aßmann', penalty: '+5s' }],
    }
    const view = render(AllView, { snapshot: raceEvents, config: cfg({ nameStyle: 'short' }) })
    await settle()
    await view.rerender({ snapshot: withNew })
    await settle()
    expect(textOf(view.container, SEL.update)).toBe('J.ASSM')
    expect(transformOf(view.container, 'updates')).toBe('translateX(-56px)')
  })

  it('the qualifying card in a slot running past the canvas keeps the slot right edge', async () => {
    // x 1200, w 840 (ends 2040 > 1920). 900 px: 1200 - (2100 - 2040) = 1140.
    widths = { qualifying: 900 }
    const { container } = render(AllView, {
      snapshot: qualifying,
      config: cfg({ nameStyle: 'full' }, { qualifying: { x: 1200 } }),
    })
    await settle()
    expect(transformOf(container, 'qualifying')).toBe('translateX(-60px)')
  })

  it('the HUD grows about its slot centre, then shifts left at the canvas edge', async () => {
    // Slot x 1500, w 400: a 600 px HUD centred starts at 1400 and ends at 2000, 80 past 1920.
    widths = { onboard: 600 }
    const { container } = render(AllView, {
      snapshot: longOnCamera,
      config: cfg({ nameStyle: 'full' }, { onboard: { x: 1500 } }),
    })
    await settle()
    expect(transformOf(container, 'onboard')).toBe('translateX(-80px)')
  })

  it('never moves a widget left of the canvas edge', async () => {
    // Battle slot at x 0, w 440: a 2000 px box (wider than the canvas) starts at 0.
    widths = { battle: 2000 }
    const { container } = render(AllView, {
      snapshot: longOnCamera,
      config: cfg({ nameStyle: 'full' }, { battle: { x: 0 } }),
    })
    await settle()
    expect(transformOf(container, 'battle')).toBe('')
  })

  it('follows the names with no hold: a narrower name moves the widget back', async () => {
    widths = { battle: 600 }
    const view = render(AllView, {
      snapshot: longOnCamera,
      config: cfg({ nameStyle: 'full' }, { battle: { x: 1700 } }),
    })
    await settle()
    expect(transformOf(view.container, 'battle')).toBe('translateX(-160px)')
    widths = { battle: 440 }
    await view.rerender({ snapshot: named })
    await settle()
    expect(transformOf(view.container, 'battle')).toBe('')
  })

  it('never moves the tower (rules 48 and 116 place it)', async () => {
    widths = { tower: 900 }
    const { container } = render(AllView, {
      snapshot: longOnCamera,
      config: cfg({ nameStyle: 'full' }, { tower: { x: 1500 } }),
    })
    await settle()
    expect(transformOf(container, 'tower')).toBe('')
  })
})

describe('AllView — full-style tower width (rule 48)', () => {
  const minWidth = (container) => towerRoot(container).style.minWidth
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
    // Longest full name 'M. Verstappen' = 130px, under the 400 default w (overlay-config rule 45).
    const { container } = render(AllView, { snapshot: named, config: normalizeConfig({ theme: { nameStyle: 'full' } }) })
    await settle()
    expect(minWidth(container)).toBe('400px')
  })

  it("grows past the slot's w when a full name needs more", async () => {
    const config = normalizeConfig({ theme: { nameStyle: 'full' }, widgets: { tower: { w: 100 } } })
    const { container } = render(AllView, { snapshot: named, config })
    await settle()
    // The slot keeps its configured w; only the tower inside it grows.
    expect(container.querySelector('[data-testid="widget-tower"]').style.width).toBe('100px')
    expect(minWidth(container)).toBe('130px')
  })

  it('a stored tower nameStyle: full still grows the tower (migration)', async () => {
    const config = normalizeConfig({ widgets: { tower: { nameStyle: 'full', w: 100 } } })
    const { container } = render(AllView, { snapshot: named, config })
    await settle()
    expect(minWidth(container)).toBe('130px')
  })

  it("resets when the tower's textScale changes", async () => {
    const config = normalizeConfig({ theme: { nameStyle: 'full' }, widgets: { tower: { w: 100 } } })
    const view = render(AllView, { snapshot: LONG_NAMED, config })
    await settle()
    // 'M. Gonzalez-Hernandez' = 210px; it holds after the car leaves (grow only).
    expect(minWidth(view.container)).toBe('210px')
    await view.rerender({ snapshot: named })
    await settle()
    expect(minWidth(view.container)).toBe('210px')

    // A text-size preset with the same w (set directly, not through the editor's widening).
    await view.rerender({
      config: normalizeConfig({ theme: { nameStyle: 'full' }, widgets: { tower: { w: 100, textScale: 'large' } } }),
    })
    await settle()
    expect(minWidth(view.container)).toBe('130px')
  })
})
