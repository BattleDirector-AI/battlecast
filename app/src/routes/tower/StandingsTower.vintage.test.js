/* The tower's own vintage look — widgets.md rules 89 (vintage70) and 90 (vintage80), ADR 0027,
 * how/renderer.md "Tower".
 *
 * happy-dom applies no stylesheet, so a rendered row cannot tell us its fill, colour or shadow.
 * These tests read the rules from the component source (Vite `?raw`), keyed on the theme
 * selector how/renderer.md prescribes (`:global([data-theme='…'])` on an ancestor, so the
 * /config preview gets them too), and assert the paint each spec bullet names. A rule written
 * under `:root[data-theme]` only, or under the wrong preset, does not count.
 */
import { describe, it, expect } from 'vitest'
import source from './StandingsTower.svelte?raw'

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

/** The declared value of `prop` in a rule for `target` under the preset's ancestor scope. */
function themed(preset, target, prop) {
  const scope = `:global([data-theme='${preset}']) `
  let value
  for (const rule of RULES) {
    if (rule.selectors.some((s) => s === scope + target) && rule.decls.has(prop)) value = rule.decls.get(prop)
  }
  return value
}

describe('vintage70 tower (rule 89)', () => {
  it('header: a 4px accent rule along its bottom edge, inside it', () => {
    expect(themed('vintage70', '.tower__header', 'box-shadow') ?? '').toContain('inset 0 -4px 0 var(--bc-accent)')
  })

  it('class chip: skewed 8 degrees with a hard 2px black drop shadow, its label upright', () => {
    expect(themed('vintage70', '.row__class', 'transform')).toBe('skewX(-8deg)')
    expect(themed('vintage70', '.row__class', 'filter')).toBe('drop-shadow(2px 2px 0 #000)')
    // The skew gives the lean; an italic label on top would lean twice.
    expect(themed('vintage70', '.row__class', 'font-style')).toBe('normal')
  })

  it('on-camera row: no fill, a 4px accent underline inside the row', () => {
    expect(themed('vintage70', '.row--oncam', 'background')).toBe('none')
    expect(themed('vintage70', '.row--oncam', 'box-shadow')).toBe('inset 0 -4px 0 var(--bc-accent)')
  })

  it('position numerals: warm white on every row, the on-camera row included', () => {
    expect(themed('vintage70', '.row__pos', 'color')).toBe('var(--bc-text-2)')
    // The base `.row--oncam .row__pos` (accent) outranks a bare themed `.row__pos`.
    expect(themed('vintage70', '.row--oncam .row__pos', 'color')).toBe('var(--bc-text-2)')
  })

  it('re-cut: no shine element renders', () => {
    expect(themed('vintage70', '.row__oncam-flash', 'display')).toBe('none')
  })
})

describe('vintage80 tower (rule 90)', () => {
  const ONCAM_TEXT = '.row--oncam > :not(.row__pit--in):not(.row__finish):not(.row__class)'
  const RING = '0 0 0 3px #000'

  it('on-camera row in reverse video: solid accent fill, no shadow', () => {
    expect(themed('vintage80', '.row--oncam', 'background')).toBe('var(--bc-accent)')
    expect(themed('vintage80', '.row--oncam', 'box-shadow')).toBe('none')
  })

  it('on-camera row: its text cells dark, with no outline; the chips excluded', () => {
    expect(themed('vintage80', ONCAM_TEXT, 'color')).toBe('var(--bc-text-on-accent)')
    expect(themed('vintage80', ONCAM_TEXT, 'text-shadow')).toBe('none')
  })

  it('on-camera row: the nested STOP label and tire compound turn dark too', () => {
    // Each sets its own colour (text-3, primary), so the direct-child rule does not reach it;
    // the tire compound in primary text would be lime on lime.
    for (const cell of ['.row--oncam .row__pit-label', '.row--oncam .row__tire-compound']) {
      expect(themed('vintage80', cell, 'color'), cell).toBe('var(--bc-text-on-accent)')
      expect(themed('vintage80', cell, 'text-shadow'), cell).toBe('none')
    }
  })

  it('on-camera row: the class, DNF and DQ chips sit on a black block, 2px past the cell', () => {
    for (const cell of ['.row--oncam .row__class', '.row--oncam .row__finish--dnf', '.row--oncam .row__finish--dq']) {
      expect(themed('vintage80', cell, 'background'), cell).toBe('#000')
      expect(themed('vintage80', cell, 'box-shadow'), cell).toBe('0 0 0 2px #000')
    }
  })

  it('on-camera row: the chequered flag keeps its squares and edge, ringed in black', () => {
    const flag = '.row--oncam .row__finish--flag'
    // A background here would wipe the flag's gradient squares.
    expect(themed('vintage80', flag, 'background')).toBeUndefined()
    expect(themed('vintage80', flag, 'background-image')).toBeUndefined()
    expect(themed('vintage80', flag, 'box-shadow')).toBe('inset 0 0 0 1px rgba(0, 0, 0, 0.35), 0 0 0 2px #000')
  })

  it('plain-lap flash: a white block, 2px spread, a 1px black ring, dark text, no outline', () => {
    expect(themed('vintage80', '.row__gap--flash', 'background')).toBe('var(--bc-text-2)')
    expect(themed('vintage80', '.row__gap--flash', 'box-shadow')).toBe(`0 0 0 2px var(--bc-text-2), ${RING}`)
    expect(themed('vintage80', '.row__gap--flash', 'color')).toBe('var(--bc-text-on-accent)')
    expect(themed('vintage80', '.row__gap--flash', 'text-shadow')).toBe('none')
  })

  it('personal-best flash: a green block, so it cannot be mistaken for a plain lap', () => {
    // Compound, so it outranks the plain-lap rule whatever the source order.
    const pb = '.row__gap--flash.row__gap--flash-personal-best'
    expect(themed('vintage80', pb, 'background')).toBe('var(--bc-lap-pb)')
    expect(themed('vintage80', pb, 'box-shadow')).toBe(`0 0 0 2px var(--bc-lap-pb), ${RING}`)
  })

  it('session- and class-best flash: a purple block', () => {
    for (const tier of ['.row__gap--flash.row__gap--flash-session-best', '.row__gap--flash.row__gap--flash-class-best']) {
      expect(themed('vintage80', tier, 'background'), tier).toBe('var(--bc-lap-best)')
      expect(themed('vintage80', tier, 'box-shadow'), tier).toBe(`0 0 0 2px var(--bc-lap-best), ${RING}`)
    }
  })

  it('re-cut: no shine element renders', () => {
    expect(themed('vintage80', '.row__oncam-flash', 'display')).toBe('none')
  })
})

describe('the vintage rules change no box size (overlay-config rule 60)', () => {
  // Box size and spacing. A border colour, radius or style is paint; a border width is not.
  const GEOMETRY =
    /^(width|min-width|max-width|height|min-height|max-height|font|font-size|font-family|font-weight|letter-spacing|line-height|text-transform|white-space|inset|top|right|bottom|left|position|gap|column-gap|row-gap|display)$|^(padding|margin|flex|grid)(-|$)|^border(-(top|right|bottom|left))?(-width)?$/
  for (const preset of ['vintage70', 'vintage80']) {
    it(`${preset}: no themed tower rule sets a size or spacing property`, () => {
      const scope = `:global([data-theme='${preset}'])`
      const themedRules = RULES.filter((r) => r.selectors.some((s) => s.startsWith(scope)))
      expect(themedRules.length, `no ${preset} rules in the tower`).toBeGreaterThan(0)
      for (const rule of themedRules) {
        for (const prop of rule.decls.keys()) {
          // `display: none` on the shine overlay is rule 89/90's own exception: it removes an
          // absolutely positioned, zero-layout element.
          if (prop === 'display' && rule.selectors.every((s) => s.endsWith('.row__oncam-flash'))) continue
          expect(GEOMETRY.test(prop), `${rule.selectors[0]} sets ${prop}`).toBe(false)
        }
      }
    })
  }
})
