/* vehicles.js — the usable-entry helpers (protocol-contract.md rule 21). */
import { describe, it, expect } from 'vitest'
import {
  isVehicleEntry,
  validVehicleList,
  validVehicles,
  hasSlotId,
  isUsableSlotId,
  isListable,
  listableVehicles,
  listableVehicleList,
} from './vehicles.js'

const car = { slot_id: 'car-1', position: 1 }
const JUNK = [
  ['null', null],
  ['undefined', undefined],
  ['a number', 7],
  ['zero', 0],
  ['a string', 'car-1'],
  ['an empty string', ''],
  ['a boolean', true],
  ['an array', [car]],
]
const NON_ARRAYS = [
  ['undefined', undefined],
  ['null', null],
  ['an object', { 0: car, length: 1 }],
  ['a string', 'abc'],
  ['a number', 3],
]

describe('isVehicleEntry', () => {
  it('accepts plain objects, including empty ones', () => {
    expect(isVehicleEntry(car)).toBe(true)
    expect(isVehicleEntry({})).toBe(true)
  })
  it.each(JUNK)('rejects %s', (_label, value) => {
    expect(isVehicleEntry(value)).toBe(false)
  })
})

describe('validVehicleList', () => {
  it('drops each junk type wherever it sits and keeps the objects in order', () => {
    const a = { slot_id: 'a' }
    const b = { slot_id: 'b' }
    const input = [a, ...JUNK.map(([, v]) => v), b]
    expect(validVehicleList(input)).toEqual([a, b])
  })
  it.each(NON_ARRAYS)('a non-array (%s) is an empty list', (_label, value) => {
    expect(validVehicleList(value)).toEqual([])
  })
  it('returns a new array even when every entry is valid', () => {
    const input = [car, { slot_id: 'car-2' }]
    const out = validVehicleList(input)
    expect(out).toEqual(input)
    expect(out).not.toBe(input)
    out.reverse()
    expect(input[0]).toBe(car) // sorting the result never reorders the source
  })
  it('returns a new empty array for an empty input', () => {
    const input = []
    expect(validVehicleList(input)).not.toBe(input)
  })
})

describe('validVehicles', () => {
  it('reads snapshot.vehicles and drops junk entries', () => {
    expect(validVehicles({ vehicles: [null, car, 5, [car], 'x'] })).toEqual([car])
  })
  it.each([
    ['no snapshot', undefined],
    ['a null snapshot', null],
    ['no vehicles field', {}],
    ['a non-array vehicles', { vehicles: 'nope' }],
    ['an object vehicles', { vehicles: { 0: car } }],
  ])('%s gives an empty list', (_label, snapshot) => {
    expect(validVehicles(snapshot)).toEqual([])
  })
  it('returns a new array even when every entry is valid', () => {
    const vehicles = [car]
    const out = validVehicles({ vehicles })
    expect(out).toEqual(vehicles)
    expect(out).not.toBe(vehicles)
  })
})

describe('hasSlotId / isUsableSlotId / isListable / listable helpers (rule 21 option b)', () => {
  const ok = { slot_id: 'a', position: 1 }
  it('a slot_id is usable only as a non-empty string; whitespace counts', () => {
    expect(isUsableSlotId('a')).toBe(true)
    expect(isUsableSlotId(' ')).toBe(true)
    for (const bad of ['', 7, null, undefined, {}]) expect(isUsableSlotId(bad)).toBe(false)
    expect(hasSlotId({ slot_id: ' ' })).toBe(true)
    expect(hasSlotId({ slot_id: '' })).toBe(false)
    expect(hasSlotId(null)).toBe(false)
  })
  it('listable needs a usable slot_id and a finite numeric position', () => {
    expect(isListable(ok)).toBe(true)
    expect(isListable({ slot_id: 'a', position: -0 })).toBe(true)
    for (const position of [NaN, Infinity, -Infinity, '2', null, undefined]) {
      expect(isListable({ slot_id: 'a', position })).toBe(false)
    }
    expect(isListable({ slot_id: '', position: 1 })).toBe(false)
    expect(isListable({ position: 1 })).toBe(false)
  })
  it('listableVehicles / listableVehicleList keep only listable entries, in order, as a new array', () => {
    const b = { slot_id: ' ', position: 2 }
    const input = [{}, ok, null, { slot_id: 'x', position: NaN }, b, { position: 3 }]
    expect(listableVehicleList(input)).toEqual([ok, b])
    expect(listableVehicles({ vehicles: input })).toEqual([ok, b])
    expect(listableVehicles(undefined)).toEqual([])
    expect(listableVehicleList('abc')).toEqual([])
  })
})
