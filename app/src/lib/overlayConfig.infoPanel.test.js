import { describe, it, expect } from 'vitest'
import { normalizeConfig, DEFAULT_CONFIG, WIDGET_KEYS, PLATE_WIDGET_KEYS, TEXT_WIDGET_KEYS } from './overlayConfig.js'

// The info panel's profile entry (overlay-config.md rule 52, ADR 0024): the `info` widget, its
// default geometry, its dwellSeconds default and range, and its `lines` list.
const info = (widget) => normalizeConfig({ widgets: { info: widget } }).widgets.info
const dwell = (v) => info({ dwellSeconds: v })?.dwellSeconds
const lines = (v) => info({ lines: v })?.lines

describe('normalizeConfig — the info widget (rule 52)', () => {
  it('is a widget key with its default geometry, visible, at an 8 s dwell with no lines', () => {
    expect(WIDGET_KEYS).toContain('info')
    expect(normalizeConfig({}).widgets.info).toMatchObject({
      visible: true,
      x: 1200,
      y: 816,
      w: 696,
      h: 72,
      z: 9,
      dwellSeconds: 8,
      lines: [],
    })
  })

  it('overlaps no other default widget, hidden ones included', () => {
    const me = DEFAULT_CONFIG.widgets.info
    expect(me, 'no info widget in DEFAULT_CONFIG').toBeTruthy()
    for (const [key, o] of Object.entries(DEFAULT_CONFIG.widgets)) {
      if (key === 'info') continue
      const apart = me.x >= o.x + o.w || o.x >= me.x + me.w || me.y >= o.y + o.h || o.y >= me.y + me.h
      expect(apart, `the info panel overlaps ${key}`).toBe(true)
    }
    expect(me.x + me.w).toBeLessThanOrEqual(1920)
    expect(me.y + me.h).toBeLessThanOrEqual(1080)
  })

  it('is a plate-rendering and text-rendering widget (rules 23, 40)', () => {
    expect(PLATE_WIDGET_KEYS).toContain('info')
    expect(TEXT_WIDGET_KEYS).toContain('info')
  })

  it('gives a profile saved before the widget existed the defaults, leaving its other widgets alone', () => {
    const cfg = normalizeConfig({ widgets: { updates: { dwellSeconds: 4, x: 100 } } })
    expect(cfg.widgets.info).toMatchObject({ visible: true, x: 1200, dwellSeconds: 8, lines: [] })
    expect(cfg.widgets.updates).toMatchObject({ dwellSeconds: 4, x: 100 })
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
    ['0', 0],
    ['negative', -3],
    ['above 60', 60.5],
    ['a blank string', '  '],
    ['null', null],
    ['true', true],
    ['[5]', [5]],
    ['a non-numeric string', 'abc'],
  ])('replaces a dwell that is %s with the 8 s default', (_label, input) => {
    expect(dwell(input)).toBe(8)
  })
})

describe('normalizeConfig — the info widget’s lines (rule 52)', () => {
  it('keeps a clean list as it is', () => {
    expect(lines(['Follow us @battlecast', 'Sponsored by Example'])).toEqual([
      'Follow us @battlecast',
      'Sponsored by Example',
    ])
  })

  it('trims, drops non-strings, blanks and duplicates: the rule’s own example', () => {
    expect(lines([' Follow us @battlecast ', '', 42, 'Follow us @battlecast'])).toEqual(['Follow us @battlecast'])
  })

  it('drops every kind of non-string entry without stopping the ones around it', () => {
    expect(lines(['A', null, true, { text: 'B' }, ['C'], 7, '   ', 'D'])).toEqual(['A', 'D'])
  })

  it('compares duplicates after trimming and exactly (case kept)', () => {
    expect(lines(['Live', '  Live', 'LIVE'])).toEqual(['Live', 'LIVE'])
  })

  it('cuts a line to its first 120 characters, then trims again', () => {
    const long = 'x'.repeat(130)
    expect(lines([long])).toEqual(['x'.repeat(120)])
    const spaceAtCut = `${'y'.repeat(119)} tail`
    expect(lines([spaceAtCut]), 'the space left at the cut is trimmed').toEqual(['y'.repeat(119)])
    expect(lines([`   ${'z'.repeat(120)}   `]), 'trimmed before the cut').toEqual(['z'.repeat(120)])
  })

  it('drops a line that is a duplicate only after the cut', () => {
    const base = 'w'.repeat(120)
    expect(lines([base, `${base}extra`])).toEqual([base])
  })

  it('keeps at most 10 lines, the first 10 kept', () => {
    const many = Array.from({ length: 13 }, (_, i) => `Line ${i + 1}`)
    expect(lines(many)).toEqual(many.slice(0, 10))
  })

  it('counts only kept lines toward the 10', () => {
    const raw = ['', 'Line 1', 'Line 1', ...Array.from({ length: 11 }, (_, i) => `Line ${i + 2}`)]
    expect(lines(raw)).toEqual(Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`))
  })

  it.each([
    ['absent', undefined],
    ['null', null],
    ['a string', 'Follow us'],
    ['an object', { 0: 'Follow us' }],
    ['a number', 3],
  ])('gives [] when lines is %s', (_label, input) => {
    expect(lines(input)).toEqual([])
  })

  it('is carried by the info widget only: no other widget, known or unknown, has a lines key', () => {
    const cfg = normalizeConfig({
      widgets: { tower: { lines: ['A'] }, updates: { lines: ['B'] }, future: { lines: ['C'] } },
    })
    for (const key of Object.keys(cfg.widgets)) {
      if (key === 'info') continue
      expect(cfg.widgets[key], key).not.toHaveProperty('lines')
    }
    expect(normalizeConfig({}).widgets.tower).not.toHaveProperty('lines')
    expect(cfg.widgets.info.lines).toEqual([])
  })
})
