// The driver lower-third's subject when several `vehicles[]` entries share a `slot_id` —
// protocol-contract.md rule 21 ("Entries sharing a slot_id"). Driven from driver-subject-a.json
// (subject car-44 Hamilton, P1, gt3).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import DriverLowerThird from './DriverLowerThird.svelte'
import subjectA from '../../../../spec/v1/fixtures/driver-subject-a.json'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const posOf = (c) => c.querySelector('[data-testid="driver-lt-pos"]')?.textContent.trim()
async function renderCard(vehicles) {
  const r = render(DriverLowerThird, { snapshot: { ...subjectA, vehicles }, widget: {} })
  await tick()
  return r.container
}
const [ham, ver, lec] = subjectA.vehicles

describe('rule 21 — entries sharing a slot_id on the driver card', () => {
  // DELIVERABLE (green today): the first match already wins when both copies are complete.
  it('a later complete copy of the subject does not change the card', async () => {
    const c = await renderCard([ham, ver, lec, { ...ham, position: 9, vehicle_class: 'gtp' }])
    expect(posOf(c)).toBe('P1')
    expect(c.textContent).toContain('GT3')
    expect(c.textContent).not.toContain('GTP')
  })

  // RED: resolveSubject takes the first match, which has no position, so the card shows neither
  // the position nor the class of the complete copy.
  it('a first copy with no position loses to the complete second copy', async () => {
    const c = await renderCard([{ slot_id: ham.slot_id, vehicle_class: 'gtp' }, ham, ver, lec])
    expect(posOf(c)).toBe('P1')
    expect(c.textContent).toContain('GT3')
    expect(c.textContent).not.toContain('GTP')
  })
})
