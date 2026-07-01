import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import AllView from './AllView.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
import idleBattle from '../../../../spec/v1/fixtures/race-idle-battle.json'

afterEach(() => cleanup())

function renderedNames(container) {
  return Array.from(container.querySelectorAll('[data-testid="driver-name"]')).map((el) =>
    el.textContent.trim(),
  )
}

describe('AllView — standings tower + battle box from one snapshot', () => {
  it('renders both widgets driven by the same snapshot', () => {
    const { container } = render(AllView, { snapshot: closeBattle })

    // Standings tower: driver rows in position order.
    expect(renderedNames(container)).toEqual(['Hamilton', 'Verstappen', 'Leclerc', 'Norris'])
    // On-camera highlight still applies inside the combined view.
    expect(
      container.querySelector('[data-testid="tower-row"][data-slot="car-1"]').getAttribute('data-oncam'),
    ).toBe('true')

    // Battle box: on-camera driver + gaps, driven from the same snapshot.
    expect(container.textContent).toContain('Verstappen')
    expect(container.textContent).toContain('+0.4')
    expect(container.textContent).toContain('+1.8')
  })

  it('renders both widgets in their empty/idle states when there is no snapshot yet', () => {
    const { container } = render(AllView, { snapshot: null })
    expect(container.querySelector('[data-testid="tower-empty"]')).not.toBeNull()
    expect(container.textContent).toContain('NO ACTIVE BATTLE')
  })

  it('keeps the battle box idle for a lone car even though the tower has a row', () => {
    const { container } = render(AllView, { snapshot: idleBattle })
    expect(renderedNames(container)).toEqual(['Alonso'])
    expect(container.textContent).toContain('NO ACTIVE BATTLE')
  })
})
