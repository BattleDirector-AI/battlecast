import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import localYellow from '../../../../spec/v1/fixtures/race-local-yellow.json'

afterEach(() => cleanup())

// Cars involved in a local yellow (widgets.md rule 43, ADR 0016). The producer flags each
// involved car with `yellow_involved: true`; the tower puts a yellow edge on that row and
// never works out involvement itself.
//
// race-local-yellow.json (session: S2 yellow, flag "yellow", no FCY/SC; subject car-1):
//   P1 car-44 Hamilton    — no yellow_involved field
//   P2 car-1  Verstappen  — no yellow_involved field (on camera)
//   P3 car-16 Leclerc     — yellow_involved: true
//   P4 car-4  Norris      — yellow_involved: false

const rowFor = (slot) =>
  document.querySelector(`[data-testid="tower-row"][data-slot="${slot}"]`)
const isMarked = (slot) => {
  const row = rowFor(slot)
  return {
    attr: row?.getAttribute('data-yellow') ?? null,
    edge: row?.querySelector('[data-testid="row-yellow-edge"]') != null,
  }
}
const MARKED = { attr: 'true', edge: true }
const UNMARKED = { attr: null, edge: false }

function withVehicle(slot, patch, base = localYellow) {
  const snap = structuredClone(base)
  Object.assign(
    snap.vehicles.find((v) => v.slot_id === slot),
    patch,
  )
  return snap
}

describe('StandingsTower local yellow — row mark (rule 43)', () => {
  it('marks exactly the involved row', () => {
    render(StandingsTower, { snapshot: localYellow })
    expect(isMarked('car-16')).toEqual(MARKED)
    expect(isMarked('car-44')).toEqual(UNMARKED)
    expect(isMarked('car-1')).toEqual(UNMARKED)
    expect(isMarked('car-4')).toEqual(UNMARKED)
  })

  it.each([
    ['the string "true"', 'true'],
    ['the number 1', 1],
    ['null', null],
  ])('only exactly true marks a row — %s does not', (_label, value) => {
    // car-16 stays true in the same render, so this fails if the mark never renders.
    render(StandingsTower, { snapshot: withVehicle('car-4', { yellow_involved: value }) })
    expect(isMarked('car-16')).toEqual(MARKED)
    expect(isMarked('car-4')).toEqual(UNMARKED)
  })

  it('keeps the class bar and the row text on a marked row', () => {
    render(StandingsTower, { snapshot: localYellow, nameStyle: 'full' })
    const row = rowFor('car-16')
    expect(isMarked('car-16')).toEqual(MARKED)
    expect(row.querySelector('.row__classbar')).not.toBeNull()
    expect(row.querySelector('[data-testid="driver-name"]').textContent.trim().toUpperCase()).toContain('LECLERC')
    expect(row.querySelector('[data-testid="row-gap"]').textContent.trim()).toBe('+2.200')
  })

  it('changes no text in the row', async () => {
    const view = render(StandingsTower, { snapshot: withVehicle('car-16', { yellow_involved: false }) })
    expect(isMarked('car-16')).toEqual(UNMARKED)
    const plainText = rowFor('car-16').textContent
    await view.rerender({ snapshot: localYellow })
    expect(isMarked('car-16')).toEqual(MARKED)
    expect(rowFor('car-16').textContent).toBe(plainText)
  })

  it('combines with the on-camera highlight instead of replacing it', () => {
    render(StandingsTower, { snapshot: withVehicle('car-1', { yellow_involved: true }) })
    const row = rowFor('car-1')
    expect(isMarked('car-1')).toEqual(MARKED)
    expect(row.getAttribute('data-oncam')).toBe('true')
    expect(row.getAttribute('aria-current')).toBe('true')
    // The highlight itself, not just its attributes: the on-camera styling and its flash overlay.
    expect(row.classList.contains('row--oncam')).toBe(true)
    expect(row.querySelector('[data-testid="row-oncam-flash"]')).not.toBeNull()
  })

  it('keeps the class bar its class colour on a marked row', async () => {
    const view = render(StandingsTower, { snapshot: withVehicle('car-16', { yellow_involved: false }) })
    const before = rowFor('car-16').querySelector('.row__classbar').style.background
    expect(before).not.toBe('')
    await view.rerender({ snapshot: localYellow })
    expect(isMarked('car-16')).toEqual(MARKED)
    expect(rowFor('car-16').querySelector('.row__classbar').style.background).toBe(before)
  })

  it('clears the mark as soon as a snapshot stops sending true (no hold)', async () => {
    const view = render(StandingsTower, { snapshot: localYellow })
    expect(isMarked('car-16')).toEqual(MARKED)
    await view.rerender({ snapshot: withVehicle('car-16', { yellow_involved: false }) })
    expect(isMarked('car-16')).toEqual(UNMARKED)
    await view.rerender({ snapshot: localYellow })
    expect(isMarked('car-16')).toEqual(MARKED)
    const absent = structuredClone(localYellow)
    delete absent.vehicles.find((v) => v.slot_id === 'car-16').yellow_involved
    await view.rerender({ snapshot: absent })
    expect(isMarked('car-16')).toEqual(UNMARKED)
  })

  it('marks the row in the grouped layout too', () => {
    render(StandingsTower, { snapshot: localYellow, classDisplay: 'grouped' })
    expect(isMarked('car-16')).toEqual(MARKED)
    expect(isMarked('car-4')).toEqual(UNMARKED)
  })

  it('marks the row in a lap-timed session too', () => {
    render(StandingsTower, { snapshot: { ...localYellow, mode: 'qualifying' } })
    expect(isMarked('car-16')).toEqual(MARKED)
  })

  it('reads only the car field — no sector flags needed, and a yellow sector marks nobody', async () => {
    const noSectors = structuredClone(localYellow)
    delete noSectors.session.sector_flags
    const view = render(StandingsTower, { snapshot: noSectors })
    expect(isMarked('car-16')).toEqual(MARKED)

    const noneInvolved = withVehicle('car-16', { yellow_involved: false })
    noneInvolved.session.sector_flags = ['yellow', 'yellow', 'yellow']
    await view.rerender({ snapshot: noneInvolved })
    for (const slot of ['car-44', 'car-1', 'car-16', 'car-4']) {
      expect(isMarked(slot)).toEqual(UNMARKED)
    }
  })
})
