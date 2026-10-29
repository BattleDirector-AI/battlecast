/* The on-board HUD's bar labels never run into their tracks (#430).
 *
 * THROTTLE is wider than a fixed 64px column in Saira at every textScale, and in the vintage
 * faces at the larger ones. So the label column must size to its widest label, both rows must
 * share it (the two tracks start at the same x), and the 64px floor must sit on the label, not
 * on the column: a floor on the column caps the HUD's min-content at 64px, and a narrow slot
 * squeezes the column back under the label. happy-dom does no layout, so the rules are read
 * from the component source (Vite `?raw`); the rendered HUD from a spec/v1 fixture shows the
 * two labels and tracks as the cells of that one grid.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import source from './OnBoardHud.svelte?raw'
import OnBoardHud from './OnBoardHud.svelte'
import fixture from '../../../../spec/v1/fixtures/race-onboard-telemetry.json'

afterEach(() => cleanup())

/** Flat rules of the component's <style>: [{ selectors: string[], decls: Map }]. */
const RULES = (() => {
  const css = (/<style>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(/,(?![^(]*\))/).map((s) => s.trim().replace(/\s+/g, ' '))
    const decls = new Map()
    for (const part of m[2].split(';')) {
      const idx = part.indexOf(':')
      if (idx !== -1) decls.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim().replace(/\s+/g, ' '))
    }
    rules.push({ selectors, decls })
  }
  return rules
})()

/** `prop` as declared by the rules whose selector list holds exactly `selector`, last wins. */
function base(selector, prop) {
  let value
  for (const r of RULES) if (r.selectors.includes(selector) && r.decls.has(prop)) value = r.decls.get(prop)
  return value
}

/** Top-level tracks of a grid-template-columns value: `a minmax(b, c) d` -> ['a', 'minmax(b, c)', 'd']. */
function tracks(value) {
  return value.match(/[\w-]+\([^)]*\)|[^\s()]+/g) ?? []
}

/** The minimum of a track: `minmax(min, max)` -> min, a single size -> itself. */
function trackMin(track) {
  const m = /^minmax\(\s*([^,]+?)\s*,/.exec(track)
  return m ? m[1] : track
}

describe('on-board HUD bar labels (#430)', () => {
  it('the label column sizes to the label, with no fixed width or floor of its own', () => {
    expect(base('.bc-onboard__bars', 'display')).toBe('grid')
    const [label] = tracks(base('.bc-onboard__bars', 'grid-template-columns') ?? '')
    // Its minimum is the content, so the label's width counts in the HUD's min-content and a
    // narrow slot cannot shrink the column under it.
    expect(['max-content', 'auto', 'min-content']).toContain(trackMin(label))
  })

  it('the track column keeps a 108px minimum, so the wider label does not eat the bar', () => {
    const [, track] = tracks(base('.bc-onboard__bars', 'grid-template-columns') ?? '')
    expect(trackMin(track ?? '')).toBe('108px')
  })

  it('the label itself carries the 64px floor', () => {
    expect(base('.bc-onboard__bar-label', 'min-width')).toBe('64px')
  })

  it('both rows share that one column, so the tracks start at the same x', () => {
    // A row that is its own grid sizes its own column, and THROTTLE's track would start right
    // of BRAKE's. `display: contents` makes each row's label and track cells of the bars grid.
    expect(base('.bc-onboard__bar', 'display')).toBe('contents')
  })

  it('no other rule, themed or not, sets the label column or a row grid', () => {
    const offenders = RULES.filter(
      (r) =>
        r.decls.has('grid-template-columns') &&
        r.selectors.some((s) => /\.bc-onboard__bars?\b/.test(s)) &&
        !(r.selectors.length === 1 && r.selectors[0] === '.bc-onboard__bars'),
    ).map((r) => r.selectors.join(', '))
    expect(offenders).toEqual([])
    // Nor turns a row back into a box of its own (a row grid sizes its own column).
    const rowDisplay = RULES.filter(
      (r) =>
        r.decls.has('display') &&
        r.selectors.some((s) => /\.bc-onboard__bar(?![\w-])/.test(s)) &&
        !(r.selectors.length === 1 && r.selectors[0] === '.bc-onboard__bar'),
    ).map((r) => r.selectors.join(', '))
    expect(rowDisplay).toEqual([])
    // Nor shrinks the label back under its text with a width or max-width.
    const capped = RULES.filter(
      (r) => r.selectors.some((s) => s.includes('.bc-onboard__bar-label')) && (r.decls.has('width') || r.decls.has('max-width')),
    )
    expect(capped).toEqual([])
  })

  it('renders each label then its track, THROTTLE above BRAKE, as the grid cells', () => {
    const { container } = render(OnBoardHud, {
      props: { telemetry: fixture.subject.telemetry, mode: fixture.mode },
    })
    const cells = [...container.querySelectorAll('.bc-onboard__bars > .bc-onboard__bar > *')]
    expect(cells.map((c) => c.className.split(' ')[0])).toEqual([
      'bc-onboard__bar-label',
      'bc-onboard__track',
      'bc-onboard__bar-label',
      'bc-onboard__track',
    ])
    expect(cells[0].textContent).toBe('THROTTLE')
    expect(cells[2].textContent).toBe('BRAKE')
    expect(cells[1].querySelector('[data-testid="onboard-throttle-fill"]').style.width).toBe('82%')
  })
})
