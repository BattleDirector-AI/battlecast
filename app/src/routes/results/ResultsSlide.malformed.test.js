// The results slide on a malformed `vehicles` — protocol-contract.md rule 21, widgets.md rule 66.
// A non-object `vehicles[]` entry is not a row and is not counted in a class position; a
// `vehicles` that is not an array is an empty field. Driven from race-close-battle.json (single
// class F1: Hamilton P1, Verstappen P2, Leclerc P3, Norris P4) and grid-multiclass.json.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import ResultsSlide from './ResultsSlide.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
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
const rows = () => Array.from(document.querySelectorAll('[data-testid="results-row"]'))
const empty = () => document.querySelector('[data-testid="results-empty"]')

describe('rule 66 — a non-object vehicles[] entry is not a results row', () => {
  it.each([
    ['null', null],
    ['a number', 7],
    ['a string', 'car-1'],
    ['an array carrying vehicle fields', GHOST],
  ])('with %s first, in the middle and last: the same four rows, class positions 1-4', (_l, junk) => {
    const v = closeBattle.vehicles
    render(ResultsSlide, { snapshot: { ...closeBattle, vehicles: [junk, v[0], junk, ...v.slice(1), junk] } })
    expect(names()).toEqual(['Hamilton', 'Verstappen', 'Leclerc', 'Norris'])
    expect(rows().map((r) => r.getAttribute('data-class-pos'))).toEqual(['1', '2', '3', '4'])
  })

  it('restarts class positions per class without counting the entry (multi-class)', () => {
    render(ResultsSlide, { snapshot: { ...multiClass, vehicles: [null, ...multiClass.vehicles, 7] } })
    expect(names()).toEqual(['Verstappen', 'Hamilton', 'Rossi', 'Bourdais', 'Alonso', 'Albon'])
    expect(rows().map((r) => r.getAttribute('data-class-pos'))).toEqual(['1', '2', '1', '2', '1', '2'])
  })

  it('a field of only junk entries is the empty field, not the empty-class placeholder', () => {
    render(ResultsSlide, { snapshot: { ...closeBattle, vehicles: [null, 7, 'x'] } })
    expect(rows()).toHaveLength(0)
    expect(empty()?.getAttribute('data-reason')).toBe('no-state')
  })
})

describe('rule 66 — a vehicles that is not an array is an empty field', () => {
  it.each([
    ['an object', {}],
    ['a string', 'car-1'],
    ['null', null],
  ])('renders no rows and the no-state placeholder when vehicles is %s', (_l, junk) => {
    render(ResultsSlide, { snapshot: { ...closeBattle, vehicles: junk } })
    expect(rows()).toHaveLength(0)
    expect(empty()?.getAttribute('data-reason')).toBe('no-state')
  })
})
