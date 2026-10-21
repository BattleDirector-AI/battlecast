// The standings tower when a `vehicles[]` entry is an object but incomplete — protocol-contract.md
// rule 21, widgets.md rule 66. An entry without a usable `slot_id` (non-empty string) or without a
// usable `position` (finite number) is absent: not a row, not counted, and it cannot collide with
// another on a row key. Driven from race-onboard-telemetry.json (car-44 Hamilton P1, car-1
// Verstappen P2, car-16 Leclerc P3, all F1) and grid-multiclass.json, with incomplete entries
// spliced into `vehicles`.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import onboard from '../../../../spec/v1/fixtures/race-onboard-telemetry.json'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'

afterEach(() => cleanup())

const names = () =>
  Array.from(document.querySelectorAll('[data-testid="driver-name"]')).map((el) => el.textContent.trim())
const positions = () =>
  Array.from(document.querySelectorAll('[data-testid="tower-row"] .row__pos')).map((el) => el.textContent.trim())
const classBadges = () =>
  Array.from(document.querySelectorAll('[data-testid="class-pos"]')).map((el) => el.textContent.trim())
const rows = () => document.querySelectorAll('[data-testid="tower-row"]').length
const empty = () => document.querySelector('[data-testid="tower-empty"]')

const car = (over) => ({ driver_name: 'Ghost', vehicle_class: 'F1', ...over })
const INCOMPLETE = [
  ['an empty object', {}],
  ['a missing slot_id', car({ position: 4 })],
  ['an empty slot_id', car({ slot_id: '', position: 4 })],
  ['a numeric slot_id', car({ slot_id: 7, position: 4 })],
  ['a null position', car({ slot_id: 'p-null', position: null })],
  ['a string position', car({ slot_id: 'p-str', position: '2' })],
  ['a missing position', car({ slot_id: 'p-none' })],
  // JSON.parse('1e999') is Infinity: reachable from the wire, and not a finite number.
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
describe('rule 66 — an incomplete vehicles[] entry is not a tower row', () => {
  it.each(INCOMPLETE)('with %s first, in the middle and last: the same three rows in order', (_l, junk) => {
    const v = onboard.vehicles
    const [a, b, c] = three(junk)
    render(StandingsTower, {
      nameStyle: 'full',
      snapshot: { ...onboard, vehicles: [a, v[0], b, v[1], v[2], c] },
    })
    expect(rows()).toBe(3)
    expect(names()).toEqual(['Hamilton', 'Verstappen', 'Leclerc'])
    expect(positions()).toEqual(['1', '2', '3'])
    expect(document.querySelector('[data-testid="tower-row"][data-slot="car-1"]').getAttribute('data-oncam')).toBe('true')
  })

  it.each([
    ['0', 0],
    ['2.5', 2.5],
  ])('a position of %s is usable: the entry is a row, sorted by its number', (_l, position) => {
    const entry = car({ slot_id: 'odd', driver_name: 'O. Position', position })
    render(StandingsTower, { nameStyle: 'full', snapshot: { ...onboard, vehicles: [...onboard.vehicles, entry] } })
    expect(rows()).toBe(4)
    const expected = position === 0
      ? ['O. Position', 'Hamilton', 'Verstappen', 'Leclerc']
      : ['Hamilton', 'Verstappen', 'O. Position', 'Leclerc']
    expect(names()).toEqual(expected)
  })

  it('a whitespace-only slot_id is usable: the entry is a row', () => {
    const entry = car({ slot_id: '  ', driver_name: 'O. Key', position: 4 })
    render(StandingsTower, { nameStyle: 'full', snapshot: { ...onboard, vehicles: [...onboard.vehicles, entry] } })
    expect(names()).toEqual(['Hamilton', 'Verstappen', 'Leclerc', 'O. Key'])
  })

  it('two incomplete entries render no row and do not stop the tower rendering', () => {
    const v = onboard.vehicles
    const twoNoSlot = [car({ position: 4 }), car({ position: 5 }), {}, {}]
    expect(() =>
      render(StandingsTower, { nameStyle: 'full', snapshot: { ...onboard, vehicles: [...twoNoSlot, ...v] } }),
    ).not.toThrow()
    expect(rows()).toBe(3)
    expect(names()).toEqual(['Hamilton', 'Verstappen', 'Leclerc'])
  })

  it('does not count the entry toward class rank or class size (inline badges)', () => {
    const v = multiClass.vehicles
    const ghosts = [car({ vehicle_class: 'GTP', position: 9 }), car({ slot_id: 'g', vehicle_class: 'GT3', position: null })]
    render(StandingsTower, { nameStyle: 'full', snapshot: { ...multiClass, vehicles: [ghosts[0], ...v, ghosts[1]] } })
    expect(names()).toEqual(['Verstappen', 'Alonso', 'Hamilton', 'Rossi', 'Albon', 'Bourdais'])
    expect(classBadges()).toEqual(['1/2', '1/2', '2/2', '1/2', '2/2', '2/2'])
  })

  it('a field of only incomplete entries is the empty field, not the empty-class placeholder', () => {
    render(StandingsTower, { snapshot: { ...onboard, vehicles: INCOMPLETE.map(([, e]) => e) } })
    expect(rows()).toBe(0)
    expect(empty()?.getAttribute('data-reason')).toBe('no-state')
  })
})
