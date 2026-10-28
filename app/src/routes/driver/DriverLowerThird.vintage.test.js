/* The driver lower-third's own vintage look — widgets.md rules 93 (vintage70) and 94 (vintage80),
 * ADR 0030, how/renderer.md "Lower-thirds".
 *
 * happy-dom applies no stylesheet, so a rendered card cannot tell us its fill, colour or shadow.
 * These tests read the rules from the component source (Vite `?raw`), keyed on the theme
 * selector how/renderer.md prescribes (`:global([data-theme='…'])` on an ancestor, so the
 * /config preview gets them too), and assert the paint each spec bullet names. A rule written
 * under `:root[data-theme]` only, under the wrong preset, or in the shared LowerThirdShell does
 * not count. Any rule that mentions a vintage preset in another spelling fails, and the complete
 * set of themed rules is pinned, so "everything else renders the base look" is checked too. The
 * parser is the tower's (StandingsTower.vintage.test.js).
 */
import { describe, it, expect } from 'vitest'
import source from './DriverLowerThird.svelte?raw'

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
    for (const part of m[2].split(';')) {
      const idx = part.indexOf(':')
      if (idx === -1) continue
      decls.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim().replace(/\s+/g, ' '))
    }
    rules.push({ selectors, decls })
  }
  return rules
}
const RULES = styleRules()

/** Any selector that mentions the theme attribute at all, however it is spelled: `=`, `^=`, `*=`,
 *  `~=`, unquoted, wrapped, or `:not([data-theme='modern'])`. The base rules mention none. */
const MENTIONS_VINTAGE = /data-theme/
/** The one spelling how/renderer.md allows: the ancestor scope, a space, then the target. */
const CANONICAL = /^:global\(\[data-theme='(vintage70|vintage80)'\]\) (?!.*data-theme)(.+)$/
const THEMED_SELECTORS = RULES.flatMap((r) => r.selectors).filter((s) => MENTIONS_VINTAGE.test(s))

/** Every themed declaration for `preset`: { target: { prop: value } }, later rules winning. */
function themedMap(preset) {
  const map = {}
  for (const rule of RULES) {
    for (const s of rule.selectors) {
      const m = CANONICAL.exec(s)
      if (!m || m[1] !== preset) continue
      map[m[2]] = { ...map[m[2]], ...Object.fromEntries(rule.decls) }
    }
  }
  return map
}

/** The declared value of `prop` in a rule for `target` under the preset's ancestor scope. */
function themed(preset, target, prop) {
  return themedMap(preset)[target]?.[prop]
}

/** The mocks' heavy large-text treatments (vintage-70s-us.html `--bc-shadow-text`,
 *  vintage-80s-f1.html `--bc-outline`). */
const HEAVY_70 =
  '1px 1px 0 #2a1200, 2px 2px 0 #1a0b00, 3px 3px 0 #000, 4px 4px 0 #000, 0 0 10px rgba(0, 0, 0, 0.55), 0 0 2px rgba(0, 0, 0, 0.9)'
const HEAVY_80 =
  '-2px -2px 0 #000, 0 -2px 0 #000, 2px -2px 0 #000, 2px 0 0 #000, 2px 2px 0 #000, 0 2px 0 #000, -2px 2px 0 #000, -2px 0 0 #000, 3px 3px 0 #000, 0 0 9px rgba(0, 0, 0, 0.6)'

const ACCENT = { 'border-radius': '0', 'box-shadow': '2px 2px 0 #000' }
/** Rules 93 and 94, complete: every themed selector, property and value, and nothing else. */
const EXPECTED = {
  vintage70: {
    '.bc-lt': { 'box-shadow': 'inset 0 -4px 0 var(--bc-accent)' },
    '.bc-lt__accent': ACCENT,
    '.bc-lt__pos': { color: 'var(--bc-text-2)' },
    '.bc-lt__name': { color: 'var(--bc-text)', 'text-shadow': HEAVY_70 },
  },
  vintage80: {
    '.bc-lt__accent': ACCENT,
    '.bc-lt__label': {
      'font-family': 'var(--bc-font-display)',
      color: 'var(--bc-text-2)',
      background: 'var(--bc-header)',
      'text-shadow': 'none',
      'box-shadow': '0 0 0 3px var(--bc-header), 2px 2px 0 3px #000',
    },
    '.bc-lt__name': { 'text-shadow': HEAVY_80 },
  },
}

describe('vintage70 driver lower-third (rule 93)', () => {
  it('red rule: a 4px accent rule along the card bottom, inside it', () => {
    expect(themed('vintage70', '.bc-lt', 'box-shadow')).toBe('inset 0 -4px 0 var(--bc-accent)')
  })

  it('accent bar: square-ended, a hard 2px black drop shadow in place of the glow', () => {
    expect(themed('vintage70', '.bc-lt__accent', 'border-radius')).toBe('0')
    expect(themed('vintage70', '.bc-lt__accent', 'box-shadow')).toBe('2px 2px 0 #000')
  })

  it('position: warm white, not the accent red', () => {
    expect(themed('vintage70', '.bc-lt__pos', 'color')).toBe('var(--bc-text-2)')
  })

  it('name: gold, with the mock heavy extrusion in place of the accent glow', () => {
    expect(themed('vintage70', '.bc-lt__name', 'color')).toBe('var(--bc-text)')
    expect(themed('vintage70', '.bc-lt__name', 'text-shadow')).toBe(HEAVY_70)
  })
})

describe('vintage80 driver lower-third (rule 94)', () => {
  it('ON CAMERA tag: caption face, CG white on a header-red block with a hard drop shadow', () => {
    expect(themed('vintage80', '.bc-lt__label', 'font-family')).toBe('var(--bc-font-display)')
    expect(themed('vintage80', '.bc-lt__label', 'color')).toBe('var(--bc-text-2)')
    expect(themed('vintage80', '.bc-lt__label', 'background')).toBe('var(--bc-header)')
    expect(themed('vintage80', '.bc-lt__label', 'text-shadow')).toBe('none')
    expect(themed('vintage80', '.bc-lt__label', 'box-shadow')).toBe('0 0 0 3px var(--bc-header), 2px 2px 0 3px #000')
  })

  it('accent bar: square-ended, a hard 2px black drop shadow in place of the glow', () => {
    expect(themed('vintage80', '.bc-lt__accent', 'border-radius')).toBe('0')
    expect(themed('vintage80', '.bc-lt__accent', 'box-shadow')).toBe('2px 2px 0 #000')
  })

  it('name: its own colour, with the mock heavy 2px outline in place of the accent glow', () => {
    expect(themed('vintage80', '.bc-lt__name', 'text-shadow')).toBe(HEAVY_80)
  })
})

describe('the driver lower-third vintage rules, complete (rules 93, 94)', () => {
  it('every themed selector is in the canonical form', () => {
    for (const s of THEMED_SELECTORS) expect(CANONICAL.test(s), s).toBe(true)
  })

  for (const preset of ['vintage70', 'vintage80']) {
    // Pins the "everything else renders the base look" clauses: the 70s label, the 80s position,
    // no red rule under the 80s, and so on.
    it(`${preset}: exactly the themed rules the spec names, and nothing else renders differently`, () => {
      expect(themedMap(preset)).toEqual(EXPECTED[preset])
    })
  }
})

describe('the driver lower-third vintage rules change no set length (overlay-config rule 60)', () => {
  // Box size, spacing, order and flow. A border colour, radius or style is paint; a width is not.
  const GEOMETRY =
    /^(width|min-width|max-width|height|min-height|max-height|font|font-size|font-family|font-weight|font-stretch|letter-spacing|word-spacing|line-height|text-indent|text-transform|white-space|vertical-align|inset|top|right|bottom|left|position|gap|column-gap|row-gap|display|order|zoom|aspect-ratio|box-sizing|outline|outline-width|transform)$|^(padding|margin|flex|grid)(-|$)|^border(-(top|right|bottom|left))?(-width)?$/
  for (const preset of ['vintage70', 'vintage80']) {
    it(`${preset}: no themed rule sets a size or spacing property`, () => {
      const map = themedMap(preset)
      expect(Object.keys(map).length, `no ${preset} rules in the driver lower-third`).toBeGreaterThan(0)
      for (const [target, decls] of Object.entries(map)) {
        for (const [prop, value] of Object.entries(decls)) {
          // Rule 94's one exception: the 80s label takes the caption face.
          if (preset === 'vintage80' && target === '.bc-lt__label' && prop === 'font-family' && value === 'var(--bc-font-display)') continue
          expect(GEOMETRY.test(prop), `${target} sets ${prop}`).toBe(false)
        }
      }
    })
  }
})
