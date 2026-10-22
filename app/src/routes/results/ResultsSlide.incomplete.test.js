// The results slide when a `vehicles[]` entry is an object but incomplete — protocol-contract.md
// rule 21, widgets.md rule 66. An entry without a usable `slot_id` or `position` is not a row and
// is not counted in a class position. Driven from race-close-battle.json (single class F1:
// Hamilton P1, Verstappen P2, Leclerc P3, Norris P4) and grid-multiclass.json.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import ResultsSlide from './ResultsSlide.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'

afterEach(() => cleanup())

const names = () =>
  Array.from(document.querySelectorAll('[data-testid="driver-name"]')).map((el) => el.textContent.trim())
const rows = () => Array.from(document.querySelectorAll('[data-testid="results-row"]'))
const empty = () => document.querySelector('[data-testid="results-empty"]')

const car = (over) => ({ driver_name: 'Ghost', vehicle_class: 'F1', ...over })
const INCOMPLETE = [
  ['an empty object', {}],
  ['a missing slot_id', car({ position: 1 })],
  ['a null position', car({ slot_id: 'p-null', position: null })],
  ['a string position', car({ slot_id: 'p-str', position: '2' })],
  ['an Infinity position', car({ slot_id: 'p-inf', position: JSON.parse('1e999') })],
]


// Three copies of an incomplete entry. A string slot_id gets its own suffix and a numeric one its own
// number, so a failure names the entry that leaked. Copies with no slot_id or an empty one cannot be
// keyed apart; those share a key by nature, which is the case the spec says must not stop rendering.
const three = (e) =>
  [0, 1, 2].map((i) => {
    if (typeof e.slot_id === 'string' && e.slot_id) return { ...e, slot_id: `${e.slot_id}-${i}` }
    if (typeof e.slot_id === 'number') return { ...e, slot_id: e.slot_id + i }
    return { ...e }
  })
describe('rule 66 — an incomplete vehicles[] entry is not a results row', () => {
  it.each(INCOMPLETE)('with %s first, in the middle and last: the same four rows, class positions 1-4', (_l, junk) => {
    const v = closeBattle.vehicles
    const [a, b, c] = three(junk)
    render(ResultsSlide, { snapshot: { ...closeBattle, vehicles: [a, v[0], b, ...v.slice(1), c] } })
    expect(names()).toEqual(['Hamilton', 'Verstappen', 'Leclerc', 'Norris'])
    expect(rows().map((r) => r.getAttribute('data-class-pos'))).toEqual(['1', '2', '3', '4'])
  })

  it('a position of 0 is usable: the entry is a row, ahead of P1', () => {
    const entry = car({ slot_id: 'zero', driver_name: 'Zero', position: 0 })
    render(ResultsSlide, { snapshot: { ...closeBattle, vehicles: [...closeBattle.vehicles, entry] } })
    expect(names()).toEqual(['Zero', 'Hamilton', 'Verstappen', 'Leclerc', 'Norris'])
  })

  it('restarts class positions per class without counting the entry (multi-class)', () => {
    const ghost = car({ vehicle_class: 'GTP', slot_id: 'p-null', position: null })
    render(ResultsSlide, { snapshot: { ...multiClass, vehicles: [{}, ...multiClass.vehicles, ghost] } })
    expect(names()).toEqual(['Verstappen', 'Hamilton', 'Rossi', 'Bourdais', 'Alonso', 'Albon'])
    expect(rows().map((r) => r.getAttribute('data-class-pos'))).toEqual(['1', '2', '1', '2', '1', '2'])
  })

  it('a field of only incomplete entries is the empty field, not the empty-class placeholder', () => {
    render(ResultsSlide, { snapshot: { ...closeBattle, vehicles: INCOMPLETE.map(([, e]) => e) } })
    expect(rows()).toHaveLength(0)
    expect(empty()?.getAttribute('data-reason')).toBe('no-state')
  })
})
