import { describe, it, expect } from 'vitest'
import { normalizeConfig, DEFAULT_CONFIG, WIDGET_KEYS } from './overlayConfig.js'
import { FIELD_HELP } from './configHelp.js'

// `theme.classTags` — the overlay-wide class-tag setting (overlay-config.md rules 47-48,
// widgets.md rule 60, ADR 0022).
const classTags = (v) => normalizeConfig({ theme: { classTags: v } }).theme.classTags

describe('normalizeConfig — theme.classTags (rule 47)', () => {
  it('defaults to auto: in the built-in default, with no theme, and with a theme lacking the key', () => {
    expect(DEFAULT_CONFIG.theme.classTags).toBe('auto')
    expect(normalizeConfig({}).theme.classTags).toBe('auto')
    expect(normalizeConfig({ theme: { classColors: { gt3: '#112233' } } }).theme.classTags).toBe('auto')
  })

  it.each(['auto', 'show', 'hide'])('keeps exactly %s', (value) => {
    expect(classTags(value)).toBe(value)
  })

  it.each([
    ['another case', 'Hide'],
    ['upper case', 'SHOW'],
    ['padded', ' hide '],
    ['an unknown string', 'off'],
    ['an empty string', ''],
    ['null', null],
    ['false (not hide)', false],
    ['true (not show)', true],
    ['a number', 0],
    ['an array', ['hide']],
    ['an object', { mode: 'hide' }],
  ])('replaces %s with auto', (_label, value) => {
    expect(classTags(value)).toBe('auto')
  })

  it('leaves theme.classColors as rule 32 normalizes it', () => {
    const theme = normalizeConfig({ theme: { classTags: 'hide', classColors: { ' GT3 ': '#AABBCC', bad: 'red' } } }).theme
    expect(theme.classTags).toBe('hide')
    expect(theme.classColors).toEqual(normalizeConfig({ theme: { classColors: { ' GT3 ': '#AABBCC', bad: 'red' } } }).theme.classColors)
  })

  it('is overlay-wide, not normalized onto any widget', () => {
    const widgets = normalizeConfig({ theme: { classTags: 'hide' } }).widgets
    for (const key of WIDGET_KEYS) expect(widgets[key], key).not.toHaveProperty('classTags')
  })

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['a number', 7],
  ])('a theme that is %s normalizes to classTags auto', (_label, theme) => {
    expect(normalizeConfig({ theme }).theme.classTags).toBe('auto')
  })

  it('a saved value survives a second normalization (load → save → load)', () => {
    const once = normalizeConfig({ theme: { classTags: 'show' } })
    expect(normalizeConfig(JSON.parse(JSON.stringify(once))).theme.classTags).toBe('show')
  })
})

describe('configHelp — classTags copy (rules 16, 48)', () => {
  it('says auto follows the producer and show / hide override it', () => {
    const copy = FIELD_HELP.classTags
    expect(copy, 'no help copy for classTags').toBeTruthy()
    const lower = copy.toLowerCase()
    expect(lower).toMatch(/auto/)
    expect(lower).toMatch(/producer/)
    expect(lower).toMatch(/show/)
    expect(lower).toMatch(/hide/)
    expect(lower).toMatch(/single-class|one class/)
    // The preview's sample feed sends no flag, so auto shows tags there; the copy must say so.
    expect(lower).toMatch(/preview/)
  })
})
