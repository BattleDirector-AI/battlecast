/* The info panel's own vintage look — widgets.md rules 101 (vintage70) and 102 (vintage80),
 * ADR 0034, how/renderer.md "Info panel".
 *
 * happy-dom applies no stylesheet, so a rendered panel cannot tell us its colour, face or rule.
 * These tests read the rules from the component source (Vite `?raw`), keyed on the theme
 * selector how/renderer.md prescribes (`:global([data-theme='…'])` on an ancestor, so the
 * /config preview gets them too), as StandingsTower.vintage.test.js does. Any other spelling of a
 * theme selector (`:root[data-theme]`, `[data-theme^='vintage']`, …) fails, so an extra rule
 * cannot slip past the set check. Each rule says that everything it does not name renders the
 * base look, so the themed declarations are pinned as an exact set: an extra one (a heavier
 * shadow, a recoloured line, a size change) fails too.
 * The last block drives the panel from event-info.json under each preset and checks it shows
 * the same content as under `modern` (overlay-config rule 60).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import source from './InfoPanel.svelte?raw'
import InfoPanel from './InfoPanel.svelte'
import fixture from '../../../../spec/v1/fixtures/event-info.json'

/** Flat rules of the component's <style>: [{ selectors: string[], decls: Map }]. */
function styleRules() {
  const css = (/<style>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
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
const PRESETS = ['vintage70', 'vintage80']
const scope = (preset) => `:global([data-theme='${preset}'])`

/** Every selector in the component that mentions a theme at all. */
const THEME_SELECTORS = RULES.flatMap((r) => r.selectors).filter((s) => s.includes('data-theme'))

/** Every themed declaration for the preset, as "target | prop: value" (value lowercased). */
function themedDecls(preset) {
  const out = []
  for (const rule of RULES) {
    for (const s of rule.selectors) {
      if (!s.startsWith(scope(preset) + ' ')) continue
      const target = s.slice(scope(preset).length).trim()
      for (const [prop, value] of rule.decls) out.push(`${target} | ${prop}: ${value.toLowerCase()}`)
    }
  }
  return out.sort()
}

describe('theme selectors (how/renderer.md)', () => {
  it('every theme selector is one of the two prescribed ancestor scopes', () => {
    for (const s of THEME_SELECTORS) {
      expect(
        PRESETS.some((p) => s.startsWith(scope(p) + ' ')),
        `${s} is not :global([data-theme='vintage70']) or :global([data-theme='vintage80']) on an ancestor`,
      ).toBe(true)
    }
  })
})

describe('vintage70 info panel (rule 101)', () => {
  const decls = () => themedDecls('vintage70')

  it('a 4px red rule along the panel bottom edge, inside it', () => {
    // An inset shadow takes no layout space, so the panel is no taller.
    expect(decls()).toContain('.bc-info | box-shadow: inset 0 -4px 0 var(--bc-accent)')
  })

  it('header: the mock teal subhead colour', () => {
    expect(decls()).toContain('.bc-info__header | color: #35d4c8')
  })

  it('nothing else is themed: the line, both shadows and the motion keep the base look', () => {
    expect(decls()).toEqual(
      ['.bc-info | box-shadow: inset 0 -4px 0 var(--bc-accent)', '.bc-info__header | color: #35d4c8'].sort(),
    )
  })
})

describe('vintage80 info panel (rule 102)', () => {
  const decls = () => themedDecls('vintage80')
  const HEADER = [
    '.bc-info__header | align-self: flex-start',
    '.bc-info__header | font-family: var(--bc-font-display)',
    '.bc-info__header | color: var(--bc-text-2)',
    '.bc-info__header | background: var(--bc-header)',
    '.bc-info__header | box-shadow: 0 0 0 2px var(--bc-header), 3px 3px 0 2px #000',
    '.bc-info__header | text-shadow: none',
  ]

  it("header: the preset's display face (Oswald), not VT323, in white with no outline", () => {
    expect(decls()).toContain('.bc-info__header | font-family: var(--bc-font-display)')
    expect(decls()).toContain('.bc-info__header | color: var(--bc-text-2)')
    expect(decls()).toContain('.bc-info__header | text-shadow: none')
  })

  it('header: a red Scoreboard tag, 2px past the text, hard black shadow', () => {
    expect(decls()).toContain('.bc-info__header | background: var(--bc-header)')
    expect(decls()).toContain('.bc-info__header | box-shadow: 0 0 0 2px var(--bc-header), 3px 3px 0 2px #000')
  })

  it('header: the tag hugs the text instead of spanning the panel', () => {
    // A flex item of the column panel stretches to its width otherwise, and so would the block.
    expect(decls()).toContain('.bc-info__header | align-self: flex-start')
  })

  it('nothing else is themed: the VT323 lime line, its outline and the motion keep the base look', () => {
    // Size, weight, tracking and line height stay on the base rule, so the header line box
    // (line-height x size) is the same height in either face and the panel is no taller.
    expect(decls()).toEqual([...HEADER].sort())
  })
})

describe('every preset shows the same content (overlay-config rule 60)', () => {
  afterEach(() => {
    cleanup()
    delete document.documentElement.dataset.theme
  })

  function shown() {
    return {
      header: document.querySelector('[data-testid="info-header"]')?.textContent,
      lines: [...document.querySelectorAll('[data-testid="info-line"]')].map((n) => n.textContent),
      panels: document.querySelectorAll('[data-testid="info-panel"]').length,
    }
  }

  for (const preset of ['vintage70', 'vintage80']) {
    it(`${preset}: the header and the first line, as under modern`, () => {
      render(InfoPanel, { props: { snapshot: structuredClone(fixture) } })
      const modern = shown()
      cleanup()
      document.documentElement.dataset.theme = preset
      render(InfoPanel, { props: { snapshot: structuredClone(fixture) } })
      expect(modern).toEqual({
        header: 'ROUND 3 · SPA 6 HOURS · SPA-FRANCORCHAMPS',
        lines: ['Live from the Ardennes'],
        panels: 1,
      })
      expect(shown()).toEqual(modern)
    })
  }
})
