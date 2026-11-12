import { describe, it, expect } from 'vitest'
import { normalizeConfig, WIDGET_KEYS, PLATE_WIDGET_KEYS, TEXT_WIDGET_KEYS } from './overlayConfig.js'

// The replay widget's profile entry (overlay-config.md rules 23, 40, 70; widgets.md rule 120;
// ADR 0039).

describe('normalizeConfig — the replay widget (rule 70)', () => {
  it('is a widget key with its default geometry, visible', () => {
    expect(WIDGET_KEYS).toContain('replay')
    expect(normalizeConfig({}).widgets.replay).toMatchObject({
      visible: true,
      x: 1656,
      y: 168,
      w: 240,
      h: 56,
      z: 11,
    })
  })

  it('a profile saved before the widget existed gets the defaults, and configVersion stays "1"', () => {
    const old = { configVersion: '1', widgets: { tower: { x: 10 }, weather: { visible: false } } }
    const out = normalizeConfig(old)
    expect(out.configVersion).toBe('1')
    expect(out.widgets.replay).toMatchObject({ visible: true, x: 1656, y: 168, w: 240, h: 56, z: 11 })
    expect(out.widgets.tower.x).toBe(10)
  })

  it('keeps saved replay geometry', () => {
    const out = normalizeConfig({ widgets: { replay: { x: 40, y: 600, w: 200, h: 50, z: 30, visible: false } } })
    expect(out.widgets.replay).toMatchObject({ x: 40, y: 600, w: 200, h: 50, z: 30, visible: false })
  })

  it('overlaps no other default widget, hidden ones included', () => {
    const { widgets, canvas } = normalizeConfig({})
    const r = widgets.replay
    expect(r.x + r.w, 'runs off the canvas').toBeLessThanOrEqual(canvas.w)
    expect(r.y + r.h, 'runs off the canvas').toBeLessThanOrEqual(canvas.h)
    for (const key of WIDGET_KEYS.filter((k) => k !== 'replay')) {
      const o = widgets[key]
      const apart = r.x + r.w <= o.x || o.x + o.w <= r.x || r.y + r.h <= o.y || o.y + o.h <= r.y
      expect(apart, `the replay badge overlaps ${key}`).toBe(true)
    }
  })

  it('aligns its right edge with the race update box, with room for its handle label under it', () => {
    const { widgets } = normalizeConfig({})
    expect(widgets.replay.x + widgets.replay.w).toBe(widgets.updates.x + widgets.updates.w)
    // Rule 70 / rule 65: the 24px handle label above the badge (y 144-168) overlaps no widget.
    const LABEL_H = 24
    const label = { x: widgets.replay.x, y: widgets.replay.y - LABEL_H, w: widgets.replay.w, h: LABEL_H }
    expect(label.y).toBeGreaterThanOrEqual(widgets.updates.y + widgets.updates.h)
    for (const [key, o] of Object.entries(widgets)) {
      if (key === 'replay') continue
      const apart = label.x + label.w <= o.x || o.x + o.w <= label.x || label.y + label.h <= o.y || o.y + o.h <= label.y
      expect(apart, `the replay handle label overlaps ${key}`).toBe(true)
    }
  })

  it('is a plate-rendering widget (rule 23) and a text-rendering widget (rule 40)', () => {
    expect(PLATE_WIDGET_KEYS).toContain('replay')
    expect(TEXT_WIDGET_KEYS).toContain('replay')
    // Rule 23: ten plate widgets, logos the only widget without a plate.
    expect(PLATE_WIDGET_KEYS).toHaveLength(10)
    expect(WIDGET_KEYS.filter((k) => !PLATE_WIDGET_KEYS.includes(k))).toEqual(['logos'])
    expect(WIDGET_KEYS.filter((k) => !TEXT_WIDGET_KEYS.includes(k))).toEqual(['logos'])
  })
})
