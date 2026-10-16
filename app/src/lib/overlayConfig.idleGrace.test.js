import { describe, it, expect } from 'vitest'
import { normalizeConfig, WIDGET_KEYS } from './overlayConfig.js'

// `idleGraceSeconds` — the battle box exit grace (overlay-config.md rule 36, ADR 0013).
const grace = (v) =>
  normalizeConfig({ widgets: { battle: { idleGraceSeconds: v } } }).widgets.battle.idleGraceSeconds

describe('normalizeConfig — battle idleGraceSeconds (#204)', () => {
  it('defaults to 5 seconds', () => {
    expect(normalizeConfig({}).widgets.battle.idleGraceSeconds).toBe(5)
  })

  it('keeps a finite value inside [0, 30], including 0 (hold off) and fractions', () => {
    expect(grace(0)).toBe(0)
    expect(grace(12)).toBe(12)
    expect(grace(2.5)).toBe(2.5)
    expect(grace(30)).toBe(30)
  })

  it('clamps out-of-range numbers to [0, 30]', () => {
    expect(grace(-3)).toBe(0)
    expect(grace(99)).toBe(30)
  })

  it.each([
    ['absent', undefined],
    ['null', null],
    ['a string', '7'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['an object', {}],
  ])('replaces %s with the default', (_label, value) => {
    expect(grace(value)).toBe(5)
  })

  it('is normalized onto every widget for a uniform shape (rule 11)', () => {
    const cfg = normalizeConfig({})
    for (const key of WIDGET_KEYS) {
      expect(cfg.widgets[key].idleGraceSeconds, `${key}`).toBe(5)
    }
  })
})
