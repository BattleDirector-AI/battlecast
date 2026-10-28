/* Theme presets as token sets (overlay-config.md rules 59–60, ADR 0026, how/renderer.md
 * "Theme presets").
 *
 * happy-dom resolves no CSS custom properties, so a rendered widget cannot tell us which colour
 * or font a preset produced. What this file can hold is the stylesheet's STRUCTURE, which is
 * where every way of getting a preset silently wrong lives:
 *   - a block keyed `:root[data-theme=…]` only, which never reaches the /config preview stage;
 *   - a typo'd token name, which overrides nothing and fails silently;
 *   - an input token overridden without the token derived from it, which leaves the preview's
 *     plates modern (a custom property resolves var() where it is declared);
 *   - a geometry token overridden, which changes the tower's row budget (behaviour, not look);
 *   - a missing base-look token, so widgets show a half-themed look before their own pass.
 * The token CSS is read from disk (a `?raw` CSS import is empty under vitest's CSS handling).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TOKENS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'tokens')
const TOKEN_FILES = ['colors.css', 'typography.css', 'spacing.css', 'effects.css']
const VINTAGE = ['vintage70', 'vintage80']

/** Strip comments, @import and nested at-rule blocks (@keyframes), then return the flat rules
 *  as { selectors: string[], decls: Map<prop, value> }. */
function parseRules(css) {
  let src = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]*;/g, '')
  // Remove @keyframes blocks, which nest braces.
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
    const selectors = m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '))
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

const files = Object.fromEntries(
  TOKEN_FILES.map((f) => [f, parseRules(readFileSync(join(TOKENS_DIR, f), 'utf8'))]),
)
const allRules = Object.values(files).flat()

/** `[data-theme="x"]`, `[data-theme='x']` or `[data-theme=x]`, normalized to the double-quoted form. */
const normSel = (s) => s.replace(/\[data-theme=['"]?([\w-]+)['"]?\]/g, '[data-theme="$1"]')

/** The modern token set: every custom property declared on a bare `:root`. */
function baseTokens(rules) {
  const out = new Map()
  for (const r of rules) {
    if (r.selectors.includes(':root')) {
      for (const [k, v] of r.decls) if (k.startsWith('--')) out.set(k, v)
    }
  }
  return out
}
const BASE = baseTokens(allRules)

/** A preset's overrides, from blocks that list the BARE attribute selector (so they reach the
 *  /config preview stage as well as the document root). */
function presetOverrides(preset) {
  const want = `[data-theme="${preset}"]`
  const out = new Map()
  for (const r of allRules) {
    if (r.selectors.map(normSel).includes(want)) {
      for (const [k, v] of r.decls) if (k.startsWith('--')) out.set(k, v)
    }
  }
  return out
}

/** The base look every widget gets before its own pass (ADR 0026, "The base look"). */
const REQUIRED = [
  '--bc-font-display',
  '--bc-font-ui',
  '--bc-font-mono',
  '--bc-font-style',
  '--bc-text',
  '--bc-text-2',
  '--bc-text-3',
  '--bc-text-4',
  '--bc-text-on-accent',
  '--bc-accent',
  '--bc-accent-soft',
  '--bc-accent-glow',
  '--bc-accent-line',
  '--bc-oncam-text',
  '--bc-oncam-bg',
  '--bc-oncam-shadow',
  '--bc-plate-rgb',
  '--bc-plate-dense-rgb',
  '--bc-plate-solid',
  '--bc-header-rgb',
  '--bc-blur',
  '--bc-shadow-plate',
  '--bc-shadow-soft',
  '--bc-shadow-text',
  '--bc-radius',
  '--bc-radius-chip',
]

/** Spacing tokens that are geometry (every spacing.css token but the radii). */
const GEOMETRY = [...baseTokens(files['spacing.css']).keys()].filter((k) => !k.startsWith('--bc-radius'))
// Rule 60's text-sized boxes grow or shrink only by typeface and font style: the text's size,
// weight and letter spacing are the same in every preset.
const TEXT_METRICS = [...baseTokens(files['typography.css']).keys()].filter((k) => /^--bc-(size|weight|track)-/.test(k))

describe('the modern token set (rule 60: modern renders exactly as before)', () => {
  it('declares the two new base-look tokens with values that change nothing', () => {
    expect(BASE.get('--bc-shadow-text'), '--bc-shadow-text on :root').toBe('none')
    expect(BASE.get('--bc-font-style'), '--bc-font-style on :root').toBe('normal')
  })

  it('guard: the parser sees the existing modern tokens and geometry set', () => {
    expect(BASE.get('--bc-accent')).toBe('#1FE0C4')
    expect(BASE.get('--bc-plate')).toBe('rgba(var(--bc-plate-rgb), 0.82)')
    expect(GEOMETRY).toEqual(expect.arrayContaining(['--bc-row-standard', '--bc-tower-width', '--bc-inset-safe']))
    expect(GEOMETRY).not.toContain('--bc-radius')
  })
})

describe.each(VINTAGE)('the %s token set', (preset) => {
  const overrides = presetOverrides(preset)

  it('is keyed off the bare [data-theme] attribute and overrides the whole base look', () => {
    expect(overrides.size, `no [data-theme="${preset}"] block in ${TOKEN_FILES.join(', ')}`).toBeGreaterThan(0)
    const missing = REQUIRED.filter((t) => !overrides.has(t))
    expect(missing, `${preset} leaves these modern`).toEqual([])
  })

  it('overrides only tokens the modern set defines (no typos, one vocabulary)', () => {
    expect(overrides.size, 'guard: the preset block exists').toBeGreaterThan(0)
    const orphans = [...overrides.keys()].filter((t) => !BASE.has(t))
    expect(orphans).toEqual([])
  })

  it('never overrides a geometry token', () => {
    expect(overrides.size, 'guard: the preset block exists').toBeGreaterThan(0)
    expect([...overrides.keys()].filter((t) => GEOMETRY.includes(t))).toEqual([])
  })

  it('never overrides a text size, weight or letter-spacing token', () => {
    expect(TEXT_METRICS, 'guard: the typography metrics are found').toEqual(
      expect.arrayContaining(['--bc-size-label', '--bc-weight-name', '--bc-track-label']),
    )
    expect([...overrides.keys()].filter((t) => TEXT_METRICS.includes(t))).toEqual([])
  })

  it('re-declares every derived token whose input it changes', () => {
    expect(overrides.size, 'guard: the preset block exists').toBeGreaterThan(0)
    const stale = []
    for (const [token, value] of BASE) {
      const inputs = [...value.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1])
      if (inputs.some((i) => overrides.has(i)) && !overrides.has(token)) stale.push(token)
    }
    expect(stale, `${preset} changes an input but not these derived tokens`).toEqual([])
  })

  it('sets the inherited text shadow and font style on its theme scope', () => {
    const scoped = allRules.filter((r) =>
      r.selectors.map(normSel).some((s) => s === '[data-theme]' || s === `[data-theme="${preset}"]`),
    )
    const value = (prop) => scoped.map((r) => r.decls.get(prop)).find((v) => v !== undefined)
    expect(value('text-shadow'), 'text-shadow on the theme scope').toBe('var(--bc-shadow-text)')
    expect(value('font-style'), 'font-style on the theme scope').toBe('var(--bc-font-style)')
  })
})
