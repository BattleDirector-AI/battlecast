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
  // Each slot redeclares --bc-plate composed from the base rgb + the widget's plateAlpha,
  // so the widget child inherits a plate at the configured opacity. (Overriding only an
  // alpha var wouldn't work — a :root --bc-plate that bakes it resolves once at :root.)
  it('scales all three plate tokens per slot, proportional to plateAlpha', () => {
    const cfg = normalizeConfig({ widgets: { tower: { plateAlpha: 0.5 } } })
    const { container } = render(AllView, { snapshot: closeBattle, config: cfg })
    const styleOf = (key) => container.querySelector(`[data-testid="widget-${key}"]`).style
    // Configured widget: --bc-plate IS the alpha; dense/header scale to preserve their
    // relative density (0.84·0.5/0.82 = 0.512; 0.94·0.5/0.82 = 0.573).
    const t = styleOf('tower')
    expect(t.getPropertyValue('--bc-plate')).toBe('rgba(var(--bc-plate-rgb), 0.5)')
    expect(t.getPropertyValue('--bc-plate-dense')).toBe('rgba(var(--bc-plate-dense-rgb), 0.512)')
    expect(t.getPropertyValue('--bc-header')).toBe('rgba(var(--bc-header-rgb), 0.573)')
    // A widget left at the 0.82 default keeps every plate's original alpha.
    const b = styleOf('battle')
    expect(b.getPropertyValue('--bc-plate')).toBe('rgba(var(--bc-plate-rgb), 0.82)')
    expect(b.getPropertyValue('--bc-plate-dense')).toBe('rgba(var(--bc-plate-dense-rgb), 0.84)')
    expect(b.getPropertyValue('--bc-header')).toBe('rgba(var(--bc-header-rgb), 0.94)')
  })

  it('clamps every scaled plate token to 1 at plateAlpha = 1', () => {
    const cfg = normalizeConfig({ widgets: { tower: { plateAlpha: 1 } } })
    const { container } = render(AllView, { snapshot: closeBattle, config: cfg })
    const s = container.querySelector('[data-testid="widget-tower"]').style
    // dense (0.84·1/0.82 = 1.02) and header (0.94·1/0.82 = 1.15) both clamp to 1.
    expect(s.getPropertyValue('--bc-plate')).toBe('rgba(var(--bc-plate-rgb), 1)')
    expect(s.getPropertyValue('--bc-plate-dense')).toBe('rgba(var(--bc-plate-dense-rgb), 1)')
    expect(s.getPropertyValue('--bc-header')).toBe('rgba(var(--bc-header-rgb), 1)')
  })
})
