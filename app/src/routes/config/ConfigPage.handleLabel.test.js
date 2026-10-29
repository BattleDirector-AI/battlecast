import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* Where a drag handle's key label sits (overlay-config.md rules 65–66, how/config-editor.md
 * "Preview"). The label sits just above its widget's top-left corner, so it never covers the
 * widget, and falls inside only when the widget's `y` leaves less than the label's 24 canvas px
 * above it. The labels live in one layer above every handle, each with its own move handler.
 * Placement (`data-placement`), position (inline `left`/`top` in canvas px) and the layer's
 * `z-index` are all written in the markup, so these tests read them there, step by step through
 * typed edits and a live drag.
 *
 * happy-dom does no layout and applies no component stylesheet. The fixed size and the
 * pointer-events declarations are read from the component's own <style> (Vite `?raw`), as
 * ConfigPage.previewTheme.test.js does. What only a real browser proves is NOT held here: the
 * painted edges (an above label's rect bottom on the handle's rect top, lefts equal; an inside
 * label's tops and lefts equal), the rendered 24px height, and that a press at a label's centre
 * hits the label (`elementFromPoint`). */
vi.mock('../../lib/configApi.js', () => ({
  serverAvailable: vi.fn(async () => true),
  listProfiles: vi.fn(async () => []),
  listLogos: vi.fn(async () => []),
  getProfile: vi.fn(),
  saveProfile: vi.fn(async () => ({ saved: true })),
  uploadLogo: vi.fn(),
  deleteLogo: vi.fn(async () => true),
  deleteProfile: vi.fn(async () => true),
}))

import ConfigPage from './ConfigPage.svelte'
import configSource from './ConfigPage.svelte?raw'
import { FakeEventSource } from '../../lib/testing/fakeEventSource.js'
import { DEFAULT_CONFIG } from '../../lib/overlayConfig.js'

beforeEach(() => {
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

async function settle() {
  for (let i = 0; i < 5; i++) await tick()
}

const input = (c, field, key = 'tower') => c.querySelector(`[data-testid="${field}-${key}"]`)
const value = (c, field, key = 'tower') => Number(input(c, field, key).value)

async function type(c, field, v, key = 'tower') {
  await fireEvent.input(input(c, field, key), { target: { value: String(v) } })
  await fireEvent.change(input(c, field, key)) // a typed value applies on commit (rule 44)
  await tick()
}

function label(c, key = 'tower') {
  const el = c.querySelector(`[data-testid="label-${key}"]`)
  expect(el, `no key label for ${key} in the preview`).toBeTruthy()
  return el
}
/** Placement plus the inline canvas-px position the markup writes. */
const where = (c, key = 'tower') => {
  const el = label(c, key)
  return [el.getAttribute('data-placement'), el.style.left, el.style.top]
}

/** The preview's screen→canvas scale, so pointer offsets land on exact canvas pixels. */
function previewScale(c) {
  const m = /scale\(([\d.]+)\)/.exec(c.querySelector('.preview__canvas').style.transform)
  expect(m, 'preview canvas has no scale transform').toBeTruthy()
  return Number(m[1])
}

const POINTER = 1
async function press(c, el, dx = 0, dy = 0) {
  const s = previewScale(c)
  await fireEvent.pointerDown(el, { pointerId: POINTER, clientX: dx * s, clientY: dy * s })
  await tick()
}
async function moveTo(c, dx, dy) {
  const s = previewScale(c)
  await fireEvent.pointerMove(window, { buttons: 1, pointerId: POINTER, clientX: dx * s, clientY: dy * s })
  await tick()
}
async function release() {
  await fireEvent.pointerUp(window, { pointerId: POINTER, clientX: 0, clientY: 0 })
  await tick()
}

/** Flat rules of the component's own <style>: [{ selectors, decls }]. */
const STYLE = (/<style>([\s\S]*?)<\/style>/.exec(configSource)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
const RULES = [...STYLE.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selectors: m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
  decls: new Map(
    m[2]
      .split(';')
      .filter((p) => p.includes(':'))
      .map((p) => [p.slice(0, p.indexOf(':')).trim(), p.slice(p.indexOf(':') + 1).trim().replace(/\s+/g, ' ')]),
  ),
}))
const decl = (selector, prop) =>
  RULES.findLast((r) => r.selectors.includes(selector) && r.decls.has(prop))?.decls.get(prop)

describe('the key label sits above its widget unless the widget is at the canvas top (rule 65)', () => {
  it('in the default layout every visible label sits above its widget, at x and y − 24', async () => {
    const { container: c } = render(ConfigPage)
    await settle()
    const visible = Object.entries(DEFAULT_CONFIG.widgets).filter(([, w]) => w.visible)
    // Guard: the defaults this rule speaks of — every visible y is 24 or more, top band at 24.
    expect(visible.length, 'guard: default widgets found').toBeGreaterThan(5)
    expect(visible.filter(([, w]) => w.y === 24).map(([k]) => k)).toEqual(
      expect.arrayContaining(['tower', 'battle', 'racecontrol', 'updates']),
    )
    const got = Object.fromEntries(visible.map(([k]) => [k, where(c, k)]))
    expect(got).toEqual(Object.fromEntries(visible.map(([k, w]) => [k, ['above', `${w.x}px`, `${w.y - 24}px`]])))
  })

  it('falls inside (at x, y) below y 24 and sits above (at x, y − 24) from 24 on, whatever x, w and h are', async () => {
    const { container: c } = render(ConfigPage)
    await settle()
    await type(c, 'x', 600)
    const seen = []
    for (const y of [0, 1, 23, 24, 25, 150, 23]) {
      await type(c, 'y', y)
      expect(value(c, 'y'), `guard: tower y took ${y}`).toBe(y)
      seen.push([y, ...where(c)])
    }
    expect(seen).toEqual([
      [0, 'inside', '600px', '0px'],
      [1, 'inside', '600px', '1px'],
      [23, 'inside', '600px', '23px'],
      [24, 'above', '600px', '0px'],
      [25, 'above', '600px', '1px'],
      [150, 'above', '600px', '126px'],
      [23, 'inside', '600px', '23px'],
    ])

    // Nothing but y moves the placement: at y 24, a far-right x, a narrow w and a short h keep it
    // above, and at y 0 they keep it inside. The label follows x.
    await type(c, 'y', 24)
    await type(c, 'w', 40)
    await type(c, 'h', 30)
    await type(c, 'x', 1880)
    expect(where(c), 'at y 24 after x/w/h edits').toEqual(['above', '1880px', '0px'])
    await type(c, 'y', 0)
    expect(where(c), 'at y 0 after x/w/h edits').toEqual(['inside', '1880px', '0px'])
  })

  it('follows y at every pointer step of a live drag', async () => {
    const { container: c } = render(ConfigPage)
    await settle()
    await type(c, 'x', 600)
    await type(c, 'y', 100)
    expect(where(c), 'before the drag').toEqual(['above', '600px', '76px'])

    await press(c, c.querySelector('[data-testid="handle-tower"]'))
    const steps = []
    for (const dy of [-76, -77, -100, -76, 0]) {
      await moveTo(c, 0, dy)
      steps.push([value(c, 'y'), ...where(c)])
    }
    await release()
    expect(steps).toEqual([
      [24, 'above', '600px', '0px'],
      [23, 'inside', '600px', '23px'],
      [0, 'inside', '600px', '0px'],
      [24, 'above', '600px', '0px'],
      [100, 'above', '600px', '76px'],
    ])
  })

  it('is one fixed-size line in canvas pixels, drawn inside the scaled canvas', async () => {
    expect({
      height: decl('.handle__label', 'height'),
      'line-height': decl('.handle__label', 'line-height'),
      padding: decl('.handle__label', 'padding'),
      'font-size': decl('.handle__label', 'font-size'),
      'white-space': decl('.handle__label', 'white-space'),
    }).toEqual({ height: '24px', 'line-height': '24px', padding: '0 8px', 'font-size': '22px', 'white-space': 'nowrap' })

    // Canvas pixels: the label is a descendant of the canvas the preview scales.
    const { container: c } = render(ConfigPage)
    await settle()
    expect(label(c).closest('.preview__canvas')).toBe(c.querySelector('.preview__canvas'))
    expect(c.querySelector('.preview__canvas').style.transform).toMatch(/^scale\([\d.]+\)$/)
  })

  it('paints in one layer above every handle, in widget z order within it', async () => {
    const { container: c } = render(ConfigPage)
    await settle()
    const layer = c.querySelector('[data-testid="handle-labels"]')
    expect(layer, 'no label layer in the preview').toBeTruthy()
    expect(layer.parentElement).toBe(c.querySelector('.preview__canvas'))

    const handles = [...c.querySelectorAll('[data-testid^="handle-"]:not([data-testid="handle-labels"])')]
    expect(handles.length, 'guard: handles rendered').toBeGreaterThan(5)
    const top = Math.max(...handles.map((h) => Number(h.style.zIndex)))
    expect(Number(layer.style.zIndex), 'layer z-index vs the highest handle').toBe(top + 1)

    // Every label is in the layer, none in a handle, and orders as its handle does.
    for (const h of handles) {
      const key = h.dataset.testid.slice('handle-'.length)
      expect(h.querySelector('.handle__label'), `${key}'s handle holds a label`).toBeNull()
      expect(label(c, key).parentElement, `${key}'s label is in the layer`).toBe(layer)
      expect(label(c, key).style.zIndex, `${key}'s label order`).toBe(h.style.zIndex)
    }

    // Raising a widget's z raises the layer with it.
    await type(c, 'z', 50)
    expect(Number(layer.style.zIndex), 'layer after tower z 50').toBe(151)
  })
})

describe('the key label moves its own widget, with one look (rule 66)', () => {
  it('a press on the label moves its own widget, never resizes it, at either placement', async () => {
    const { container: c } = render(ConfigPage)
    await settle()
    await type(c, 'x', 600)
    await type(c, 'y', 120)
    await press(c, label(c))
    await moveTo(c, 40, 30)
    expect([value(c, 'x'), value(c, 'y'), value(c, 'w'), value(c, 'h')], 'from y 120').toEqual([640, 150, 400, 900])
    await release()

    await type(c, 'y', 0)
    await press(c, label(c))
    await moveTo(c, -50, 60)
    expect([value(c, 'x'), value(c, 'y'), value(c, 'w'), value(c, 'h')], 'from y 0').toEqual([590, 60, 400, 900])
    await release()
  })

  it('a press on a label over another widget moves the label’s widget, not the one beneath', async () => {
    // Default layout: driver's label (y 876–900) lies over qualifying (z 5, y 788–888) and tower.
    const { container: c } = render(ConfigPage)
    await settle()
    const before = ['qualifying', 'tower'].map((k) => [value(c, 'x', k), value(c, 'y', k)])
    await press(c, label(c, 'driver'))
    await moveTo(c, 20, -10)
    expect([value(c, 'x', 'driver'), value(c, 'y', 'driver')]).toEqual([68, 890])
    expect(['qualifying', 'tower'].map((k) => [value(c, 'x', k), value(c, 'y', k)]), 'neighbours untouched').toEqual(before)
    await release()
  })

  it('no label rule lets a press pass through, and the layer itself blocks nothing', () => {
    const offenders = RULES.filter((r) => r.selectors.some((s) => /\.handle__label\b/.test(s)))
      .filter((r) => r.decls.get('pointer-events') === 'none')
      .map((r) => r.selectors.join(', '))
    expect(offenders).toEqual([])
    expect(decl('.handle__label', 'pointer-events')).toBe('auto')
    expect(decl('.handle-labels', 'pointer-events')).toBe('none')
  })

  it('the layer and its labels are positioned, so the inline z-index and offsets take effect', () => {
    // A static layer ignores its z-index and paints under the positioned handles, which then
    // cover the labels again; a static label ignores its inline left/top.
    expect({
      layer: [decl('.handle-labels', 'position'), decl('.handle-labels', 'inset')],
      label: decl('.handle__label', 'position'),
    }).toEqual({ layer: ['absolute', '0'], label: 'absolute' })
  })

  it('hovering, pressing or dragging changes nothing about the label (placement and position aside)', async () => {
    const { container: c } = render(ConfigPage)
    await settle()
    await type(c, 'x', 600)
    await type(c, 'y', 120)
    const snapshot = () => {
      const el = label(c)
      const attrs = [...el.attributes]
        .filter((a) => a.name !== 'data-placement' && a.name !== 'style')
        .map((a) => `${a.name}=${a.value}`)
        .sort()
      return { text: el.textContent, attrs, opacity: el.style.opacity, zIndex: el.style.zIndex }
    }
    const idle = snapshot()
    expect(idle.text).toBe('tower')

    const h = c.querySelector('[data-testid="handle-tower"]')
    for (const target of [h, label(c)]) {
      await fireEvent.pointerEnter(target)
      await fireEvent.pointerOver(target)
      expect(snapshot(), 'hovered').toEqual(idle)
      await press(c, target)
      expect(snapshot(), 'pressed').toEqual(idle)
      await moveTo(c, 10, 10)
      expect(snapshot(), 'dragging').toEqual(idle)
      await release()
      expect(snapshot(), 'released').toEqual(idle)
    }

    // And no stylesheet rule gives a handle or its label a state look.
    const stateful = RULES.flatMap((r) => r.selectors).filter(
      (s) => /\.handle\b|\.handle__|\.handle-labels/.test(s) && /:(?:hover|active|focus|focus-visible|focus-within)\b|--(?:selected|active|dragging)\b/.test(s),
    )
    expect(stateful).toEqual([])
  })
})
