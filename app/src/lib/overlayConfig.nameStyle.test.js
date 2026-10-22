import { describe, it, expect } from 'vitest'
import { normalizeConfig, DEFAULT_CONFIG, WIDGET_KEYS } from './overlayConfig.js'
import { FIELD_HELP } from './configHelp.js'

// `nameStyle` — the tower's driver-name style (overlay-config.md rules 42-43, ADR 0018).
const nameStyle = (v) => normalizeConfig({ widgets: { tower: { nameStyle: v } } }).widgets.tower.nameStyle

describe('normalizeConfig — tower nameStyle (rule 42)', () => {
  it('defaults to short, in the built-in default and on a profile without the key', () => {
    expect(DEFAULT_CONFIG.widgets.tower.nameStyle).toBe('short')
    expect(normalizeConfig({}).widgets.tower.nameStyle).toBe('short')
    expect(normalizeConfig({ widgets: { tower: { x: 10 } } }).widgets.tower.nameStyle).toBe('short')
  })

  it('is normalized onto every widget for a uniform shape', () => {
    const widgets = normalizeConfig({}).widgets
    for (const key of WIDGET_KEYS) expect(widgets[key].nameStyle, key).toBe('short')
  })

  it('keeps exactly "short" or "full"', () => {
    expect(nameStyle('full')).toBe('full')
    expect(nameStyle('short')).toBe('short')
  })

  it.each([
    ['another case', 'Full'],
    ['upper case', 'FULL'],
    ['padded', ' full '],
    ['an unknown string', 'long'],
    ['null', null],
    ['a number', 1],
    ['a boolean', true],
    ['an object', { style: 'full' }],
  ])('replaces %s with short', (_label, value) => {
    expect(nameStyle(value)).toBe('short')
  })
})

describe('configHelp — nameStyle copy (rules 16, 43)', () => {
  it('explains that full names make the tower grow wider and can run past the source edge', () => {
    const copy = FIELD_HELP.nameStyle
    expect(copy, 'no help copy for nameStyle').toBeTruthy()
    expect(copy.toLowerCase()).toMatch(/short/)
    expect(copy.toLowerCase()).toMatch(/full/)
    expect(copy.toLowerCase()).toMatch(/wider/)
    expect(copy.toLowerCase()).toMatch(/edge/)
  })
})
