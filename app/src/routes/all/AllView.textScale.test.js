/* Per-widget text size in /all (#188): overlay-config.md rule 39, ADR 0015.
 *
 * happy-dom does no layout and resolves no CSS custom properties, so the rendered font
 * size cannot be measured here. What /all owns, and what this asserts, is the per-slot
 * redeclaration of every `--bc-size-*` type token at base × factor (the same per-slot
 * override `plateAlpha` uses). The base values are read from typography.css itself, so a
 * future base-size change cannot make this test lie.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

afterEach(() => cleanup())

// Read from disk: a `?raw` CSS import comes back empty under vitest's CSS handling.
const typography = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'design', 'tokens', 'typography.css'),
  'utf8',
)

/** Every `--bc-size-*: <n>px` token declared in typography.css, as { name: px }. */
const SIZE_TOKENS = Object.fromEntries(
  [...typography.matchAll(/(--bc-size-[a-z-]+)\s*:\s*([\d.]+)px/g)].map((m) => [m[1], Number(m[2])]),
)

const slotStyle = (container, key) =>
  container.querySelector(`[data-testid="widget-${key}"]`).style

describe('AllView — per-widget text size (rule 39)', () => {
  it('finds the type-size tokens it scales', () => {
    expect(Object.keys(SIZE_TOKENS).length).toBeGreaterThanOrEqual(10)
    expect(SIZE_TOKENS['--bc-size-name']).toBeGreaterThan(0)
  })

  it.each([
    ['large', 1.15],
    ['larger', 1.3],
  ])('%s redeclares every --bc-size-* token on that slot at base × %s', (preset, factor) => {
    const cfg = normalizeConfig({ widgets: { tower: { textScale: preset } } })
    const { container } = render(AllView, { snapshot: closeBattle, config: cfg })
    const style = slotStyle(container, 'tower')
    for (const [name, base] of Object.entries(SIZE_TOKENS)) {
      const value = style.getPropertyValue(name)
      expect(value, `${name} not redeclared on the tower slot`).toMatch(/px$/)
      expect(parseFloat(value), name).toBeCloseTo(base * factor, 2)
    }
  })

  it('scales only the widget it is set on', () => {
    const cfg = normalizeConfig({ widgets: { battle: { textScale: 'larger' } } })
    const { container } = render(AllView, { snapshot: closeBattle, config: cfg })
    expect(parseFloat(slotStyle(container, 'battle').getPropertyValue('--bc-size-battle-name')))
      .toBeCloseTo(SIZE_TOKENS['--bc-size-battle-name'] * 1.3, 2)
    expect(slotStyle(container, 'tower').getPropertyValue('--bc-size-name')).toBe('')
  })

  it('normal redeclares nothing, so the widget renders exactly as without the knob', () => {
    const { container } = render(AllView, { snapshot: closeBattle, config: normalizeConfig({}) })
    for (const key of ['tower', 'battle']) {
      const style = slotStyle(container, key)
      for (const name of Object.keys(SIZE_TOKENS)) expect(style.getPropertyValue(name), `${key} ${name}`).toBe('')
    }
  })

  it('changes text size only: the slot keeps its configured geometry', () => {
    const cfg = normalizeConfig({ widgets: { tower: { textScale: 'larger' } } })
    const { container } = render(AllView, { snapshot: closeBattle, config: cfg })
    const style = slotStyle(container, 'tower')
    expect(style.width).toBe(`${cfg.widgets.tower.w}px`)
    expect(style.height).toBe(`${cfg.widgets.tower.h}px`)
  })
})
