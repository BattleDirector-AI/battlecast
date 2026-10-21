// The battle box's on-camera name — widgets.md rule 65, which applies rule 14b's name pick to
// the focus slot and the idle line. Driven from race-close-battle.json (subject car-1
// Verstappen, P2, with Hamilton ahead and Leclerc behind) and race-idle-battle.json (subject
// car-14 Alonso, alone), with the subject's and the vehicle's names varied inside each test.
// Assertions read the rendered focus slot and idle line.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import BattleBox from './BattleBox.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
import idleBattle from '../../../../spec/v1/fixtures/race-idle-battle.json'

afterEach(() => cleanup())

/** The fixture with the subject's `driver_name` replaced (`undefined` removes the key) and,
 *  when a third argument is passed, the matched vehicle's `driver_name` replaced (`undefined` removes it). */
function named(fixture, subjectName, vehicleName) {
  const snap = structuredClone(fixture)
  if (subjectName === undefined) delete snap.subject.driver_name
  else snap.subject.driver_name = subjectName
  if (arguments.length > 2) {
    const v = snap.vehicles.find((x) => x.slot_id === snap.subject.slot_id)
    if (vehicleName === undefined) delete v.driver_name
    else v.driver_name = vehicleName
  }
  return snap
}

function renderBox(snap) {
  return render(BattleBox, {
    props: {
      subject: snap.subject,
      relationship: snap.relationship,
      vehicles: snap.vehicles,
      mode: snap.mode,
    },
  }).container
}

const focus = (c) => c.querySelector('.bc-battle__focus-name')?.textContent.trim()
const slotName = (c, which) =>
  c.querySelector(`.bc-battle__slot--${which} .bc-battle__slot-name`)?.textContent.trim()
const idleSub = (c) => c.querySelector('.bc-battle__idle-sub')?.textContent.trim()

const MISSING = [
  ['an empty string', ''],
  ['a whitespace-only string', '   '],
  ['null', null],
  ['absent', undefined],
  ['a number', 42],
  ['an object', {}],
]

describe('rule 65 — the focus slot shows the matched vehicle\'s name when the subject\'s is missing', () => {
  it.each(MISSING)('subject.driver_name is %s: the focus slot shows the vehicle\'s name', (_l, bad) => {
    const c = renderBox(named(closeBattle, bad, ' Max Verstappen '))

    expect(focus(c)).toBe('M. Verstappen')
  })

  it('a present subject.driver_name wins over the vehicle\'s', () => {
    const c = renderBox(named(closeBattle, 'Carlos Sainz', 'Max Verstappen'))

    expect(focus(c)).toBe('C. Sainz')
  })

  it.each(MISSING.flatMap(([l, bad]) => MISSING.map(([vl, vbad]) => [l, bad, vl, vbad])))('subject.driver_name is %s and the vehicle\'s is %s: the focus slot is empty, the battle still renders', (_l, bad, _vl, vbad) => {
    const c = renderBox(named(closeBattle, bad, vbad))

    expect(focus(c)).toBe('')
    expect(c.textContent).toContain('CLOSING')
    expect(c.textContent).toContain('+0.4')
    expect(slotName(c, 'ahead')).toBe('Hamilton')
    expect(slotName(c, 'behind')).toBe('Leclerc')
  })

  it('an unresolved slot_id with a present subject.driver_name shows that name', () => {
    const snap = named(closeBattle, 'Max Verstappen')
    snap.subject.slot_id = 'ghost-1'

    expect(focus(renderBox(snap))).toBe('M. Verstappen')
  })
})

describe('rule 65 — a subject with no slot_id matches no vehicle', () => {
  it('does not pick up the name of a vehicle that also lacks a slot_id (focus slot)', () => {
    const snap = named(closeBattle, undefined)
    delete snap.subject.slot_id
    snap.vehicles.push({ driver_name: 'Stranger Danger', position: 9 })
    const c = renderBox(snap)

    expect(focus(c)).toBe('')
    expect(c.textContent).not.toContain('Danger')
  })

  it('does not pick up the name of a vehicle that also lacks a slot_id (idle line)', () => {
    const snap = named(idleBattle, undefined)
    delete snap.subject.slot_id
    snap.vehicles.push({ driver_name: 'Stranger Danger', position: 9 })

    expect(idleSub(renderBox(snap))).toBe('CLEAR AIR — ON-CAMERA CAR')
  })
})

describe('rule 65 — the idle line shows the same name', () => {
  it.each(MISSING)('subject.driver_name is %s: the idle line shows the vehicle\'s name', (_l, bad) => {
    const c = renderBox(named(idleBattle, bad, 'Fernando Alonso'))

    expect(idleSub(c)).toBe('CLEAR AIR — F. Alonso')
  })

  it('a present subject.driver_name wins over the vehicle\'s', () => {
    const c = renderBox(named(idleBattle, 'Lance Stroll', 'Fernando Alonso'))

    expect(idleSub(c)).toBe('CLEAR AIR — L. Stroll')
  })

  it.each(MISSING.flatMap(([l, bad]) => MISSING.map(([vl, vbad]) => [l, bad, vl, vbad])))('subject.driver_name is %s and the vehicle\'s is %s: the idle line reads ON-CAMERA CAR', (_l, bad, _vl, vbad) => {
    const c = renderBox(named(idleBattle, bad, vbad))

    expect(idleSub(c)).toBe('CLEAR AIR — ON-CAMERA CAR')
  })
})

describe('rule 65 — the ahead and behind names are not the subject\'s name', () => {
  it('a blank subject.driver_name leaves the ahead and behind slots as the vehicles name them', () => {
    const c = renderBox(named(closeBattle, '', 'Max Verstappen'))

    expect(slotName(c, 'ahead')).toBe('Hamilton')
    expect(slotName(c, 'behind')).toBe('Leclerc')
  })
})
