/* The Countdown slide's look per preset and its lack of an entrance — widgets.md rules 138–141,
 * ADR 0042, how/renderer.md "Countdown slide".
 *
 * happy-dom applies no stylesheet, so a rendered element cannot tell us its fill, face or size.
 * These tests read the rules from the component source, keyed on the theme selector
 * how/renderer.md prescribes (`:global([data-theme='…'])` on an ancestor), as
 * EventSlide.vintage.test.js does. The source is read through `import.meta.glob`, so a missing
 * component gives an empty source and failing assertions that name the gap, not a
 * module-not-found error for the whole file. The last block renders `/countdown` (fake clock, a
 * start ten minutes ahead) and checks that every themed and timer selector names an element the
 * slide draws.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick, flushSync } from 'svelte'
import App from '../../App.svelte'

const sources = import.meta.glob('./CountdownSlide.svelte', { query: '?raw', import: 'default', eager: true })
const source = Object.values(sources)[0] ?? ''

afterEach(() => {
  cleanup()
  vi.useRealTimers()
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
    '.countdown | background: var(--bc-plate-solid)',
    '.countdown__series | box-shadow: inset 0 -4px 0 var(--bc-accent)',
  ].sort(),
  vintage80: [
    '.countdown | background: var(--bc-plate-solid)',
    '.countdown__series | background: var(--bc-header)',
    '.countdown__series | box-shadow: 0 0 0 6px var(--bc-header)',
    '.countdown__series | color: var(--bc-text-2)',
  ].sort(),
}
const TIMER_SIZE = 'calc(var(--bc-size-name) * 3)'

describe('the component exists', () => {
  it('routes/countdown/CountdownSlide.svelte has a <style> block', () => {
    expect(source, 'no routes/countdown/CountdownSlide.svelte').not.toBe('')
    expect(RULES.length, 'CountdownSlide.svelte has no style rules').toBeGreaterThan(0)
  })
})

describe('the look under modern (rule 139)', () => {
  it('board: the opaque board colour, at least as tall as the page', () => {
    expect(base('.countdown', 'background')).toBe('var(--bc-board)')
    expect(base('.countdown', 'min-height')).toBe('100vh')
  })

  it('parts: a column centred on both axes, each text centred, all text in capitals', () => {
    expect(base('.countdown', 'display')).toBe('flex')
    expect(base('.countdown', 'flex-direction')).toBe('column')
    expect(base('.countdown', 'align-items')).toBe('center')
    expect(base('.countdown', 'justify-content')).toBe('center')
    expect(base('.countdown', 'text-align')).toBe('center')
    expect(base('.countdown', 'text-transform')).toBe('uppercase')
  })

  it('logo: at most 40% of the page height and 60% of its width, aspect kept', () => {
    expect(base('.countdown__logo', 'max-height')).toBe('40vh')
    expect(base('.countdown__logo', 'max-width')).toBe('60vw')
    expect(base('.countdown__logo', 'width')).toBe('auto')
    expect(base('.countdown__logo', 'height')).toBe('auto')
    expect(base('.countdown__logo', 'object-fit')).toBe('contain')
  })

  it('series name: the display face at the title size', () => {
    expect(base('.countdown__series', 'font-family')).toBe('var(--bc-font-display)')
    expect(base('.countdown__series', 'font-size')).toBe('var(--bc-size-name)')
  })

  it('timer: the numeral face and weight, tabular figures, three times the title size', () => {
    expect(base('.countdown__timer', 'font-family')).toBe('var(--bc-font-mono)')
    expect(base('.countdown__timer', 'font-weight')).toBe('var(--bc-weight-num)')
    expect(base('.countdown__timer', 'font-variant-numeric')).toBe('tabular-nums')
    expect(base('.countdown__timer', 'font-size')).toBe(TIMER_SIZE)
  })

  it('starting line: the display face at the size of the timer', () => {
    expect(base('.countdown__started', 'font-family')).toBe('var(--bc-font-display)')
    expect(base('.countdown__started', 'font-size')).toBe(TIMER_SIZE)
  })
})

describe('the look under vintage70 (rule 140)', () => {
  it('declares exactly the black board and the series rule', () => {
    expect(themedDecls('vintage70')).toEqual(EXPECTED.vintage70)
  })

  it('the red marks nothing else: only the series rule names the accent', () => {
    const accent = RULES.filter((r) => [...r.decls.values()].some((v) => v.includes('--bc-accent')))
    expect(accent.map((r) => r.selectors.join(', '))).toEqual([`${scopeOf('vintage70')} .countdown__series`])
  })
})

describe('the look under vintage80 (rule 141)', () => {
  it('declares exactly the black board and the red series plate', () => {
    expect(themedDecls('vintage80')).toEqual(EXPECTED.vintage80)
  })
})

describe('no entrance (rule 138)', () => {
  it('has no CSS transition or animation and no Svelte transition directive', () => {
    expect(source, 'no routes/countdown/CountdownSlide.svelte').not.toBe('')
    expect(source).not.toMatch(/@keyframes/)
    expect(source).not.toMatch(/(^|[;{\s])(transition|animation)(-[a-z-]+)?\s*:/m)
    expect(source).not.toMatch(/\s(transition|in|out):[a-zA-Z]/)
  })
})

describe('every styled selector names an element the slide draws', () => {
  it('renders /countdown with every part and finds each themed and timer target', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 20, 18, 50, 0))
    window.history.replaceState({}, '', '/countdown?profile=p')
    const profile = {
      slides: { series: 'GT World Cup', logo: '/logos/a.png', start: '2026-11-20T19:00' },
    }
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => structuredClone(profile) })))
    const { container } = render(App)
    for (let i = 0; i < 6; i++) await tick()
    flushSync()
    const slide = container.querySelector('[data-testid="countdown-slide"]')
    expect(slide, '/countdown renders no countdown slide').not.toBeNull()

    const targets = new Set([
      ...[...EXPECTED.vintage70, ...EXPECTED.vintage80].map((d) => d.split(' | ')[0]),
      '.countdown__logo',
      '.countdown__timer',
    ])
    for (const target of targets) {
      const found = slide.matches(target) || slide.querySelector(target)
      expect(found, `no element matches ${target}`).toBeTruthy()
    }
    expect(slide.querySelector('.countdown__logo')?.getAttribute('data-testid')).toBe('countdown-logo')
    expect(slide.querySelector('.countdown__timer')?.getAttribute('data-testid')).toBe('countdown-timer')
  })

  it('renders /countdown after the start and finds the starting line by its class', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 20, 19, 5, 0))
    window.history.replaceState({}, '', '/countdown?profile=p')
    const profile = { slides: { series: 'GT World Cup', start: '2026-11-20T19:00' } }
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => structuredClone(profile) })))
    const { container } = render(App)
    for (let i = 0; i < 6; i++) await tick()
    flushSync()
    const slide = container.querySelector('[data-testid="countdown-slide"]')
    expect(slide, '/countdown renders no countdown slide').not.toBeNull()
    const line = slide.querySelector('.countdown__started')
    expect(line, 'no element matches .countdown__started').not.toBeNull()
    expect(line.getAttribute('data-testid')).toBe('countdown-started')
  })
})
