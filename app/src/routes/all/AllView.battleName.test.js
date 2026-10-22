// /all shows one on-camera name everywhere — widgets.md rules 14b and 65. Driven from
// race-close-battle.json (subject car-1, P2) with the subject's name blanked and the matched
// vehicle's name set; the battle box's focus slot and the driver lower-third's name cell must
// read the same.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
import onboardFixture from '../../../../spec/v1/fixtures/race-onboard-telemetry.json'

afterEach(() => cleanup())

const CFG = normalizeConfig({
  widgets: { battle: { visible: true }, driver: { visible: true, trigger: 'persistent' } },
})
const q = (el, sel) => el?.querySelector(sel)?.textContent.trim()

describe('/all — a blank subject.driver_name reads the same in the battle box and the driver lower-third', () => {
  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
  ])('a name that is %s: both show the matched vehicle\'s name', async (_label, blank) => {
    const snap = structuredClone(closeBattle)
    snap.subject.driver_name = blank
    snap.vehicles.find((v) => v.slot_id === 'car-1').driver_name = 'Max Verstappen'
    const { container } = render(AllView, { snapshot: snap, config: CFG })
    await tick()

    const card = q(container, '[data-testid="driver-lt-name"]')
    expect(card).toContain('Verstappen')
    expect(q(container, '[data-testid="widget-battle"] .bc-battle__focus-name')).toBe(card)
  })
})

// Rule 65 last sentence: outside a hold, the battle box, the driver lower-third and the HUD strip
// show the same name. Driven from race-onboard-telemetry.json (active battle, subject car-1, telemetry).
const FULL = normalizeConfig({
  widgets: {
    battle: { visible: true },
    driver: { visible: true, trigger: 'persistent' },
    onboard: { visible: true },
  },
})

describe('/all — the HUD strip shows the same name as the battle box and the driver lower-third', () => {
  // GUARD: shipped code already routes all three through resolveSubject.
  it('a blank subject.driver_name: all three show the matched vehicle\'s name', async () => {
    const snap = structuredClone(onboardFixture)
    snap.subject.driver_name = '   '
    snap.vehicles.find((v) => v.slot_id === 'car-1').driver_name = 'Max Verstappen'
    const { container } = render(AllView, { snapshot: snap, config: FULL, preview: true })
    await tick()

    const card = q(container, '[data-testid="driver-lt-name"]')
    expect(card).toContain('Verstappen')
    expect(q(container, '[data-testid="widget-battle"] .bc-battle__focus-name')).toBe(card)
    expect(q(container, '[data-testid="onboard-driver-name"]')).toBe(card)
  })

  // GUARD: absent names everywhere.
  it('no name anywhere: empty focus slot, empty card name, no HUD name', async () => {
    const snap = structuredClone(onboardFixture)
    delete snap.subject.driver_name
    delete snap.vehicles.find((v) => v.slot_id === 'car-1').driver_name
    const { container } = render(AllView, { snapshot: snap, config: FULL, preview: true })
    await tick()

    expect(q(container, '[data-testid="widget-battle"] .bc-battle__focus-name')).toBe('')
    expect(q(container, '[data-testid="driver-lt-name"]')).toBe('')
    expect(container.querySelector('[data-testid="onboard-driver-name"]')).toBeNull()
    expect(q(container, '[data-testid="onboard-speed"]')).toContain('247')
  })
})
