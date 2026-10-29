/* The race update box's own vintage look — widgets.md rules 99 (vintage70) and 100 (vintage80),
 * ADR 0033, how/renderer.md "Race update box".
 *
 * happy-dom applies no stylesheet, so a rendered card cannot tell us its colour, face or shadow.
 * As StandingsTower.vintage.test.js does, these tests read the rules from the component source
 * (Vite `?raw`), keyed on the theme selector how/renderer.md prescribes (`:global([data-theme='…'])`
 * on an ancestor, so the /config preview gets them too), and assert the paint each spec bullet
 * names. A rule written under `:root[data-theme]` only, or under the wrong preset, does not count.
 *
 * "Everything this rule does not name renders the base look" is held by a closed set: each
 * preset's themed declarations must equal, exactly, the list in how/renderer.md.
 */
import { describe, it, expect } from 'vitest'
import source from './RaceUpdateBox.svelte?raw'
import shellSource from '../../lib/LowerThirdShell.svelte?raw'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// app.css is read from disk, as the token tests read theirs.
const appCss = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../app.css'), 'utf8')

/** Flat rules of a <style> or stylesheet: [{ selectors: string[], decls: Map }]. */
function parseRules(text) {
  const css = (/<style>([\s\S]*?)<\/style>/.exec(text)?.[1] ?? text).replace(/\/\*[\s\S]*?\*\//g, '')
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
const RULES = parseRules(source)

const PRESETS = ['vintage70', 'vintage80']
const scopeOf = (preset) => `:global([data-theme='${preset}']) `

/** The declared value of `prop` in a rule for `target` under the preset's ancestor scope. */
function themed(preset, target, prop) {
  let value
  for (const rule of RULES) {
    if (rule.selectors.some((s) => s === scopeOf(preset) + target) && rule.decls.has(prop)) value = rule.decls.get(prop)
  }
  return value
}

/** The declared value of `prop` in an unthemed rule for exactly `target`. */
function base(target, prop) {
  let value
  for (const rule of RULES) {
    if (rule.selectors.includes(target) && rule.decls.has(prop)) value = rule.decls.get(prop)
  }
  return value
}

/** Every themed declaration for the preset, as { target: { prop: value } }. */
function themedSet(preset) {
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

const TEXT = ['.bc-ru__label', '.bc-ru__name', '.bc-ru__value', '.bc-ru__detail']
const ACCENT_BAR = { 'border-radius': '0', 'box-shadow': '2px 2px 0 #000' }

describe('accent bar under both presets (rules 99, 100)', () => {
  for (const preset of PRESETS) {
    it(`${preset}: flat and square, its glow replaced by a hard 2px black drop shadow`, () => {
      expect(themed(preset, '.bc-ru__accent', 'border-radius')).toBe('0')
      // Replacing the whole shadow is what removes the base `0 0 12px var(--bc-accent-glow)`.
      expect(themed(preset, '.bc-ru__accent', 'box-shadow')).toBe('2px 2px 0 #000')
    })
  }
})

describe('vintage70 race update box (rule 99)', () => {
  it('value: warm white, not the red accent', () => {
    expect(themed('vintage70', '.bc-ru__value', 'color')).toBe('var(--bc-text-2)')
  })

  it('no line of text is red: each line\'s effective colour is not a red token', () => {
    // The themed colour where one is set, else the line's base colour, else the card's.
    for (const t of TEXT) {
      const colour = themed('vintage70', t, 'color') ?? base(t, 'color') ?? base('.bc-ru', 'color')
      expect(colour, t).toBeDefined()
      expect(colour, t).not.toMatch(/--bc-(accent|live|down|intensity)/)
    }
  })
})

describe('vintage80 race update box (rule 100)', () => {
  it('label as a tag: a header-red block, 2px past its line, a hard 3px black drop shadow', () => {
    expect(themed('vintage80', '.bc-ru__label', 'background')).toBe('var(--bc-header)')
    expect(themed('vintage80', '.bc-ru__label', 'box-shadow')).toBe('0 0 0 2px var(--bc-header), 3px 3px 0 2px #000')
  })

  it('label as a tag: as wide as its text, not the card', () => {
    // The label is a flex item of a column, so by default it stretches to the card's width and a
    // background would fill the whole line.
    expect(themed('vintage80', '.bc-ru__label', 'align-self')).toBe('flex-start')
  })

  it('label as a tag: white display-face text with no outline', () => {
    expect(themed('vintage80', '.bc-ru__label', 'font-family')).toBe('var(--bc-font-display)')
    expect(themed('vintage80', '.bc-ru__label', 'color')).toBe('var(--bc-text-2)')
    expect(themed('vintage80', '.bc-ru__label', 'text-shadow')).toBe('none')
  })

  it('detail: the display face', () => {
    expect(themed('vintage80', '.bc-ru__detail', 'font-family')).toBe('var(--bc-font-display)')
  })
})

describe('everything the rules do not name renders the base look', () => {
  // The closed set, exactly as how/renderer.md lists it. Any other selector or property (a lean
  // dropped, a stroke on the name, a transform, a background on `.bc-ru` over the shell's plate)
  // fails here.
  const EXPECTED = {
    vintage70: {
      '.bc-ru__accent': ACCENT_BAR,
      '.bc-ru__value': { color: 'var(--bc-text-2)' },
    },
    vintage80: {
      '.bc-ru__accent': ACCENT_BAR,
      '.bc-ru__label': {
        'align-self': 'flex-start',
        'font-family': 'var(--bc-font-display)',
        color: 'var(--bc-text-2)',
        background: 'var(--bc-header)',
        'box-shadow': '0 0 0 2px var(--bc-header), 3px 3px 0 2px #000',
        'text-shadow': 'none',
      },
      '.bc-ru__detail': { 'font-family': 'var(--bc-font-display)' },
    },
  }
  for (const preset of PRESETS) {
    it(`${preset}: the themed declarations are exactly the listed ones`, () => {
      expect(themedSet(preset)).toEqual(EXPECTED[preset])
    })
  }

  it('every data-theme selector uses one of the two exact preset scopes', () => {
    // An unquoted `[data-theme=vintage80]`, a bare `[data-theme]` or a `:root[data-theme…]` would
    // slip past the closed set above.
    for (const rule of RULES) {
      for (const s of rule.selectors) {
        if (!s.includes('data-theme')) continue
        expect(PRESETS.some((p) => s.startsWith(scopeOf(p))) && s.indexOf('data-theme') === s.lastIndexOf('data-theme'), s).toBe(true)
      }
    }
  })
})

describe('a face changes no line box (rule 100, how/renderer.md)', () => {
  // The card's lines take their height from the line height they inherit, so swapping the label
  // and detail to the display face moves nothing. That line height comes from app.css's `:root`
  // `font` shorthand; it must stay a set length or percentage, and nothing between it and the
  // card's lines may reset it (a `font` shorthand resets line-height to `normal`).
  it('app.css :root sets a length or percentage line height', () => {
    // The first top-level `:root` block, nested `@media` included (it only changes font-size).
    const css = appCss.replace(/\/\*[\s\S]*?\*\//g, '')
    const at = css.search(/(^|\n):root\s*\{/)
    let i = css.indexOf('{', at)
    const start = i
    for (let depth = 0; i < css.length; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}' && --depth === 0) break
    }
    const block = css.slice(start + 1, i)
    expect(/(^|[;{\s])font:\s*([^;]*)/.exec(block)?.[2] ?? '', 'app.css :root font').toMatch(/^[\d.]+px\s*\/\s*[\d.]+(%|px)\s/)
    expect(/(^|[;{\s])line-height\s*:/.test(block), 'app.css :root line-height').toBe(false)
  })

  it('neither the box nor the shell sets a line height or a font shorthand', () => {
    for (const [file, rules] of [
      ['RaceUpdateBox.svelte', RULES],
      ['LowerThirdShell.svelte', parseRules(shellSource)],
    ]) {
      for (const rule of rules) {
        for (const prop of ['line-height', 'font']) {
          expect(rule.decls.has(prop), `${file} ${rule.selectors[0]} sets ${prop}`).toBe(false)
        }
      }
    }
  })
})
