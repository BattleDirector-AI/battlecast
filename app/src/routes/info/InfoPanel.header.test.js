/* The info panel's header is never cut — widgets.md rules 78, 78a and 102, ADR 0037,
 * how/renderer.md "A long header widens the panel".
 *
 * happy-dom applies no stylesheet and does no layout, so a rendered panel cannot show whether a
 * long header is cut or how wide the panel grows. These tests read the rules from the component
 * source (Vite `?raw`), as InfoPanel.vintage.test.js does: every rule that styles the header, in
 * any preset, must leave it uncut (no `max-width`, `overflow`, `text-overflow` or `text-wrap`, and
 * no `width` but `max-content`) and on one line, while the line keeps its one-line ellipsis (rule
 * 78). The base rule sizes the header to its text (`width: max-content`), the box how/renderer.md
 * measures. infoPanel.span.test.js pins the placement arithmetic, InfoPanel.width.test.js the
 * wiring; the measured text width itself is checked in a real browser.
 */
import { describe, it, expect } from 'vitest'
import source from './InfoPanel.svelte?raw'

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

/** Every declaration on a selector whose subject is the element, as "selector | prop: value". */
function declsOn(className) {
  const out = []
  for (const rule of RULES) {
    for (const s of rule.selectors) {
      if (!new RegExp(`\\.${className}(?![\\w-])[^ ]*$`).test(s)) continue
      for (const [prop, value] of rule.decls) out.push(`${s} | ${prop}: ${value}`)
    }
  }
  return out
}

// Properties that can cap, clip or wrap the header. `width: max-content` and `white-space: nowrap`
// are the two values how/renderer.md prescribes; any other value of these is a cut.
const CUTTING = /\| (max-width|width|overflow|overflow-x|text-overflow|text-wrap|white-space): /
const ALLOWED = /\| (width: max-content|white-space: nowrap)$/

describe('the header shows in full (rules 78a, 102)', () => {
  it('the parser sees the header rules (base and themed)', () => {
    // Guards the checks below against passing on an empty set.
    expect(declsOn('bc-info__header').length).toBeGreaterThan(5)
  })

  it('no rule in any preset caps, clips or ellipsizes the header', () => {
    const cutting = declsOn('bc-info__header').filter(
      (d) => CUTTING.test(d) && !ALLOWED.test(d),
    )
    expect(cutting, 'header rules that cut it').toEqual([])
  })

  it('the header stays on one line', () => {
    expect(declsOn('bc-info__header')).toContain('.bc-info__header | white-space: nowrap')
  })

  it('the base header is sized to its text, so its measure does not depend on the panel', () => {
    // A stretched header is as wide as the panel, so measuring it could never widen the panel
    // or let it shrink back after a shorter header (how/renderer.md "The measure").
    expect(declsOn('bc-info__header')).toContain('.bc-info__header | width: max-content')
  })
})

describe('the line still cuts at the panel width (rule 78)', () => {
  it('the line is one line, clipped, with an ellipsis', () => {
    const line = declsOn('bc-info__line')
    expect(line).toContain('.bc-info__line | white-space: nowrap')
    expect(line).toContain('.bc-info__line | overflow: hidden')
    expect(line).toContain('.bc-info__line | text-overflow: ellipsis')
  })
})
