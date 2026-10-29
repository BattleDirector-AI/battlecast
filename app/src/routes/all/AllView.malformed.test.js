// /all on a malformed `vehicles` — protocol-contract.md rule 21, widgets.md rules 14a, 59 and 66.
// One non-object entry must not take down the composed canvas: every configured widget still
// renders. Driven from race-onboard-telemetry.json (car-44 Hamilton P1, car-1 Verstappen P2,
// car-16 Leclerc P3; subject car-1 with live inputs 247 km/h, gear 6).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import onboard from '../../../../spec/v1/fixtures/race-onboard-telemetry.json'

afterEach(() => cleanup())

const q = (el, id) => el?.querySelector(`[data-testid="${id}"]`) ?? null
const slots = (c) => Array.from(c.querySelectorAll('[data-widget]')).map((el) => el.getAttribute('data-widget'))
const names = (c) =>
  Array.from(c.querySelectorAll('[data-testid="driver-name"]')).map((el) => el.textContent.trim())
const DWELL = normalizeConfig({ widgets: { driver: { trigger: 'dwell' } } })

describe('/all — a junk vehicles[] entry (null, number, string)', () => {
  it.each([
    ['null', null],
    ['a number', 7],
    ['a string', 'car-1'],
  ])('renders the same widgets and content as the clean snapshot when vehicles[] holds %s', async (_l, junk) => {
    const clean = render(AllView, { snapshot: onboard, config: DWELL })
    await tick()
    const expectedSlots = slots(clean.container)
    cleanup()

    const { container } = render(AllView, {
      snapshot: { ...onboard, vehicles: [junk, ...onboard.vehicles, junk] },
      config: DWELL,
    })
    await tick()

    // Every widget the clean snapshot composes is still composed.
    expect(slots(container)).toEqual(expectedSlots)
    expect(expectedSlots).toEqual(expect.arrayContaining(['tower', 'battle', 'driver', 'onboard']))
    // Tower: the three real cars, in order, and no row for the junk.
    expect(names(container).slice(0, 3)).toEqual(['HAM', 'VER', 'LEC'])
    expect(Array.from(container.querySelectorAll('[data-testid="tower-row"]'))).toHaveLength(3)
    // Driver lower-third still resolves the subject past the junk (the HUD slot is in the list above).
    expect(q(container, 'driver-lt-name')?.textContent.trim()).toBe('VER')
    // Battle box: the subject's own name.
    expect(q(container, 'widget-battle')?.textContent).toContain('VER')
  })
})

describe('/all — a vehicles that is not an array', () => {
  it.each([
    ['an object', {}],
    ['a string', 'car-1'],
    ['null', null],
  ])('renders every widget, with an empty tower, when vehicles is %s', async (_l, junk) => {
    const { container } = render(AllView, { snapshot: { ...onboard, vehicles: junk }, config: DWELL })
    await tick()

    expect(slots(container)).toEqual(expect.arrayContaining(['tower', 'battle', 'driver', 'onboard']))
    expect(Array.from(container.querySelectorAll('[data-testid="tower-row"]'))).toHaveLength(0)
    expect(q(container, 'tower-empty')?.getAttribute('data-reason')).toBe('no-state')
    // The subject has a name but resolves to no vehicle: the driver card renders degraded.
    expect(q(container, 'driver-lt-name')?.textContent.trim()).toBe('VER')
  })
})
