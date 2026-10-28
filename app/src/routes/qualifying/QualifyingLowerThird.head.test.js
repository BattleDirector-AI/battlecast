/* #22's head row is one line, and the name gives way — widgets.md rule 110, how/renderer.md
 * "#22's head row gives way at the name".
 *
 * happy-dom does no layout, so it cannot show `CLASS BEST` wrapping or the card growing. What
 * decides it is each head-row item's flex and wrapping rules: an item that may wrap has a
 * one-word min-content floor, so a long name squeezes it onto two lines. These tests drive the
 * class-best flash from the spec/v1 fixtures to pin which elements form the row, then read the
 * items' rules from the component source (Vite `?raw`) and assert the label, position and chip
 * hold their one-line width while the name alone shrinks and ellipsizes, and that the probe that
 * measures the full form sits out of flow at its text's width. Which form the name shows is
 * QualifyingLowerThird.nameFit.test.js's. That the card then stays one height for any name is for
 * a real browser to show.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import QualifyingLowerThird from './QualifyingLowerThird.svelte'
import source from './QualifyingLowerThird.svelte?raw'
import chipSource from '../../design/ClassChip.svelte?raw'
import racePreClassBest from '../../../../spec/v1/fixtures/race-pre-class-best.json'
import raceClassBest from '../../../../spec/v1/fixtures/race-class-best.json'
import qualSectorA from '../../../../spec/v1/fixtures/qualifying-sector-a.json'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

/** Flat rules of a component's <style>: [{ selectors: string[], decls: [prop, value][] }], in
 *  source order. The parser is the vintage tests', keeping declaration order. */
function styleRules(src) {
  let css = (/<style>([\s\S]*?)<\/style>/.exec(src)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
  for (let at = css.indexOf('@keyframes'); at !== -1; at = css.indexOf('@keyframes')) {
    let i = css.indexOf('{', at)
    let depth = 0
    for (; i < css.length; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}' && --depth === 0) break
    }
    css = css.slice(0, at) + css.slice(i + 1)
  }
  const rules = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(/,(?![^(]*\))/).map((s) => s.trim().replace(/\s+/g, ' ').replace(/"/g, "'"))
    const decls = []
    for (const part of m[2].split(';')) {
      const idx = part.indexOf(':')
      if (idx === -1) continue
      decls.push([part.slice(0, idx).trim(), part.slice(idx + 1).trim().replace(/\s+/g, ' ')])
    }
    rules.push({ selectors, decls })
  }
  return rules
}
const RULES = styleRules(source)
const CHIP_RULES = styleRules(chipSource)

/** Declarations, in source order, of the rules whose selector is exactly `selector` (the base
 *  rule, no theme scope: rule 110 holds under every preset). */
const base = (rules, selector) => rules.filter((r) => r.selectors.includes(selector)).flatMap((r) => r.decls)
/** Declarations of every rule with a selector that targets `cls`, themed, compound or not. */
const targeting = (rules, cls) =>
  rules.filter((r) => r.selectors.some((s) => new RegExp(`\\${cls}$`).test(s))).flatMap((r) => r.decls)
function declared(decls, prop) {
  let value
  for (const [p, v] of decls) if (p === prop) value = v
  return value
}
/** The flex-shrink the declarations leave: the `flex` shorthand's second number, or the longhand,
 *  whichever comes last; CSS's initial value is 1. */
function flexShrink(decls) {
  let shrink = '1'
  for (const [p, v] of decls) {
    if (p === 'flex-shrink') shrink = v
    else if (p === 'flex') {
      const parts = v.split(' ')
      if (v === 'none') shrink = '0'
      else if (parts.length >= 2 && /^[\d.]+$/.test(parts[1])) shrink = parts[1]
      else shrink = '1'
    }
  }
  return shrink
}

/** Props that would let an item wrap, shrink below its text, or cut it. */
const GIVES_WAY = ([p, v]) =>
  (p === 'white-space' && v !== 'nowrap') ||
  (p === 'min-width' && /^0(px)?$/.test(v)) ||
  p === 'max-width' ||
  p === 'width' ||
  p === 'text-overflow' ||
  (p.startsWith('overflow') && v !== 'visible')

describe("#22's head row is one line, and the name gives way (widgets rule 110)", () => {
  it('the class-best flash renders its head row as label, position, name and chip, in that order', async () => {
    const widget = { trigger: 'dwell', dwellSeconds: 5, fireOnClassBest: true }
    const { container, rerender } = render(QualifyingLowerThird, { snapshot: racePreClassBest, widget })
    await tick()
    await rerender({ snapshot: raceClassBest, widget })
    await tick()
    const head = container.querySelector('.bc-qt__head')
    expect(head).not.toBeNull()
    // The hidden probe that measures the full form (how/renderer.md) is not one of the row's items.
    const items = [...head.children]
      .filter((el) => !el.classList.contains('bc-qt__name-probe'))
      .map((el) => el.className.split(' ').find((c) => c.startsWith('bc-')))
    expect(items).toEqual(['bc-qt__label', 'bc-qt__pos', 'bc-qt__name', 'bc-class-chip'])
    expect(head.querySelector('.bc-qt__label').textContent.trim()).toBe('CLASS BEST')
    expect(head.querySelector('.bc-qt__name').textContent.trim()).toBe('Alonso')
  })

  it('the label stays on one line: the base .bc-qt__label rule is white-space: nowrap', () => {
    expect(declared(base(RULES, '.bc-qt__label'), 'white-space')).toBe('nowrap')
  })

  it('the label never gives way to the name: it does not shrink, and no rule lets it wrap, shrink or cut', () => {
    expect(flexShrink(base(RULES, '.bc-qt__label'))).toBe('0')
    expect(targeting(RULES, '.bc-qt__label').filter(GIVES_WAY)).toEqual([])
  })

  it('the position and the chip hold their own size: neither may wrap, shrink below its text or be cut by the row', () => {
    // `P12` is one word, so its automatic min-content floor holds it while nothing lowers it.
    expect(targeting(RULES, '.bc-qt__pos').filter(GIVES_WAY)).toEqual([])
    // The chip clips a long class on its inner label (rule 32's own cap), not in the row.
    const chip = base(CHIP_RULES, '.bc-class-chip')
    expect(flexShrink(chip)).toBe('0')
    expect(declared(chip, 'white-space')).toBe('nowrap')
  })

  it('the name is the one item that gives way: it shrinks to nothing, on one line, cut at its end with an ellipsis', () => {
    const name = base(RULES, '.bc-qt__name')
    expect(declared(name, 'min-width')).toBe('0')
    expect(flexShrink(name)).not.toBe('0')
    expect(declared(name, 'white-space')).toBe('nowrap')
    expect(['hidden', 'clip']).toContain(declared(name, 'overflow-x') ?? declared(name, 'overflow'))
    expect(declared(name, 'text-overflow')).toBe('ellipsis')
  })

  it("the full-form probe is out of flow, unseen, and as wide as its text whatever the row's width", async () => {
    const probe = base(RULES, '.bc-qt__name-probe')
    expect(declared(probe, 'position')).toBe('absolute')
    expect(declared(probe, 'visibility')).toBe('hidden')
    expect(declared(probe, 'width')).toBe('max-content')
    expect(declared(probe, 'pointer-events')).toBe('none')
    // No other rule may give the probe a width, a cap or a cut that would change its measure.
    const others = RULES.filter((r) => !r.selectors.includes('.bc-qt__name-probe'))
    expect(targeting(others, '.bc-qt__name-probe').filter(([p]) => /width|overflow|position|display/.test(p))).toEqual([])
    // The probe shares `.bc-qt__name`, so no name rule, base or themed, may size or cap it either.
    const capsWidth = ([p]) => /^(width|max-width|inline-size|max-inline-size)$/.test(p)
    expect(targeting(RULES, '.bc-qt__name').filter(capsWidth)).toEqual([])
    // Rendered: the probe shares the name's class, so every name rule (face, size, presets) reaches
    // it, it is hidden from assistive tech, and it holds the full form.
    const { container } = render(QualifyingLowerThird, { snapshot: qualSectorA, widget: {} })
    await tick()
    const el = container.querySelector('.bc-qt__head .bc-qt__name-probe')
    expect(el?.classList.contains('bc-qt__name')).toBe(true)
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(el.textContent.trim()).toBe('Leclerc')
  })
})
