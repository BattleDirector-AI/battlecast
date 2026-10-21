// /all when a `vehicles[]` entry is an object but incomplete — protocol-contract.md rule 21,
// widgets.md rules 14a, 59 and 66. Such an entry must not take down the composed canvas, is not a
// tower row, and never resolves the subject. Driven from race-onboard-telemetry.json (car-44
// Hamilton P1, car-1 Verstappen P2, car-16 Leclerc P3; subject car-1 Verstappen).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import onboard from '../../../../spec/v1/fixtures/race-onboard-telemetry.json'

afterEach(() => cleanup())

const q = (el, id) => el?.querySelector(`[data-testid="${id}"]`) ?? null
const slots = (c) => Array.from(c.querySelectorAll('[data-widget]')).map((el) => el.getAttribute('data-widget'))
const names = (c) =>
  Array.from(c.querySelectorAll('[data-testid="driver-name"]')).map((el) => el.textContent.trim())
const DWELL = normalizeConfig({ widgets: { driver: { trigger: 'dwell' } } })

const car = (over) => ({ driver_name: 'Ghost', vehicle_class: 'F1', ...over })
const INCOMPLETE = [
  ['an empty object', {}],
  ['a missing slot_id', car({ position: 4 })],
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
describe('/all — an incomplete vehicles[] entry', () => {
  it.each(INCOMPLETE)('renders the same widgets and content as the clean snapshot with %s', async (_l, junk) => {
    const [a, b, c] = three(junk)
    const clean = render(AllView, { snapshot: onboard, config: DWELL })
    await tick()
    const expectedSlots = slots(clean.container)
    cleanup()

    const { container } = render(AllView, {
      snapshot: { ...onboard, vehicles: [a, ...onboard.vehicles, b, c] },
      config: DWELL,
    })
    await tick()

    expect(slots(container)).toEqual(expectedSlots)
    expect(expectedSlots).toEqual(expect.arrayContaining(['tower', 'battle', 'driver', 'onboard']))
    expect(names(container).slice(0, 3)).toEqual(['HAM', 'VER', 'LEC'])
    expect(Array.from(container.querySelectorAll('[data-testid="tower-row"]'))).toHaveLength(3)
    expect(q(container, 'driver-lt-name')?.textContent.trim()).toBe('Verstappen')
    expect(q(container, 'widget-battle')?.textContent).toContain('Verstappen')
  })

  // Subject resolution needs only a usable slot_id (rule 14a): an entry with no usable position
  // still resolves the subject; rules 18 and 54 then show no position and render the rest.
  it.each([
    ['null', null],
    ['a string', '3'],
    ['absent', undefined],
  ])('a subject matching an entry whose position is %s: the card shows class and number, no position', async (_l, position) => {
    const snap = {
      ...onboard,
      subject: { ...onboard.subject, slot_id: 'p-bad' },
      vehicles: [...onboard.vehicles, car({ slot_id: 'p-bad', driver_name: 'Entry Name', car_number: '77', position })],
    }
    const { container } = render(AllView, { snapshot: snap, config: DWELL })
    await tick()

    const card = q(container, 'driver-lower-third')
    expect(card, 'the card renders').not.toBeNull()
    expect(card.textContent).toContain('F1')
    expect(q(container, 'driver-lt-pos')).toBeNull()
    expect(q(container, 'driver-lt-name')?.textContent.trim()).toBe('Verstappen')
    // The entry is still not a tower row.
    expect(Array.from(container.querySelectorAll('[data-testid="tower-row"]'))).toHaveLength(3)
  })

  it('a nameless subject matching an entry with no position takes the entry name', async () => {
    const snap = {
      ...onboard,
      subject: { slot_id: 'p-bad', telemetry: onboard.subject.telemetry },
      vehicles: [...onboard.vehicles, car({ slot_id: 'p-bad', driver_name: 'Entry Name', position: null })],
    }
    const { container } = render(AllView, { snapshot: snap, config: DWELL })
    await tick()

    expect(q(container, 'driver-lt-name')?.textContent.trim()).toBe('E. Name')
    expect(q(container, 'driver-lt-pos')).toBeNull()
  })

  // Rule 14a: a slot_id that is not a usable string never matches. The subject and the entry carry
  // the same numeric 7 (or the same ''), yet the entry does not resolve the subject: the card is
  // name-only, with no class chip.
  it.each([
    ['numeric 7', 7],
    ['empty string', ''],
  ])('a subject and an entry that share the unusable slot_id %s do not match: name-only card', async (_l, id) => {
    const snap = {
      ...onboard,
      subject: { slot_id: id, driver_name: 'Named Driver', telemetry: onboard.subject.telemetry },
      vehicles: [...onboard.vehicles, car({ slot_id: id, driver_name: 'Entry Name', position: 4 })],
    }
    const { container } = render(AllView, { snapshot: snap, config: DWELL })
    await tick()

    expect(q(container, 'driver-lt-name')?.textContent.trim()).toBe('N. Driver')
    expect(q(container, 'driver-lower-third')?.textContent).not.toContain('F1')
    expect(q(container, 'driver-lt-pos')).toBeNull()
  })
})
