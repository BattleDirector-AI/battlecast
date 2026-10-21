// The starting-grid slide on a malformed `vehicles` — protocol-contract.md rule 21, widgets.md
// rule 66. A non-object `vehicles[]` entry is not a cell and not part of a class group's car
// count; a `vehicles` that is not an array is an empty field. Driven from grid-multiclass.json
// (GTP: Verstappen P1, Hamilton P3 / GT3: Alonso P2, Albon P5 / LMP2: Rossi P4, Bourdais P6).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import GridSlide from './GridSlide.svelte'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'

afterEach(() => cleanup())

const GHOST = Object.assign([], {
  slot_id: 'ghost',
  driver_name: 'Ghost Array',
  vehicle_class: 'ZZ',
  position: 0,
  pit_stops: 3,
})

const names = () =>
  Array.from(document.querySelectorAll('[data-testid="driver-name"]')).map((el) => el.textContent.trim())
const cells = () => Array.from(document.querySelectorAll('[data-testid="grid-cell"]'))
const groups = () => Array.from(document.querySelectorAll('[data-testid="grid-group"]'))
const empty = () => document.querySelector('[data-testid="grid-empty"]')

describe('rule 66 — a non-object vehicles[] entry is not a grid cell', () => {
  it.each([
    ['null', null],
    ['a number', 7],
    ['a string', 'car-1'],
    ['an array carrying vehicle fields', GHOST],
  ])('with %s first, in the middle and last: the same grouped grid', (_l, junk) => {
    const v = multiClass.vehicles
    render(GridSlide, { snapshot: { ...multiClass, vehicles: [junk, ...v.slice(0, 3), junk, ...v.slice(3), junk] } })
    expect(groups().map((g) => g.getAttribute('data-class'))).toEqual(['GTP', 'LMP2', 'GT3'])
    expect(names()).toEqual(['Verstappen', 'Hamilton', 'Rossi', 'Bourdais', 'Alonso', 'Albon'])
    expect(cells().map((c) => c.getAttribute('data-position'))).toEqual(['1', '3', '4', '6', '2', '5'])
  })

  it('a field of only junk entries is the empty field, not the empty-class placeholder', () => {
    render(GridSlide, { snapshot: { ...multiClass, vehicles: [null, 7, 'x'] } })
    expect(cells()).toHaveLength(0)
    expect(empty()?.getAttribute('data-reason')).toBe('no-state')
  })
})

describe('rule 66 — a vehicles that is not an array is an empty field', () => {
  it.each([
    ['an object', {}],
    ['a string', 'car-1'],
    ['null', null],
  ])('renders no cells and the no-state placeholder when vehicles is %s', (_l, junk) => {
    render(GridSlide, { snapshot: { ...multiClass, vehicles: junk } })
    expect(cells()).toHaveLength(0)
    expect(empty()?.getAttribute('data-reason')).toBe('no-state')
  })
})
