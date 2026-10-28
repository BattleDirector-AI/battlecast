/* The weather box's own vintage look — widgets.md rules 103 (vintage70) and 104 (vintage80),
 * ADR 0035, how/renderer.md "Weather".
 *
 * happy-dom applies no stylesheet, so a rendered box cannot tell us its colour or shadow. These
 * tests read the rules from the component source (Vite `?raw`), keyed on the theme selector
 * how/renderer.md prescribes (`:global([data-theme='…'])` on an ancestor, so the /config preview
 * gets them too), and assert the paint each spec bullet names, as StandingsTower.vintage.test.js
 * does. Each rule says everything it does not name renders the base look, so the themed
 * declarations are checked as a closed set: every rule whose selector mentions `data-theme`, in
 * any form, must be one of the named declarations, and each preset must have exactly those.
 * The last block renders the box under each preset and checks it shows the same content.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import source from './WeatherBox.svelte?raw'
import WeatherBox from './WeatherBox.svelte'
import fixture from '../../../../spec/v1/fixtures/race-weather.json'

/** Flat rules of the component's <style>: [{ selectors: string[], decls: [prop, value][] }]. */
function styleRules() {
  const css = (/<style>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
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
const RULES = styleRules()
const scopeOf = (preset) => `:global([data-theme='${preset}'])`

/** The declared value of `prop` in a rule for `target` under the preset's ancestor scope. */
function themed(preset, target, prop) {
  const selector = `${scopeOf(preset)} ${target}`
  let value
  for (const rule of RULES) {
    if (!rule.selectors.includes(selector)) continue
    for (const [p, v] of rule.decls) if (p === prop) value = v
  }
  return value
}

/** Every rule with a selector that mentions the theme attribute in any form. */
const THEMED = RULES.filter((r) => r.selectors.some((s) => s.includes('data-theme')))

/** `selector | prop: value` for every declaration of the preset's themed rules, sorted. */
function triples(preset) {
  const out = []
  for (const rule of THEMED) {
    for (const s of rule.selectors.filter((s) => s.startsWith(`${scopeOf(preset)} `))) {
      for (const [prop, value] of rule.decls) out.push(`${s} | ${prop}: ${value}`)
    }
  }
  return out.sort()
}

/** The whole of rules 103 and 104: nothing else is themed. */
const NAMED = {
  vintage70: [
    ":global([data-theme='vintage70']) .bc-weather | box-shadow: inset 0 -4px 0 var(--bc-accent), var(--bc-shadow-plate)",
    ":global([data-theme='vintage70']) .bc-weather__conditions | color: var(--bc-text)",
    ":global([data-theme='vintage70']) .bc-weather__value | color: var(--bc-text-2)",
  ],
  vintage80: [
    ":global([data-theme='vintage80']) .bc-weather__label | color: var(--bc-text-2)",
    ":global([data-theme='vintage80']) .bc-weather__label | font-family: var(--bc-font-display)",
  ],
}

describe('vintage70 weather box (rule 103)', () => {
  it('red rule: 4px of the accent along the bottom edge, inset, the plate shadow kept', () => {
    // An inset shadow takes no layout space; a border-bottom would make the box taller.
    expect(themed('vintage70', '.bc-weather', 'box-shadow')).toBe(
      'inset 0 -4px 0 var(--bc-accent), var(--bc-shadow-plate)',
    )
  })

  it('temperatures: warm white, like every numeral in the preset', () => {
    expect(themed('vintage70', '.bc-weather__value', 'color')).toBe('var(--bc-text-2)')
  })

  it('conditions: the preset gold', () => {
    expect(themed('vintage70', '.bc-weather__conditions', 'color')).toBe('var(--bc-text)')
  })
})

describe('vintage80 weather box (rule 104)', () => {
  it('labels: CG white', () => {
    expect(themed('vintage80', '.bc-weather__label', 'color')).toBe('var(--bc-text-2)')
  })

  it('labels: the display face (Oswald) instead of VT323', () => {
    // The token, not a family name, so a custom theme's display face reaches the labels too.
    expect(themed('vintage80', '.bc-weather__label', 'font-family')).toBe('var(--bc-font-display)')
  })
})

describe('nothing else is themed (rules 103-104: everything not named renders the base look)', () => {
  it('every themed selector is one of the named, exactly quoted forms', () => {
    const allowed = new Set(NAMED.vintage70.concat(NAMED.vintage80).map((t) => t.split(' | ')[0]))
    // Unquoted, ^= or :root forms, or the whole selector inside :global(), are all rejected here.
    for (const rule of THEMED) {
      for (const s of rule.selectors) expect(allowed.has(s), `themed selector ${s}`).toBe(true)
    }
  })

  for (const preset of ['vintage70', 'vintage80']) {
    it(`${preset}: the themed declarations are exactly the rule's named set`, () => {
      // No lean, outline, plate, transform, opacity, transition, size or text-fill change rides
      // along: any extra declaration, or a named one with another value, fails here.
      expect(triples(preset)).toEqual([...NAMED[preset]].sort())
    })
  }
})

describe('the Oswald labels add no height (ADR 0035 decision 4)', () => {
  // A 12px Oswald label sits inside the 16px value's line box only under the box's inherited
  // unitless line-height; under `normal`, Oswald's tall ascent would make the 80s box taller.
  it('the box sets a unitless line-height of 1.15', () => {
    const base = RULES.filter((r) => r.selectors.includes('.bc-weather'))
    expect(base.flatMap((r) => r.decls.filter(([p]) => p === 'line-height').map(([, v]) => v))).toEqual(['1.15'])
  })

  it('no rule on an item or a label sets its own line-height', () => {
    for (const rule of RULES) {
      if (!rule.selectors.some((s) => /\.bc-weather__(item|label)\b/.test(s))) continue
      for (const [prop] of rule.decls) expect(prop, `${rule.selectors[0]} sets ${prop}`).not.toBe('line-height')
    }
  })
})

describe('every preset shows the same content (overlay-config rule 60)', () => {
  afterEach(cleanup)

  for (const preset of ['modern', 'vintage70', 'vintage80']) {
    it(`${preset}: the parts of race-weather.json, in order`, async () => {
      const host = document.createElement('div')
      host.setAttribute('data-theme', preset)
      document.body.appendChild(host)
      const view = render(WeatherBox, { target: host, props: { snapshot: fixture, tempUnit: 'c' } })
      await tick()
      const box = view.getByTestId('weather-box')
      expect([...box.children].map((el) => el.textContent.replace(/\s+/g, ' ').trim())).toEqual([
        'AIR 22°C',
        'TRACK 31°C',
        'Light rain',
      ])
      host.remove()
    })
  }
})
