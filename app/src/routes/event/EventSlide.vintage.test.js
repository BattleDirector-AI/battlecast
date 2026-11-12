/* The Event slide's look per preset and its lack of an entrance — widgets.md rules 127–130,
 * ADR 0041, how/renderer.md "Event slide".
 *
 * happy-dom applies no stylesheet, so a rendered element cannot tell us its fill or colour. These
 * tests read the rules from the component source, keyed on the theme selector how/renderer.md
 * prescribes (`:global([data-theme='…'])` on an ancestor), as GridSlide.vintage.test.js does. The
 * source is read through `import.meta.glob`, so a missing component gives an empty source and
 * failing assertions that name the gap, not a module-not-found error for the whole file. The last
 * block renders `/event` and checks that every themed selector names an element the slide draws.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick, flushSync } from 'svelte'
import App from '../../App.svelte'

const sources = import.meta.glob('./EventSlide.svelte', { query: '?raw', import: 'default', eager: true })
const source = Object.values(sources)[0] ?? ''

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

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
const scopeOf = (preset) => `:global([data-theme='${preset}'])`

/** The declared value of `prop` in an unthemed rule for exactly `target`. */
function base(target, prop) {
  let value
  for (const rule of RULES) {
    if (rule.selectors.includes(target) && rule.decls.has(prop)) value = rule.decls.get(prop)
  }
  return value
}

/** Every `selector | prop: value` the preset's scope declares, sorted. */
function themedDecls(preset) {
  const scope = `${scopeOf(preset)} `
  const out = []
  for (const rule of RULES) {
    for (const sel of rule.selectors.filter((s) => s.startsWith(scope))) {
      for (const [prop, value] of rule.decls) out.push(`${sel.slice(scope.length)} | ${prop}: ${value}`)
    }
  }
  return out.sort()
}

const EXPECTED = {
  vintage70: [
    '.event | background: var(--bc-plate-solid)',
    '.event__series | box-shadow: inset 0 -4px 0 var(--bc-accent)',
    '.event__meta | color: var(--bc-subhead)',
  ].sort(),
  vintage80: [
    '.event | background: var(--bc-plate-solid)',
    '.event__series | background: var(--bc-header)',
    '.event__series | box-shadow: 0 0 0 6px var(--bc-header)',
    '.event__series | color: var(--bc-text-2)',
    '.event__meta | color: var(--bc-text-2)',
  ].sort(),
}

describe('the component exists', () => {
  it('routes/event/EventSlide.svelte has a <style> block', () => {
    expect(source, 'no routes/event/EventSlide.svelte').not.toBe('')
    expect(RULES.length, 'EventSlide.svelte has no style rules').toBeGreaterThan(0)
  })
})

describe('the look under modern (rule 128)', () => {
  it('board: the opaque board colour', () => {
    expect(base('.event', 'background')).toBe('var(--bc-board)')
  })

  it('board: at least as tall as the page, so no page background shows below it', () => {
    expect(base('.event', 'min-height')).toBe('100vh')
  })

  it('parts: a column centred on both axes, each text centred, all text in capitals', () => {
    expect(base('.event', 'display')).toBe('flex')
    expect(base('.event', 'flex-direction')).toBe('column')
    expect(base('.event', 'align-items')).toBe('center')
    expect(base('.event', 'justify-content')).toBe('center')
    expect(base('.event', 'text-align')).toBe('center')
    expect(base('.event', 'text-transform')).toBe('uppercase')
  })

  it('logo: at most 40% of the page height and 60% of its width, aspect kept, never enlarged', () => {
    expect(base('.event__logo', 'max-height')).toBe('40vh')
    expect(base('.event__logo', 'max-width')).toBe('60vw')
    expect(base('.event__logo', 'width')).toBe('auto')
    expect(base('.event__logo', 'height')).toBe('auto')
    expect(base('.event__logo', 'object-fit')).toBe('contain')
  })

  it('meta line: the third text colour', () => {
    expect(base('.event__meta', 'color')).toBe('var(--bc-text-3)')
  })
})

describe('the look under vintage70 (rule 129)', () => {
  it('declares exactly the board, the series rule and the teal meta line', () => {
    expect(themedDecls('vintage70')).toEqual(EXPECTED.vintage70)
  })

  it('the red marks nothing else: only the series rule names the accent', () => {
    const accent = RULES.filter((r) => [...r.decls.values()].some((v) => v.includes('--bc-accent')))
    expect(accent.map((r) => r.selectors.join(', '))).toEqual([`${scopeOf('vintage70')} .event__series`])
  })
})

describe('the look under vintage80 (rule 130)', () => {
  it('declares exactly the board, the red series plate and the white meta line', () => {
    expect(themedDecls('vintage80')).toEqual(EXPECTED.vintage80)
  })
})

describe('no entrance (rule 127)', () => {
  it('has no CSS transition or animation and no Svelte transition directive', () => {
    expect(source, 'no routes/event/EventSlide.svelte').not.toBe('')
    expect(source).not.toMatch(/@keyframes/)
    expect(source).not.toMatch(/(^|[;{\s])(transition|animation)(-[a-z-]+)?\s*:/m)
    expect(source).not.toMatch(/\s(transition|in|out):[a-zA-Z]/)
  })
})

describe('every themed selector names an element the slide draws', () => {
  it('renders /event with every part and finds each themed target', async () => {
    window.history.replaceState({}, '', '/event?profile=p')
    const profile = {
      slides: { series: 'GT World Cup', round: 'Round 3', track: 'Spa-Francorchamps', logo: '/logos/a.png' },
    }
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => structuredClone(profile) })))
    const { container } = render(App)
    for (let i = 0; i < 6; i++) await tick()
    flushSync()
    const slide = container.querySelector('[data-testid="event-slide"]')
    expect(slide, '/event renders no event slide').not.toBeNull()

    const targets = new Set(
      [...EXPECTED.vintage70, ...EXPECTED.vintage80].map((d) => d.split(' | ')[0]),
    )
    for (const target of targets) {
      const found = slide.matches(target) || slide.querySelector(target)
      expect(found, `no element matches ${target}`).toBeTruthy()
    }
    expect(slide.querySelector('.event__logo')?.getAttribute('data-testid')).toBe('event-logo')
  })
})
