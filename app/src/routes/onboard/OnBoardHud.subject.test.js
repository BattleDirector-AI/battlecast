// The on-board HUD identity strip's subject resolution on malformed producer data —
// widgets.md rules 57, 14a (non-object `vehicles[]` entries are skipped) and 14b (which name the
// strip shows; a blank name counts as missing). The strip is resolved with resolveIdentity() from
// a spec/v1 fixture (varied inside the test) and rendered, and the assertions read the strip.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import OnBoardHud, { resolveIdentity } from './OnBoardHud.svelte'
import subjectB from '../../../../spec/v1/fixtures/driver-subject-b.json'
import degraded from '../../../../spec/v1/fixtures/driver-degraded.json'

afterEach(() => cleanup())

const WIDGET = { driverInfo: { name: true, position: true, class: true } }
const q = (c, id) => c.querySelector(`[data-testid="${id}"]`)

function renderStrip(snapshot) {
  return render(OnBoardHud, { identity: resolveIdentity(snapshot, WIDGET, true) }).container
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

describe('rule 14a — non-object vehicles[] entries are skipped by the strip', () => {
  it('a valid subject shows its full strip when vehicles[] holds null, a number and a string', () => {
    const snap = { ...subjectB, vehicles: [null, 7, 'car-16', ...subjectB.vehicles, null] }
    const container = renderStrip(snap)

    expect(q(container, 'onboard-label')?.textContent.trim()).toBe('ON BOARD')
    expect(q(container, 'onboard-driver-name')?.textContent.trim()).toBe('C. Leclerc')
    expect(q(container, 'onboard-driver-position')?.textContent.trim()).toBe('P3')
    expect(q(container, 'onboard-driver-class')?.textContent).toContain('GTP')
  })
})

describe('rule 14b — the name the strip shows', () => {
  it('a present subject.driver_name wins over the vehicle\'s driver_name', () => {
    const container = renderStrip(subjectBNamed('Arthur Leclerc'))
    expect(q(container, 'onboard-driver-name')?.textContent.trim()).toBe('A. Leclerc')
  })

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
  ])('a subject.driver_name that is %s falls back to the vehicle\'s driver_name', (_label, blank) => {
    const container = renderStrip(subjectBNamed(blank))

    expect(q(container, 'onboard-driver-name')?.textContent.trim()).toBe('C. Leclerc')
    expect(q(container, 'onboard-driver-position')?.textContent.trim()).toBe('P3')
  })

  it('with both names blank the strip shows its other fields and no name', () => {
    const container = renderStrip(subjectBNamed(' ', ''))

    expect(q(container, 'onboard-label')?.textContent.trim()).toBe('ON BOARD')
    expect(q(container, 'onboard-driver-position')?.textContent.trim()).toBe('P3')
    expect(q(container, 'onboard-driver-name')).toBeNull()
  })

  it.each([
    ['empty', ''],
    ['whitespace-only', ' \t '],
  ])('an unresolved slot_id with a subject.driver_name that is %s has no strip', (_label, blank) => {
    const snap = { ...degraded, subject: { ...degraded.subject, driver_name: blank } }
    const container = renderStrip(snap)

    expect(q(container, 'onboard-identity')).toBeNull()
    expect(q(container, 'onboard-label')).toBeNull()
  })
})
