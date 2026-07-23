import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
import idleBattle from '../../../../spec/v1/fixtures/race-idle-battle.json'
import noSubject from '../../../../spec/v1/fixtures/driver-no-subject.json'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'

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

  it('shows the tower empty state and no battle box when there is no snapshot yet', () => {
    const { container } = render(AllView, { snapshot: null })
    expect(container.querySelector('[data-testid="tower-empty"]')).not.toBeNull()
    // The battle box is a race widget: with no snapshot there is no racing mode, so it
    // draws nothing (its slot may remain, but no battle content). #81
    expect(container.querySelector('.bc-battle')).toBeNull()
    expect(container.textContent).not.toContain('NO ACTIVE BATTLE')
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

  it('drives the tower layout from the config classDisplay (grouped)', () => {
    // Default config keeps the tower inline (one overall-order list, no sections).
    const inline = render(AllView, { snapshot: multiClass })
    expect(inline.container.querySelectorAll('[data-testid="tower-group"]')).toHaveLength(0)
    inline.unmount()

    // A profile that selects grouped renders per-class sections in the composed view.
    const cfg = normalizeConfig({ widgets: { tower: { classDisplay: 'grouped' } } })
    const { container } = render(AllView, { snapshot: multiClass, config: cfg })
    const groups = Array.from(
      container.querySelectorAll('[data-testid="tower-group"]'),
    ).map((g) => g.getAttribute('data-class'))
    expect(groups).toEqual(['GTP', 'LMP2', 'GT3'])
  })
})

describe('AllView — per-widget plate opacity (#117)', () => {
  // SPEC-FIRST: encodes the application contract for overlay-config rule 15 and is RED
  // until AllView applies each widget's plateAlpha as a --bc-plate-alpha CSS var on its slot.
  it('applies each widget plateAlpha as a --bc-plate-alpha var on its slot', () => {
    const cfg = normalizeConfig({ widgets: { tower: { plateAlpha: 0.5 } } })
    const { container } = render(AllView, { snapshot: closeBattle, config: cfg })
    const towerSlot = container.querySelector('[data-testid="widget-tower"]')
    expect(towerSlot.style.getPropertyValue('--bc-plate-alpha')).toBe('0.5')
    // A widget left at the default carries 0.82.
    const battleSlot = container.querySelector('[data-testid="widget-battle"]')
    expect(battleSlot.style.getPropertyValue('--bc-plate-alpha')).toBe('0.82')
  })
})
