import { describe, it, expect } from 'vitest'
import { normalizeConfig, DEFAULT_CONFIG, WIDGET_KEYS } from './overlayConfig.js'

// `hideDuringReplay` — the battle box's replay hide (overlay-config.md rule 72, widgets.md
// rule 122, ADR 0040): a boolean, else false, carried by the `battle` widget only.
const hide = (v) =>
  normalizeConfig({ widgets: { battle: { hideDuringReplay: v } } }).widgets.battle.hideDuringReplay

describe('normalizeConfig — the battle widget’s hideDuringReplay (rule 72)', () => {
  it('is false by default, in an empty profile and in the built-in default', () => {
    expect(normalizeConfig({}).widgets.battle.hideDuringReplay).toBe(false)
    expect(normalizeConfig(DEFAULT_CONFIG).widgets.battle.hideDuringReplay).toBe(false)
  })

  it('keeps a boolean', () => {
    expect(hide(true)).toBe(true)
    expect(hide(false)).toBe(false)
  })

  it.each([
    ['the string "true"', 'true'],
    ['1', 1],
    ['null', null],
    ['an object', { on: true }],
    ['an array', [true]],
  ])('replaces a hideDuringReplay that is %s with false', (_label, v) => {
    expect(hide(v)).toBe(false)
  })

  it('is carried by the battle widget only: no other widget, known or unknown, has the key', () => {
    const others = Object.fromEntries(
      [...WIDGET_KEYS.filter((k) => k !== 'battle'), 'future'].map((k) => [k, { hideDuringReplay: true }]),
    )
    const cfg = normalizeConfig({ widgets: others })
    for (const key of Object.keys(cfg.widgets)) {
      if (key === 'battle') continue
      expect(cfg.widgets[key], key).not.toHaveProperty('hideDuringReplay')
    }
    expect(cfg.widgets.battle.hideDuringReplay).toBe(false)
  })
})
