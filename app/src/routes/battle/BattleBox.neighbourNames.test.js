// The battle box's ahead/behind names — widgets.md rule 68. A neighbour name counts as present by the
// rule 14b test (a string with a non-whitespace character); anything else renders `—`. Driven from
// race-close-battle.json: subject car-1 Verstappen (P2) with Hamilton ahead (P1) and Leclerc
// behind (P3). Each case blanks one neighbour's driver_name on a copy of the fixture.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import BattleBox from './BattleBox.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

afterEach(() => cleanup())

const ABSENT = Symbol('absent')

function renderBox(vehicles, subject = closeBattle.subject) {
  const { container } = render(BattleBox, {
    props: { subject, relationship: closeBattle.relationship, vehicles, mode: closeBattle.mode },
  })
  const text = (which) =>
    container.querySelector(`.bc-battle__slot--${which} .bc-battle__slot-name`).textContent.trim()
  return { ahead: text('ahead'), behind: text('behind') }
}

function renderWith(slot, name) {
  const position = slot === 'ahead' ? 1 : 3
  const vehicles = closeBattle.vehicles.map((v) => {
    if (v.position !== position) return v
    const copy = { ...v }
    if (name === ABSENT) delete copy.driver_name
    else copy.driver_name = name
    return copy
  })
  return renderBox(vehicles)
}

describe('rule 68 — a missing neighbour name renders —', () => {
  describe.each([
    ['ahead', 'behind', 'Hamilton', 'Leclerc'],
    ['behind', 'ahead', 'Leclerc', 'Hamilton'],
  ])('%s slot', (slot, other, _own, otherName) => {
    it.each([
      ['empty', ''],
      ['whitespace-only', '   '],
      ['null', null],
      ['absent', ABSENT],
      ['a number', 42],
      ['a boolean', true],
      ['an object', {}],
    ])('renders — when the name is %s, leaving the other slot alone', (_label, name) => {
      const out = renderWith(slot, name)
      expect(out[slot]).toBe('—')
      expect(out[other]).toBe(otherName)
    })

    it('renders a present name through fmtName', () => {
      const out = renderWith(slot, '  Nyck de Vries ')
      expect(out[slot]).toBe('N. de Vries')
      expect(out[other]).toBe(otherName)
    })
  })
})

describe('rule 68 — a slot with no car at the neighbouring position renders —', () => {
  it('subject at P1 with a gap at P2: both slots are —', () => {
    // Hamilton (P1) drops out of the field; the subject moves up to P1 and Leclerc stays at P3.
    const vehicles = closeBattle.vehicles
      .filter((v) => v.position !== 1)
      .map((v) => (v.slot_id === closeBattle.subject.slot_id ? { ...v, position: 1 } : v))
    const out = renderBox(vehicles)
    expect(out.ahead).toBe('—')
    // P2 now holds nobody: the behind slot is the car at exactly position + 1.
    expect(out.behind).toBe('—')
  })

  it('subject at P1 with a car at P2: ahead is —, behind keeps its name', () => {
    const vehicles = closeBattle.vehicles
      .filter((v) => v.position !== 1)
      .map((v) => (v.slot_id === closeBattle.subject.slot_id ? { ...v, position: 1 } : v))
      .map((v) => (v.position === 3 ? { ...v, position: 2 } : v))
    const out = renderBox(vehicles)
    expect(out.ahead).toBe('—')
    expect(out.behind).toBe('Leclerc')
  })

  it('subject with an unresolved slot_id: both slots are —', () => {
    const out = renderBox(closeBattle.vehicles, { ...closeBattle.subject, slot_id: 'no-such-car' })
    expect(out.ahead).toBe('—')
    expect(out.behind).toBe('—')
  })

  it('subject vehicle with no position: both slots are —', () => {
    const vehicles = closeBattle.vehicles.map((v) => {
      if (v.slot_id !== closeBattle.subject.slot_id) return v
      const copy = { ...v }
      delete copy.position
      return copy
    })
    const out = renderBox(vehicles)
    expect(out.ahead).toBe('—')
    expect(out.behind).toBe('—')
  })
})
