// The standings tower when several `vehicles[]` entries share a `slot_id` — protocol-contract.md
// rule 21 ("Entries sharing a slot_id"): the car is the first listable entry with that slot_id;
// every later copy is absent. Driven from race-onboard-telemetry.json (car-44 Hamilton P1, car-1
// Verstappen P2, car-16 Leclerc P3) with copies spliced in.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import onboard from '../../../../spec/v1/fixtures/race-onboard-telemetry.json'

afterEach(() => cleanup())

const names = () =>
  Array.from(document.querySelectorAll('[data-testid="driver-name"]')).map((el) => el.textContent.trim())
const positions = () =>
  Array.from(document.querySelectorAll('[data-testid="tower-row"] .row__pos')).map((el) => el.textContent.trim())
const rows = () => document.querySelectorAll('[data-testid="tower-row"]').length

const [ham, ver, lec] = onboard.vehicles
const draw = (vehicles) => render(StandingsTower, { nameStyle: 'full', snapshot: { ...onboard, vehicles } })

describe('rule 21 — entries sharing a slot_id in the tower', () => {
  // RED: today the shared row key throws each_key_duplicate.
  it('two complete entries sharing a slot_id make one row carrying the first entry data', () => {
    draw([ham, ver, { ...ham, driver_name: 'Ghost', position: 4 }, lec])
    expect(rows()).toBe(3)
    expect(names()).toEqual(['Hamilton', 'Verstappen', 'Leclerc'])
    expect(positions()).toEqual(['1', '2', '3'])
  })

  // RED: same reason, with a copy that would sort ahead of the first entry.
  it('a later copy that sorts ahead of the first still loses', () => {
    draw([ver, ham, { ...ham, driver_name: 'Ghost', position: 0 }, lec])
    expect(names()).toEqual(['Hamilton', 'Verstappen', 'Leclerc'])
  })

  // RED: same reason, with three copies.
  it('three copies of a car make one row', () => {
    draw([ham, { ...ham, driver_name: 'G1', position: 5 }, { ...ham, driver_name: 'G2', position: 6 }, ver, lec])
    expect(names()).toEqual(['Hamilton', 'Verstappen', 'Leclerc'])
  })

  // DELIVERABLE (green today): the incomplete first copy is already absent from the list, so the
  // complete second copy is the row. Pins the "first LISTABLE" half of the rule.
  it('a first copy with no position is absent: the complete second copy is the row', () => {
    draw([{ slot_id: 'car-44', driver_name: 'Ghost' }, ham, ver, lec])
    expect(names()).toEqual(['Hamilton', 'Verstappen', 'Leclerc'])
    expect(positions()).toEqual(['1', '2', '3'])
  })

  // GUARD (green today): slot_ids that differ are different cars.
  it('entries with different slot_ids are not duplicates', () => {
    draw([ham, ver, lec, { ...lec, slot_id: 'car-17', driver_name: 'Other', position: 4 }])
    expect(rows()).toBe(4)
  })
})
