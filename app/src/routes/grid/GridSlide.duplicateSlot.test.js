// The starting-grid slide when several `vehicles[]` entries share a `slot_id` — protocol-contract.md
// rule 21 ("Entries sharing a slot_id"). Driven from grid-multiclass.json (GTP: Verstappen P1,
// Hamilton P3 / GT3: Alonso P2, Albon P5 / LMP2: Rossi P4, Bourdais P6).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import GridSlide from './GridSlide.svelte'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'

afterEach(() => cleanup())

const names = () =>
  Array.from(document.querySelectorAll('[data-testid="driver-name"]')).map((el) => el.textContent.trim())
const cells = () => Array.from(document.querySelectorAll('[data-testid="grid-cell"]'))
const BASE = ['Verstappen', 'Hamilton', 'Rossi', 'Bourdais', 'Alonso', 'Albon']
const verstappen = () => multiClass.vehicles.find((v) => v.driver_name === 'Verstappen')

describe('rule 21 — entries sharing a slot_id on the grid', () => {
  // RED: today the copy renders as an extra cell.
  it('a later copy of a car is not a cell: one cell, the first entry data', () => {
    const copy = { ...verstappen(), driver_name: 'Ghost', position: 7, vehicle_class: 'GT3' }
    render(GridSlide, { snapshot: { ...multiClass, vehicles: [...multiClass.vehicles, copy] } })
    expect(names()).toEqual(BASE)
    expect(cells().map((c) => c.getAttribute('data-position'))).toEqual(['1', '3', '4', '6', '2', '5'])
  })

  // DELIVERABLE (green today): the incomplete first copy is already absent.
  it('a first copy with no position is absent: the complete second copy is the cell', () => {
    const first = { slot_id: verstappen().slot_id, driver_name: 'Ghost' }
    render(GridSlide, { snapshot: { ...multiClass, vehicles: [first, ...multiClass.vehicles] } })
    expect(names()).toEqual(BASE)
  })
})
