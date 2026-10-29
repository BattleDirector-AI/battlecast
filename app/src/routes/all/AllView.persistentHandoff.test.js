// The on-board HUD's hand-off with the driver lower-third (#21) in /all — widgets.md rule 24,
// rules 55–57, ADR 0021 (amendment). With the card on `persistent` and `waitForLowerThird` on,
// only the HUD's identity strip waits; the telemetry row keeps rendering. A `dwell` card still
// holds the whole HUD for its dwell. Every test drives AllView from a spec/v1 fixture and
// asserts what is rendered in the onboard slot.
// Names read in the profile's default short style (widgets.md rule 111): `VER`, `LEC`, `PIA`.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import raceOnboard from '../../../../spec/v1/fixtures/race-onboard-telemetry.json'
import driverSubjectB from '../../../../spec/v1/fixtures/driver-subject-b.json'
import driverDegraded from '../../../../spec/v1/fixtures/driver-degraded.json'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const PERSISTENT = normalizeConfig({ widgets: { driver: { trigger: 'persistent' } } })
const DWELL = normalizeConfig({ widgets: { driver: { trigger: 'dwell' } } })

// race-onboard-telemetry.json's subject (car-1, Verstappen, P2) with its telemetry, on another
// car: driver-subject-b.json's subject (car-16, Leclerc, P3) given the same live inputs.
const subjectBWithTelemetry = {
  ...driverSubjectB,
  subject: { ...driverSubjectB.subject, telemetry: { throttle: 0.5, brake: 0.2, speed: 180, gear: 4 } },
}
// driver-degraded.json (slot_id unresolved, name only) with live inputs.
const degradedWithTelemetry = {
  ...driverDegraded,
  subject: { ...driverDegraded.subject, telemetry: { throttle: 0.4, brake: 0, speed: 150, gear: 3 } },
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

/** Telemetry row on screen (with the given speed / gear), identity strip and label not. */
function expectTelemetryOnly(container, { speed, gear, name }) {
  const slot = onboard(container)
  expect(q(slot, 'onboard-hud'), 'the HUD plate must render for the telemetry row').not.toBeNull()
  expect(q(slot, 'onboard-speed')?.textContent, 'telemetry row: speed').toContain(String(speed))
  expect(q(slot, 'onboard-gear')?.textContent, 'telemetry row: gear').toContain(String(gear))
  expect(q(slot, 'onboard-throttle'), 'telemetry row: throttle bar').not.toBeNull()
  expect(q(slot, 'onboard-identity'), 'identity strip is held back').toBeNull()
  expect(q(slot, 'onboard-label'), 'no ON BOARD label without the strip').toBeNull()
  expect(q(slot, 'onboard-driver-name')).toBeNull()
  expect(q(slot, 'onboard-driver-position')).toBeNull()
  expect(slot.textContent).not.toContain(name)
}

/** Whole HUD held: nothing in the onboard slot. */
function expectWholeHudHeld(container) {
  const slot = onboard(container)
  expect(slot, 'the onboard slot stays placed').not.toBeNull()
  expect(q(slot, 'onboard-hud'), 'whole HUD held off').toBeNull()
  expect(slot.textContent.trim()).toBe('')
}

/** Full HUD: strip (label + name) on top, telemetry row below. */
function expectFullHud(container, { speed, name }) {
  const slot = onboard(container)
  expect(q(slot, 'onboard-label')?.textContent.trim()).toBe('ON BOARD')
  expect(q(slot, 'onboard-driver-name')?.textContent).toContain(name)
  expect(q(slot, 'onboard-speed')?.textContent).toContain(String(speed))
}

function driverCardName(container) {
  return q(container, 'driver-lt-name')?.textContent ?? null
}

describe('rule 24 — persistent lower-third holds back only the identity strip', () => {
  it('keeps the telemetry row while a persistent card shows the name, on connect', async () => {
    const { container } = render(AllView, { snapshot: raceOnboard, config: PERSISTENT })
    await tick()
    expect(driverCardName(container), 'premise: the persistent card is up').toContain('VER')
    expectTelemetryOnly(container, { speed: 247, gear: 6, name: 'VER' })
  })

  it('keeps that split for as long as the subject stays valid (no timer)', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: PERSISTENT })
    await tick()
    vi.advanceTimersByTime(60_000)
    await rerender({ snapshot: structuredClone(raceOnboard) })
    await tick()
    expect(driverCardName(container)).toContain('VER')
    expectTelemetryOnly(container, { speed: 247, gear: 6, name: 'VER' })
  })

  it('on a camera cut, the telemetry row follows the new subject and the strip stays held', async () => {
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: PERSISTENT })
    await tick()
    await rerender({ snapshot: subjectBWithTelemetry })
    await tick()
    expect(driverCardName(container)).toContain('LEC')
    expectTelemetryOnly(container, { speed: 180, gear: 4, name: 'LEC' })
  })

  it('a degraded subject (card shows the name only) also holds only the strip', async () => {
    const { container } = render(AllView, { snapshot: degradedWithTelemetry, config: PERSISTENT })
    await tick()
    expect(driverCardName(container), 'premise: the degraded card is up').toContain('PIA')
    expectTelemetryOnly(container, { speed: 150, gear: 3, name: 'PIA' })
  })

  it('valid -> invalid -> valid: the row shows throughout, the strip never does', async () => {
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: PERSISTENT })
    await tick()
    expectTelemetryOnly(container, { speed: 247, gear: 6, name: 'VER' })

    // Invalid subject: the card goes down; there is no strip to hold (rule 57) and the
    // telemetry row renders on its own, with no label (rule 56 "telemetry row only").
    await rerender({ snapshot: invalidWithTelemetry })
    await tick()
    expect(driverCardName(container), 'premise: card down on an invalid subject').toBeNull()
    expectTelemetryOnly(container, { speed: 247, gear: 6, name: 'VER' })

    // Valid again: the card is back and the strip is held again.
    await rerender({ snapshot: structuredClone(raceOnboard) })
    await tick()
    expect(driverCardName(container)).toContain('VER')
    expectTelemetryOnly(container, { speed: 247, gear: 6, name: 'VER' })
  })

  it('with no telemetry, a persistent card leaves the HUD with nothing to show', async () => {
    // Strip held, no telemetry content -> rule 56 "nothing" while the card is up.
    const { container } = render(AllView, { snapshot: driverSubjectB, config: PERSISTENT })
    await tick()
    expect(driverCardName(container)).toContain('LEC')
    expectWholeHudHeld(container)
  })
})

describe('rule 24 — a trigger-mode change re-applies the hand-off at once', () => {
  it('dwell -> persistent mid-dwell: the telemetry row appears, the strip stays held', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: DWELL })
    await tick()
    expectWholeHudHeld(container)

    await rerender({ config: PERSISTENT })
    await tick()
    expect(driverCardName(container)).toContain('VER')
    expectTelemetryOnly(container, { speed: 247, gear: 6, name: 'VER' })
  })

  it('dwell ended -> persistent: the card comes back up and the HUD drops to the telemetry row', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: DWELL })
    await tick()
    vi.advanceTimersByTime(6000)
    await tick()
    expect(driverCardName(container), 'premise: the dwell has ended').toBeNull()
    expectFullHud(container, { speed: 247, name: 'VER' })

    await rerender({ config: PERSISTENT })
    await tick()
    expect(driverCardName(container), 'a persistent card is up for a valid subject').toContain('VER')
    expectTelemetryOnly(container, { speed: 247, gear: 6, name: 'VER' })
  })

  it('persistent -> dwell: the next camera cut holds the whole HUD for the dwell again', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: PERSISTENT })
    await tick()
    expectTelemetryOnly(container, { speed: 247, gear: 6, name: 'VER' })

    // Premise: the switch starts the card's fresh dwell (rule 16), so right after it the card is
    // still up and the hold for the mode now configured (dwell: the whole HUD) applies.
    await rerender({ config: DWELL })
    await tick()
    expect(driverCardName(container), 'premise: the card is still up after the switch').toContain('VER')
    expectWholeHudHeld(container)

    await rerender({ snapshot: subjectBWithTelemetry })
    await tick()
    expect(driverCardName(container)).toContain('LEC')
    expectWholeHudHeld(container)

    vi.advanceTimersByTime(6000)
    await tick()
    expect(driverCardName(container)).toBeNull()
    expectFullHud(container, { speed: 180, name: 'LEC' })
  })

  it('persistent -> dwell with no camera cut: the whole HUD holds for the fresh dwell, then reveals', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: PERSISTENT })
    await tick()
    vi.advanceTimersByTime(60_000)
    await tick()
    expectTelemetryOnly(container, { speed: 247, gear: 6, name: 'VER' })

    await rerender({ config: DWELL })
    await tick()
    expectWholeHudHeld(container)

    vi.advanceTimersByTime(5_999)
    await rerender({ snapshot: structuredClone(raceOnboard) })
    await tick()
    expect(driverCardName(container), 'still inside the fresh dwell').toContain('VER')
    expectWholeHudHeld(container)

    vi.advanceTimersByTime(1)
    await tick()
    expect(driverCardName(container), 'the fresh dwell elapsed -> the card wipes out').toBeNull()
    expectFullHud(container, { speed: 247, name: 'VER' })
  })
})

describe('rule 24 guards — dwell and opt-out are unchanged', () => {
  it('a dwell card holds the whole HUD, telemetry row included, then reveals all of it', async () => {
    vi.useFakeTimers()
    const { container } = render(AllView, { snapshot: raceOnboard, config: DWELL })
    await tick()
    expect(driverCardName(container)).toContain('VER')
    expectWholeHudHeld(container)

    vi.advanceTimersByTime(6000)
    await tick()
    expect(driverCardName(container)).toBeNull()
    expectFullHud(container, { speed: 247, name: 'VER' })
  })

  it('a dwell re-fire on a camera cut holds the whole HUD again', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: DWELL })
    await tick()
    vi.advanceTimersByTime(6000)
    await tick()
    expectFullHud(container, { speed: 247, name: 'VER' })

    await rerender({ snapshot: subjectBWithTelemetry })
    await tick()
    expect(driverCardName(container)).toContain('LEC')
    expectWholeHudHeld(container)
  })

  it('persistent with waitForLowerThird off: no hand-off, the full HUD shows beside the card', async () => {
    const cfg = normalizeConfig({
      widgets: { driver: { trigger: 'persistent' }, onboard: { waitForLowerThird: false } },
    })
    const { container } = render(AllView, { snapshot: raceOnboard, config: cfg })
    await tick()
    expect(driverCardName(container)).toContain('VER')
    expectFullHud(container, { speed: 247, name: 'VER' })
  })

  it('persistent but the driver lower-third not visible: nothing to wait for, the full HUD shows', async () => {
    // The trigger only matters through the hand-off gate: a hidden card holds nothing.
    const cfg = normalizeConfig({ widgets: { driver: { trigger: 'persistent', visible: false } } })
    const { container } = render(AllView, { snapshot: raceOnboard, config: cfg })
    await tick()
    expect(driverCardName(container), 'premise: no driver card').toBeNull()
    expectFullHud(container, { speed: 247, name: 'VER' })
    expect(q(onboard(container), 'onboard-gear')?.textContent).toContain('6')
  })

  it('persistent in preview: no hand-off, the full HUD shows', async () => {
    const { container } = render(AllView, { snapshot: raceOnboard, config: PERSISTENT, preview: true })
    await tick()
    expectFullHud(container, { speed: 247, name: 'VER' })
    expect(q(onboard(container), 'onboard-gear')?.textContent).toContain('6')
  })
})
