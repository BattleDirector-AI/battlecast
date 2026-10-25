import { describe, it, expect } from 'vitest'
import { normalizeConfig, WIDGET_KEYS } from './overlayConfig.js'

// The race update box's profile entry (overlay-config.md rule 50, ADR 0023): the `updates`
// widget, its default geometry, and its own dwellSeconds default and range.
const dwell = (v) =>
  normalizeConfig({ widgets: { updates: { dwellSeconds: v } } }).widgets.updates?.dwellSeconds

describe('normalizeConfig — the updates widget (rule 50)', () => {
  it('is a widget key with its default geometry, visible, at an 8 s dwell', () => {
    expect(WIDGET_KEYS).toContain('updates')
    expect(normalizeConfig({}).widgets.updates).toMatchObject({
      visible: true,
      x: 1376,
      y: 24,
      w: 520,
      h: 120,
      z: 8,
      dwellSeconds: 8,
    })
  })

  it('gives a profile saved before the widget existed the defaults, leaving its other widgets alone', () => {
    const cfg = normalizeConfig({ widgets: { driver: { dwellSeconds: 4, x: 100 } } })
    expect(cfg.widgets.updates).toMatchObject({ visible: true, x: 1376, dwellSeconds: 8 })
    expect(cfg.widgets.driver).toMatchObject({ dwellSeconds: 4, x: 100 })
  })

  it.each([
    [2, 2],
    [60, 60],
    [7.5, 7.5],
    ['7.5', 7.5],
    [' 12 ', 12],
  ])('stores a valid dwell from 2 to 60: %j → %j', (input, stored) => {
    expect(dwell(input)).toBe(stored)
  })

  it.each([
    ['below 2', 1.9],
    ['1', 1],
    ['0', 0],
    ['negative', -3],
    ['above 60', 60.5],
    ['90', 90],
    ['a blank string', '  '],
    ['null', null],
    ['true', true],
    ['[5]', [5]],
    ['a non-numeric string', 'abc'],
    ['NaN', Number.NaN],
    ['absent', undefined],
  ])('replaces a dwell that is %s with the 8 s default', (_label, input) => {
    expect(dwell(input)).toBe(8)
  })

  it("leaves every other widget's dwellSeconds on rule 46 (default 6, any number above 0)", () => {
    const cfg = normalizeConfig({ widgets: { driver: { dwellSeconds: 1 }, qualifying: { dwellSeconds: 90 } } })
    expect(cfg.widgets.driver.dwellSeconds).toBe(1)
    expect(cfg.widgets.qualifying.dwellSeconds).toBe(90)
    expect(normalizeConfig({}).widgets.driver.dwellSeconds).toBe(6)
  })
})
