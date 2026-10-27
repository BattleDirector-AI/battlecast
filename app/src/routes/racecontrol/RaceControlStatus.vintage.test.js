/* Race Control's own vintage look — widgets.md rules 95 (vintage70) and 96 (vintage80), ADR 0031,
 * how/renderer.md "Race Control".
 *
 * happy-dom applies no stylesheet, so a rendered strip cannot tell us its fill, typeface or
 * shadow. These tests read the rules from the component source (Vite `?raw`), keyed on the theme
 * selector how/renderer.md prescribes (`:global([data-theme='…'])` on an ancestor, so the /config
 * preview gets them too), and assert the paint each spec bullet names. A rule written under
 * `:root[data-theme]` only, or under the wrong preset, does not count. The last block renders the
 * strip inside each theme scope and checks the content is the same in every preset.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import RaceControlStatus from './RaceControlStatus.svelte'
import source from './RaceControlStatus.svelte?raw'
import fcySession from '../../../../spec/v1/fixtures/race-session-fcy.json'
import localYellow from '../../../../spec/v1/fixtures/race-local-yellow.json'

afterEach(() => cleanup())

/** Flat rules of the component's <style>, in source order: [{ selectors: string[], decls: Map }]. */
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

const scopeOf = (preset) => `:global([data-theme='${preset}']) `

/** The declared value of `prop` in a rule for `target` under the preset's ancestor scope. */
function themed(preset, target, prop) {
  let value
  for (const rule of RULES) {
    if (rule.selectors.some((s) => s === scopeOf(preset) + target) && rule.decls.has(prop)) value = rule.decls.get(prop)
  }
  return value
}

/** Source index of the last rule for `selector` that declares `prop`; -1 if none. */
function lastIndex(selector, prop) {
  let index = -1
  RULES.forEach((rule, i) => {
    if (rule.selectors.includes(selector) && rule.decls.has(prop)) index = i
  })
  return index
}

const BADGES = ['.bc-racecontrol__badge', '.bc-racecontrol__badge--fcy', '.bc-racecontrol__badge--sc', '.bc-racecontrol__badge--sector']
// The full-motion pulse on the strip itself (the glow bloom); the ring pulses on `::after`.
const BASE_PULSE = ":global(:root:not([data-motion='reduced'])) .bc-racecontrol--caution"
const CAUTION = '.bc-racecontrol.bc-racecontrol--caution'

/** Both presets drop the glow bloom and keep the ring's pulse (rules 95, 96). */
function cautionIsGlowless(preset) {
  expect(themed(preset, CAUTION, 'animation')).toBe('none')
  // Equal specificity to the base pulse rule, so it must come after it to win.
  expect(lastIndex(scopeOf(preset) + CAUTION, 'animation')).toBeGreaterThan(lastIndex(BASE_PULSE, 'animation'))
  // The ring keeps its pulse: no themed rule stops or replaces it.
  expect(themed(preset, '.bc-racecontrol--caution::after', 'animation')).toBeUndefined()
  expect(themed(preset, '.bc-racecontrol--caution::after', 'box-shadow')).toBeUndefined()
}

describe('vintage70 Race Control (rule 95)', () => {
  it('strip: a 4px accent rule along its bottom edge, inside it, over the header plate', () => {
    expect(themed('vintage70', '.bc-racecontrol', 'background')).toBe(
      'linear-gradient(var(--bc-accent), var(--bc-accent)) bottom / 100% 4px no-repeat, var(--bc-header)',
    )
  })

  it('flag swatch: skewed 8 degrees, top edge to the right', () => {
    expect(themed('vintage70', '.bc-racecontrol__swatch', 'transform')).toBe('skewX(-8deg)')
  })

  it('chips: not skewed, so their italic type leans once', () => {
    for (const chip of BADGES) expect(themed('vintage70', chip, 'transform'), chip).toBeUndefined()
  })

  it('FCY chip: dark text with no extrusion, and a hard 2px black drop shadow', () => {
    expect(themed('vintage70', '.bc-racecontrol__badge--fcy', 'text-shadow')).toBe('none')
    expect(themed('vintage70', '.bc-racecontrol__badge--fcy', 'filter')).toBe('drop-shadow(2px 2px 0 #000)')
  })

  it('caution: no glow bloom; the ring still pulses', () => cautionIsGlowless('vintage70'))
})

describe('vintage80 Race Control (rule 96)', () => {
  it('flag label and every chip are set in the display face, not the timing-page face', () => {
    expect(themed('vintage80', '.bc-racecontrol__flag-label', 'font-family')).toBe('var(--bc-font-display)')
    expect(themed('vintage80', '.bc-racecontrol__badge', 'font-family')).toBe('var(--bc-font-display)')
  })

  it('flag swatch: its own edge plus a 2px black ring, so a red swatch shows on the red strip', () => {
    expect(themed('vintage80', '.bc-racecontrol__swatch', 'box-shadow')).toBe('inset 0 0 0 1px rgba(0, 0, 0, 0.35), 0 0 0 2px #000')
    // A background here would wipe each flag's colour and the chequered squares.
    expect(themed('vintage80', '.bc-racecontrol__swatch', 'background')).toBeUndefined()
  })

  it('FCY chip: dark text with no outline', () => {
    expect(themed('vintage80', '.bc-racecontrol__badge--fcy', 'text-shadow')).toBe('none')
  })

  it('strip: keeps the Scoreboard red header plate and its hard shadow', () => {
    expect(themed('vintage80', '.bc-racecontrol', 'background')).toBeUndefined()
    expect(themed('vintage80', '.bc-racecontrol', 'box-shadow')).toBeUndefined()
  })

  it('caution: no glow bloom; the ring still pulses', () => cautionIsGlowless('vintage80'))
})

describe('everything rules 95-96 do not name renders the base look', () => {
  // The whole themed surface, as how/renderer.md prescribes it: selector -> property -> value.
  // Anything more (a skew on `__badges`, a dropped text shadow or plate shadow, a stopped ring
  // on `::after`) is a change the rules do not make.
  const EXPECTED = {
    vintage70: {
      '.bc-racecontrol': {
        background: 'linear-gradient(var(--bc-accent), var(--bc-accent)) bottom / 100% 4px no-repeat, var(--bc-header)',
      },
      '.bc-racecontrol__swatch': { transform: 'skewX(-8deg)' },
      '.bc-racecontrol__badge--fcy': { 'text-shadow': 'none', filter: 'drop-shadow(2px 2px 0 #000)' },
      [CAUTION]: { animation: 'none' },
    },
    vintage80: {
      '.bc-racecontrol__flag-label': { 'font-family': 'var(--bc-font-display)' },
      '.bc-racecontrol__badge': { 'font-family': 'var(--bc-font-display)' },
      '.bc-racecontrol__swatch': { 'box-shadow': 'inset 0 0 0 1px rgba(0, 0, 0, 0.35), 0 0 0 2px #000' },
      '.bc-racecontrol__badge--fcy': { 'text-shadow': 'none' },
      [CAUTION]: { animation: 'none' },
    },
  }

  /** Every (target, property, value) declared under the preset's scope, merged in source order. */
  function surface(preset) {
    const out = {}
    for (const rule of RULES) {
      for (const s of rule.selectors) {
        if (!s.startsWith(scopeOf(preset))) continue
        const target = s.slice(scopeOf(preset).length)
        out[target] = { ...out[target], ...Object.fromEntries(rule.decls) }
      }
    }
    return out
  }

  for (const preset of ['vintage70', 'vintage80']) {
    it(`${preset}: the themed rules are exactly the ones the rule names`, () => {
      expect(surface(preset)).toEqual(EXPECTED[preset])
    })
  }

  it('every theme selector is one of the two quoted ancestor scopes', () => {
    // `:root[data-theme=…]` would miss the /config preview; an unquoted or other-preset scope
    // would escape the closed-set check above.
    const themedSelectors = RULES.flatMap((r) => r.selectors).filter((s) => s.includes('data-theme'))
    expect(themedSelectors.length, 'no theme selectors in Race Control').toBeGreaterThan(0)
    for (const s of themedSelectors) {
      expect(s.startsWith(scopeOf('vintage70')) || s.startsWith(scopeOf('vintage80')), s).toBe(true)
    }
  })
})

describe('the vintage rules set no size or spacing property (overlay-config rule 60)', () => {
  // Set lengths and spacing. A typeface is paint, and the strip sizes to its text (rule 60's
  // text-sized box); a font size or weight is a set length, so it is not.
  const GEOMETRY =
    /^(width|min-width|max-width|height|min-height|max-height|font|font-size|font-weight|letter-spacing|line-height|text-transform|white-space|inset|top|right|bottom|left|position|gap|column-gap|row-gap|display)$|^(padding|margin|flex|grid)(-|$)|^border(-(top|right|bottom|left))?(-width)?$/
  for (const preset of ['vintage70', 'vintage80']) {
    it(`${preset}: no themed Race Control rule sets a size or spacing property`, () => {
      const themedRules = RULES.filter((r) => r.selectors.some((s) => s.startsWith(scopeOf(preset).trim())))
      expect(themedRules.length, `no ${preset} rules in Race Control`).toBeGreaterThan(0)
      for (const rule of themedRules) {
        for (const prop of rule.decls.keys()) {
          expect(GEOMETRY.test(prop), `${rule.selectors[0]} sets ${prop}`).toBe(false)
        }
      }
    })
  }
})

describe('every preset shows the same content (overlay-config rule 60)', () => {
  function textIn(preset, session) {
    const target = document.createElement('div')
    target.setAttribute('data-theme', preset)
    document.body.append(target)
    const { container } = render(RaceControlStatus, { target, props: { session, mode: 'race' } })
    const parts = [...container.querySelectorAll('[data-testid^="racecontrol-"]')].map(
      (el) => `${el.dataset.testid}=${el.textContent.replace(/\s+/g, ' ').trim()}`,
    )
    target.remove()
    return parts
  }

  for (const [name, session] of [
    ['race-session-fcy.json', fcySession.session],
    ['race-local-yellow.json', localYellow.session],
  ]) {
    it(`${name}: the same elements and text under modern, vintage70 and vintage80`, () => {
      const modern = textIn('modern', session)
      expect(modern.length).toBeGreaterThan(1)
      expect(textIn('vintage70', session)).toEqual(modern)
      expect(textIn('vintage80', session)).toEqual(modern)
    })
  }
})
