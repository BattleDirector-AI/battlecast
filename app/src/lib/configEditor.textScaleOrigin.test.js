import { describe, it, expect } from 'vitest'
import {
  setWidgetTextScale,
  moveWidget,
  resizeWidget,
  setWidgetField,
  setCanvas,
} from './configEditor.js'
import { normalizeConfig } from './overlayConfig.js'

/* Text size presets restore the widget's `normal` geometry exactly (#215):
 * overlay-config.md rules 41, 41a, 41b; ADR 0015 amendment. */

const at = (tower, canvas) =>
  normalizeConfig({ ...(canvas ? { canvas } : {}), widgets: { tower: { textScale: 'normal', ...tower } } })
const tower = (cfg) => cfg.widgets.tower
const pick = (cfg, ...presets) => presets.reduce((c, p) => setWidgetTextScale(c, 'tower', p), cfg)

describe('round trip through the presets (rule 41)', () => {
  it('a widget against the right edge comes back to its exact x and w', () => {
    const start = at({ x: 1500, w: 380 })
    const big = pick(start, 'larger')
    // Kept on canvas: 494 wide can't start at 1500 on a 1920 canvas.
    expect(tower(big).w).toBe(494)
    expect(tower(big).x).toBe(1920 - 494)
    const back = pick(big, 'normal')
    expect(tower(back).x).toBe(1500)
    expect(tower(back).w).toBe(380)
  })

  it('a width capped at the canvas comes back to its exact original width', () => {
    const start = at({ x: 0, w: 1000 }, { w: 1280, h: 720 })
    const big = pick(start, 'larger')
    expect(tower(big).w).toBe(1280)
    expect(tower(pick(big, 'normal')).w).toBe(1000)
  })

  it('odd widths do not drift: 23 -> large -> larger -> normal is 23', () => {
    const end = pick(at({ w: 23 }), 'large', 'larger', 'normal')
    expect(tower(end).w).toBe(23)
  })

  it('every bigger preset is computed from the origin, not the previous preset', () => {
    // 23 × 1.3 = 29.9 -> 30. Chained from large (26) it would be round(26 × 1.3 / 1.15) = 29.
    expect(tower(pick(at({ w: 23 }), 'large', 'larger')).w).toBe(30)
  })

  it('records the origin when leaving normal and removes it on return', () => {
    const big = pick(at({ x: 24, w: 380 }), 'large')
    expect(tower(big).textScaleOrigin).toEqual({ x: 24, w: 380 })
    expect(tower(pick(big, 'larger')).textScaleOrigin).toEqual({ x: 24, w: 380 })
    expect(tower(pick(big, 'normal')).textScaleOrigin ?? null).toBeNull()
  })

  it('never changes y or h', () => {
    const start = at({ y: 300, h: 600 })
    for (const p of ['large', 'larger', 'normal']) {
      const c = pick(start, p)
      expect(tower(c).y, p).toBe(300)
      expect(tower(c).h, p).toBe(600)
    }
  })
})

describe('editing geometry at a bigger preset moves the origin (rule 41a)', () => {
  it('dragging at larger: normal lands at the new x', () => {
    const moved = moveWidget(pick(at({ x: 24, w: 380 }), 'larger'), 'tower', 200, 24)
    const back = pick(moved, 'normal')
    expect(tower(back).x).toBe(200)
    expect(tower(back).w).toBe(380)
  })

  it('resizing at larger: normal is the new width ÷ 1.3', () => {
    const resized = resizeWidget(pick(at({ x: 24, w: 380 }), 'larger'), 'tower', 520, 600)
    expect(tower(resized).textScaleOrigin.w).toBe(400)
    expect(tower(pick(resized, 'normal')).w).toBe(400)
  })

  it('typing a width at large: normal is that width ÷ 1.15', () => {
    const typed = setWidgetField(pick(at({ x: 24, w: 380 }), 'large'), 'tower', 'w', 460)
    expect(tower(pick(typed, 'normal')).w).toBe(400)
  })

  it('typing an x at large: normal keeps it', () => {
    const typed = setWidgetField(pick(at({ x: 24, w: 380 }), 'large'), 'tower', 'x', 90)
    expect(tower(pick(typed, 'normal')).x).toBe(90)
  })

  it('a canvas change that clamps the widget does not rewrite the origin', () => {
    const big = pick(at({ x: 1500, w: 380 }), 'larger')
    const shrunk = setCanvas(big, { w: 1280, h: 720 })
    expect(tower(shrunk).textScaleOrigin).toEqual({ x: 1500, w: 380 })
  })
})

describe('the origin is saved but never rendered (rule 41b)', () => {
  it('survives a save + reload, so the round trip still lands exactly', () => {
    const big = pick(at({ x: 1500, w: 380 }), 'larger')
    const reloaded = normalizeConfig(JSON.parse(JSON.stringify(big)))
    expect(tower(reloaded).textScaleOrigin).toEqual({ x: 1500, w: 380 })
    expect(tower(pick(reloaded, 'normal')).x).toBe(1500)
  })

  it.each([
    ['on a normal widget', { textScale: 'normal', textScaleOrigin: { x: 1, w: 100 } }],
    ['non-numeric', { textScale: 'large', textScaleOrigin: { x: 'abc', w: 100 } }],
    ['missing w', { textScale: 'large', textScaleOrigin: { x: 1 } }],
    ['not an object', { textScale: 'large', textScaleOrigin: 7 }],
  ])('normalization drops an origin %s', (_label, w) => {
    expect(normalizeConfig({ widgets: { tower: w } }).widgets.tower.textScaleOrigin ?? null).toBeNull()
  })

  it('a hand-set w renders as stored, whatever the origin says', () => {
    const cfg = normalizeConfig({
      widgets: { tower: { textScale: 'larger', w: 600, textScaleOrigin: { x: 24, w: 380 } } },
    })
    expect(cfg.widgets.tower.w).toBe(600)
  })

  it('keeps only x and w: extra parts are not carried along', () => {
    const cfg = normalizeConfig({
      widgets: { tower: { textScale: 'large', textScaleOrigin: { x: 24, w: 380, y: 5, h: 9 } } },
    })
    expect(cfg.widgets.tower.textScaleOrigin).toEqual({ x: 24, w: 380 })
  })
})

describe('the origin lives only on a widget that renders text (rule 41b, #224)', () => {
  const originOn = (key, origin = { x: 100, w: 300 }) =>
    normalizeConfig({ widgets: { [key]: { textScale: 'large', textScaleOrigin: origin } } }).widgets[key]
      .textScaleOrigin ?? null

  it('drops a hand-authored origin on logos, which renders no text', () => {
    expect(originOn('logos')).toBeNull()
  })

  it('drops it on logos even at larger with string parts that would otherwise be coerced', () => {
    const cfg = normalizeConfig({
      widgets: { logos: { textScale: 'larger', textScaleOrigin: { x: '100', w: '300' } } },
    })
    expect(cfg.widgets.logos.textScaleOrigin ?? null).toBeNull()
    // The preset itself is still normalized onto logos (rule 40 withholds only the control).
    expect(cfg.widgets.logos.textScale).toBe('larger')
  })

  it('drops it on a widget key normalization does not know', () => {
    expect(originOn('futureWidget')).toBeNull()
  })

  it.each(['tower', 'battle', 'driver', 'qualifying', 'racecontrol', 'onboard'])(
    'keeps it on %s, which renders text',
    (key) => {
      expect(originOn(key)).toEqual({ x: 100, w: 300 })
    },
  )
})

describe('numeric-string origin parts are coerced like widget geometry (rule 41b, #224)', () => {
  const origin = (o) =>
    normalizeConfig({ widgets: { tower: { textScale: 'large', textScaleOrigin: o } } }).widgets.tower
      .textScaleOrigin ?? null

  it("turns { x: '1500', w: '380' } into the numbers 1500 and 380", () => {
    const o = origin({ x: '1500', w: '380' })
    expect(o).toEqual({ x: 1500, w: 380 })
    expect(typeof o.x).toBe('number')
    expect(typeof o.w).toBe('number')
  })

  it('coerces a string part next to a number part', () => {
    expect(origin({ x: 24, w: '380' })).toEqual({ x: 24, w: 380 })
    expect(origin({ x: '24', w: 380 })).toEqual({ x: 24, w: 380 })
  })

  it.each([
    [' 1500 ', 1500],
    ['1500.5', 1500.5],
    ['-12', -12],
    ['1e3', 1000],
    ['0x10', 16],
  ])('reads %j as %d, the same number a widget x of that string becomes', (s, n) => {
    expect(origin({ x: s, w: 380 })).toEqual({ x: n, w: 380 })
    // Same conversion as the widget's own geometry (rule 6).
    expect(normalizeConfig({ widgets: { tower: { x: s } } }).widgets.tower.x).toBe(n)
  })

  it('survives a reload: a profile saved with string parts round-trips back to normal exactly', () => {
    const loaded = normalizeConfig({
      // Neither part matches the no-origin fallback (x stays 1426, w is round(494 / 1.3) = 380),
      // so both assertions check that the string origin was kept.
      widgets: { tower: { textScale: 'larger', x: 1426, w: 494, textScaleOrigin: { x: '1300', w: '520' } } },
    })
    const back = setWidgetTextScale(loaded, 'tower', 'normal')
    expect(tower(back).x).toBe(1300)
    expect(tower(back).w).toBe(520)
  })

  it.each([
    ['an empty string', { x: '', w: 380 }],
    ['a whitespace-only string', { x: 24, w: '   ' }],
    ['a word', { x: 'abc', w: 380 }],
    ['a number followed by junk', { x: ' 12abc', w: 380 }],
    ['a unit suffix', { x: 24, w: '380px' }],
    ["'Infinity'", { x: 'Infinity', w: 380 }],
    ['null', { x: null, w: 380 }],
    ['a boolean', { x: true, w: 380 }],
    ['an array, though Number([1500]) is 1500', { x: [1500], w: 380 }],
    ['an object', { x: 24, w: {} }],
    ['one good string and one bad', { x: '1500', w: 'abc' }],
  ])('drops the whole origin when a part is %s', (_label, o) => {
    expect(origin(o)).toBeNull()
  })
})

describe('only the part of the geometry the broadcaster changed moves the origin (rule 41a, #221 review)', () => {
  // The /config drag handler calls moveWidget/resizeWidget on every pointermove, so these
  // must not rewrite the origin from geometry the clamp produced.
  const edgeAtLarger = () => pick(at({ x: 1500, w: 380 }), 'larger') // x clamped to 1426

  it('a vertical-only drag keeps the origin: normal still lands at x 1500', () => {
    const dragged = moveWidget(edgeAtLarger(), 'tower', 1426, 400)
    expect(tower(dragged).textScaleOrigin).toEqual({ x: 1500, w: 380 })
    expect(tower(pick(dragged, 'normal')).x).toBe(1500)
  })

  it('a zero-pixel move keeps the origin', () => {
    const big = edgeAtLarger()
    const jitter = moveWidget(big, 'tower', tower(big).x, tower(big).y)
    expect(tower(jitter).textScaleOrigin).toEqual({ x: 1500, w: 380 })
  })

  it('a height-only resize keeps the origin width', () => {
    const capped = pick(at({ x: 0, w: 1000 }, { w: 1280, h: 720 }), 'larger') // w capped at 1280
    const taller = resizeWidget(capped, 'tower', 1280, 500)
    expect(tower(pick(taller, 'normal')).w).toBe(1000)
  })

  it('typing a w the clamp answers by moving x leaves the origin x alone', () => {
    const big = pick(at({ x: 24, w: 380 }), 'large') // x 24, w 437
    const typed = setWidgetField(big, 'tower', 'w', 1900) // clamp moves x to 20
    expect(tower(typed).textScaleOrigin.x).toBe(24)
  })
})

describe('`from` is the widget where a preview drag began (rule 41c)', () => {
  // The /config drag handler passes the drag-start widget as `from` on every pointer step, so
  // each step is compared with the start, not with the previous step.
  const edgeAtLarger = () => pick(at({ x: 1500, w: 380 }), 'larger') // x 1426, origin x 1500

  it('moveWidget: away and back to the start x keeps the start origin', () => {
    const start = edgeAtLarger()
    const from = tower(start)
    const away = moveWidget(start, 'tower', 1400, from.y, from)
    expect(tower(away).textScaleOrigin).toEqual({ x: 1400, w: 380 })
    const back = moveWidget(away, 'tower', 1426, from.y, from)
    expect(tower(back).textScaleOrigin).toEqual({ x: 1500, w: 380 })
    // Without `from` the same step compares with the previous one and moves the origin.
    expect(tower(moveWidget(away, 'tower', 1426, from.y)).textScaleOrigin).toEqual({ x: 1426, w: 380 })
  })

  it('resizeWidget: narrower and back to the start w keeps the start origin width', () => {
    const start = pick(at({ x: 0, w: 1600 }), 'larger') // 2080, capped at 1920; origin w 1600
    const from = tower(start)
    expect(from.w).toBe(1920)
    const narrower = resizeWidget(start, 'tower', 1900, from.h, from)
    expect(tower(narrower).textScaleOrigin.w).toBe(Math.round(1900 / 1.3))
    const back = resizeWidget(narrower, 'tower', 1920, from.h, from)
    expect(tower(back).textScaleOrigin).toEqual({ x: 0, w: 1600 })
    expect(tower(resizeWidget(narrower, 'tower', 1920, from.h)).textScaleOrigin.w).toBe(Math.round(1920 / 1.3))
  })
})
