import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
import idleBattle from '../../../../spec/v1/fixtures/race-idle-battle.json'
import noSubject from '../../../../spec/v1/fixtures/driver-no-subject.json'

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

  it('includes the driver lower-third slot and fires it for the on-camera subject', async () => {
    const { container } = render(AllView, { snapshot: closeBattle })
    await tick()

    const driverSlot = container.querySelector('[data-testid="widget-driver"]')
    expect(driverSlot).not.toBeNull()
    // Placed at its default bottom lower-third geometry.
    expect(driverSlot.style.top).toBe('900px')
    // Fires on connect for the on-camera subject (car-1 = Verstappen, P2).
    expect(driverSlot.querySelector('[data-testid="driver-lt-name"]').textContent.trim()).toBe(
      'Verstappen',
    )
    expect(driverSlot.querySelector('[data-testid="driver-lt-pos"]').textContent.trim()).toBe('P2')
  })

  it('mounts the driver slot but renders no card when there is no valid subject', async () => {
    const { container } = render(AllView, { snapshot: noSubject })
    await tick()
    const driverSlot = container.querySelector('[data-testid="widget-driver"]')
    // The slot is present (self-managing), but the card itself is not drawn.
    expect(driverSlot).not.toBeNull()
    expect(driverSlot.querySelector('[data-testid="driver-lower-third"]')).toBeNull()
  })

  it('drops the driver slot entirely when hideWhenIdle is set and there is no subject', async () => {
    const cfg = normalizeConfig({ widgets: { driver: { visible: true, hideWhenIdle: true } } })
    const { container } = render(AllView, { snapshot: noSubject, config: cfg })
    await tick()
    expect(container.querySelector('[data-testid="widget-driver"]')).toBeNull()
  })
})
