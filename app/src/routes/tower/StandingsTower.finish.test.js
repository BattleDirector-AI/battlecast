import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import finish from '../../../../spec/v1/fixtures/race-finish.json'

afterEach(() => cleanup())

// Finish status (widgets.md rule 45, ADR 0017). The producer sends each car's
// `finish_status` code — 0 running, 1 finished, 2 DNF, 3 DQ — and the tower puts one
// finish chip at the row's trailing end. It never works the code out itself.
//
// race-finish.json (mode race, session flag checkered; subject car-77):
//   P1 car-6  Estre   GTP — finish_status 1 (finished)
//   P2 car-7  Conway  GTP — finish_status 1 (finished)
//   P3 car-92 Lietz   GT3 — finish_status 1 (finished)
//   P4 car-77 Ried    GT3 — finish_status 0 (still on the last lap, on camera)
//   P5 car-18 Stroll  GT3 — finish_status 2 (DNF)

const SLOTS = ['car-6', 'car-7', 'car-92', 'car-77', 'car-18']
const rowFor = (slot) =>
  document.querySelector(`[data-testid="tower-row"][data-slot="${slot}"]`)
const chipsIn = (slot) => rowFor(slot)?.querySelectorAll('[data-testid="row-finish"]') ?? []
const finishOf = (slot) => {
  const row = rowFor(slot)
  const chips = chipsIn(slot)
  return {
    attr: row?.getAttribute('data-finish') ?? null,
    chips: chips.length,
    text: chips[0]?.textContent.trim() ?? null,
  }
}
const FINISHED = { attr: 'finished', chips: 1, text: '' }
const DNF = { attr: 'dnf', chips: 1, text: 'DNF' }
const DQ = { attr: 'dq', chips: 1, text: 'DQ' }
const NONE = { attr: null, chips: 0, text: null }

function withVehicle(slot, patch, base = finish) {
  const snap = structuredClone(base)
  Object.assign(
    snap.vehicles.find((v) => v.slot_id === slot),
    patch,
  )
  return snap
}

describe('StandingsTower finish status (rule 45)', () => {
  it('marks exactly the three finished rows and the DNF row from the fixture', () => {
    render(StandingsTower, { snapshot: finish })
    expect(finishOf('car-6')).toEqual(FINISHED)
    expect(finishOf('car-7')).toEqual(FINISHED)
    expect(finishOf('car-92')).toEqual(FINISHED)
    expect(finishOf('car-77')).toEqual(NONE)
    expect(finishOf('car-18')).toEqual(DNF)
  })

  it('names the chequered chip "Finished" for assistive tech', () => {
    render(StandingsTower, { snapshot: finish })
    const chip = chipsIn('car-6')[0]
    expect(chip?.getAttribute('role') ?? null).toBe('img')
    expect(chip?.getAttribute('aria-label') ?? null).toBe('Finished')
  })

  it('reads DQ for code 3', () => {
    render(StandingsTower, { snapshot: withVehicle('car-18', { finish_status: 3 }) })
    expect(finishOf('car-18')).toEqual(DQ)
  })

  it.each([
    ['0', 0],
    ['null', null],
    ['the string "1"', '1'],
    ['true', true],
    ['1.5', 1.5],
    ['an undefined code, 4', 4],
  ])('shows no chip for %s', (_label, value) => {
    // car-6 stays finished in the same render, so this fails if the chip never renders.
    render(StandingsTower, { snapshot: withVehicle('car-92', { finish_status: value }) })
    expect(finishOf('car-6')).toEqual(FINISHED)
    expect(finishOf('car-92')).toEqual(NONE)
  })

  it('shows no chip when the field is absent', () => {
    const snap = structuredClone(finish)
    delete snap.vehicles.find((v) => v.slot_id === 'car-92').finish_status
    render(StandingsTower, { snapshot: snap })
    expect(finishOf('car-6')).toEqual(FINISHED)
    expect(finishOf('car-92')).toEqual(NONE)
  })

  it('puts the chip at the trailing end of the row, after every metric cell', () => {
    // car-6 carries every strategy field, so the interval, pit, tire and fuel cells all render.
    const snap = withVehicle('car-6', {
      pit_stops: 2,
      in_pit: false,
      tire_compound: 'M',
      tire_wear: 0.4,
      fuel: 0.1,
    })
    render(StandingsTower, { snapshot: snap, metrics: { interval: true, pit: true, tire: true, fuel: true } })
    const row = rowFor('car-6')
    for (const cell of ['row-interval', 'row-pit', 'row-tire', 'row-fuel']) {
      expect(row.querySelector(`[data-testid="${cell}"]`), cell).not.toBeNull()
    }
    expect(row.lastElementChild?.getAttribute('data-testid')).toBe('row-finish')
  })

  it('changes no other text in the row', async () => {
    const view = render(StandingsTower, { snapshot: withVehicle('car-92', { finish_status: 0 }) })
    expect(finishOf('car-92')).toEqual(NONE)
    const plainText = rowFor('car-92').textContent
    await view.rerender({ snapshot: withVehicle('car-92', { finish_status: 2 }) })
    expect(finishOf('car-92')).toEqual(DNF)
    // The DNF chip adds its own text and nothing else changes.
    expect(rowFor('car-92').textContent.replace('DNF', '')).toBe(plainText)
    await view.rerender({ snapshot: finish })
    expect(finishOf('car-92')).toEqual(FINISHED)
    expect(rowFor('car-92').textContent).toBe(plainText)
    expect(rowFor('car-92').querySelector('[data-testid="row-gap"]').textContent.trim()).toBe('+24.871')
  })

  it('follows the latest snapshot with no hold', async () => {
    const view = render(StandingsTower, { snapshot: withVehicle('car-77', { finish_status: 0 }) })
    expect(finishOf('car-77')).toEqual(NONE)
    await view.rerender({ snapshot: withVehicle('car-77', { finish_status: 1 }) })
    expect(finishOf('car-77')).toEqual(FINISHED)
    await view.rerender({ snapshot: withVehicle('car-77', { finish_status: 0 }) })
    expect(finishOf('car-77')).toEqual(NONE)
  })

  it('combines with the on-camera highlight and the local-yellow edge', () => {
    render(StandingsTower, {
      snapshot: withVehicle('car-77', { finish_status: 1, yellow_involved: true }),
    })
    const row = rowFor('car-77')
    expect(finishOf('car-77')).toEqual(FINISHED)
    expect(row.getAttribute('data-oncam')).toBe('true')
    expect(row.classList.contains('row--oncam')).toBe(true)
    expect(row.getAttribute('data-yellow')).toBe('true')
  })

  it('marks rows in the grouped layout too', () => {
    render(StandingsTower, { snapshot: finish, classDisplay: 'grouped' })
    expect(finishOf('car-7')).toEqual(FINISHED)
    expect(finishOf('car-92')).toEqual(FINISHED)
    expect(finishOf('car-77')).toEqual(NONE)
    expect(finishOf('car-18')).toEqual(DNF)
  })

  it.each(['results', ' Race ', 'RESULTS'])('marks rows when the mode is %j', (mode) => {
    render(StandingsTower, { snapshot: { ...finish, mode } })
    expect(finishOf('car-6')).toEqual(FINISHED)
    expect(finishOf('car-18')).toEqual(DNF)
  })

  it.each(['qualifying', 'practice', 'grid', 'replay', 'warmup', ''])(
    'shows no finish chip when the mode is %j, whatever the field holds',
    async (mode) => {
      // Positive control: the same snapshot in a race marks car-6.
      const view = render(StandingsTower, { snapshot: finish })
      expect(finishOf('car-6')).toEqual(FINISHED)
      await view.rerender({ snapshot: { ...finish, mode } })
      for (const slot of SLOTS) expect(finishOf(slot)).toEqual(NONE)
    },
  )

  it.each([
    ['a green flag', (s) => (s.session = { ...s.session, flag: 'green' })],
    ['no session at all', (s) => delete s.session],
  ])('shows the chips under %s — a car can retire before the chequered flag', (_label, mutate) => {
    const snap = structuredClone(finish)
    mutate(snap)
    render(StandingsTower, { snapshot: snap })
    expect(finishOf('car-6')).toEqual(FINISHED)
    expect(finishOf('car-77')).toEqual(NONE)
    expect(finishOf('car-18')).toEqual(DNF)
  })

  it('reads only the car field — a chequered session flag alone marks nobody', async () => {
    const view = render(StandingsTower, { snapshot: finish })
    expect(finishOf('car-6')).toEqual(FINISHED)
    const noField = structuredClone(finish)
    for (const v of noField.vehicles) delete v.finish_status
    await view.rerender({ snapshot: noField })
    expect(noField.session.flag).toBe('checkered')
    for (const slot of SLOTS) expect(finishOf(slot)).toEqual(NONE)
  })
})
