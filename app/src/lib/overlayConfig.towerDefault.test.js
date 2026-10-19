/* Default tower and battle-box geometry — overlay-config.md rules 2 and 44, ADR 0020.
 * The standalone token is read from spacing.css on disk (a `?raw` CSS import comes back empty
 * under vitest's CSS handling, as AllView.textScale.test.js notes).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_CONFIG, normalizeConfig } from './overlayConfig.js'

const spacing = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'design', 'tokens', 'spacing.css'),
  'utf8',
)

describe('default tower width (rule 44)', () => {
  it('is 400 wide at x 24, in the built-in default and for a profile without a tower w', () => {
    expect(DEFAULT_CONFIG.widgets.tower).toMatchObject({ x: 24, w: 400 })
    expect(normalizeConfig({}).widgets.tower).toMatchObject({ x: 24, w: 400 })
    expect(normalizeConfig({ widgets: { tower: { h: 600 } } }).widgets.tower.w).toBe(400)
  })

  it('sets the standalone --bc-tower-width token to 400px', () => {
    const m = spacing.match(/--bc-tower-width\s*:\s*([^;]+);/)
    expect(m, 'no --bc-tower-width in spacing.css').toBeTruthy()
    expect(m[1].trim()).toBe('400px')
  })

  it('moves the default battle box to x 448, keeping a 24px gap to the tower', () => {
    const { tower, battle } = DEFAULT_CONFIG.widgets
    expect(battle).toMatchObject({ x: 448, w: 440 })
    expect(battle.x - (tower.x + tower.w)).toBe(24)
  })

  it('leaves no two default widgets in the top band overlapping', () => {
    const top = ['tower', 'battle', 'racecontrol'].map((k) => DEFAULT_CONFIG.widgets[k])
    top.sort((a, b) => a.x - b.x)
    for (let i = 1; i < top.length; i++) {
      expect(top[i].x, `widget at x ${top[i].x} overlaps the one before it`).toBeGreaterThanOrEqual(
        top[i - 1].x + top[i - 1].w,
      )
    }
  })
})

describe('a saved tower width is kept (rule 2)', () => {
  it('keeps a stored w of 380', () => {
    expect(normalizeConfig({ widgets: { tower: { w: 380 } } }).widgets.tower.w).toBe(380)
  })
})
