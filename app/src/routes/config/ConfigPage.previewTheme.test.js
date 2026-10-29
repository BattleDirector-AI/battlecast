/* The /config preview in the chosen preset (overlay-config.md rules 63–64, how/config-editor.md
 * "Preview").
 *
 * Rule 63: every widget in the preview takes the preset its render page would. A widget does so
 * when its nearest `data-theme` ancestor is the preview stage and its preset styling keys off
 * that ancestor, never off the document root (the editor's root is never themed, rule 59). The
 * rendered half checks the first for every widget `AllView` draws; the source half checks the
 * second across every component, since happy-dom applies no stylesheet and a widget rule written
 * `:root[data-theme=…]` renders the same DOM either way. (Token blocks are held to the same rule
 * by `design/themeTokens.test.js`.)
 *
 * Rule 64: the drag handles are editor chrome. They sit inside the themed stage, so they would
 * inherit whatever text properties the token files set on a theme scope (today the base look's
 * shadow and lean) and could pick up preset tokens. The handle CSS is read from the component's
 * own <style> (Vite `?raw`), as `StandingsTower.vintage.test.js` does; the scope rules from the
 * token files on disk.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

vi.mock('../../lib/configApi.js', () => ({
  serverAvailable: vi.fn(async () => true),
  listProfiles: vi.fn(async () => []),
  listLogos: vi.fn(async () => []),
  getProfile: vi.fn(),
  saveProfile: vi.fn(async () => ({ saved: true })),
  uploadLogo: vi.fn(),
  deleteLogo: vi.fn(async () => true),
  deleteProfile: vi.fn(async () => true),
}))

import ConfigPage from './ConfigPage.svelte'
import configSource from './ConfigPage.svelte?raw'
import { FakeEventSource } from '../../lib/testing/fakeEventSource.js'
import { sourceFiles, stripComments } from '../../lib/testing/sourceScan.js'
import { WIDGET_KEYS } from '../../lib/overlayConfig.js'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

beforeEach(() => {
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

async function settle() {
  for (let i = 0; i < 5; i++) await tick()
}

const stage = (c) => c.querySelector('[data-testid="preview-stage"]')

describe('the preview renders every widget in the chosen preset (rule 63)', () => {
  it('each widget AllView draws sits in the stage, whose data-theme is the nearest one above it', async () => {
    const { container } = render(ConfigPage)
    await settle()
    // Show every widget, the ones hidden by default (logos) included.
    for (const key of WIDGET_KEYS) {
      const box = container.querySelector(`[data-testid="visible-${key}"]`)
      expect(box, `guard: a visibility toggle for ${key}`).toBeTruthy()
      if (!box.checked) await fireEvent.click(box)
    }
    await settle()

    const select = container.querySelector('[data-testid="theme-preset"]')
    for (const preset of ['vintage70', 'vintage80', 'modern']) {
      await fireEvent.change(select, { target: { value: preset } })
      await settle()
      const s = stage(container)
      expect(s.dataset.theme, `stage under ${preset}`).toBe(preset)
      // Nothing inside the stage scopes its own theme: one would cut a widget off the choice.
      expect(s.querySelectorAll('[data-theme]'), `a data-theme inside the stage under ${preset}`).toHaveLength(0)
      const drawn = [...container.querySelectorAll('[data-testid^="widget-"]')].map((el) => el.dataset.widget)
      expect(drawn.sort(), `widgets drawn under ${preset}`).toEqual([...WIDGET_KEYS].sort())
      for (const key of WIDGET_KEYS) {
        const slot = container.querySelector(`[data-testid="widget-${key}"]`)
        expect(slot.closest('[data-theme]'), `${key}'s theme scope under ${preset}`).toBe(s)
      }
    }
  })

  it('no component keys preset styling off the document root alone', () => {
    // `:root[data-theme…]` / `html[data-theme…]`, with or without other root conditions such as
    // `:not([data-motion='reduced'])` chained before the theme attribute.
    const ROOT_THEME = /(?::root|\bhtml)(?:\[[^\]]*\]|:not\([^)]*\))*\[data-theme/
    const offenders = []
    let scanned = 0
    for (const [abs, rel] of sourceFiles(SRC)) {
      if (!rel.endsWith('.svelte')) continue
      const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(readFileSync(abs, 'utf8'))?.[1]
      if (!style) continue
      scanned++
      const css = style.replace(/\/\*[\s\S]*?\*\//g, '')
      for (const m of css.matchAll(/([^{}]+)\{/g)) {
        for (const sel of m[1].split(/,(?![^(]*\))/)) {
          if (ROOT_THEME.test(sel)) offenders.push(`${rel}: ${sel.trim()}`)
        }
      }
    }
    expect(scanned, 'guard: component styles were scanned').toBeGreaterThan(10)
    expect(offenders).toEqual([])
  })

  it('no widget code reads the preset off the document root', () => {
    // The tower's theme-switch reset looks the scope up with `closest('[data-theme]')`; a read
    // of `document.documentElement`'s attribute sees `modern` (or nothing) in the editor.
    const READ = /documentElement\s*\.\s*(?:dataset\s*\.\s*theme\b|getAttribute\s*\(\s*['"]data-theme)/
    const offenders = []
    for (const [abs, rel] of sourceFiles(SRC)) {
      if (rel.endsWith('.test.js') || rel === 'lib/theme.js') continue
      if (READ.test(stripComments(readFileSync(abs, 'utf8')))) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})

/** Flat rules of a stylesheet: [{ selectors: string[], decls: Map }], comments and @keyframes
 *  blocks (which nest braces) removed. */
function cssRules(raw) {
  let src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]*;/g, '')
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
    const selectors = m[1].split(/,(?![^(]*\))/).map((s) => s.trim().replace(/\s+/g, ' '))
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
const RULES = cssRules(/<style>([\s\S]*?)<\/style>/.exec(configSource)?.[1] ?? '')
const HANDLE = /\.handle\b|\.handle__/
// The LAST rule declaring the property: the one the cascade applies (equal specificity, later wins).
const decl = (selector, prop) =>
  RULES.findLast((r) => r.selectors.includes(selector) && r.decls.has(prop))?.decls.get(prop)

/* The rules that style a theme scope itself (`[data-theme]`, `:root[data-theme]`,
 * `[data-theme="vintage70"]` …), across every token file: what the preview stage applies and
 * its descendants inherit. Read from disk, as `design/themeTokens.test.js` does. */
const TOKENS_DIR = join(SRC, 'design', 'tokens')
const THEME_SCOPE = /^(?::root)?\[data-theme(?:=['"]?[\w-]+['"]?)?\]$/
const SCOPE_RULES = readdirSync(TOKENS_DIR)
  .filter((f) => f.endsWith('.css'))
  .flatMap((f) => cssRules(readFileSync(join(TOKENS_DIR, f), 'utf8')))
  .filter((r) => r.selectors.some((s) => THEME_SCOPE.test(s)))
/** Inherited text properties: the ones a declaration on the stage hands down to the label. */
const INHERITED =
  /^(?:color|font(?:-[\w-]+)?|letter-spacing|word-spacing|line-height|text-(?:shadow|transform|align|indent|rendering|emphasis[\w-]*)|-webkit-text-(?:stroke[\w-]*|fill-color)|paint-order|white-space|direction)$/
const SCOPE_PROPS = [...new Set(SCOPE_RULES.flatMap((r) => [...r.decls.keys()]).filter((k) => INHERITED.test(k)))]

describe('the drag handles keep the editor look under every preset (rule 64)', () => {
  it('the key label overrides, with a literal value, every text property a theme scope hands down', async () => {
    // Today the base-look rule (design/tokens/effects.css) sets `text-shadow` and `font-style` on
    // every scope; a property any later pass adds there reaches the label too, unless it sets its own.
    expect(SCOPE_PROPS, 'guard: the base-look rule was found').toEqual(expect.arrayContaining(['text-shadow', 'font-style']))
    const offenders = []
    for (const prop of SCOPE_PROPS) {
      const own = decl('.handle__label', prop)
      if (own === undefined || /var\(--bc-|inherit|unset|revert/.test(own)) offenders.push(`${prop}: ${own ?? '(inherited)'}`)
    }
    expect(offenders).toEqual([])
    expect(decl('.handle__label', 'text-shadow')).toBe('none')
    expect(decl('.handle__label', 'font-style')).toBe('normal')

    // And it really is the key label that rule styles.
    const { container } = render(ConfigPage)
    await settle()
    const label = container.querySelector('[data-testid="label-tower"]')
    expect(label?.textContent).toBe('tower')
  })

  it('no handle rule reads a design token or sits under a preset selector', () => {
    const offenders = []
    for (const r of RULES) {
      if (!r.selectors.some((s) => HANDLE.test(s))) continue
      if (r.selectors.some((s) => s.includes('data-theme'))) offenders.push(`${r.selectors.join(', ')}: themed`)
      for (const [k, v] of r.decls) if (/var\(--bc-/.test(v)) offenders.push(`${r.selectors.join(', ')}: ${k}: ${v}`)
    }
    expect(RULES.filter((r) => r.selectors.some((s) => HANDLE.test(s))).length, 'guard: handle rules parsed').toBeGreaterThanOrEqual(3)
    expect(offenders).toEqual([])
  })

  it('the label never takes a preset typeface from the stage or the canvas', () => {
    // The stage scopes the preset's font tokens (`--bc-font-*`); the label inherits the editor
    // root's typeface unless something between sets a font from them. The token side (a theme
    // scope rule setting `font-family`) is held by the first test above.
    for (const sel of ['.handle__label', '.handle', '.preview__canvas', '.preview__stage']) {
      for (const prop of ['font-family', 'font']) {
        expect(decl(sel, prop) ?? '', `${sel} ${prop}`).not.toMatch(/var\(--bc-font/)
      }
    }
  })
})
