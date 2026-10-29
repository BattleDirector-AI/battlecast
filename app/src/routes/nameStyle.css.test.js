/* No widget cuts a driver's name — widgets.md rules 112-114, ADR 0038, how/renderer.md
 * "Driver names in every widget".
 *
 * happy-dom applies no stylesheet and does no layout, so a rendered widget cannot show whether a
 * long name is cut or how wide the widget grows. These tests read the rules from each
 * component's source (Vite `?raw`), as InfoPanel.header.test.js does: every rule that styles a
 * name, in any preset, must leave it whole (no `text-overflow`, no clipping `overflow`, no
 * `max-width`, no `min-width: 0`, no `text-wrap`) and on one line; the boxes around a name must
 * not let it shrink below its text; each widget's root must not be narrower than its content;
 * and the global reference short form (rule 113) must be the `W.WWW` block how/renderer.md
 * names. Whether the resulting widths are right is a real-browser check.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import battleSrc from './battle/BattleBox.svelte?raw'
import driverSrc from './driver/DriverLowerThird.svelte?raw'
import qualifyingSrc from './qualifying/QualifyingLowerThird.svelte?raw'
import onboardSrc from './onboard/OnBoardHud.svelte?raw'
import updatesSrc from './updates/RaceUpdateBox.svelte?raw'
import gridSrc from './grid/GridSlide.svelte?raw'
import resultsSrc from './results/ResultsSlide.svelte?raw'

// A `.css` file imported with `?raw` reads empty under vitest's CSS handling, so the global
// stylesheet is read from disk.
const stylesCss = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'design', 'styles.css'), 'utf8')

/** Flat rules of a stylesheet: [{ selectors: string[], decls: Map }]. */
function cssRules(css) {
  // Comments and `@import` statements (which carry no braces) are dropped first.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]*;/g, '')
  const rules = []
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
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
const styleOf = (source) => cssRules(/<style>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? '')

/** Every declaration on a selector whose subject is `.className`, as "selector | prop: value". */
function declsOn(rules, className) {
  const out = []
  for (const rule of rules) {
    for (const s of rule.selectors) {
      if (!new RegExp(`\\.${className}(?![\\w-])[^ ]*$`).test(s)) continue
      for (const [prop, value] of rule.decls) out.push(`${s} | ${prop}: ${value}`)
    }
  }
  return out
}

const COMPONENTS = {
  BattleBox: styleOf(battleSrc),
  DriverLowerThird: styleOf(driverSrc),
  QualifyingLowerThird: styleOf(qualifyingSrc),
  OnBoardHud: styleOf(onboardSrc),
  RaceUpdateBox: styleOf(updatesSrc),
  GridSlide: styleOf(gridSrc),
  ResultsSlide: styleOf(resultsSrc),
}

// [component, the name element's class]
const NAMES = [
  ['BattleBox', 'bc-battle__focus-name'],
  ['BattleBox', 'bc-battle__slot-name'],
  ['BattleBox', 'bc-battle__idle-sub'],
  ['DriverLowerThird', 'bc-lt__name'],
  ['QualifyingLowerThird', 'bc-qt__name'],
  ['OnBoardHud', 'bc-onboard__driver'],
  ['RaceUpdateBox', 'bc-ru__name'],
  ['GridSlide', 'cell__name'],
  ['ResultsSlide', 'row__name'],
]

// Declarations that cut, clip, cap or wrap a name, or let it shrink below its text.
const CUTTING =
  /\| (text-overflow: .*|overflow(-x|-y)?: (?!visible$).*|max-width: .*|min-width: 0(px)?|text-wrap: .*|white-space: (?!nowrap$).*)$/

describe('a name is never cut (rule 112)', () => {
  it.each(NAMES)('%s: the parser sees the .%s rules', (component, cls) => {
    // Guards the checks below against passing on an empty set.
    expect(declsOn(COMPONENTS[component], cls).length).toBeGreaterThan(2)
  })

  it.each(NAMES)('%s: no rule in any preset cuts, clips or wraps .%s', (component, cls) => {
    const cutting = declsOn(COMPONENTS[component], cls).filter((d) => CUTTING.test(d))
    expect(cutting, `.${cls} rules that cut the name`).toEqual([])
  })

  it.each(NAMES)('%s: .%s stays on one line', (component, cls) => {
    expect(declsOn(COMPONENTS[component], cls)).toContain(`.${cls} | white-space: nowrap`)
  })
})

describe('the boxes around a name do not shrink it (rule 114)', () => {
  // A flex or grid item with `min-width: 0` may shrink below its content, so the name would
  // overflow it instead of widening the widget.
  const HOLDERS = [
    ['BattleBox', 'bc-battle__slot'],
    ['DriverLowerThird', 'bc-lt__body'],
    ['QualifyingLowerThird', 'bc-qt__head'],
    ['QualifyingLowerThird', 'bc-qt__body'],
    ['OnBoardHud', 'bc-onboard__identity'],
    ['RaceUpdateBox', 'bc-ru__body'],
    ['RaceUpdateBox', 'bc-ru__main'],
  ]
  it.each(HOLDERS)('%s: .%s has no min-width: 0', (component, cls) => {
    const decls = declsOn(COMPONENTS[component], cls)
    expect(decls.length, `no .${cls} rule found`).toBeGreaterThan(0)
    expect(decls.filter((d) => /\| min-width: 0(px)?$/.test(d))).toEqual([])
  })

  it.each([
    ['BattleBox', 'bc-battle__body'],
    ['GridSlide', 'group__grid'],
  ])('%s: .%s gives no column a zero minimum', (component, cls) => {
    const columns = declsOn(COMPONENTS[component], cls).filter((d) => /\| grid-template-columns: /.test(d))
    expect(columns.length, `no grid-template-columns on .${cls}`).toBeGreaterThan(0)
    expect(columns.filter((d) => /minmax\(\s*0/.test(d))).toEqual([])
  })

  it("#22's label stays on one line and never gives way to the name (#416)", () => {
    const label = declsOn(COMPONENTS.QualifyingLowerThird, 'bc-qt__label')
    expect(label).toContain('.bc-qt__label | white-space: nowrap')
    expect(label).toContain('.bc-qt__label | flex-shrink: 0')
  })
})

describe('each widget is never narrower than its content (rule 114)', () => {
  it.each([
    ['BattleBox', 'bc-battle'],
    ['OnBoardHud', 'bc-onboard'],
    ['DriverLowerThird', 'lt3-anchor'],
    ['QualifyingLowerThird', 'lt3-anchor'],
    ['RaceUpdateBox', 'lt3-anchor'],
  ])('%s: .%s has min-width: min-content', (component, cls) => {
    expect(declsOn(COMPONENTS[component], cls)).toContain(`.${cls} | min-width: min-content`)
  })

  it.each(['DriverLowerThird', 'QualifyingLowerThird', 'RaceUpdateBox'])(
    "%s: the anchor is a grid, so the card's plate gives it a width",
    (component) => {
      expect(declsOn(COMPONENTS[component], 'lt3-anchor')).toContain('.lt3-anchor | display: grid')
    },
  )

  it('the lines that still cut keep cutting (the update detail, the HUD make and model)', () => {
    for (const [component, cls] of [
      ['RaceUpdateBox', 'bc-ru__detail'],
      ['OnBoardHud', 'bc-onboard__car'],
    ]) {
      const decls = declsOn(COMPONENTS[component], cls)
      expect(decls, cls).toContain(`.${cls} | text-overflow: ellipsis`)
      expect(decls, cls).toContain(`.${cls} | white-space: nowrap`)
    }
  })
})

describe('the reference short form (rule 113)', () => {
  const after = declsOn(cssRules(stylesCss), 'bc-name-ref::after')

  it('styles.css draws W.WWW as an invisible block that adds no height', () => {
    expect(after).toContain(".bc-name-ref::after | content: 'W.WWW'")
    expect(after).toContain('.bc-name-ref::after | display: block')
    expect(after).toContain('.bc-name-ref::after | height: 0')
    expect(after).toContain('.bc-name-ref::after | visibility: hidden')
  })
})
