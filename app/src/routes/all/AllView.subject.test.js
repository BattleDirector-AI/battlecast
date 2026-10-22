// /all's subject resolution on malformed producer data — widgets.md rules 14a and 14b, and the
// hand-off (rule 24) that reads it on every snapshot. Driven from race-onboard-telemetry.json
// (subject car-1 Verstappen, P2, with live inputs: 247 km/h, gear 6) and driver-degraded.json,
// varied inside each test; the assertions read the driver lower-third and on-board HUD slots.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import raceOnboard from '../../../../spec/v1/fixtures/race-onboard-telemetry.json'
import driverDegraded from '../../../../spec/v1/fixtures/driver-degraded.json'

afterEach(() => cleanup())

const DWELL = normalizeConfig({ widgets: { driver: { trigger: 'dwell' } } })
const q = (el, id) => el?.querySelector(`[data-testid="${id}"]`) ?? null
const onboard = (c) => q(c, 'widget-onboard')

describe('rule 14b — /all: an unresolved subject with a blank name puts no card up', () => {
  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
  ])('a name that is %s: no driver card, and the HUD is not held', async (_label, blank) => {
    const snap = {
      ...driverDegraded,
      subject: { slot_id: 'ghost-7', driver_name: blank, telemetry: { ...raceOnboard.subject.telemetry } },
    }
    const { container } = render(AllView, { snapshot: snap, config: DWELL })
    await tick()

    expect(q(container, 'driver-lower-third'), 'no driver card for an invalid subject').toBeNull()
    // Nothing to wait for: the HUD's telemetry row renders (invalid subject -> no strip).
    expect(q(onboard(container), 'onboard-speed')?.textContent).toContain('247')
    expect(q(onboard(container), 'onboard-gear')?.textContent).toContain('6')
    expect(q(onboard(container), 'onboard-identity')).toBeNull()
  })
})
