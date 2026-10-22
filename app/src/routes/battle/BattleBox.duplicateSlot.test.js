// The battle box when several `vehicles[]` entries share a `slot_id` — protocol-contract.md
// rule 21 ("Entries sharing a slot_id"). Driven from race-close-battle.json (subject car-1
// Verstappen P2 with Hamilton P1 ahead and Leclerc P3 behind, all "F1").
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import BattleBox from './BattleBox.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

afterEach(() => cleanup())

function renderBox(vehicles) {
  const snap = { ...closeBattle, vehicles }
  return render(BattleBox, {
    props: { subject: snap.subject, relationship: snap.relationship, vehicles: snap.vehicles, mode: snap.mode },
  }).container
}
const chips = (c) => Array.from(c.querySelectorAll('.bc-class-chip')).map((el) => el.textContent.trim())
const slotName = (c, which) =>
  c.querySelector(`.bc-battle__slot--${which} .bc-battle__slot-name`)?.textContent.trim()
const [ham, ver, lec, nor] = closeBattle.vehicles

describe('rule 21 — entries sharing a slot_id in the battle box', () => {
  // RED: the neighbour lookup finds the copy (a car-44 copy at position 3, before Leclerc).
  it('a later copy of a car is never named as a neighbour', () => {
    const copy = { ...ham, driver_name: 'Ghost', position: 3 }
    const c = renderBox([ham, ver, copy, lec, nor])
    expect(slotName(c, 'ahead')).toBe('Hamilton')
    expect(slotName(c, 'behind')).toBe('Leclerc')
  })

  // DELIVERABLE (green today): the subject first entry already wins the chip and position.
  it('a later copy of the subject does not change its chip or neighbours', () => {
    const copy = { ...ver, vehicle_class: 'GT3', position: 4 }
    const c = renderBox([ham, ver, lec, nor, copy])
    expect(chips(c)).toEqual(['F1'])
    expect(slotName(c, 'ahead')).toBe('Hamilton')
    expect(slotName(c, 'behind')).toBe('Leclerc')
  })

  // RED: subject resolution takes the first match, which has no position, so both neighbours are dashes.
  it('a subject whose first copy has no position uses the complete second copy', () => {
    const first = { slot_id: ver.slot_id, driver_name: 'Verstappen', vehicle_class: 'GT3' }
    const c = renderBox([first, ham, ver, lec, nor])
    expect(chips(c)).toEqual(['F1'])
    expect(slotName(c, 'ahead')).toBe('Hamilton')
    expect(slotName(c, 'behind')).toBe('Leclerc')
  })
})
