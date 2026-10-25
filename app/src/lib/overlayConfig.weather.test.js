import { describe, it, expect } from 'vitest'
import { normalizeConfig, DEFAULT_CONFIG, WIDGET_KEYS, PLATE_WIDGET_KEYS, TEXT_WIDGET_KEYS } from './overlayConfig.js'

// The weather profile entries (overlay-config.md rules 54, 55, 57; ADR 0025): `tempUnit` on
// every widget, the `weather` widget's defaults, and the `info` widget's `weatherCard`.
const unit = (key, v) => normalizeConfig({ widgets: { [key]: { tempUnit: v } } }).widgets[key]?.tempUnit
const card = (v) => normalizeConfig({ widgets: { info: { weatherCard: v } } }).widgets.info?.weatherCard

describe('normalizeConfig — tempUnit (rule 54)', () => {
  it('defaults to c on every widget', () => {
    const { widgets } = normalizeConfig({})
    for (const key of WIDGET_KEYS) expect(widgets[key].tempUnit, key).toBe('c')
  })

  it.each(['c', 'f'])('keeps %s', (v) => {
    expect(unit('weather', v)).toBe(v)
    expect(unit('info', v)).toBe(v)
  })

  it.each([
    ['another case', 'F'],
    ['padded', ' f '],
    ['a word', 'fahrenheit'],
    ['empty', ''],
    ['null', null],
    ['true', true],
    ['a number', 1],
  ])('replaces a tempUnit that is %s with c', (_label, v) => {
    expect(unit('weather', v)).toBe('c')
  })
})

describe('normalizeConfig — the weather widget (rule 55)', () => {
  it('is a widget key with its default geometry, visible', () => {
    expect(WIDGET_KEYS).toContain('weather')
    expect(normalizeConfig({}).widgets.weather).toMatchObject({
      visible: true,
      x: 900,
      y: 80,
      w: 360,
      h: 44,
      z: 10,
      tempUnit: 'c',
    })
  })

  it('overlaps no other default widget, hidden ones included', () => {
    const me = DEFAULT_CONFIG.widgets.weather
    expect(me, 'no weather widget in DEFAULT_CONFIG').toBeTruthy()
    for (const [key, o] of Object.entries(DEFAULT_CONFIG.widgets)) {
      if (key === 'weather') continue
      const apart = me.x >= o.x + o.w || o.x >= me.x + me.w || me.y >= o.y + o.h || o.y >= me.y + me.h
      expect(apart, `the weather box overlaps ${key}`).toBe(true)
    }
  })

  it('is a plate-rendering and text-rendering widget (rules 23, 40)', () => {
    expect(PLATE_WIDGET_KEYS).toContain('weather')
    expect(TEXT_WIDGET_KEYS).toContain('weather')
  })

  it('gives a profile saved before the widget existed the defaults, leaving its other widgets alone', () => {
    const cfg = normalizeConfig({ widgets: { info: { x: 100, lines: ['A'] } } })
    expect(cfg.widgets.weather).toMatchObject({ visible: true, x: 900, y: 80 })
    expect(cfg.widgets.info).toMatchObject({ x: 100, lines: ['A'] })
  })
})

describe('normalizeConfig — the info widget’s weatherCard (rule 57)', () => {
  it('defaults to false: the weather box already shows the weather by default', () => {
    expect(normalizeConfig({}).widgets.info.weatherCard).toBe(false)
    expect(normalizeConfig({}).widgets.weather.visible).toBe(true)
  })

  it.each([
    [true, true],
    [false, false],
  ])('keeps a boolean %j', (v, kept) => {
    expect(card(v)).toBe(kept)
  })

  it.each([
    ['the string "true"', 'true'],
    ['1', 1],
    ['null', null],
    ['an object', {}],
  ])('replaces a weatherCard that is %s with false', (_label, v) => {
    expect(card(v)).toBe(false)
  })

  it('is carried by the info widget only: no other widget, known or unknown, has a weatherCard key', () => {
    const cfg = normalizeConfig({
      widgets: { weather: { weatherCard: true }, tower: { weatherCard: true }, future: { weatherCard: true } },
    })
    for (const key of Object.keys(cfg.widgets)) {
      if (key === 'info') continue
      expect(cfg.widgets[key], key).not.toHaveProperty('weatherCard')
    }
    expect(cfg.widgets.info.weatherCard).toBe(false)
  })
})
