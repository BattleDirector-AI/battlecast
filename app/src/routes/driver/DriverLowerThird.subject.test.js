// The driver lower-third's (#21) subject resolution on malformed producer data —
// widgets.md rules 14, 14a (non-object `vehicles[]` entries are skipped) and 14b (which name
// the card shows, and a blank name counts as missing). Every test drives the card from a
// spec/v1 fixture, varied inside the test, and asserts what the card renders.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import DriverLowerThird, { isDriverSubjectIdle } from './DriverLowerThird.svelte'
import subjectA from '../../../../spec/v1/fixtures/driver-subject-a.json'
import subjectB from '../../../../spec/v1/fixtures/driver-subject-b.json'
import degraded from '../../../../spec/v1/fixtures/driver-degraded.json'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const card = (c) => c.querySelector('[data-testid="driver-lower-third"]')
const nameOf = (c) => c.querySelector('[data-testid="driver-lt-name"]')?.textContent.trim()
const posOf = (c) => c.querySelector('[data-testid="driver-lt-pos"]')?.textContent.trim()

async function renderCard(snapshot) {
  const r = render(DriverLowerThird, { snapshot, widget: {} })
  await tick()
  return r.container
}

/** subject-b (car-16 "Charles Leclerc", P3, gtp) with its subject's name replaced. */
function subjectBNamed(subjectName, vehicleName) {
  const snap = structuredClone(subjectB)
  snap.subject.driver_name = subjectName
  if (vehicleName !== undefined) {
    snap.vehicles.find((v) => v.slot_id === snap.subject.slot_id).driver_name = vehicleName
  }
  return snap
}

describe('rule 14a — non-object vehicles[] entries are skipped', () => {
  it.each([
    ['null', null],
    ['a number', 7],
    ['a string', 'car-44'],
  ])('a valid subject still renders its full card when vehicles[] holds %s', async (_label, junk) => {
    // The junk entry sits first, before the subject's own vehicle (car-44, Hamilton, P1, GT3).
    const snap = { ...subjectA, vehicles: [junk, ...subjectA.vehicles, junk] }
    const container = await renderCard(snap)

    expect(card(container)?.getAttribute('data-state')).toBe('valid')
    expect(nameOf(container)).toBe('Hamilton')
    expect(posOf(container)).toBe('P1')
    expect(container.textContent).toContain('GT3')
  })

  it('a degraded subject still degrades, not throws, when vehicles[] holds null entries', async () => {
    // driver-degraded: subject ghost-7 "Oscar Piastri" matches no vehicle; nulls at both ends.
    const snap = { ...degraded, vehicles: [null, ...degraded.vehicles, null] }
    const container = await renderCard(snap)

    expect(card(container)?.getAttribute('data-state')).toBe('degraded')
    expect(nameOf(container)).toBe('O. Piastri')
    expect(container.querySelector('[data-testid="driver-lt-pos"]')).toBeNull()
  })

  it('the idle predicate answers instead of throwing', () => {
    expect(isDriverSubjectIdle({ ...subjectA, vehicles: [null, ...subjectA.vehicles] })).toBe(false)
    expect(isDriverSubjectIdle({ ...degraded, vehicles: [null, ...degraded.vehicles] })).toBe(false)
  })
})

describe('rule 14b — the name the card shows', () => {
  it('a present subject.driver_name wins over the vehicle\'s driver_name', async () => {
    const container = await renderCard(subjectBNamed('Arthur Leclerc'))
    expect(nameOf(container)).toBe('A. Leclerc')
  })

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
    ['null', null],
    ['a number', 42],
  ])('a subject.driver_name that is %s falls back to the vehicle\'s driver_name', async (_label, blank) => {
    const container = await renderCard(subjectBNamed(blank))

    expect(card(container)?.getAttribute('data-state')).toBe('valid')
    expect(nameOf(container)).toBe('C. Leclerc')
    expect(posOf(container)).toBe('P3')
  })

  // The 42 row is the one that pins the vehicle-side presentName: fmtName trims whitespace,
  // so '  ' renders as no name even with a loosened check.
  it.each([
    ['empty', ''],
    ['whitespace-only', '  '],
    ['a number', 42],
    ['an object', {}],
  ])('a valid subject with a blank subject name and the vehicle name %s still renders its position and class, with no name', async (_label, vehicleName) => {
    const container = await renderCard(subjectBNamed('  ', vehicleName))

    expect(card(container)?.getAttribute('data-state')).toBe('valid')
    expect(posOf(container)).toBe('P3')
    expect(container.textContent).toContain('GTP')
    expect(nameOf(container)).toBe('')
  })

  it.each([
    ['empty', ''],
    ['whitespace-only', ' \t '],
    ['a number', 42],
  ])('an unresolved slot_id with a subject.driver_name that is %s is invalid: no card', async (_label, blank) => {
    const snap = { ...degraded, subject: { ...degraded.subject, driver_name: blank } }
    const container = await renderCard(snap)

    expect(card(container)).toBeNull()
    expect(isDriverSubjectIdle(snap)).toBe(true)
  })
})
