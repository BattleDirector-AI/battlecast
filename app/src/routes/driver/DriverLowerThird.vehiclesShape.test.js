// The driver lower-third (#21), qualifying bar (#22) and on-board HUD identity strip (#26) when
// `vehicles` is not an array — protocol-contract.md rule 21, widgets.md rule 14a. The field is
// empty, so `subject.slot_id` resolves to nothing: a subject with a name degrades (#21 shows the
// name only, #22 and the strip fall idle / drop the vehicle-derived fields), without throwing.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import DriverLowerThird from './DriverLowerThird.svelte'
import QualifyingLowerThird from '../qualifying/QualifyingLowerThird.svelte'
import OnBoardHud, { resolveIdentity } from '../onboard/OnBoardHud.svelte'
import subjectB from '../../../../spec/v1/fixtures/driver-subject-b.json'
import qualSectorA from '../../../../spec/v1/fixtures/qualifying-sector-a.json'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const NON_ARRAYS = [
  ['an object', {}],
  ['a string', 'car-16'],
  ['null', null],
]
const q = (c, id) => c.querySelector(`[data-testid="${id}"]`)

describe.each(NON_ARRAYS)('vehicles is %s', (_l, junk) => {
  it('driver lower-third: a subject that resolves on clean data renders degraded (name only, no position)', async () => {
    const { container } = render(DriverLowerThird, { snapshot: { ...subjectB, vehicles: junk }, widget: {} })
    await tick()
    expect(q(container, 'driver-lower-third')).not.toBeNull()
    expect(q(container, 'driver-lt-name')?.textContent.trim()).toBe('C. Leclerc')
    expect(q(container, 'driver-lt-pos')).toBeNull()
  })

  it('qualifying bar: the subject does not resolve, so no bar', async () => {
    const { container } = render(QualifyingLowerThird, { snapshot: { ...qualSectorA, vehicles: junk }, widget: {} })
    await tick()
    expect(q(container, 'qualifying-lower-third')).toBeNull()
  })

  it('on-board HUD strip: shows the subject\'s name without the position or class', () => {
    const identity = resolveIdentity({ ...subjectB, vehicles: junk }, { driverInfo: { name: true, position: true, class: true } }, true)
    const { container } = render(OnBoardHud, { identity })
    expect(q(container, 'onboard-driver-name')?.textContent.trim()).toBe('C. Leclerc')
    expect(q(container, 'onboard-driver-position')).toBeNull()
    expect(q(container, 'onboard-driver-class')).toBeNull()
  })
})

// An array is not an object for rule 21, even though `typeof [] === 'object'`: an array that
// carries the subject's `slot_id` as a property is skipped, and resolution lands on the real entry.
describe('rule 21 — an array vehicles[] entry is skipped', () => {
  const ghost = (slot) =>
    Object.assign([], { slot_id: slot, driver_name: 'Ghost Array', position: 9, vehicle_class: 'ZZ' })

  it('driver lower-third: shows the real vehicle, not the array', async () => {
    const snap = structuredClone(subjectB)
    snap.vehicles = [ghost(snap.subject.slot_id), ...snap.vehicles]
    const { container } = render(DriverLowerThird, { snapshot: snap, widget: {} })
    await tick()
    expect(q(container, 'driver-lt-pos')?.textContent.trim()).toBe('P3')
    expect(container.textContent).not.toContain('Ghost')
  })

  it('on-board HUD strip: shows the real position and class, not the array\'s', () => {
    const snap = structuredClone(subjectB)
    snap.vehicles = [ghost(snap.subject.slot_id), ...snap.vehicles]
    const identity = resolveIdentity(snap, { driverInfo: { name: true, position: true, class: true } }, true)
    const { container } = render(OnBoardHud, { identity })
    expect(q(container, 'onboard-driver-position')?.textContent.trim()).toBe('P3')
    expect(q(container, 'onboard-driver-class')?.textContent).toContain('GTP')
    expect(container.textContent).not.toContain('ZZ')
  })
})
