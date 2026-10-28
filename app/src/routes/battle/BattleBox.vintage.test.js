/* The battle box's own vintage look — widgets.md rules 91 (vintage70) and 92 (vintage80),
 * ADR 0029, how/renderer.md "Battle box".
 *
 * happy-dom applies no stylesheet, so a rendered box cannot tell us its fill, colour, shadow or
 * transform. These tests read the rules from the component source (Vite `?raw`), keyed on the
 * theme selector how/renderer.md prescribes (`:global([data-theme='…'])` on an ancestor, so the
 * /config preview gets them too), and assert the paint each spec bullet names, as
 * StandingsTower.vintage.test.js does for the tower. A rule written under `:root[data-theme]`
 * only, or under the wrong preset, does not count.
 */
import { describe, it, expect } from 'vitest'
import source from './BattleBox.svelte?raw'
import meterSource from '../../design/IntensityMeter.svelte?raw'

/** Flat rules of the component's <style>: [{ selectors: string[], decls: Map }]. */
function styleRules() {
  const css = (/<style>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
  let src = css
  for (let at = src.indexOf('@keyframes'); at !== -1; at = src.indexOf('@keyframes')) {
    let i = src.indexOf('{', at)
    let depth = 0
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}' && --depth === 0) break
    }
    src = src.slice(0, at) + src.slice(i + 1)
  }
  const rules = []
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(/,(?![^(]*\))/).map((s) => s.trim().replace(/\s+/g, ' ').replace(/"/g, "'"))
    const decls = new Map()
    // Split on `;` only outside parentheses, so a gradient's arguments stay whole.
    for (const part of m[2].split(/;(?![^(]*\))/)) {
      const idx = part.indexOf(':')
      if (idx === -1) continue
      decls.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim().replace(/\s+/g, ' '))
    }
    rules.push({ selectors, decls })
  }
  return rules
}
const RULES = styleRules()

/** The declared value of `prop` in a rule for `target` under the preset's ancestor scope. */
function themed(preset, target, prop) {
  const scope = `:global([data-theme='${preset}']) `
  let value
  for (const rule of RULES) {
    if (rule.selectors.some((s) => s === scope + target) && rule.decls.has(prop)) value = rule.decls.get(prop)
  }
  return value
}

/** Every rule with at least one selector under the preset's ancestor scope. */
const themedRules = (preset) =>
  RULES.filter((r) => r.selectors.some((s) => s.startsWith(`:global([data-theme='${preset}'])`)))

/** The declared value of `prop` in an unthemed (base) rule for exactly `target`. */
function base(target, prop) {
  let value
  for (const rule of RULES) {
    if (rule.selectors.includes(target) && rule.decls.has(prop)) value = rule.decls.get(prop)
  }
  return value
}

const TRACK = '.bc-battle__meter :global(.bc-intensity__track)'
const FILL = '.bc-battle__meter :global(.bc-intensity__fill)'
const FOCUS = '.bc-battle__slot--focus'
const FOCUS_LABEL = '.bc-battle__slot--focus .bc-battle__slot-label'
const NAME = '.bc-battle__focus-name'
const CHIP = '.bc-battle__header :global(.bc-class-chip)'

describe('vintage70 battle box (rule 91)', () => {
  it('header: a 4px accent rule along its bottom edge, inside it', () => {
    expect(themed('vintage70', '.bc-battle__header', 'box-shadow')).toBe('inset 0 -4px 0 var(--bc-accent)')
  })

  it('focus slot: the seven-stripe raster under a 30% black layer, with a hard 4px drop shadow', () => {
    expect(themed('vintage70', FOCUS, 'background')).toBe(
      'linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3)), repeating-linear-gradient(180deg, ' +
        '#2FB34A 0 7px, #9BCB2C 7px 14px, #E9B21C 14px 21px, #DE6A24 21px 28px, ' +
        '#B53C9A 28px 35px, #5A4FCF 35px 42px, #2C8FD8 42px 49px)'
    )
    expect(themed('vintage70', FOCUS, 'box-shadow')).toBe('4px 4px 0 #000')
  })

  it('focus slot: the FOCUS label and the name are white', () => {
    expect(themed('vintage70', FOCUS_LABEL, 'color')).toBe('var(--bc-oncam-text)')
    expect(themed('vintage70', NAME, 'color')).toBe('var(--bc-oncam-text)')
  })

  it('focus name: the heavy 4-step extrusion, not the accent glow', () => {
    const shadow = themed('vintage70', NAME, 'text-shadow')
    expect(shadow).toBe(
      '1px 1px 0 #2a1200, 2px 2px 0 #1a0b00, 3px 3px 0 #000, 4px 4px 0 #000, ' +
        '0 0 10px rgba(0, 0, 0, 0.55), 0 0 2px rgba(0, 0, 0, 0.9)'
    )
  })

  it('meter: a skewed track of 10 segments with 4px gaps, square corners', () => {
    const tenths = 'repeating-linear-gradient(90deg, #000 0 calc(10% - 4px), transparent calc(10% - 4px) 10%)'
    expect(themed('vintage70', TRACK, 'transform')).toBe('skewX(-14deg)')
    expect(themed('vintage70', TRACK, 'mask-image')).toBe(tenths)
    // OBS 30's CEF 103 reads only the prefixed property.
    expect(themed('vintage70', TRACK, '-webkit-mask-image')).toBe(tenths)
    expect(themed('vintage70', TRACK, 'border-radius')).toBe('0')
    expect(themed('vintage70', FILL, 'border-radius')).toBe('0')
  })

  it('the accent colour is painted only by the header rule', () => {
    // The focus slot is marked by the raster; the accent red stays out of the box's text, ring
    // and meter, where it would read as the intensity red.
    const rules = themedRules('vintage70')
    expect(rules.length, 'no vintage70 rules in the battle box').toBeGreaterThan(0)
    for (const rule of rules) {
      for (const [prop, value] of rule.decls) {
        if (!/var\(--bc-accent/.test(value)) continue
        expect(
          rule.selectors.every((s) => s.endsWith(' .bc-battle__header')),
          `${rule.selectors[0]} paints ${prop}: ${value}`
        ).toBe(true)
      }
    }
  })
})

describe('vintage80 battle box (rule 92)', () => {
  const BLOCK = '0 0 0 2px #000'

  it('header: the title and the class chip each sit on a black block, 2px past the box', () => {
    expect(themed('vintage80', '.bc-battle__title', 'background')).toBe('#000')
    expect(themed('vintage80', '.bc-battle__title', 'box-shadow')).toBe(BLOCK)
    // ClassChip sets its background inline, which a stylesheet background cannot override, so
    // the chip's black fill is an inset shadow.
    expect(themed('vintage80', CHIP, 'background')).toBeUndefined()
    expect(themed('vintage80', CHIP, 'box-shadow')).toBe(`inset 0 0 0 99px #000, ${BLOCK}`)
    // The Scoreboard red header itself stays.
    expect(themed('vintage80', '.bc-battle__header', 'background')).toBeUndefined()
  })

  it('header: the title keeps its colours, so CLOSING is the intensity colour on black', () => {
    // A themed title colour would outrank the base hot rule and drop the meaning colour.
    expect(themed('vintage80', '.bc-battle__title', 'color')).toBeUndefined()
    expect(themed('vintage80', '.bc-battle--hot .bc-battle__title', 'color')).toBeUndefined()
    expect(base('.bc-battle--hot .bc-battle__title', 'color')).toBe('var(--bc-intensity-hot)')
    expect(themed('vintage80', '.bc-battle__title', 'background')).toBe('#000')
  })

  it('labels: every label is set in the display face (Oswald), the numbers stay in VT323', () => {
    const labels = [
      '.bc-battle__title',
      CHIP,
      '.bc-battle__slot-label',
      '.bc-battle__meter :global(.bc-intensity__label)',
      '.bc-battle__idle-heading',
      '.bc-battle__idle-sub',
    ]
    for (const cell of labels) expect(themed('vintage80', cell, 'font-family'), cell).toBe('var(--bc-font-display)')
    // The gaps, the meter's value and the names keep the faces the base look gives them.
    for (const cell of ['.bc-battle__gap', '.bc-battle__meter :global(.bc-intensity__value)', '.bc-battle__slot-name', NAME]) {
      expect(themed('vintage80', cell, 'font-family'), cell).toBeUndefined()
    }
  })

  it('focus slot in reverse video: a lime fill with a hard 3px drop shadow', () => {
    expect(themed('vintage80', FOCUS, 'background')).toBe('var(--bc-accent)')
    expect(themed('vintage80', FOCUS, 'box-shadow')).toBe('3px 3px 0 #000')
  })

  it('focus slot: the FOCUS label and the name are dark, with no outline or glow', () => {
    for (const cell of [FOCUS_LABEL, NAME]) {
      expect(themed('vintage80', cell, 'color'), cell).toBe('var(--bc-text-on-accent)')
      expect(themed('vintage80', cell, 'text-shadow'), cell).toBe('none')
    }
  })

  it('meter: an upright track of 12 segments with 4px gaps, square corners', () => {
    const twelfths =
      'repeating-linear-gradient(90deg, #000 0 calc(100% / 12 - 4px), transparent calc(100% / 12 - 4px) calc(100% / 12))'
    expect(themed('vintage80', TRACK, 'mask-image')).toBe(twelfths)
    expect(themed('vintage80', TRACK, '-webkit-mask-image')).toBe(twelfths)
    expect(themed('vintage80', TRACK, 'transform')).toBeUndefined()
    expect(themed('vintage80', TRACK, 'border-radius')).toBe('0')
    expect(themed('vintage80', FILL, 'border-radius')).toBe('0')
  })
})

describe('the vintage rules are exactly the listed ones (rules 91-92, overlay-config rule 60)', () => {
  // how/renderer.md "Battle box", as data. Everything these rules do not name renders the base
  // look, so the set is closed: no other themed selector, property or value.
  const RASTER =
    'linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3)), repeating-linear-gradient(180deg, ' +
    '#2FB34A 0 7px, #9BCB2C 7px 14px, #E9B21C 14px 21px, #DE6A24 21px 28px, ' +
    '#B53C9A 28px 35px, #5A4FCF 35px 42px, #2C8FD8 42px 49px)'
  const HEAVY =
    '1px 1px 0 #2a1200, 2px 2px 0 #1a0b00, 3px 3px 0 #000, 4px 4px 0 #000, ' +
    '0 0 10px rgba(0, 0, 0, 0.55), 0 0 2px rgba(0, 0, 0, 0.9)'
  const TENTHS = 'repeating-linear-gradient(90deg, #000 0 calc(10% - 4px), transparent calc(10% - 4px) 10%)'
  const TWELFTHS =
    'repeating-linear-gradient(90deg, #000 0 calc(100% / 12 - 4px), transparent calc(100% / 12 - 4px) calc(100% / 12))'
  const DISPLAY = { 'font-family': 'var(--bc-font-display)' }
  const EXPECTED = {
    vintage70: {
      '.bc-battle__header': { 'box-shadow': 'inset 0 -4px 0 var(--bc-accent)' },
      [FOCUS]: { background: RASTER, 'box-shadow': '4px 4px 0 #000' },
      [FOCUS_LABEL]: { color: 'var(--bc-oncam-text)' },
      [NAME]: { color: 'var(--bc-oncam-text)', 'text-shadow': HEAVY },
      [TRACK]: { transform: 'skewX(-14deg)', 'mask-image': TENTHS, '-webkit-mask-image': TENTHS, 'border-radius': '0' },
      [FILL]: { 'border-radius': '0' },
    },
    vintage80: {
      '.bc-battle__title': { background: '#000', 'box-shadow': '0 0 0 2px #000', ...DISPLAY },
      [CHIP]: { 'box-shadow': 'inset 0 0 0 99px #000, 0 0 0 2px #000', ...DISPLAY },
      '.bc-battle__slot-label': DISPLAY,
      '.bc-battle__meter :global(.bc-intensity__label)': DISPLAY,
      '.bc-battle__idle-heading': DISPLAY,
      '.bc-battle__idle-sub': DISPLAY,
      [FOCUS]: { background: 'var(--bc-accent)', 'box-shadow': '3px 3px 0 #000' },
      [FOCUS_LABEL]: { color: 'var(--bc-text-on-accent)', 'text-shadow': 'none' },
      [NAME]: { color: 'var(--bc-text-on-accent)', 'text-shadow': 'none' },
      [TRACK]: { 'mask-image': TWELFTHS, '-webkit-mask-image': TWELFTHS, 'border-radius': '0' },
      [FILL]: { 'border-radius': '0' },
    },
  }

  it('the shared IntensityMeter carries no theme rules: the battle box styles its meter', () => {
    // A themed rule there would reach every meter and escape this closed list.
    expect(meterSource).not.toMatch(/data-theme/i)
  })

  it('every selector that names data-theme uses one of the two exact preset scopes', () => {
    const scoped = RULES.flatMap((r) => r.selectors).filter((s) => /data-theme/i.test(s))
    expect(scoped.length, 'no themed selectors in the battle box').toBeGreaterThan(0)
    for (const s of scoped) {
      // An unquoted value, `:root[data-theme=…]`, `^=` or any other spelling is not counted by
      // the closed set below, so it is refused here.
      expect(/^:global\(\[data-theme='vintage(70|80)'\]\) \S/.test(s), s).toBe(true)
      expect(s.indexOf('data-theme'), s).toBe(s.lastIndexOf('data-theme'))
    }
  })

  for (const preset of ['vintage70', 'vintage80']) {
    it(`${preset}: the themed (selector, property, value) set is exactly the listed one`, () => {
      const scope = `:global([data-theme='${preset}']) `
      const actual = {}
      for (const rule of RULES) {
        for (const s of rule.selectors) {
          if (!s.startsWith(scope)) continue
          const target = s.slice(scope.length)
          actual[target] ??= {}
          for (const [prop, value] of rule.decls) {
            expect(actual[target][prop], `${target} sets ${prop} twice`).toBeUndefined()
            actual[target][prop] = value
          }
        }
      }
      expect(actual).toEqual(EXPECTED[preset])
    })
  }
})
