// The battle box finds the subject's own entry once, by rule 65's match: a subject with no
// usable slot_id matches no entry, even one that also has none (widgets.md rule 65). That entry
// supplies the class chip and the position rule 68 reads for the ahead/behind slots.
// Driven from race-close-battle.json (subject car-1 Verstappen P2, Hamilton P1, Leclerc P3,
// Norris P4, all "F1") plus a stranger carrying vehicle_class 'GT3' and position 3: were it
// matched as the subject, the box would show a GT3 chip and name P2 / P4 (Verstappen / Norris).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import BattleBox from './BattleBox.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

afterEach(() => cleanup())

function renderBox(snap) {
  return render(BattleBox, {
    props: { subject: snap.subject, relationship: snap.relationship, vehicles: snap.vehicles, mode: snap.mode },
  }).container
}
const chips = (c) => Array.from(c.querySelectorAll('.bc-class-chip')).map((el) => el.textContent.trim())
const slotName = (c, which) =>
  c.querySelector(`.bc-battle__slot--${which} .bc-battle__slot-name`)?.textContent.trim()

/** The fixture with the subject's slot_id removed or nulled, and a stranger lacking it likewise. */
function strangerSnap(slotId) {
  const snap = structuredClone(closeBattle)
  if (slotId === undefined) delete snap.subject.slot_id
  else snap.subject.slot_id = slotId
  const stranger = { driver_name: 'Stranger Danger', vehicle_class: 'GT3', position: 3 }
  if (slotId !== undefined) stranger.slot_id = slotId
  snap.vehicles.push(stranger)
  return snap
}

describe('rule 65 — a subject with no slot_id matches no entry for the class chip and neighbours', () => {
  // DELIVERABLE (red until implemented): the chip and subjectPos still use ===.
  const CASES = [
    ['absent on both sides', undefined],
    ['null on both sides', null],
  ]

  it.each(CASES)('slot_id %s: no GT3 chip shows', (_l, slotId) => {
    expect(chips(renderBox(strangerSnap(slotId)))).toEqual([])
  })

  it.each(CASES)('slot_id %s: both neighbours are dashes, not the cars around the stranger', (_l, slotId) => {
    const c = renderBox(strangerSnap(slotId))

    expect(slotName(c, 'ahead')).toBe('—')
    expect(slotName(c, 'behind')).toBe('—')
    // The battle still renders, and the name is the subject's own.
    expect(c.querySelector('.bc-battle__focus-name')?.textContent.trim()).toBe('Verstappen')
  })

  // GUARD: a subject with a slot_id that matches still gets its own chip and neighbours.
  it('a matched subject keeps its chip and neighbours beside the stranger', () => {
    const snap = structuredClone(closeBattle)
    snap.vehicles.push({ driver_name: 'Stranger Danger', vehicle_class: 'GT3', position: 9 })
    const c = renderBox(snap)

    expect(chips(c)).toEqual(['F1'])
    expect(slotName(c, 'ahead')).toBe('Hamilton')
    expect(slotName(c, 'behind')).toBe('Leclerc')
  })
})
