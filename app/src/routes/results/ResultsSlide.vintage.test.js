/* The /results slide's own vintage look — widgets.md rules 105 (vintage70) and 106 (vintage80),
 * ADR 0036, how/renderer.md "Takeover slides".
 *
 * happy-dom applies no stylesheet, so a rendered row cannot tell us its fill, colour or shadow.
 * These tests read the rules from the component source (Vite `?raw`), keyed on the theme
 * selector how/renderer.md prescribes (`:global([data-theme='…'])` on an ancestor), and assert
 * the paint each spec bullet names. A rule written under `:root[data-theme]` only, or under the
 * wrong preset, does not count. The last block renders the slide and checks that every themed
 * selector names an element it draws, so a rule aimed at a class the markup lacks fails too.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import ResultsSlide from './ResultsSlide.svelte'
import source from './ResultsSlide.svelte?raw'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'

afterEach(() => cleanup())

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
const scopeOf = (preset) => `:global([data-theme='${preset}'])`
const themedRules = (preset) => RULES.filter((r) => r.selectors.some((s) => s.startsWith(scopeOf(preset))))

/** The declared value of `prop` in a rule for `target` under the preset's ancestor scope. */
function themed(preset, target, prop) {
  const scope = `${scopeOf(preset)} `
  let value
  for (const rule of RULES) {
    if (rule.selectors.some((s) => s === scope + target) && rule.decls.has(prop)) value = rule.decls.get(prop)
  }
  return value
}

const CHIPS = ['.group__head :global(.bc-class-chip)', '.results__filter :global(.bc-class-chip)']

/** Every `selector | prop: value` the preset's scope declares, sorted; hex colours lower-cased. */
function themedDecls(preset) {
  const scope = `${scopeOf(preset)} `
  const out = []
  for (const rule of RULES) {
    for (const sel of rule.selectors.filter((s) => s.startsWith(scope))) {
      for (const [prop, value] of rule.decls) {
        out.push(`${sel.slice(scope.length)} | ${prop}: ${value.replace(/#[0-9a-f]{3,8}\b/gi, (h) => h.toLowerCase())}`)
      }
    }
  }
  return out.sort()
}

/** The whole of rules 105 and 106 for this slide: the preset scope themes nothing else. */
const EXPECTED = {
  vintage70: [
    '.results | background: var(--bc-plate-solid)',
    '.results__header | box-shadow: inset 0 -4px 0 var(--bc-accent)',
    '.group__count | color: #35d4c8',
    '.group__colhead | color: #35d4c8',
    '.row__pos | color: var(--bc-text-2)',
    ...CHIPS.flatMap((c) => [
      `${c} | transform: skewX(-8deg)`,
      `${c} | filter: drop-shadow(2px 2px 0 #000)`,
      `${c} | font-style: normal`,
    ]),
  ].sort(),
  vintage80: [
    '.results | background: var(--bc-plate-solid)',
    '.results__title | background: var(--bc-header)',
    '.results__title | box-shadow: 0 0 0 6px var(--bc-header)',
    '.results__title | color: var(--bc-text-2)',
    '.group__count | color: var(--bc-text-2)',
    '.group__colhead | color: var(--bc-text-2)',
    '.row__pos | color: var(--bc-text-2)',
  ].sort(),
}

describe('vintage70 results slide (rule 105)', () => {
  it('board: solid black', () => {
    expect(themed('vintage70', '.results', 'background')).toBe('var(--bc-plate-solid)')
  })

  it('header: a 4px accent rule along its bottom edge, inside it', () => {
    expect(themed('vintage70', '.results__header', 'box-shadow')).toBe('inset 0 -4px 0 var(--bc-accent)')
  })

  it('subheads: each group car count and the column heads are teal', () => {
    // The column-head spans set no colour of their own, so they inherit the row's.
    for (const sub of ['.group__count', '.group__colhead']) {
      expect(themed('vintage70', sub, 'color')?.toLowerCase(), sub).toBe('#35d4c8')
    }
  })

  it('position numerals: warm white', () => {
    expect(themed('vintage70', '.row__pos', 'color')).toBe('var(--bc-text-2)')
  })

  it('class chips (group header and filter): skewed 8 degrees, a hard 2px black drop shadow, label upright', () => {
    for (const chip of CHIPS) {
      expect(themed('vintage70', chip, 'transform'), chip).toBe('skewX(-8deg)')
      expect(themed('vintage70', chip, 'filter'), chip).toBe('drop-shadow(2px 2px 0 #000)')
      // The skew gives the lean; an italic label on top would lean twice.
      expect(themed('vintage70', chip, 'font-style'), chip).toBe('normal')
    }
  })

  it('the red marks nothing else: only the header rule names the accent', () => {
    const accent = RULES.filter((r) => [...r.decls.values()].some((v) => v.includes('--bc-accent')))
    expect(accent.map((r) => r.selectors)).toEqual([[`${scopeOf('vintage70')} .results__header`]])
  })
})

describe('vintage80 results slide (rule 106)', () => {
  it('board: solid black', () => {
    expect(themed('vintage80', '.results', 'background')).toBe('var(--bc-plate-solid)')
  })

  it('title on a Scoreboard plate: header red, 6px past the title, no shadow, white type', () => {
    expect(themed('vintage80', '.results__title', 'background')).toBe('var(--bc-header)')
    expect(themed('vintage80', '.results__title', 'box-shadow')).toBe('0 0 0 6px var(--bc-header)')
    // Lime on the header red misses 4.5:1; the preset white clears it, as the mock's bar label does.
    expect(themed('vintage80', '.results__title', 'color')).toBe('var(--bc-text-2)')
  })

  it('subheads: each group car count and the column heads are the preset white', () => {
    for (const sub of ['.group__count', '.group__colhead']) {
      expect(themed('vintage80', sub, 'color'), sub).toBe('var(--bc-text-2)')
    }
  })

  it('position numerals: the preset white', () => {
    expect(themed('vintage80', '.row__pos', 'color')).toBe('var(--bc-text-2)')
  })

  it('class chips: unchanged from the base look', () => {
    const chipRules = themedRules('vintage80').filter((r) => r.selectors.some((s) => s.includes('bc-class-chip')))
    expect(chipRules).toEqual([])
  })
})

describe('the themed CSS is a closed set', () => {
  it('every rule that names data-theme uses the exact quoted ancestor scope', () => {
    const scopes = ['vintage70', 'vintage80'].map((p) => `${scopeOf(p)} `)
    for (const rule of RULES) {
      for (const sel of rule.selectors.filter((s) => s.includes('data-theme'))) {
        const scope = scopes.find((sc) => sel.startsWith(sc))
        expect(scope, `${sel} is not under an exact :global([data-theme='...']) scope`).toBeDefined()
        expect(sel.slice(scope.length), `${sel} names data-theme twice`).not.toContain('data-theme')
      }
    }
  })

  for (const preset of ['vintage70', 'vintage80']) {
    it(`${preset}: themes exactly what its rule names, and nothing else`, () => {
      expect(themedDecls(preset)).toEqual(EXPECTED[preset])
    })
  }
})

describe('the vintage rules change paint only (overlay-config rule 60)', () => {
  // Box size and spacing. A border colour, radius or style is paint; a border width is not.
  const GEOMETRY =
    /^(width|min-width|max-width|height|min-height|max-height|font|font-size|font-family|font-weight|letter-spacing|line-height|text-transform|white-space|inset|top|right|bottom|left|position|gap|column-gap|row-gap|display)$|^(padding|margin|flex|grid)(-|$)|^border(-(top|right|bottom|left))?(-width)?$/
  for (const preset of ['vintage70', 'vintage80']) {
    it(`${preset}: no themed slide rule sets a size or spacing property, or its own text shadow`, () => {
      const rules = themedRules(preset)
      expect(rules.length, `no ${preset} rules in the results slide`).toBeGreaterThan(0)
      for (const rule of rules) {
        for (const prop of rule.decls.keys()) {
          expect(GEOMETRY.test(prop), `${rule.selectors[0]} sets ${prop}`).toBe(false)
          // Every text keeps the base look's small-text shadow (rules 105, 106 "Type").
          expect(prop, `${rule.selectors[0]} sets its own text shadow`).not.toBe('text-shadow')
        }
      }
    })

    it(`${preset}: every themed selector names an element the slide renders`, () => {
      const { container } = render(ResultsSlide, { snapshot: multiClass, classFilter: 'GTP' })
      const rules = themedRules(preset)
      expect(rules.length, `no ${preset} rules in the results slide`).toBeGreaterThan(0)
      for (const rule of rules) {
        for (const sel of rule.selectors.filter((s) => s.startsWith(scopeOf(preset)))) {
          const query = sel.slice(scopeOf(preset).length).replace(/:global\(([^)]*)\)/g, '$1').trim()
          expect(container.querySelector(query), `${sel} matches nothing`).not.toBeNull()
        }
      }
    })
  }
})
