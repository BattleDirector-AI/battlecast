// The on-board HUD's hand-off follows the driver lower-third's OWN show/hide timer — widgets.md
// rule 24. AllView runs that timer once and hands the same "card is up" flag to the card and the
// HUD, so the two cannot drift. Two ways the HUD used to run a second copy of the timer and fall
// out of step with the card (#290):
//   1. the HUD itself hidden and shown again got a fresh timer while the card kept its own;
//   2. a `hideWhenIdle` card unmounts while idle and comes back as a connect (no fire), but the
//      HUD's copy saw a subject change and fired.
// Each test drives AllView from spec/v1 fixtures with fake timers and asserts what is on screen,
// the card's name and the onboard slot, at concrete times.
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

// driver-subject-b.json's subject (car-16, Leclerc) given live inputs, for a camera cut.
const subjectB = {
  ...driverSubjectB,
  subject: { ...driverSubjectB.subject, telemetry: { throttle: 0.5, brake: 0.2, speed: 180, gear: 4 } },
}
// An invalid subject (no slot_id, no driver_name) that still carries telemetry.
const invalid = {
  ...raceOnboard,
  subject: { slot_id: null, driver_name: null, telemetry: { ...raceOnboard.subject.telemetry } },
}

const q = (el, id) => el.querySelector(`[data-testid="${id}"]`)
const hud = (c) => q(c, 'widget-onboard')
const cardName = (c) => q(c, 'driver-lt-name')?.textContent ?? null

async function at(ms) {
  vi.advanceTimersByTime(ms)
  await tick()
}

describe('#290 case 1 — hiding and re-showing the HUD does not restart the card timer', () => {
  it('dwell already over: the re-shown HUD is visible at once, not held 6s with no card', async () => {
    vi.useFakeTimers()
    const driver = { trigger: 'dwell', dwellSeconds: 6 }
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: cfg(driver) })
    await tick()
    expect(cardName(container), 'premise: card fires on connect').toContain('Verstappen')
    expect(q(hud(container), 'onboard-hud'), 'HUD held while the card is up').toBeNull()

    await at(6000)
    expect(cardName(container), 'premise: dwell over').toBeNull()
    expect(q(hud(container), 'onboard-hud')).not.toBeNull()

    await rerender({ config: cfg(driver, { visible: false }) })
    await tick()
    expect(hud(container)).toBeNull()
    await at(1000)
    await rerender({ config: cfg(driver) })
    await tick()
    expect(cardName(container), 'no card is up').toBeNull()
    expect(q(hud(container), 'onboard-hud'), 'HUD must show at once').not.toBeNull()
    expect(q(hud(container), 'onboard-speed').textContent).toContain('247')

    await at(3000)
    expect(q(hud(container), 'onboard-hud'), 'and stay shown').not.toBeNull()
  })

  it('showOnConnect off, card up: the re-shown HUD still holds, so the name never shows twice', async () => {
    vi.useFakeTimers()
    const driver = { trigger: 'dwell', dwellSeconds: 6, showOnConnect: false }
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: cfg(driver) })
    await tick()
    expect(cardName(container), 'premise: connect does not fire').toBeNull()

    await rerender({ snapshot: subjectB })
    await tick()
    expect(cardName(container), 'premise: camera cut fires the card').toContain('Leclerc')
    expect(q(hud(container), 'onboard-hud')).toBeNull()

    await at(2000)
    await rerender({ config: cfg(driver, { visible: false }) })
    await tick()
    await at(1000)
    await rerender({ config: cfg(driver) })
    await tick()
    expect(cardName(container), 'premise: card still up (3s into the dwell)').toContain('Leclerc')
    expect(q(hud(container), 'onboard-hud'), 'HUD must stay held beside the card').toBeNull()
    expect(hud(container).textContent, 'the name must not show twice').not.toContain('Leclerc')

    await at(3000)
    expect(cardName(container), 'card wipes out at 6s').toBeNull()
    expect(q(hud(container), 'onboard-hud'), 'HUD reveals with it').not.toBeNull()
    expect(q(hud(container), 'onboard-driver-name').textContent).toContain('Leclerc')
  })
})

describe('#290 case 2 — a hideWhenIdle card that returns as a connect does not hold the HUD', () => {
  const driver = { trigger: 'dwell', dwellSeconds: 6, showOnConnect: false, hideWhenIdle: true }

  it.each([
    ['A -> invalid -> A', [raceOnboard, invalid, raceOnboard], 'Verstappen', 247],
    ['A -> invalid -> B', [raceOnboard, invalid, subjectB], 'Leclerc', 180],
  ])('%s: the HUD shows with no card when the card comes back as a connect', async (_n, steps, name, speed) => {
    vi.useFakeTimers()
    const { container, rerender } = render(AllView, { snapshot: steps[0], config: cfg(driver) })
    await tick()
    for (const snap of steps.slice(1, -1)) {
      await rerender({ snapshot: snap })
      await tick()
      await at(500)
    }
    expect(cardName(container), 'premise: no card while idle').toBeNull()

    await rerender({ snapshot: steps[steps.length - 1] })
    await tick()
    expect(cardName(container), 'the card came back as a connect: no fire').toBeNull()
    expect(q(hud(container), 'onboard-hud'), 'HUD must not be held with no card').not.toBeNull()
    expect(q(hud(container), 'onboard-speed').textContent).toContain(String(speed))
    expect(q(hud(container), 'onboard-driver-name').textContent).toContain(name)

    await at(6000)
    expect(cardName(container)).toBeNull()
    expect(q(hud(container), 'onboard-hud')).not.toBeNull()
  })

  it('showOnConnect on: A -> invalid -> A fires on reconnect and holds the HUD for the full dwell', async () => {
    vi.useFakeTimers()
    const on = { ...driver, showOnConnect: true }
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: cfg(on) })
    await tick()
    await at(6000)
    expect(cardName(container), 'premise: first dwell over').toBeNull()
    await rerender({ snapshot: invalid })
    await tick()
    expect(container.querySelector('[data-testid="widget-driver"]')).toBeNull()

    await rerender({ snapshot: raceOnboard })
    await tick()
    expect(cardName(container), 'the card fires on reconnect').toContain('Verstappen')
    expect(q(hud(container), 'onboard-hud'), 'HUD held beside it').toBeNull()
    await at(5900)
    expect(cardName(container)).toContain('Verstappen')
    expect(q(hud(container), 'onboard-hud'), 'still held at 5.9s').toBeNull()
    await at(200)
    expect(cardName(container), 'wiped out after the full dwell').toBeNull()
    expect(q(hud(container), 'onboard-hud')).not.toBeNull()
  })

  it('the card is unmounted, not merely down, while the subject is invalid', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: cfg(driver) })
    await tick()
    await rerender({ snapshot: invalid })
    await tick()
    expect(container.querySelector('[data-testid="widget-driver"]')).toBeNull()
  })
})

describe('the card hidden mid-dwell drops its timer (#290 hide path)', () => {
  it('hidden while up, then shown again with showOnConnect off: the card is not resurrected and the HUD shows', async () => {
    vi.useFakeTimers()
    const driver = { trigger: 'dwell', dwellSeconds: 6, showOnConnect: false }
    const { container, rerender } = render(AllView, { snapshot: raceOnboard, config: cfg(driver) })
    await tick()
    await rerender({ snapshot: subjectB })
    await tick()
    expect(cardName(container), 'premise: card up').toContain('Leclerc')
    expect(q(hud(container), 'onboard-hud')).toBeNull()

    await rerender({ config: cfg({ ...driver, visible: false }) })
    await tick()
    expect(cardName(container)).toBeNull()
    expect(q(hud(container), 'onboard-hud'), 'no card, nothing held').not.toBeNull()

    await at(1000)
    await rerender({ config: cfg(driver) })
    await tick()
    expect(cardName(container), 'back as a connect: no fire').toBeNull()
    expect(q(hud(container), 'onboard-hud')).not.toBeNull()
    await at(6000)
    expect(cardName(container)).toBeNull()
    expect(q(hud(container), 'onboard-hud')).not.toBeNull()
  })
})
