// The on-board HUD's hand-off gate turned off and on again in /all — widgets.md rule 24 (the
// "leaves nothing stale" paragraph). Turning `waitForLowerThird` off, or hiding the driver
// lower-third, and then back on must leave the HUD holding exactly what the driver card shows
// right then. Every test drives AllView from a spec/v1 fixture, flips the config live with
// rerender, and asserts what is rendered: the driver card's name, and the onboard slot's
// identity strip / whole HUD.
//
// These live beside the other /all hand-off tests rather than in routes/onboard: the two ways of
// turning the gate off differ in what they pass the HUD. Unticking passes the card's config with
// `waitForLowerThird = false`; hiding the card passes no gate at all, and the card's one timer
// (run in AllView) is dropped, so showing it again is a (re)connect. Rule 24 asks for different
// results when each is undone, so only AllView can tell them apart.
// Names read in the profile's default short style (widgets.md rule 111): `VER`, `LEC`, `PIA`.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import raceOnboard from '../../../../spec/v1/fixtures/race-onboard-telemetry.json'
import driverSubjectB from '../../../../spec/v1/fixtures/driver-subject-b.json'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function cfg(driver, onboard = {}) {
  return normalizeConfig({ widgets: { driver, onboard } })
}
const PERSISTENT = cfg({ trigger: 'persistent' })
const PERSISTENT_UNTICKED = cfg({ trigger: 'persistent' }, { waitForLowerThird: false })
const PERSISTENT_CARD_HIDDEN = cfg({ trigger: 'persistent', visible: false })
const DWELL = cfg({ trigger: 'dwell' })
const DWELL_UNTICKED = cfg({ trigger: 'dwell' }, { waitForLowerThird: false })
const DWELL_CARD_HIDDEN = cfg({ trigger: 'dwell', visible: false })
const DWELL_NO_CONNECT = cfg({ trigger: 'dwell', showOnConnect: false })
const DWELL_NO_CONNECT_HIDDEN = cfg({ trigger: 'dwell', showOnConnect: false, visible: false })

// driver-subject-b.json's subject (car-16, Leclerc) given live inputs, for a camera cut.
const subjectBWithTelemetry = {
  ...driverSubjectB,
  subject: { ...driverSubjectB.subject, telemetry: { throttle: 0.5, brake: 0.2, speed: 180, gear: 4 } },
}
// An invalid subject (no slot_id, no driver_name) that still carries telemetry.
const invalidWithTelemetry = {
  ...raceOnboard,
  subject: { slot_id: null, driver_name: null, telemetry: { ...raceOnboard.subject.telemetry } },
}

function onboard(container) {
  return container.querySelector('[data-testid="widget-onboard"]')
}
function q(el, id) {
  return el.querySelector(`[data-testid="${id}"]`)
}
function driverCardName(container) {
  return q(container, 'driver-lt-name')?.textContent ?? null
}

/** Persistent hold: telemetry row on screen, identity strip (label + name) held back. */
function expectStripHeld(container, { speed, name }) {
  const slot = onboard(container)
  expect(q(slot, 'onboard-speed')?.textContent, 'telemetry row keeps rendering').toContain(String(speed))
  expect(q(slot, 'onboard-identity'), 'identity strip must be held while the card shows the name').toBeNull()
  expect(slot.textContent, 'the name must not show twice').not.toContain(name)
}

/** Dwell hold: nothing in the onboard slot. */
function expectWholeHudHeld(container) {
  const slot = onboard(container)
  expect(q(slot, 'onboard-hud'), 'whole HUD must be held while the dwell card is up').toBeNull()
  expect(slot.textContent.trim()).toBe('')
}

/** Nothing held: identity strip (ON BOARD + name) and telemetry row both on screen. */
function expectFullHud(container, { speed, name }) {
  const slot = onboard(container)
  expect(q(slot, 'onboard-label')?.textContent.trim(), 'identity strip shows').toBe('ON BOARD')
  expect(q(slot, 'onboard-driver-name')?.textContent).toContain(name)
  expect(q(slot, 'onboard-speed')?.textContent).toContain(String(speed))
}

async function at(ms) {
  vi.advanceTimersByTime(ms)
  await tick()
}

describe('rule 24 — persistent card: the strip is held again once the gate is back on', () => {
  it('waitForLowerThird off -> on: the strip is held again beside the card', async () => {
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: PERSISTENT })
    await tick()
    expectStripHeld(container, { speed: 247, name: 'VER' })

    await rerender({ config: PERSISTENT_UNTICKED })
    await tick()
    expect(driverCardName(container), 'premise: the card stays up').toContain('VER')
    expectFullHud(container, { speed: 247, name: 'VER' })

    await rerender({ config: PERSISTENT })
    await tick()
    expect(driverCardName(container)).toContain('VER')
    expectStripHeld(container, { speed: 247, name: 'VER' })
  })

  it('driver lower-third hidden -> visible: the card comes back up and the strip is held', async () => {
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: PERSISTENT })
    await tick()
    expectStripHeld(container, { speed: 247, name: 'VER' })

    await rerender({ config: PERSISTENT_CARD_HIDDEN })
    await tick()
    expect(driverCardName(container), 'premise: no card while hidden').toBeNull()
    expectFullHud(container, { speed: 247, name: 'VER' })

    await rerender({ config: PERSISTENT })
    await tick()
    expect(driverCardName(container), 'premise: the card is back').toContain('VER')
    expectStripHeld(container, { speed: 247, name: 'VER' })
  })
})

describe('rule 24 — dwell card: the HUD follows the card once the gate is back on', () => {
  it('waitForLowerThird off -> on inside the dwell: the HUD is held for the rest of that same dwell', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: DWELL })
    await tick()
    expectWholeHudHeld(container)

    await at(1000)
    await rerender({ config: DWELL_UNTICKED })
    await tick()
    expectFullHud(container, { speed: 247, name: 'VER' })

    await at(2000) // t = 3s, card still inside its 6s dwell
    await rerender({ config: DWELL })
    await tick()
    expect(driverCardName(container), 'premise: the card is still up').toContain('VER')
    expectWholeHudHeld(container)

    await at(3000) // t = 6s: the card's dwell ends, not 6s after the re-tick
    expect(driverCardName(container), 'premise: the card has wiped out').toBeNull()
    expectFullHud(container, { speed: 247, name: 'VER' })
  })

  it('waitForLowerThird off -> on after the card wiped out: nothing held, and the next cut holds again', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: DWELL })
    await tick()
    await at(1000)
    await rerender({ config: DWELL_UNTICKED })
    await tick()

    await at(6000) // t = 7s, the card's dwell is over
    await rerender({ config: DWELL })
    await tick()
    expect(driverCardName(container), 'premise: the card is down').toBeNull()
    expectFullHud(container, { speed: 247, name: 'VER' })

    await rerender({ snapshot: subjectBWithTelemetry })
    await tick()
    expect(driverCardName(container), 'premise: the cut fires the card').toContain('LEC')
    expectWholeHudHeld(container)

    await at(6000)
    expect(driverCardName(container)).toBeNull()
    expectFullHud(container, { speed: 180, name: 'LEC' })
  })

  it('a camera cut while unticked: on again inside the cut\'s dwell holds until that dwell ends', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: DWELL })
    await tick()
    await at(1000)
    await rerender({ config: DWELL_UNTICKED })
    await tick()

    await at(1000) // t = 2s: cut to Leclerc; the card fires a dwell that ends at 8s
    await rerender({ snapshot: subjectBWithTelemetry })
    await tick()
    expect(driverCardName(container), 'premise: the cut fires the card').toContain('LEC')
    expectFullHud(container, { speed: 180, name: 'LEC' })

    await at(2000) // t = 4s
    await rerender({ config: DWELL })
    await tick()
    expectWholeHudHeld(container)

    await at(3999) // t = 7.999s: the card's dwell is still running
    expect(driverCardName(container), 'premise: the card is still up').toContain('LEC')
    expectWholeHudHeld(container)

    await at(1) // t = 8s: the card's dwell, counted from the cut, ends — not 6s after the re-tick
    expect(driverCardName(container), 'premise: the card has wiped out').toBeNull()
    expectFullHud(container, { speed: 180, name: 'LEC' })
  })

  it('A -> invalid -> A while unticked: the card re-fires, and on again holds the HUD with it', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: DWELL })
    await tick()
    await at(6000) // first dwell over
    expectFullHud(container, { speed: 247, name: 'VER' })

    await rerender({ config: DWELL_UNTICKED })
    await tick()
    await rerender({ snapshot: invalidWithTelemetry })
    await tick()
    await at(1000) // t = 7s: back to Verstappen re-fires the card (rule 15); its dwell ends at 13s
    await rerender({ snapshot: structuredClone(raceOnboard) })
    await tick()
    expect(driverCardName(container), 'premise: A -> invalid -> A re-fires the card').toContain('VER')

    await at(2000) // t = 9s
    await rerender({ config: DWELL })
    await tick()
    expectWholeHudHeld(container)

    await at(3999) // t = 12.999s: the re-fired card's dwell is still running
    expect(driverCardName(container), 'premise: the card is still up').toContain('VER')
    expectWholeHudHeld(container)

    await at(1) // t = 13s
    expect(driverCardName(container), 'premise: the card has wiped out').toBeNull()
    expectFullHud(container, { speed: 247, name: 'VER' })
  })

  it('driver lower-third hidden -> visible: the card re-fires on connect and the HUD holds a full dwell', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: DWELL })
    await tick()
    await at(6000)
    expectFullHud(container, { speed: 247, name: 'VER' })

    await rerender({ config: DWELL_CARD_HIDDEN })
    await tick()
    expectFullHud(container, { speed: 247, name: 'VER' })

    await rerender({ config: DWELL })
    await tick()
    expect(driverCardName(container), 'premise: the card fires on (re)connect').toContain('VER')
    expectWholeHudHeld(container)

    await at(5000)
    expectWholeHudHeld(container)
    await at(1000)
    expect(driverCardName(container)).toBeNull()
    expectFullHud(container, { speed: 247, name: 'VER' })
  })

  it('driver lower-third hidden -> visible with showOnConnect off: no fire, nothing held until the next cut', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: DWELL_NO_CONNECT })
    await tick()
    expect(driverCardName(container), 'premise: no fire on connect').toBeNull()
    expectFullHud(container, { speed: 247, name: 'VER' })

    await rerender({ config: DWELL_NO_CONNECT_HIDDEN })
    await tick()
    await rerender({ config: DWELL_NO_CONNECT })
    await tick()
    expect(driverCardName(container), 'premise: no fire on reconnect').toBeNull()
    expectFullHud(container, { speed: 247, name: 'VER' })

    await rerender({ snapshot: subjectBWithTelemetry })
    await tick()
    expect(driverCardName(container)).toContain('LEC')
    expectWholeHudHeld(container)
  })
})

describe('rule 24 — trigger switched while the gate is off', () => {
  it('persistent -> dwell while unticked, then on: the HUD holds for the rest of the fresh dwell', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: PERSISTENT_UNTICKED })
    await tick()
    expect(driverCardName(container), 'premise: the persistent card is up').toContain('VER')
    expectFullHud(container, { speed: 247, name: 'VER' })

    await at(10000) // long past any dwell: only a switch can start a fresh one
    await rerender({ config: DWELL_UNTICKED }) // the switch starts the card's fresh dwell, ending at t = 16s
    await tick()
    expect(driverCardName(container), 'premise: the switch starts a fresh dwell').toContain('VER')
    expectFullHud(container, { speed: 247, name: 'VER' })

    await at(1000) // t = 11s, gate still off: the same subject again must not re-arm the dwell
    await rerender({ snapshot: structuredClone(raceOnboard) })
    await tick()

    // The gate comes back on 2s after the switch: a mirror that missed the switch would hold
    // from here until 18s (a dwell counted from the gate), not 16s.
    await at(1000) // t = 12s
    await rerender({ config: DWELL })
    await tick()
    expectWholeHudHeld(container)

    await at(2000) // t = 14s, gate on: still the same subject, still no re-arm
    await rerender({ snapshot: structuredClone(raceOnboard) })
    await tick()

    await at(1999) // t = 15.999s: the fresh dwell is still running
    expect(driverCardName(container), 'premise: the card is still up').toContain('VER')
    expectWholeHudHeld(container)

    await at(1) // t = 16s: the dwell, counted from the switch, ends
    expect(driverCardName(container), 'premise: the card has wiped out').toBeNull()
    expectFullHud(container, { speed: 247, name: 'VER' })
  })
})
