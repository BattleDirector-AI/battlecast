import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
import idleBattle from '../../../../spec/v1/fixtures/race-idle-battle.json'
import raceSessionFcy from '../../../../spec/v1/fixtures/race-session-fcy.json'
import raceOnboard from '../../../../spec/v1/fixtures/race-onboard-telemetry.json'
import lowerThird from './fixtures/profile-lower-third.json'
import towerOnly from './fixtures/profile-tower-only.json'
import withLogos from './fixtures/profile-with-logos.json'

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

  it('sizes the overlay stage to the configured canvas', () => {
    const { container } = render(AllView, {
      snapshot: closeBattle,
      config: normalizeConfig({ canvas: { w: 1280, h: 720 } }),
    })
    const stage = container.querySelector('[data-testid="overlay-stage"]')
    expect(stage.style.width).toBe('1280px')
    expect(stage.style.height).toBe('720px')
  })

  it('defaults the overlay stage to 1920x1080 when no canvas is configured', () => {
    const { container } = render(AllView, { snapshot: closeBattle })
    const stage = container.querySelector('[data-testid="overlay-stage"]')
    expect(stage.style.width).toBe('1920px')
    expect(stage.style.height).toBe('1080px')
  })

  it('falls back to a sensible default side-by-side layout when no config is passed', () => {
    const { container } = render(AllView, { snapshot: closeBattle })

    const tower = slot(container, 'tower')
    const battle = slot(container, 'battle')
    expect(tower).not.toBeNull()
    expect(battle).not.toBeNull()
    // Default: tower in the left column, battle placed to its right (both visible).
    expect(tower.style.left).toBe('24px')
    expect(battle.style.left).toBe('428px')
    // Existing /all content contract still holds inside the laid-out slots.
    expect(container.textContent).toContain('Hamilton')
  })

  it('auto-hides a hideWhenIdle widget when idle, and shows it when active', () => {
    const cfg = normalizeConfig({ widgets: { battle: { visible: true, hideWhenIdle: true } } })

    // Clear air (both gaps null) -> battle box is idle -> removed from the DOM.
    const idle = render(AllView, { snapshot: idleBattle, config: cfg })
    expect(slot(idle.container, 'battle')).toBeNull()
    cleanup()

    // A real battle -> shown.
    const active = render(AllView, { snapshot: closeBattle, config: cfg })
    expect(slot(active.container, 'battle')).not.toBeNull()
  })

  it('keeps an idle widget when hideWhenIdle is off (shows the idle placeholder)', () => {
    const cfg = normalizeConfig({ widgets: { battle: { visible: true, hideWhenIdle: false } } })
    const { container } = render(AllView, { snapshot: idleBattle, config: cfg })
    const battle = slot(container, 'battle')
    expect(battle).not.toBeNull()
    expect(battle.textContent).toContain('NO ACTIVE BATTLE')
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

  it('composes the logos widget at its slot, driven by the logoRotation config (#33)', () => {
    const { container } = render(AllView, {
      snapshot: closeBattle,
      config: normalizeConfig(withLogos),
    })

    const logos = slot(container, 'logos')
    expect(logos).not.toBeNull()
    // Placed at the configured geometry...
    expect(logos.style.left).toBe('1560px')
    expect(logos.style.top).toBe('900px')
    // ...and showing the first configured sponsor image.
    expect(logos.querySelector('[data-testid="logo-image"]').getAttribute('src')).toBe(
      '/logos/sponsor-a.png',
    )
  })

  it('composes the race control status widget from snapshot.session without disturbing other widgets (#25)', () => {
    const { container } = render(AllView, { snapshot: raceSessionFcy })

    const racecontrol = slot(container, 'racecontrol')
    expect(racecontrol).not.toBeNull()
    expect(racecontrol.textContent).toContain('YELLOW FLAG')
    expect(racecontrol.textContent).toContain('FULL COURSE YELLOW')
    expect(racecontrol.textContent).toContain('SAFETY CAR')

    // Existing widgets keep rendering their own content unaffected (tower shows the
    // fixture's running order; battle shows the on-camera subject).
    const tower = slot(container, 'tower')
    const battle = slot(container, 'battle')
    expect(tower).not.toBeNull()
    expect(battle).not.toBeNull()
    expect(container.textContent).toContain('Hamilton')
    expect(container.textContent).toContain('Verstappen')
  })

  it('omits the racecontrol widget from the DOM when hidden via config', () => {
    const cfg = normalizeConfig({ widgets: { racecontrol: { visible: false } } })
    const { container } = render(AllView, { snapshot: raceSessionFcy, config: cfg })
    expect(slot(container, 'racecontrol')).toBeNull()
  })

  it('composes the on-board HUD from snapshot.subject.telemetry without disturbing other widgets (#26)', () => {
    const { container } = render(AllView, { snapshot: raceOnboard })

    const onboard = slot(container, 'onboard')
    expect(onboard).not.toBeNull()
    // The HUD shows the on-camera subject's live inputs (speed + gear from the fixture).
    expect(onboard.querySelector('[data-testid="onboard-speed"]').textContent).toContain('247')
    expect(onboard.querySelector('[data-testid="onboard-gear"]').textContent).toContain('6')

    // Existing widgets keep rendering their own content unaffected.
    const tower = slot(container, 'tower')
    const battle = slot(container, 'battle')
    expect(tower).not.toBeNull()
    expect(battle).not.toBeNull()
    expect(container.textContent).toContain('Hamilton')
    expect(container.textContent).toContain('Verstappen')
  })

  it('idles the on-board HUD (renders nothing) when the snapshot carries no telemetry', () => {
    // race-session-fcy.json has a subject but no subject.telemetry -> HUD renders
    // nothing, though its slot is still placed (the component's own guard is empty).
    const { container } = render(AllView, { snapshot: raceSessionFcy })
    const onboard = slot(container, 'onboard')
    expect(onboard).not.toBeNull()
    expect(onboard.querySelector('[data-testid="onboard-hud"]')).toBeNull()
  })

  it('omits the onboard widget from the DOM when hidden via config', () => {
    const cfg = normalizeConfig({ widgets: { onboard: { visible: false } } })
    const { container } = render(AllView, { snapshot: raceOnboard, config: cfg })
    expect(slot(container, 'onboard')).toBeNull()
  })

  it('applies the config speedUnit to the on-board HUD (mph converts the canonical km/h)', () => {
    const cfg = normalizeConfig({ widgets: { onboard: { speedUnit: 'mph' } } })
    const { container } = render(AllView, { snapshot: raceOnboard, config: cfg })
    const speed = container.querySelector('[data-testid="onboard-speed"]')
    // Fixture speed is 247 km/h -> 153 mph.
    expect(speed.textContent).toContain('153')
    expect(container.querySelector('[data-testid="onboard-speed-unit"]').textContent).toBe('MPH')
  })

  it('defaults the on-board HUD to km/h when no speedUnit is configured', () => {
    const { container } = render(AllView, { snapshot: raceOnboard })
    const speed = container.querySelector('[data-testid="onboard-speed"]')
    expect(speed.textContent).toContain('247')
    expect(container.querySelector('[data-testid="onboard-speed-unit"]').textContent).toBe('KM/H')
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
