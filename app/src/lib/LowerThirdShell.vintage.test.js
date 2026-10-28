/* The shared lower-third shell and the logo rotation under a vintage preset — widgets.md rule 107.
 *
 * happy-dom runs no CSS animation and applies no stylesheet, so whether a shine sweeps cannot be
 * observed here. As the tower's vintage test does, these tests read the rules from each
 * component's source (Vite `?raw`), keyed on the theme selector how/renderer.md prescribes
 * (`:global([data-theme='…'])` on an ancestor, so the /config preview gets them too). A rule
 * written under `:root[data-theme]` only, or under the wrong preset, does not count. The last
 * block renders the components to check the shine elements themselves are still there.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import Harness from './LowerThirdShellHarness.svelte'
import shellSource from './LowerThirdShell.svelte?raw'
import logosSource from '../routes/logos/LogoRotation.svelte?raw'

const PRESETS = ['vintage70', 'vintage80']

/** Flat rules of a component's <style>, @keyframes removed: [{ selectors: string[], decls: Map }]. */
function styleRules(source) {
  let src = (/<style>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
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

/** The last declared value of `prop` in a rule for `target` under the preset's ancestor scope. */
function themed(rules, preset, target, prop) {
  const scope = `:global([data-theme='${preset}']) `
  let value
  for (const rule of rules) {
    if (rule.selectors.some((s) => s === scope + target) && rule.decls.has(prop)) value = rule.decls.get(prop)
  }
  return value
}

const COMPONENTS = [
  // The shell: the driver and qualifying lower-thirds, the race update box and the info panel.
  { name: 'the lower-third shell', rules: styleRules(shellSource), shine: '.lt3__bar' },
  // The logo rotation keeps its own copy of the same reveal; its exit bar also carries this class.
  { name: 'the logo rotation', rules: styleRules(logosSource), shine: '.bc-logos__shine' },
]

describe('no shine sweep under a vintage preset (rule 107)', () => {
  for (const { name, rules, shine } of COMPONENTS) {
    for (const preset of PRESETS) {
      it(`${name} under ${preset}: the shine bar does not render, on the way in or out`, () => {
        expect(themed(rules, preset, shine, 'display')).toBe('none')
      })
    }

    it(`${name}: every vintage rule targets the shine bar alone, and only hides it`, () => {
      // Any selector naming data-theme counts, however it is spelled, so a rule cannot slip past
      // under :root[…], an unquoted value or a prefix match.
      const themedRules = rules.filter((r) => r.selectors.some((s) => s.includes('data-theme')))
      expect(themedRules.length, 'no vintage rule yet').toBeGreaterThan(0)
      const allowed = PRESETS.map((p) => `:global([data-theme='${p}']) ${shine}`)
      for (const rule of themedRules) {
        for (const s of rule.selectors) expect(allowed, `a vintage rule outside the shine bar: ${s}`).toContain(s)
        expect([...rule.decls.entries()], `${rule.selectors[0]} does more than hide`).toEqual([['display', 'none']])
      }
    })
  }
})

describe('the bar-wipe itself is unchanged under a vintage preset (rule 107)', () => {
  for (const { name, rules, shine } of COMPONENTS) {
    it(`${name}: the shine bar is hidden only under reduced motion or a vintage preset`, () => {
      const allowed = [
        `:global(:root[data-motion='reduced']) ${shine}`,
        ...PRESETS.map((p) => `:global([data-theme='${p}']) ${shine}`),
      ]
      const hiding = rules.filter((r) => r.selectors.some((s) => s.endsWith(shine)) && r.decls.get('display') === 'none')
      for (const rule of hiding) for (const s of rule.selectors) expect(allowed, `${s} hides the shine`).toContain(s)
    })

    it(`${name}: under modern the shine still sweeps in (its animation is not keyed on a preset)`, () => {
      const animated = rules.filter(
        (r) => r.decls.has('animation') && r.selectors.some((s) => s.endsWith(shine) && !s.includes('data-theme')),
      )
      expect(animated.length, `no un-themed animation on ${shine}`).toBeGreaterThan(0)
    })
  }
})

describe('the shine elements still render (rule 107 hides them by style, not by markup)', () => {
  afterEach(() => cleanup())

  it('the lower-third shell renders its shine bar', () => {
    const { container } = render(Harness, { show: true })
    expect(container.querySelector('.lt3 .lt3__bar')).not.toBeNull()
  })

  it("the logo rotation's entering and leaving bars both carry the shine class the vintage rule hides", () => {
    expect(logosSource).toMatch(/<span class="bc-logos__shine bc-logos__shine--out"/)
    expect(logosSource).toMatch(/<span class="bc-logos__shine" aria-hidden="true"><\/span>/)
  })
})
