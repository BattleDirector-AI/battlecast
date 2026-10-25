import { describe, it, expect } from 'vitest'
import { normalizeConfig, DEFAULT_CONFIG, WIDGET_KEYS } from './overlayConfig.js'

// `theme.preset` — the overlay-wide look (overlay-config.md rule 58, ADR 0026): exactly
// `modern`, `vintage70` or `vintage80`; anything else is `modern`.
const preset = (v) => normalizeConfig({ theme: { preset: v } }).theme.preset

describe('normalizeConfig — theme.preset (rule 58)', () => {
  it('defaults to modern: in the built-in default, with no theme, and with a theme lacking the key', () => {
    expect(DEFAULT_CONFIG.theme.preset).toBe('modern')
    expect(normalizeConfig({}).theme.preset).toBe('modern')
    expect(normalizeConfig({ theme: { classTags: 'hide' } }).theme.preset).toBe('modern')
  })

  it.each(['modern', 'vintage70', 'vintage80'])('keeps exactly %s', (value) => {
    expect(preset(value)).toBe(value)
  })

  it.each([
    ['another case', 'Vintage70'],
    ['upper case', 'VINTAGE80'],
    ['padded', ' vintage80 '],
    ['the bare family name', 'vintage'],
    ['an unknown look', 'retro'],
    ['a near miss', 'vintage-70s'],
    ['an empty string', ''],
    ['null', null],
    ['false', false],
    ['true', true],
    ['a number', 70],
    ['an array', ['vintage70']],
    ['an object', { name: 'vintage70' }],
  ])('replaces %s with modern', (_label, value) => {
    expect(preset(value)).toBe('modern')
  })

  it.each([
    ['null', null],
    ['a string', 'vintage70'],
    ['a number', 7],
  ])('a theme that is %s normalizes to preset modern', (_label, theme) => {
    expect(normalizeConfig({ theme }).theme.preset).toBe('modern')
  })

  it('leaves theme.classColors and theme.classTags as rules 32 and 47 normalize them', () => {
    const theme = normalizeConfig({
      theme: { preset: 'vintage80', classTags: 'hide', classColors: { ' GT3 ': '#AABBCC', bad: 'red' } },
    }).theme
    expect(theme.preset).toBe('vintage80')
    expect(theme.classTags).toBe('hide')
    expect(theme.classColors).toEqual({ gt3: '#AABBCC' })
  })

  it('a junk preset does not disturb the other theme keys', () => {
    const theme = normalizeConfig({ theme: { preset: 'retro', classTags: 'show', classColors: { gtp: '#112233' } } }).theme
    expect(theme).toEqual({ preset: 'modern', classTags: 'show', classColors: { gtp: '#112233' } })
  })

  it('is overlay-wide, not normalized onto any widget', () => {
    const widgets = normalizeConfig({ theme: { preset: 'vintage70' } }).widgets
    for (const key of WIDGET_KEYS) expect(widgets[key], key).not.toHaveProperty('preset')
  })

  it('a saved value survives a second normalization (load → save → load)', () => {
    const once = normalizeConfig({ theme: { preset: 'vintage70' } })
    expect(normalizeConfig(JSON.parse(JSON.stringify(once))).theme.preset).toBe('vintage70')
  })

  it('keeps configVersion "1"', () => {
    expect(normalizeConfig({ theme: { preset: 'vintage80' } }).configVersion).toBe('1')
  })
})
