/* #21's name is never cut at its top or bottom — widgets.md rule 109, how/renderer.md "#21's
 * name is never clipped on the block axis".
 *
 * happy-dom does no layout and applies no stylesheet, so it cannot show a descender being cut.
 * What decides it is the name's overflow: a box that clips on the block axis cuts every glyph and
 * shadow that reaches past its line box, and the line box (the page's inherited 26.1px) is shorter
 * than the display faces' descenders and accents. These tests read the name's rules from the
 * component source (Vite `?raw`), resolve `overflow` the way CSS computes it (a `visible` axis
 * beside one that is neither `visible` nor `clip` becomes `auto`), and assert the name never clips
 * on the block axis, stays on one line, and sets nothing that would resize its box. What the name
 * does with its width is not this file's. That the glyphs then paint whole is for a real browser
 * to show.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import DriverLowerThird from './DriverLowerThird.svelte'
import source from './DriverLowerThird.svelte?raw'
import subjectA from '../../../../spec/v1/fixtures/driver-subject-a.json'

afterEach(() => cleanup())

/** Flat rules of the component's <style>: [{ selectors: string[], decls: [prop, value][] }], in
 *  source order. The parser is DriverLowerThird.vintage.test.js's, keeping declaration order. */
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

/** Every declaration, in source order, of the base rules whose selector is exactly `.bc-lt__name`
 *  (no theme scope: rule 109 holds under every preset, so it lives in the base rule). */
const BASE_NAME_DECLS = RULES.filter((r) => r.selectors.includes('.bc-lt__name')).flatMap((r) => r.decls)
/** Every declaration of any rule whose selector targets the name, themed or not. */
const ALL_NAME_DECLS = RULES.filter((r) => r.selectors.some((s) => /\.bc-lt__name\b/.test(s))).flatMap((r) => r.decls)

function declared(decls, prop) {
  let value
  for (const [p, v] of decls) if (p === prop) value = v
  return value
}

/** The name's computed overflow per axis: the shorthand and longhands applied in source order,
 *  then CSS Overflow 3's pairing rule — when either axis is neither `visible` nor `clip`, a
 *  `visible` axis computes to `auto` and a `clip` axis to `hidden`. */
function computedOverflow(decls) {
  let x = 'visible'
  let y = 'visible'
  for (const [p, v] of decls) {
    if (p === 'overflow') {
      const [a, b = a] = v.split(' ')
      x = a
      y = b
    } else if (p === 'overflow-x') x = v
    else if (p === 'overflow-y') y = v
  }
  const passive = (v) => v === 'visible' || v === 'clip'
  if (!passive(x) || !passive(y)) {
    const fix = (v) => (v === 'visible' ? 'auto' : v === 'clip' ? 'hidden' : v)
    x = fix(x)
    y = fix(y)
  }
  return { x, y }
}

describe("#21's name is never cut at its top or bottom (widgets rule 109)", () => {
  it('the rule under test is the one on the rendered name element', async () => {
    const { container } = render(DriverLowerThird, { snapshot: subjectA, widget: {} })
    await tick()
    const name = container.querySelector('[data-testid="driver-lt-name"]')
    expect(name?.classList.contains('bc-lt__name')).toBe(true)
    // The whole name is in the DOM.
    expect(name.textContent.trim()).toBe('Hamilton')
    expect(BASE_NAME_DECLS.length).toBeGreaterThan(0)
  })

  it("the name's box cuts nothing at its top or bottom: its block-axis overflow computes to visible", () => {
    expect(computedOverflow(BASE_NAME_DECLS).y).toBe('visible')
  })

  it('no other clipper cuts the name: no clip-path, paint containment or mask on any rule for it', () => {
    const clipper = ([p, v]) =>
      p === 'clip-path' ||
      /^(-webkit-)?mask(-image)?$/.test(p) ||
      (p === 'contain' && /\b(paint|content|strict)\b/.test(v))
    expect(ALL_NAME_DECLS.filter(clipper)).toEqual([])
  })

  it('the name is one line and never wraps: white-space: nowrap', () => {
    expect(declared(BASE_NAME_DECLS, 'white-space')).toBe('nowrap')
  })

  it('showing the glyphs whole changes no box size: no rule on the name sets its line height, height, padding or margin', () => {
    const sizing = /^(line-height|height|min-height|max-height|block-size|min-block-size|max-block-size|padding(-.+)?|margin(-.+)?)$/
    expect(ALL_NAME_DECLS.filter(([p]) => sizing.test(p))).toEqual([])
    // Nor do its ancestors in the card set a line height or height that would resize its line box.
    const lineBox = /^(line-height|height|min-height|max-height|block-size|min-block-size|max-block-size)$/
    for (const cls of ['.bc-lt', '.bc-lt__body', '.bc-lt__meta']) {
      const decls = RULES.filter((r) => r.selectors.some((s) => s === cls || s.endsWith(` ${cls}`))).flatMap((r) => r.decls)
      expect(decls.filter(([p]) => lineBox.test(p)), cls).toEqual([])
    }
  })
})
