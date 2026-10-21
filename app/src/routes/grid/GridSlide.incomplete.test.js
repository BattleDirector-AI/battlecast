// The starting-grid slide when a `vehicles[]` entry is an object but incomplete —
// protocol-contract.md rule 21, widgets.md rule 66. An entry without a usable `slot_id` or
// `position` is not a cell and not part of a class group's car count. Driven from
// grid-multiclass.json (GTP: Verstappen P1, Hamilton P3 / GT3: Alonso P2, Albon P5 /
// LMP2: Rossi P4, Bourdais P6).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import GridSlide from './GridSlide.svelte'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'

afterEach(() => cleanup())

const names = () =>
  Array.from(document.querySelectorAll('[data-testid="driver-name"]')).map((el) => el.textContent.trim())
const cells = () => Array.from(document.querySelectorAll('[data-testid="grid-cell"]'))
const groups = () => Array.from(document.querySelectorAll('[data-testid="grid-group"]'))
const empty = () => document.querySelector('[data-testid="grid-empty"]')

const car = (over) => ({ driver_name: 'Ghost', vehicle_class: 'GTP', ...over })
const INCOMPLETE = [
  ['an empty object', {}],
  ['a missing slot_id', car({ position: 7 })],
  ['a null position', car({ slot_id: 'p-null', position: null })],
  ['a string position', car({ slot_id: 'p-str', position: '2' })],
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
describe('rule 66 — an incomplete vehicles[] entry is not a grid cell', () => {
  it.each(INCOMPLETE)('with %s first, in the middle and last: the same grouped grid', (_l, junk) => {
    const v = multiClass.vehicles
    const [a, b, c] = three(junk)
    render(GridSlide, { snapshot: { ...multiClass, vehicles: [a, ...v.slice(0, 3), b, ...v.slice(3), c] } })
    expect(groups().map((g) => g.getAttribute('data-class'))).toEqual(['GTP', 'LMP2', 'GT3'])
    expect(names()).toEqual(['Verstappen', 'Hamilton', 'Rossi', 'Bourdais', 'Alonso', 'Albon'])
    expect(cells().map((c) => c.getAttribute('data-position'))).toEqual(['1', '3', '4', '6', '2', '5'])
  })

  it('a field of only incomplete entries is the empty field, not the empty-class placeholder', () => {
    render(GridSlide, { snapshot: { ...multiClass, vehicles: INCOMPLETE.map(([, e]) => e) } })
    expect(cells()).toHaveLength(0)
    expect(empty()?.getAttribute('data-reason')).toBe('no-state')
  })
})
