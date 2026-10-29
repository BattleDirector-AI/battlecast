/* Race update box — which race_events entries are events, and the card's exact strings.
 *
 * Behavioral spec: .ai/spec/what/widgets.md rules 69-70, protocol-contract.md rule 22,
 * ADR 0023. `raceEventCard(entry)` (how/renderer.md) is the pure, DOM-free half of the box:
 * it returns `{ id, type, label, name, value, detail }` with the strings the card renders
 * (`value` / `detail` null when the card has none), or null for an entry rule 69 skips. The
 * rendered card is asserted in routes/updates/RaceUpdateBox.test.js; this file pins the
 * per-entry table cheaply.
 *
 * The module is loaded through a non-static specifier so a missing module fails each test
 * with a message naming it, rather than failing the whole file at import time.
 */
import { describe, it, expect } from 'vitest'
import fixture from '../../../spec/v1/fixtures/race-events.json'

const MODULE = './raceEvents.js'
async function raceEventCard(entry) {
  let mod
  try {
    mod = await import(/* @vite-ignore */ MODULE)
  } catch (err) {
    throw new Error(`could not load app/src/lib/raceEvents.js: ${String(err?.message).split('\n')[0]}`, {
      cause: err,
    })
  }
  expect(typeof mod.raceEventCard, 'raceEvents.js must export raceEventCard').toBe('function')
  return mod.raceEventCard(entry)
}

const byId = (id) => structuredClone(fixture.race_events.find((e) => e.id === id))

describe('raceEventCard — the card for each fixture event (rule 70, race-events.json)', () => {
  it('overall fastest lap: FASTEST LAP, full-form name, lap time as the tower flash formats it', async () => {
    expect(await raceEventCard(byId('ev-101'))).toEqual({
      id: 'ev-101',
      type: 'fastest_lap',
      label: 'FASTEST LAP',
      name: 'K. Estre',
      driverName: 'Kevin Estre',
      value: '3:28.977',
      detail: null,
    })
  })

  it('class fastest lap: the class leads the label, and the detail line shows', async () => {
    expect(await raceEventCard(byId('ev-102'))).toEqual({
      id: 'ev-102',
      type: 'fastest_lap',
      label: 'GT3 FASTEST LAP',
      name: 'R. Lietz',
      driverName: 'Richard Lietz',
      value: '3:47.640',
      detail: 'Lap 14',
    })
  })

  it('leader change: NEW LEADER and no value', async () => {
    expect(await raceEventCard(byId('ev-103'))).toEqual({
      id: 'ev-103',
      type: 'leader_change',
      label: 'NEW LEADER',
      name: 'M. Conway',
      driverName: 'Mike Conway',
      value: null,
      detail: 'Passes K. Estre into the first chicane',
    })
  })

  it('retirement with finish_status 2: RETIRED (class-prefixed here) and no value', async () => {
    expect(await raceEventCard(byId('ev-104'))).toEqual({
      id: 'ev-104',
      type: 'retirement',
      label: 'GT3 RETIRED',
      name: 'B. Barker',
      driverName: 'Ben Barker',
      value: null,
      detail: 'Gearbox',
    })
  })

  it('penalty: PENALTY with the penalty text as the value', async () => {
    expect(await raceEventCard(byId('ev-105'))).toEqual({
      id: 'ev-105',
      type: 'penalty',
      label: 'PENALTY',
      name: 'K. Bachler',
      driverName: 'Klaus Bachler',
      value: 'Drive-through',
      detail: 'Speeding in the pit lane',
    })
  })
})

describe('raceEventCard — formatting edges (rule 70)', () => {
  it('carries the unformatted driver_name as driverName, so the box can show it in either name style (rule 111)', async () => {
    // how/renderer.md "Driver names in every widget": RaceUpdateBox renders
    // fmtDriverName(card.driverName, nameStyle), so a style change re-renders the card's name.
    const card = await raceEventCard({ id: 'p', type: 'penalty', driver_name: 'Jean-Eric Vergne', penalty: '+5s' })
    expect(card.driverName).toBe('Jean-Eric Vergne')
    expect(card.name).toBe('J. Vergne')
  })

  it('a retirement with finish_status 3 reads DISQUALIFIED, not RETIRED', async () => {
    const card = await raceEventCard({ id: 'dq', type: 'retirement', driver_name: 'Ben Barker', finish_status: 3 })
    expect(card.label).toBe('DISQUALIFIED')
    expect(card.value).toBeNull()
  })

  it('a sub-minute lap renders as bare seconds', async () => {
    const card = await raceEventCard({ id: 'q', type: 'fastest_lap', driver_name: 'Kevin Estre', lap_time: 58.204 })
    expect(card.value).toBe('58.204')
  })

  it('trims and uppercases the class prefix', async () => {
    const card = await raceEventCard({
      id: 'c',
      type: 'leader_change',
      driver_name: 'Kevin Estre',
      vehicle_class: '  lmgt3 Pro-Am ',
    })
    expect(card.label).toBe('LMGT3 PRO-AM NEW LEADER')
  })

  it.each([
    ['null', null],
    ['blank', '   '],
    ['a number', 3],
  ])('a vehicle_class that is %s makes an overall event', async (_label, cls) => {
    const card = await raceEventCard({ id: 'c', type: 'leader_change', driver_name: 'Kevin Estre', vehicle_class: cls })
    expect(card.label).toBe('NEW LEADER')
  })

  it('names follow the full form of widgets rule 48', async () => {
    const name = async (driver_name) =>
      (await raceEventCard({ id: 'n', type: 'leader_change', driver_name })).name
    expect(await name('Estre')).toBe('Estre')
    expect(await name('  Nyck de Vries ')).toBe('N. de Vries')
    expect(await name('E.Jacobs')).toBe('E.Jacobs')
  })

  it('trims the penalty and the detail, and drops a blank or non-string detail', async () => {
    const card = await raceEventCard({
      id: 'p',
      type: 'penalty',
      driver_name: 'Klaus Bachler',
      penalty: '  +5s ',
      detail: '  Track limits  ',
    })
    expect(card.value).toBe('+5s')
    expect(card.detail).toBe('Track limits')
    for (const detail of ['   ', 42, null]) {
      const c = await raceEventCard({ id: 'p', type: 'penalty', driver_name: 'Klaus Bachler', penalty: '+5s', detail })
      expect(c.detail, `detail ${JSON.stringify(detail)}`).toBeNull()
    }
  })
})

describe('raceEventCard — entries that are not events are skipped (rule 69)', () => {
  const valid = { id: 'ok', type: 'penalty', driver_name: 'Klaus Bachler', penalty: '+5s' }

  it('accepts the valid base entry (so each case below is rejected for its one change)', async () => {
    expect(await raceEventCard(valid)).not.toBeNull()
  })

  it.each([
    ['null', null],
    ['a number', 42],
    ['a string', 'ev-1'],
    ['an array carrying the fields', Object.assign([], valid)],
    ['no id', { ...valid, id: undefined }],
    ['a blank id', { ...valid, id: '   ' }],
    ['a numeric id', { ...valid, id: 7 }],
    ['an unknown type', { ...valid, type: 'overtake' }],
    ['a type in another case', { ...valid, type: 'Penalty' }],
    ['a padded type', { ...valid, type: ' penalty' }],
    ['a blank driver_name', { ...valid, driver_name: '  ' }],
    ['a non-string driver_name', { ...valid, driver_name: 7 }],
    ['a penalty with blank penalty text', { ...valid, penalty: '  ' }],
    ['a penalty without penalty text', { ...valid, penalty: undefined }],
    ['a fastest_lap without lap_time', { id: 'f', type: 'fastest_lap', driver_name: 'Kevin Estre' }],
    ['a fastest_lap with lap_time 0', { id: 'f', type: 'fastest_lap', driver_name: 'Kevin Estre', lap_time: 0 }],
    ['a fastest_lap with a string lap_time', { id: 'f', type: 'fastest_lap', driver_name: 'Kevin Estre', lap_time: '90.1' }],
    ['a retirement with finish_status 1', { id: 'r', type: 'retirement', driver_name: 'Ben Barker', finish_status: 1 }],
    ['a retirement with finish_status "2"', { id: 'r', type: 'retirement', driver_name: 'Ben Barker', finish_status: '2' }],
    ['a retirement without finish_status', { id: 'r', type: 'retirement', driver_name: 'Ben Barker' }],
  ])('%s → null', async (_label, entry) => {
    expect(await raceEventCard(entry)).toBeNull()
  })
})
