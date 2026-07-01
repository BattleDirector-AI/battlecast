import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
import lowerThird from './fixtures/profile-lower-third.json'
import towerOnly from './fixtures/profile-tower-only.json'

afterEach(() => cleanup())

function slot(container, key) {
  return container.querySelector(`[data-testid="widget-${key}"]`)
}

describe('AllView — config-driven layout (render side of #16)', () => {
  it('places each widget at its configured position and size', () => {
    const { container } = render(AllView, {
      snapshot: closeBattle,
      config: normalizeConfig(lowerThird),
    })

    const tower = slot(container, 'tower')
    const battle = slot(container, 'battle')
    expect(tower).not.toBeNull()
    expect(battle).not.toBeNull()

    // Assert the ACTUAL rendered geometry, not merely that both are in the DOM.
    expect(tower.style.left).toBe('40px')
    expect(tower.style.top).toBe('40px')
    expect(tower.style.width).toBe('420px')
    expect(tower.style.height).toBe('800px')

    expect(battle.style.left).toBe('640px')
    expect(battle.style.top).toBe('820px')
    expect(battle.style.width).toBe('640px')
    expect(battle.style.height).toBe('200px')
  })

  it('falls back to a sensible default side-by-side layout when no config is passed', () => {
    const { container } = render(AllView, { snapshot: closeBattle })

    const tower = slot(container, 'tower')
    const battle = slot(container, 'battle')
    expect(tower).not.toBeNull()
    expect(battle).not.toBeNull()
    // Default: tower in the left column, battle placed to its right (both visible).
    expect(tower.style.left).toBe('24px')
    expect(battle.style.left).toBe('408px')
    // Existing /all content contract still holds inside the laid-out slots.
    expect(container.textContent).toContain('Hamilton')
  })

  it('omits a hidden widget from the DOM entirely (not just visually collapsed)', () => {
    const { container } = render(AllView, {
      snapshot: closeBattle,
      config: normalizeConfig(towerOnly),
    })

    expect(slot(container, 'tower')).not.toBeNull()
    expect(slot(container, 'battle')).toBeNull()
    // The hidden battle box renders none of its content.
    expect(container.textContent).not.toContain('BATTLE FOR POSITION')
  })

  it('honors z-order by painting widgets in ascending z (later = on top)', () => {
    const { container } = render(AllView, {
      snapshot: closeBattle,
      config: normalizeConfig(lowerThird),
    })
    const tower = slot(container, 'tower')
    const battle = slot(container, 'battle')
    // lower-third: tower z=1, battle z=2 -> battle stacks above tower.
    expect(Number(tower.style.zIndex)).toBeLessThan(Number(battle.style.zIndex))
  })
})
