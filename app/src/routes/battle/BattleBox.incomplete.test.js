// The battle box when a `vehicles[]` entry is an object but incomplete — widgets.md rule 59,
// protocol-contract.md rule 21. An entry without a usable `slot_id` or `position` is never named
// as the car ahead or behind, even when it sits exactly at the neighbour's position. Driven from
// race-close-battle.json: subject car-1 Verstappen (P2, F1), Hamilton ahead (P1), Leclerc behind (P3).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import BattleBox from './BattleBox.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

afterEach(() => cleanup())

const slot = (container, which) =>
  container.querySelector(`.bc-battle__slot--${which} .bc-battle__slot-name`)?.textContent.trim()
const draw = (vehicles) =>
  render(BattleBox, {
    props: {
      subject: closeBattle.subject,
      relationship: closeBattle.relationship,
      vehicles,
      mode: closeBattle.mode,
    },
  }).container

const car = (over) => ({ driver_name: 'Ghost', vehicle_class: 'F1', ...over })
const bySlot = (id) => closeBattle.vehicles.find((v) => v.slot_id === id)
const withoutHamilton = closeBattle.vehicles.filter((v) => v.slot_id !== 'car-44')
const withoutLeclerc = closeBattle.vehicles.filter((v) => v.slot_id !== 'car-16')

describe('rule 59 — an incomplete entry at the neighbour position is not a neighbour', () => {
  it('a slot_id-less entry at P1 is not named AHEAD', () => {
    const c = draw([car({ position: 1 }), ...withoutHamilton])
    expect(slot(c, 'ahead')).toBe('—')
    expect(c.textContent).not.toContain('Ghost')
    expect(slot(c, 'behind')).toContain('Leclerc')
  })

  it('a slot_id-less entry at P3 is not named BEHIND', () => {
    const c = draw([...withoutLeclerc, car({ position: 3 })])
    expect(slot(c, 'behind')).toBe('—')
    expect(c.textContent).not.toContain('Ghost')
  })

  it('an entry with a string position is not matched as a neighbour (P1 as "1")', () => {
    const c = draw([car({ slot_id: 'str', position: '1' }), ...withoutHamilton])
    expect(slot(c, 'ahead')).toBe('—')
  })

  it('the real neighbours are still named alongside the incomplete entries', () => {
    const c = draw([car({ position: 1 }), ...closeBattle.vehicles, car({ position: 3 }), {}])
    expect(slot(c, 'ahead')).toContain('Hamilton')
    expect(slot(c, 'behind')).toContain('Leclerc')
  })

  it('a subject whose entry has a usable slot_id but no usable position keeps its class chip; both neighbours are dashes', () => {
    const subjectEntry = { ...bySlot('car-1'), position: null }
    const rest = closeBattle.vehicles.filter((v) => v.slot_id !== 'car-1')
    const c = draw([...rest, subjectEntry])
    expect(c.textContent).toContain('F1')
    expect(slot(c, 'ahead')).toBe('—')
    expect(slot(c, 'behind')).toBe('—')
  })

  it('a subject whose own position is a string "2" shows both neighbours as dashes', () => {
    const subjectEntry = { ...bySlot('car-1'), position: '2' }
    const rest = closeBattle.vehicles.filter((v) => v.slot_id !== 'car-1')
    const c = draw([...rest, subjectEntry])
    expect(slot(c, 'ahead')).toBe('—')
    expect(slot(c, 'behind')).toBe('—')
    expect(c.textContent).toContain('F1')
  })
})
