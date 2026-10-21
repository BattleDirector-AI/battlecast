// The results slide when several `vehicles[]` entries share a `slot_id` — protocol-contract.md
// rule 21 ("Entries sharing a slot_id"). Driven from race-close-battle.json (single class F1:
// Hamilton P1, Verstappen P2, Leclerc P3, Norris P4).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import ResultsSlide from './ResultsSlide.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

afterEach(() => cleanup())

const names = () =>
  Array.from(document.querySelectorAll('[data-testid="driver-name"]')).map((el) => el.textContent.trim())
const rows = () => Array.from(document.querySelectorAll('[data-testid="results-row"]'))
const [ham] = closeBattle.vehicles

describe('rule 21 — entries sharing a slot_id on the results slide', () => {
  // RED: today the copy throws each_key_duplicate (the copy shares the row key).
  it('a later copy of a car is not a row, and does not count in the class positions', () => {
    const copy = { ...ham, driver_name: 'Ghost', position: 5 }
    render(ResultsSlide, { snapshot: { ...closeBattle, vehicles: [...closeBattle.vehicles, copy] } })
    expect(names()).toEqual(['Hamilton', 'Verstappen', 'Leclerc', 'Norris'])
    expect(rows().map((r) => r.getAttribute('data-class-pos'))).toEqual(['1', '2', '3', '4'])
  })

  // DELIVERABLE (green today): the incomplete first copy is already absent.
  it('a first copy with no position is absent: the complete second copy is the row', () => {
    const first = { slot_id: ham.slot_id, driver_name: 'Ghost' }
    render(ResultsSlide, { snapshot: { ...closeBattle, vehicles: [first, ...closeBattle.vehicles] } })
    expect(names()).toEqual(['Hamilton', 'Verstappen', 'Leclerc', 'Norris'])
  })
})
