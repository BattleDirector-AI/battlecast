// The on-board HUD identity strip when several `vehicles[]` entries share a `slot_id` —
// protocol-contract.md rule 21 ("Entries sharing a slot_id"). Driven from driver-subject-b.json
// (subject car-16 Leclerc, P3, gtp).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import OnBoardHud, { resolveIdentity } from './OnBoardHud.svelte'
import subjectB from '../../../../spec/v1/fixtures/driver-subject-b.json'

afterEach(() => cleanup())

const WIDGET = { driverInfo: { name: true, position: true, class: true } }
const q = (c, id) => c.querySelector(`[data-testid="${id}"]`)
const strip = (vehicles) =>
  render(OnBoardHud, { identity: resolveIdentity({ ...subjectB, vehicles }, WIDGET, true) }).container
const [ham, ver, lec] = subjectB.vehicles

describe('rule 21 — entries sharing a slot_id on the HUD strip', () => {
  // DELIVERABLE (green today): the first match already wins when both copies are complete.
  it('a later complete copy of the subject does not change the strip', () => {
    const c = strip([ham, ver, lec, { ...lec, position: 9, vehicle_class: 'gt3' }])
    expect(q(c, 'onboard-driver-position')?.textContent.trim()).toBe('P3')
    expect(q(c, 'onboard-driver-class')?.textContent).toContain('GTP')
  })

  // RED: the first match has no position, so the strip shows neither position nor the right class.
  it('a first copy with no position loses to the complete second copy', () => {
    const c = strip([{ slot_id: lec.slot_id, vehicle_class: 'gt3' }, ham, ver, lec])
    expect(q(c, 'onboard-driver-position')?.textContent.trim()).toBe('P3')
    expect(q(c, 'onboard-driver-class')?.textContent).toContain('GTP')
  })
})
