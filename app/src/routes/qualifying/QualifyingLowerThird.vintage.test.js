/* The qualifying lower-third's own vintage look — widgets.md rules 93 (vintage70) and 94
 * (vintage80), ADR 0030, how/renderer.md "Lower-thirds".
 *
 * happy-dom applies no stylesheet, so a rendered card cannot tell us its fill, colour or shadow.
 * These tests read the rules from the component source (Vite `?raw`), keyed on the theme
 * selector how/renderer.md prescribes (`:global([data-theme='…'])` on an ancestor, so the
 * /config preview gets them too), and assert the paint each spec bullet names. A rule written
 * under `:root[data-theme]` only, under the wrong preset, or in the shared LowerThirdShell does
 * not count. Where a base rule is compound (the flash, the best cell, the ahead delta) the themed
 * rule must use the same compound selector, or the base rule outranks it. Any rule that mentions
 * a vintage preset in another spelling fails, and the complete set of themed rules is pinned, so
 * "everything else renders the base look" is checked too. The parser is the tower's
 * (StandingsTower.vintage.test.js).
 */
import { describe, it, expect } from 'vitest'
import source from './QualifyingLowerThird.svelte?raw'

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

const PRESETS = ['vintage70', 'vintage80']
const FLASH_ACCENT = '.bc-qt--flash .bc-qt__accent'
const FLASH_LABEL = '.bc-qt--flash .bc-qt__label'
const BEST_VALUE = '.bc-qt__cell--best .bc-qt__cell-value'
const AHEAD_VALUE = '.bc-qt__cell--delta.bc-qt__cell--ahead .bc-qt__cell-value'

/** Shared by both presets. */
const BOTH = {
  '.bc-qt__accent': { 'border-radius': '0', 'box-shadow': '2px 2px 0 #000' },
  [FLASH_ACCENT]: { 'box-shadow': '2px 2px 0 #000' },
  [FLASH_LABEL]: {
    background: 'var(--bc-intensity-hot)',
    color: 'var(--bc-text-on-accent)',
    'text-shadow': 'none',
    'box-shadow': '0 0 0 3px var(--bc-intensity-hot), 0 0 0 4px #000',
  },
  [BEST_VALUE]: { 'text-shadow': 'var(--bc-shadow-text)' },
}
/** Rules 93 and 94, complete: every themed selector, property and value, and nothing else. */
const EXPECTED = {
  vintage70: {
    ...BOTH,
    '.bc-qt': { 'box-shadow': 'inset 0 -4px 0 var(--bc-accent)' },
    '.bc-qt__pos': { color: 'var(--bc-text-2)' },
    '.bc-qt__name': { color: 'var(--bc-text)' },
  },
  vintage80: {
    ...BOTH,
    '.bc-qt__label': { 'font-family': 'var(--bc-font-display)' },
    '.bc-qt__cell-label': { 'font-family': 'var(--bc-font-display)' },
    [AHEAD_VALUE]: {
      background: 'var(--bc-up)',
      color: 'var(--bc-text-on-accent)',
      'text-shadow': 'none',
      'box-shadow': '0 0 0 2px var(--bc-up), 0 0 0 3px #000',
    },
  },
}

describe('both vintage presets (rules 93, 94)', () => {
  for (const preset of PRESETS) {
    it(`${preset} accent bar: square-ended, a hard 2px black drop shadow in place of the glow`, () => {
      expect(themed(preset, '.bc-qt__accent', 'border-radius')).toBe('0')
      expect(themed(preset, '.bc-qt__accent', 'box-shadow')).toBe('2px 2px 0 #000')
    })

    it(`${preset} accent bar on the class-best flash: the flash colour kept, no glow`, () => {
      // The base `.bc-qt--flash .bc-qt__accent` glow outranks a bare themed `.bc-qt__accent`.
      expect(themed(preset, FLASH_ACCENT, 'box-shadow')).toBe('2px 2px 0 #000')
    })

    it(`${preset} class-best label: a flash-colour block, 3px past the label, a 1px black ring, dark text`, () => {
      expect(themed(preset, FLASH_LABEL, 'background')).toBe('var(--bc-intensity-hot)')
      expect(themed(preset, FLASH_LABEL, 'box-shadow')).toBe('0 0 0 3px var(--bc-intensity-hot), 0 0 0 4px #000')
      expect(themed(preset, FLASH_LABEL, 'color')).toBe('var(--bc-text-on-accent)')
      expect(themed(preset, FLASH_LABEL, 'text-shadow')).toBe('none')
    })

    it(`${preset} best lap: the preset base shadow in place of the accent glow`, () => {
      expect(themed(preset, BEST_VALUE, 'text-shadow')).toBe('var(--bc-shadow-text)')
    })
  }
})

describe('vintage70 qualifying lower-third (rule 93)', () => {
  it('red rule: a 4px accent rule along the card bottom, inside it', () => {
    expect(themed('vintage70', '.bc-qt', 'box-shadow')).toBe('inset 0 -4px 0 var(--bc-accent)')
  })

  it('position: warm white, not the accent red', () => {
    expect(themed('vintage70', '.bc-qt__pos', 'color')).toBe('var(--bc-text-2)')
  })

  it('name: gold', () => {
    expect(themed('vintage70', '.bc-qt__name', 'color')).toBe('var(--bc-text)')
  })
})

describe('vintage80 qualifying lower-third (rule 94)', () => {
  it('labels: the TIMING / CLASS BEST label and every cell label in the caption face', () => {
    expect(themed('vintage80', '.bc-qt__label', 'font-family')).toBe('var(--bc-font-display)')
    expect(themed('vintage80', '.bc-qt__cell-label', 'font-family')).toBe('var(--bc-font-display)')
  })

  it('delta ahead in reverse video: a green block, 2px past the value, a 1px black ring, dark text', () => {
    expect(themed('vintage80', AHEAD_VALUE, 'background')).toBe('var(--bc-up)')
    expect(themed('vintage80', AHEAD_VALUE, 'box-shadow')).toBe('0 0 0 2px var(--bc-up), 0 0 0 3px #000')
    expect(themed('vintage80', AHEAD_VALUE, 'color')).toBe('var(--bc-text-on-accent)')
    expect(themed('vintage80', AHEAD_VALUE, 'text-shadow')).toBe('none')
  })
})

describe('the qualifying lower-third vintage rules, complete (rules 93, 94)', () => {
  it('every themed selector is in the canonical form', () => {
    for (const s of THEMED_SELECTORS) expect(CANONICAL.test(s), s).toBe(true)
  })

  for (const preset of PRESETS) {
    // Pins the "everything else renders the base look" clauses: a plain TIMING label, a behind
    // delta, the values and position in VT323, #22's name in the base shadow, and so on.
    it(`${preset}: exactly the themed rules the spec names, and nothing else renders differently`, () => {
      expect(themedMap(preset)).toEqual(EXPECTED[preset])
    })
  }
})

describe('the qualifying lower-third vintage rules change no set length (overlay-config rule 60)', () => {
  // Box size, spacing, order and flow. A border colour, radius or style is paint; a width is not.
  const GEOMETRY =
    /^(width|min-width|max-width|height|min-height|max-height|font|font-size|font-family|font-weight|font-stretch|letter-spacing|word-spacing|line-height|text-indent|text-transform|white-space|vertical-align|inset|top|right|bottom|left|position|gap|column-gap|row-gap|display|order|zoom|aspect-ratio|box-sizing|outline|outline-width|transform)$|^(padding|margin|flex|grid)(-|$)|^border(-(top|right|bottom|left))?(-width)?$/
  const LABELS = ['.bc-qt__label', '.bc-qt__cell-label']
  for (const preset of PRESETS) {
    it(`${preset}: no themed rule sets a size or spacing property`, () => {
      const map = themedMap(preset)
      expect(Object.keys(map).length, `no ${preset} rules in the qualifying lower-third`).toBeGreaterThan(0)
      for (const [target, decls] of Object.entries(map)) {
        for (const [prop, value] of Object.entries(decls)) {
          // Rule 94's one exception: the 80s labels take the caption face.
          if (preset === 'vintage80' && LABELS.includes(target) && prop === 'font-family' && value === 'var(--bc-font-display)') continue
          expect(GEOMETRY.test(prop), `${target} sets ${prop}`).toBe(false)
        }
      }
    })
  }
})
