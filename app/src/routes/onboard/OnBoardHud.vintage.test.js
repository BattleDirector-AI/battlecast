/* The on-board HUD's own vintage look — widgets.md rules 97 (vintage70) and 98 (vintage80),
 * ADR 0032, how/renderer.md "On-board HUD".
 *
 * happy-dom applies no stylesheet, so a rendered HUD cannot tell us its fill, colour or shadow.
 * These tests read the rules from the component source (Vite `?raw`), keyed on the theme
 * selector how/renderer.md prescribes (`:global([data-theme='…'])` on an ancestor, so the
 * /config preview gets them too), and assert the paint each spec bullet names. A rule written
 * under `:root[data-theme]` only, or under the wrong preset, does not count, and the complete
 * set of themed declarations is pinned per preset, so nothing else rides along. The face test
 * reads the token CSS from disk (a `?raw` CSS import is empty under vitest) to check that the
 * face an upright label names is bundled with an upright cut. The last block renders the HUD
 * from a spec/v1 fixture under each preset and checks the content is the same.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, cleanup } from '@testing-library/svelte'
import source from './OnBoardHud.svelte?raw'
import OnBoardHud, { resolveIdentity } from './OnBoardHud.svelte'
import fixture from '../../../../spec/v1/fixtures/race-onboard-telemetry.json'

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

const SEGMENTS_70 = 'repeating-linear-gradient(104deg, #000 0 10px, transparent 10px 13px)'
const SEGMENTS_80 = 'repeating-linear-gradient(90deg, #000 0 10px, transparent 10px 12px)'
const CHIP = '.bc-onboard__class :global(.bc-class-chip)'

describe('vintage70 on-board HUD (rule 97)', () => {
  const SEGMENTS = SEGMENTS_70

  it('plate: a 4px accent rule along its bottom edge, inside it', () => {
    expect(themed('vintage70', '.bc-onboard', 'box-shadow')).toBe('inset 0 -4px 0 var(--bc-accent)')
  })

  it('car number: a skewed red tile with a hard drop shadow and upright white type', () => {
    expect(themed('vintage70', '.bc-onboard__number', 'transform')).toBe('skewX(-8deg)')
    expect(themed('vintage70', '.bc-onboard__number', 'filter')).toBe('drop-shadow(2px 2px 0 #000)')
    // The skew gives the lean; an italic numeral on top would lean twice.
    expect(themed('vintage70', '.bc-onboard__number', 'font-style')).toBe('normal')
    // Dark text under the black extrusion is unreadable on red: white, and no shadow.
    expect(themed('vintage70', '.bc-onboard__number', 'color')).toBe('var(--bc-oncam-text)')
    expect(themed('vintage70', '.bc-onboard__number', 'text-shadow')).toBe('none')
    // The tile keeps its accent fill.
    expect(themed('vintage70', '.bc-onboard__number', 'background')).toBeUndefined()
  })

  it('class chip: skewed 8 degrees with a hard 2px black drop shadow', () => {
    expect(themed('vintage70', '.bc-onboard__class', 'transform')).toBe('skewX(-8deg)')
    expect(themed('vintage70', '.bc-onboard__class', 'filter')).toBe('drop-shadow(2px 2px 0 #000)')
  })

  it('class chip: its label is upright type in the display face, so the skew alone leans it', () => {
    // ClassChip sets its own face (--bc-font-ui, Barlow: bundled italic only, so `normal` alone
    // would still render italic and lean twice). The rule must reach the chip itself.
    expect(themed('vintage70', CHIP, 'font-family')).toBe('var(--bc-font-display)')
    expect(themed('vintage70', CHIP, 'font-style')).toBe('normal')
  })

  it('bar and readout labels: the display face, so THROTTLE clears its bar', () => {
    for (const label of ['.bc-onboard__bar-label', '.bc-onboard__readout-label']) {
      expect(themed('vintage70', label, 'font-family'), label).toBe('var(--bc-font-display)')
      // Still italic: the base lean stays.
      expect(themed('vintage70', label, 'font-style'), label).toBeUndefined()
    }
  })

  it('gear numeral: gold like the speed, not the red accent', () => {
    expect(themed('vintage70', '.bc-onboard__value--gear', 'color')).toBe('var(--bc-text)')
  })

  it('bars: square ends, split into segments leaning 14 degrees', () => {
    expect(themed('vintage70', '.bc-onboard__track', 'border-radius')).toBe('0')
    expect(themed('vintage70', '.bc-onboard__fill', 'border-radius')).toBe('0')
    expect(themed('vintage70', '.bc-onboard__track', 'mask-image')).toBe(SEGMENTS)
    // OBS builds on older CEF need the prefixed property.
    expect(themed('vintage70', '.bc-onboard__track', '-webkit-mask-image')).toBe(SEGMENTS)
  })
})

describe('vintage80 on-board HUD (rule 98)', () => {
  const SEGMENTS = SEGMENTS_80

  it('plate: the black widget plate, not the red Scoreboard header', () => {
    // The token, not a literal black: AllView scales it by the widget's plateAlpha.
    expect(themed('vintage80', '.bc-onboard', 'background')).toBe('var(--bc-plate)')
  })

  it('ON BOARD label in reverse video: a live-red block 4px past the label, dark text, no outline', () => {
    expect(themed('vintage80', '.bc-onboard__label', 'background')).toBe('var(--bc-live)')
    expect(themed('vintage80', '.bc-onboard__label', 'box-shadow')).toBe('0 0 0 4px var(--bc-live)')
    expect(themed('vintage80', '.bc-onboard__label', 'color')).toBe('var(--bc-text-on-accent)')
    expect(themed('vintage80', '.bc-onboard__label', 'text-shadow')).toBe('none')
  })

  it('position in reverse video: a white block 4px past the numeral, dark text, no outline', () => {
    expect(themed('vintage80', '.bc-onboard__position', 'background')).toBe('var(--bc-text-2)')
    expect(themed('vintage80', '.bc-onboard__position', 'box-shadow')).toBe('0 0 0 4px var(--bc-text-2)')
    expect(themed('vintage80', '.bc-onboard__position', 'color')).toBe('var(--bc-text-on-accent)')
    expect(themed('vintage80', '.bc-onboard__position', 'text-shadow')).toBe('none')
  })

  it('car number: its lime tile and dark numeral, with no outline', () => {
    expect(themed('vintage80', '.bc-onboard__number', 'text-shadow')).toBe('none')
    expect(themed('vintage80', '.bc-onboard__number', 'background')).toBeUndefined()
    expect(themed('vintage80', '.bc-onboard__number', 'color')).toBeUndefined()
  })

  it("driver name: the preset's yellow-green", () => {
    expect(themed('vintage80', '.bc-onboard__driver', 'color')).toBe('var(--bc-text)')
  })

  it('bars: square ends, split into upright blocks', () => {
    expect(themed('vintage80', '.bc-onboard__track', 'border-radius')).toBe('0')
    expect(themed('vintage80', '.bc-onboard__fill', 'border-radius')).toBe('0')
    expect(themed('vintage80', '.bc-onboard__track', 'mask-image')).toBe(SEGMENTS)
    expect(themed('vintage80', '.bc-onboard__track', '-webkit-mask-image')).toBe(SEGMENTS)
  })
})

describe('the upright chip label has a bundled upright face (rule 97)', () => {
  const TOKENS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'design', 'tokens')
  const css = (f) => readFileSync(join(TOKENS, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  /** A custom property's value in the first block whose selector is exactly `selector`. */
  const token = (file, selector, name) => {
    const block = css(file).split('}').find((b) => b.split('{')[0].trim() === selector) ?? ''
    return new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1].trim()
  }
  /** Bundled faces: [family, style, [minWeight, maxWeight]]. */
  const faces = [...css('fonts.css').matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
    const get = (p) => new RegExp(`${p}:\\s*([^;]+);`).exec(body)?.[1].trim()
    const [lo, hi = lo] = get('font-weight').split(/\s+/).map(Number)
    return [get('font-family').replace(/['"]/g, ''), get('font-style'), [lo, hi]]
  })

  it("the chip label's face under vintage70 has a normal cut at the chip's weight", () => {
    const name = /var\((--[\w-]+)\)/.exec(themed('vintage70', CHIP, 'font-family') ?? '')?.[1]
    expect(name, 'the chip label names a font token').toBeTruthy()
    const family = token('typography.css', '[data-theme="vintage70"]', name)?.split(',')[0].replace(/['"]/g, '').trim()
    // ClassChip's weight is --bc-weight-label, which no preset overrides.
    const weight = Number(token('typography.css', ':root', '--bc-weight-label'))
    expect(weight).toBe(700)
    const upright = faces.some(([f, style, [lo, hi]]) => f === family && style === 'normal' && lo <= weight && weight <= hi)
    expect(upright, `${family} has no bundled normal ${weight} face`).toBe(true)
  })
})

describe('the vintage rules are exactly these, and paint only (overlay-config rule 60)', () => {
  // The complete themed declaration set per preset, as [selector, property, value]. Anything
  // more (a size, spacing, motion or custom-property override, a recoloured fill or track, a
  // stray selector) fails, and so does anything missing.
  const EXPECTED = {
    vintage70: [
      ['.bc-onboard', 'box-shadow', 'inset 0 -4px 0 var(--bc-accent)'],
      ['.bc-onboard__number', 'color', 'var(--bc-oncam-text)'],
      ['.bc-onboard__number', 'text-shadow', 'none'],
      ['.bc-onboard__number', 'font-style', 'normal'],
      ['.bc-onboard__number', 'transform', 'skewX(-8deg)'],
      ['.bc-onboard__number', 'filter', 'drop-shadow(2px 2px 0 #000)'],
      ['.bc-onboard__class', 'transform', 'skewX(-8deg)'],
      ['.bc-onboard__class', 'filter', 'drop-shadow(2px 2px 0 #000)'],
      [CHIP, 'font-family', 'var(--bc-font-display)'],
      [CHIP, 'font-style', 'normal'],
      ['.bc-onboard__bar-label', 'font-family', 'var(--bc-font-display)'],
      ['.bc-onboard__readout-label', 'font-family', 'var(--bc-font-display)'],
      ['.bc-onboard__value--gear', 'color', 'var(--bc-text)'],
      ['.bc-onboard__track', 'border-radius', '0'],
      ['.bc-onboard__fill', 'border-radius', '0'],
      ['.bc-onboard__track', '-webkit-mask-image', SEGMENTS_70],
      ['.bc-onboard__track', 'mask-image', SEGMENTS_70],
    ],
    vintage80: [
      ['.bc-onboard', 'background', 'var(--bc-plate)'],
      ['.bc-onboard__label', 'background', 'var(--bc-live)'],
      ['.bc-onboard__label', 'box-shadow', '0 0 0 4px var(--bc-live)'],
      ['.bc-onboard__label', 'color', 'var(--bc-text-on-accent)'],
      ['.bc-onboard__label', 'text-shadow', 'none'],
      ['.bc-onboard__position', 'background', 'var(--bc-text-2)'],
      ['.bc-onboard__position', 'box-shadow', '0 0 0 4px var(--bc-text-2)'],
      ['.bc-onboard__position', 'color', 'var(--bc-text-on-accent)'],
      ['.bc-onboard__position', 'text-shadow', 'none'],
      ['.bc-onboard__number', 'text-shadow', 'none'],
      ['.bc-onboard__driver', 'color', 'var(--bc-text)'],
      ['.bc-onboard__track', 'border-radius', '0'],
      ['.bc-onboard__fill', 'border-radius', '0'],
      ['.bc-onboard__track', '-webkit-mask-image', SEGMENTS_80],
      ['.bc-onboard__track', 'mask-image', SEGMENTS_80],
    ],
  }
  const key = ([sel, prop, value]) => `${sel} | ${prop} | ${value}`
  const SCOPES = Object.keys(EXPECTED).map((p) => `:global([data-theme='${p}']) `)

  it('every selector that names a theme uses one of the two exact ancestor scopes', () => {
    for (const rule of RULES) {
      for (const sel of rule.selectors) {
        if (!/data-theme/i.test(sel)) continue
        const scope = SCOPES.find((sc) => sel.startsWith(sc))
        expect(scope, `${sel} is not under an exact vintage scope`).toBeTruthy()
        expect(/data-theme/i.test(sel.slice(scope.length)), `${sel} names a theme twice`).toBe(false)
      }
    }
  })

  for (const [preset, rule] of [['vintage70', 97], ['vintage80', 98]]) {
    it(`${preset}: the themed declarations are exactly rule ${rule}'s`, () => {
      const scope = `:global([data-theme='${preset}']) `
      const actual = []
      for (const r of RULES) {
        for (const sel of r.selectors) {
          if (!sel.startsWith(scope)) continue
          for (const [prop, value] of r.decls) actual.push(key([sel.slice(scope.length), prop, value]))
        }
      }
      expect(actual.sort()).toEqual(EXPECTED[preset].map(key).sort())
    })
  }
})

describe('every preset shows the same HUD content (overlay-config rule 60)', () => {
  const ALL_FIELDS = { driverInfo: { name: true, number: true, position: true, class: true, make: true, model: true } }
  afterEach(() => cleanup())

  /** The HUD's text, item by item, and its fill widths, rendered inside a `data-theme` ancestor. */
  function renderIn(preset) {
    const host = document.body.appendChild(document.createElement('div'))
    host.setAttribute('data-theme', preset)
    const { unmount } = render(OnBoardHud, {
      target: host,
      props: {
        telemetry: fixture.subject.telemetry,
        identity: resolveIdentity(fixture, ALL_FIELDS, true),
      },
    })
    const hud = host.querySelector('[data-testid="onboard-hud"]')
    const items = [...hud.querySelectorAll('[data-testid]')].map((el) => [el.dataset.testid, el.textContent.trim()])
    const fills = [...hud.querySelectorAll('[data-testid$="-fill"]')].map((el) => el.style.width)
    unmount()
    host.remove()
    return { items, fills }
  }

  it('vintage70 and vintage80 render exactly the items, text and fill widths of modern', () => {
    const modern = renderIn('modern')
    // The fixture: P2, car 1, Verstappen, F1, Red Bull RB20, 82% throttle, 0% brake, 247, gear 6.
    expect(modern.items).toContainEqual(['onboard-label', 'ON BOARD'])
    expect(modern.items).toContainEqual(['onboard-driver-position', 'P2'])
    expect(modern.items).toContainEqual(['onboard-driver-number', '1'])
    expect(modern.items).toContainEqual(['onboard-driver-car', 'Red Bull RB20'])
    expect(modern.fills).toEqual(['82%', '0%'])
    for (const preset of ['vintage70', 'vintage80']) {
      expect(renderIn(preset), preset).toEqual(modern)
    }
  })
})
