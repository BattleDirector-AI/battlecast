import { describe, it, expect } from 'vitest'
import { normalizeConfig, DEFAULT_CONFIG, WIDGET_KEYS } from './overlayConfig.js'
import { FIELD_HELP } from './configHelp.js'

// `theme.nameStyle` — the overlay-wide driver-name style (overlay-config.md rules 42-43,
// widgets.md rules 111-116, ADRs 0018 and 0038). It replaces the tower-only
// `widgets.tower.nameStyle`, which a profile saved before still carries.
const nameStyle = (theme) => normalizeConfig({ theme: { nameStyle: theme } }).theme.nameStyle

const INVALID = [
  ['another case', 'Full'],
  ['upper case', 'FULL'],
  ['padded', ' full '],
  ['an unknown string', 'long'],
  ['an empty string', ''],
  ['null', null],
  ['a number', 1],
  ['a boolean', true],
  ['an array', ['full']],
  ['an object', { style: 'full' }],
]

describe('normalizeConfig — theme.nameStyle (rule 42)', () => {
  it('defaults to short: in the built-in default, with no theme, and with a theme lacking the key', () => {
    expect(DEFAULT_CONFIG.theme.nameStyle).toBe('short')
    expect(normalizeConfig({}).theme.nameStyle).toBe('short')
    expect(normalizeConfig({ theme: { classTags: 'hide' } }).theme.nameStyle).toBe('short')
  })

  it.each(['short', 'full'])('keeps exactly %s', (value) => {
    expect(nameStyle(value)).toBe(value)
  })

  it.each(INVALID)('replaces %s with short when the tower stores nothing', (_label, value) => {
    expect(nameStyle(value)).toBe('short')
  })

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['a number', 7],
  ])('a theme that is %s normalizes to short', (_label, theme) => {
    expect(normalizeConfig({ theme }).theme.nameStyle).toBe('short')
  })

  it('is overlay-wide: no normalized widget carries a nameStyle key', () => {
    const widgets = normalizeConfig({ theme: { nameStyle: 'full' }, widgets: { tower: { nameStyle: 'full' } } }).widgets
    for (const key of WIDGET_KEYS) expect(widgets[key], key).not.toHaveProperty('nameStyle')
    for (const key of WIDGET_KEYS) expect(DEFAULT_CONFIG.widgets[key], key).not.toHaveProperty('nameStyle')
  })

  it("leaves the theme's other keys as their own rules normalize them", () => {
    const others = { classTags: 'hide', preset: 'vintage80', classColors: { ' GT3 ': '#AABBCC', bad: 'red' } }
    const theme = normalizeConfig({ theme: { nameStyle: 'full', ...others } }).theme
    const without = normalizeConfig({ theme: others }).theme
    expect(theme.nameStyle).toBe('full')
    expect(theme.classTags).toBe(without.classTags)
    expect(theme.preset).toBe(without.preset)
    expect(theme.classColors).toEqual(without.classColors)
  })

  it('a saved value survives a second normalization (load → save → load)', () => {
    const once = normalizeConfig({ theme: { nameStyle: 'full' } })
    expect(normalizeConfig(JSON.parse(JSON.stringify(once))).theme.nameStyle).toBe('full')
  })
})

describe('normalizeConfig — a profile saved with the tower-only nameStyle (rule 42 migration)', () => {
  const legacy = (tower, theme) =>
    normalizeConfig({ ...(theme === undefined ? {} : { theme }), widgets: { tower: { nameStyle: tower } } }).theme
      .nameStyle

  it("takes the tower's full for the whole overlay when the theme has no style", () => {
    expect(legacy('full')).toBe('full')
    expect(legacy('full', {})).toBe('full')
    expect(legacy('full', { classTags: 'show' })).toBe('full')
  })

  it("takes the tower's short the same way", () => {
    expect(legacy('short')).toBe('short')
  })

  it.each(INVALID)("takes the tower's style when the theme's is %s", (_label, value) => {
    expect(legacy('full', { nameStyle: value })).toBe('full')
  })

  it("a valid theme style wins over the tower's", () => {
    expect(legacy('full', { nameStyle: 'short' })).toBe('short')
    expect(legacy('short', { nameStyle: 'full' })).toBe('full')
  })

  it.each(INVALID)('an invalid tower style (%s) falls through to short', (_label, value) => {
    expect(legacy(value)).toBe('short')
  })

  it('the migrated style survives a save and reload, with the tower key gone', () => {
    const once = normalizeConfig({ widgets: { tower: { nameStyle: 'full' } } })
    const saved = JSON.parse(JSON.stringify(once))
    expect(saved.widgets.tower).not.toHaveProperty('nameStyle')
    expect(saved.theme.nameStyle).toBe('full')
    expect(normalizeConfig(saved).theme.nameStyle).toBe('full')
  })

  it("keeps the profile's saved geometry", () => {
    const cfg = normalizeConfig({ widgets: { tower: { nameStyle: 'full', x: 30, w: 380 } } })
    expect(cfg.widgets.tower.x).toBe(30)
    expect(cfg.widgets.tower.w).toBe(380)
  })
})

describe('configHelp — nameStyle copy (rules 16, 21, 43)', () => {
  it('says the setting covers every widget, what each style shows, and that full grows widgets past their box and the source edge', () => {
    const copy = FIELD_HELP.nameStyle
    expect(copy, 'no help copy for nameStyle').toBeTruthy()
    const text = copy.toLowerCase()
    expect(text).toMatch(/every widget|all widgets/)
    expect(copy).toMatch(/E\.JAC/)
    expect(copy).toMatch(/E\. Jacobs/)
    expect(text).toMatch(/short/)
    expect(text).toMatch(/full/)
    expect(text).toMatch(/wider/)
    expect(text).toMatch(/edge/)
    expect(text).toMatch(/browser source/)
    // Not the tower-only copy it replaces.
    expect(text).not.toMatch(/the tower grows wider/)
  })
})
