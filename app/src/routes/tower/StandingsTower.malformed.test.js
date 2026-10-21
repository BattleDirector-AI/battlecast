// The standings tower on a malformed `vehicles` — protocol-contract.md rule 21, widgets.md rule 66.
// A non-object `vehicles[]` entry is absent: not a row, not counted for a class rank or total.
// A `vehicles` that is not an array is an empty field. Driven from race-onboard-telemetry.json
// (car-44 Hamilton P1, car-1 Verstappen P2, car-16 Leclerc P3, all F1; subject car-1) and
// grid-multiclass.json (GTP/GT3/LMP2 interleaved), with junk spliced into `vehicles`.
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

const GHOST = Object.assign([], {
  slot_id: 'ghost',
  driver_name: 'Ghost Array',
  vehicle_class: 'ZZ',
  position: 0,
  pit_stops: 3,
})

const JUNK = [
  ['null', null],
  ['a number', 7],
  ['a string', 'car-1'],
  ['an array carrying vehicle fields', GHOST],
]

describe('rule 66 — a non-object vehicles[] entry is not a tower row', () => {
  it.each(JUNK)('with %s first, in the middle and last: the same three rows in order', (_l, junk) => {
    const v = onboard.vehicles
    render(StandingsTower, {
      nameStyle: 'full',
      snapshot: { ...onboard, vehicles: [junk, v[0], junk, v[1], v[2], junk] },
    })
    expect(rows()).toBe(3)
    expect(names()).toEqual(['Hamilton', 'Verstappen', 'Leclerc'])
    expect(positions()).toEqual(['1', '2', '3'])
    // The on-camera highlight still lands on the subject's row.
    expect(document.querySelector('[data-testid="tower-row"][data-slot="car-1"]').getAttribute('data-oncam')).toBe('true')
  })

  it('an array carrying pit_stops adds no pit column (column set follows the real rows)', () => {
    render(StandingsTower, {
      metrics: { pit: true },
      snapshot: { ...onboard, vehicles: [GHOST, ...onboard.vehicles] },
    })
    // No real car carries pit_stops/in_pit, so the tower has no pit column at all. Name-column
    // width is not asserted: happy-dom does no layout.
    expect(document.querySelectorAll('[data-col="pit"]')).toHaveLength(0)
    expect(rows()).toBe(3)
  })

  it('does not count the entry toward class rank or class size (inline badges)', () => {
    const v = multiClass.vehicles
    render(StandingsTower, {
      nameStyle: 'full',
      snapshot: { ...multiClass, vehicles: [null, ...v, 7, null] },
    })
    expect(names()).toEqual(['Verstappen', 'Alonso', 'Hamilton', 'Rossi', 'Albon', 'Bourdais'])
    // Same badges as the clean fixture: GTP 1/2,2/2 · GT3 1/2,2/2 · LMP2 1/2,2/2.
    expect(classBadges()).toEqual(['1/2', '1/2', '2/2', '1/2', '2/2', '2/2'])
  })

  it('does not count the entry in a grouped tower\'s group sizes', () => {
    const v = multiClass.vehicles
    render(StandingsTower, {
      nameStyle: 'full',
      classDisplay: 'grouped',
      snapshot: { ...multiClass, vehicles: [null, ...v, 7] },
    })
    expect(names()).toEqual(['Verstappen', 'Hamilton', 'Rossi', 'Bourdais', 'Alonso', 'Albon'])
    expect(rows()).toBe(6)
  })

  it('a field of only junk entries is the empty field, not the empty-class placeholder', () => {
    render(StandingsTower, { snapshot: { ...onboard, vehicles: [null, 7, 'x'] } })
    expect(rows()).toBe(0)
    expect(empty()?.getAttribute('data-reason')).toBe('no-state')
  })
})

describe('rule 66 — a vehicles that is not an array is an empty field', () => {
  it.each([
    ['an object', {}],
    ['a string', 'car-1'],
    ['null', null],
  ])('renders no rows and the no-state placeholder when vehicles is %s', (_l, junk) => {
    render(StandingsTower, { snapshot: { ...onboard, vehicles: junk } })
    expect(rows()).toBe(0)
    expect(empty()?.getAttribute('data-reason')).toBe('no-state')
  })
})
