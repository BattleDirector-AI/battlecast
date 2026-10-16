import { describe, it, expect } from 'vitest'
import { normalizeConfig, WIDGET_KEYS } from './overlayConfig.js'

// `textScale` — per-widget text size preset (overlay-config.md rule 39, ADR 0015).
const scale = (v) =>
  normalizeConfig({ widgets: { tower: { textScale: v } } }).widgets.tower.textScale

describe('normalizeConfig — textScale (#188)', () => {
  it('defaults every widget to normal', () => {
    const cfg = normalizeConfig({})
    for (const key of WIDGET_KEYS) expect(cfg.widgets[key].textScale, key).toBe('normal')
  })

  it.each(['normal', 'large', 'larger'])('keeps the preset %s', (preset) => {
    expect(scale(preset)).toBe(preset)
  })

  it.each([
    ['an unknown preset', 'huge'],
    ['a different case', 'Large'],
    ['a number', 1.3],
    ['null', null],
    ['an object', {}],
  ])('replaces %s with normal', (_label, value) => {
    expect(scale(value)).toBe('normal')
  })

  it('never touches geometry: a hand-set w survives any preset', () => {
    const cfg = normalizeConfig({ widgets: { tower: { textScale: 'larger', w: 380 } } })
    expect(cfg.widgets.tower.w).toBe(380)
    expect(cfg.widgets.tower.textScale).toBe('larger')
  })
})
