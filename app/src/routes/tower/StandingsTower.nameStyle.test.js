/* Tower driver name style — widgets.md rules 46-48, ADR 0018.
 *
 * Drives the bare component with an explicit `nameStyle` prop (the bare default is 'short',
 * asserted below; the routes pass the config value and are covered in
 * AllView.nameStyle.test.js and TowerPage.nameStyle.test.js).
 *
 * The fixtures' driver names are mostly single surnames, so the multi-word, hyphenated and
 * punctuated cases are the grid-multiclass fixture with its names swapped per slot. Every
 * other field, including order and classes, is the fixture's own.
 *
 * Full-style width (rule 48) is covered in StandingsTower.nameWidth.test.js.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'

afterEach(() => cleanup())

/** grid-multiclass with each slot's driver_name replaced. */
function withNames(names) {
  return {
    ...multiClass,
    vehicles: multiClass.vehicles.map((v) =>
      Object.prototype.hasOwnProperty.call(names, v.slot_id) ? { ...v, driver_name: names[v.slot_id] } : v,
    ),
  }
}

const nameOf = (slotId) =>
  document
    .querySelector(`[data-testid="tower-row"][data-slot="${slotId}"] [data-testid="driver-name"]`)
    ?.textContent.trim()

const renderedNames = () =>
  Array.from(document.querySelectorAll('[data-testid="driver-name"]')).map((el) => el.textContent.trim())

const tower = () => document.querySelector('[data-testid="standings-tower"]')

// Fixture order: car-1 P1 GTP, car-14 P2 GT3, car-44 P3 GTP, car-8 P4 LMP2, car-23 P5 GT3,
// car-31 P6 LMP2.
const NAMES = {
  'car-1': 'Erik Jacobs',
  'car-14': 'Tsunoda',
  'car-44': 'Nyck de Vries',
  'car-8': 'Jean-Eric Vergne',
  'car-23': 'Bo',
  'car-31': 'Erik Li',
}
const SHORT = {
  'car-1': 'E.JAC',
  'car-14': 'TSU',
  'car-44': 'N.DEV',
  'car-8': 'J.VER',
  'car-23': 'BO',
  'car-31': 'E.LI',
}
const FULL = {
  'car-1': 'E. Jacobs',
  'car-14': 'Tsunoda',
  'car-44': 'N. de Vries',
  'car-8': 'J. Vergne',
  'car-23': 'Bo',
  'car-31': 'E. Li',
}

describe('StandingsTower — short names (rules 46-47)', () => {
  it.each(['inline', 'grouped'])('renders every row short in the %s layout', (classDisplay) => {
    render(StandingsTower, { snapshot: withNames(NAMES), nameStyle: 'short', classDisplay })
    for (const [slot, expected] of Object.entries(SHORT)) expect(nameOf(slot), slot).toBe(expected)
    expect(tower().getAttribute('data-name-style')).toBe('short')
  })

  it('keeps the running order and the class badges exactly as in full style', () => {
    const snapshot = withNames(NAMES)
    render(StandingsTower, { snapshot, nameStyle: 'full' })
    const badges = () =>
      Array.from(document.querySelectorAll('[data-testid="class-pos"]')).map((el) => el.textContent.trim())
    const fullBadges = badges()
    cleanup()

    render(StandingsTower, { snapshot, nameStyle: 'short' })
    expect(renderedNames()).toEqual(['E.JAC', 'TSU', 'N.DEV', 'J.VER', 'BO', 'E.LI'])
    expect(badges()).toEqual(fullBadges)
  })

  it('pins the edge cases: case, punctuation, other scripts, digits, and names already holding "."', () => {
    const cases = {
      'car-1': ['erik jacobs', 'E.JAC'],
      'car-14': ["Pato O'Ward", 'P.OWA'],
      'car-44': ['Sébastien Buemi', 'S.BUE'],
      'car-8': ['J.R. Hildebrand', 'J.HIL'],
      'car-23': ['E.Jacobs', 'E.JAC'],
      'car-31': ['D7', 'D7'],
    }
    render(StandingsTower, {
      snapshot: withNames(Object.fromEntries(Object.entries(cases).map(([s, [n]]) => [s, n]))),
      nameStyle: 'short',
    })
    for (const [slot, [input, expected]] of Object.entries(cases)) {
      expect(nameOf(slot), `${input} -> ${expected}`).toBe(expected)
    }
  })

  it('reads an already-abbreviated name as initial + last name, and drops hyphens inside the last name', () => {
    render(StandingsTower, {
      snapshot: withNames({
        'car-1': 'E. Jacobs',
        'car-14': 'E.JAC',
        'car-44': 'Tsunoda.',
        'car-8': '-',
        'car-23': 'Ana Le-Roux',
        'car-31': 'Kimi Räikkönen',
      }),
      nameStyle: 'short',
    })
    expect(nameOf('car-1')).toBe('E.JAC')
    expect(nameOf('car-14')).toBe('E.JAC')
    expect(nameOf('car-44')).toBe('TSU')
    // Nothing but punctuation: no words left, so the cell is empty.
    expect(nameOf('car-8')).toBe('')
    // A hyphen inside the last name is dropped before the three letters are taken.
    expect(nameOf('car-23')).toBe('A.LER')
    // Letters of any script are letters, and uppercase.
    expect(nameOf('car-31')).toBe('K.RÄI')
  })

  it('renders an empty name cell for an empty or whitespace-only name, and the row otherwise as usual', () => {
    render(StandingsTower, {
      snapshot: withNames({ 'car-1': '', 'car-14': '   ' }),
      nameStyle: 'short',
    })
    expect(nameOf('car-1')).toBe('')
    expect(nameOf('car-14')).toBe('')
    // The rows are still there, in order, with their positions.
    const positions = Array.from(document.querySelectorAll('[data-testid="tower-row"] .row__pos')).map((el) =>
      el.textContent.trim(),
    )
    expect(positions).toEqual(['1', '2', '3', '4', '5', '6'])
    // The untouched fixture names around them are still short.
    expect(nameOf('car-44')).toBe('HAM')
    expect(nameOf('car-8')).toBe('ROS')
  })

  it('shortens the fixture names a producer actually sends (one-word surnames)', () => {
    render(StandingsTower, { snapshot: multiClass, nameStyle: 'short' })
    expect(renderedNames()).toEqual(['VER', 'ALO', 'HAM', 'ROS', 'ALB', 'BOU'])
  })
})

describe('StandingsTower — full names (rule 48)', () => {
  it.each(['inline', 'grouped'])('renders every row in the full format in the %s layout', (classDisplay) => {
    render(StandingsTower, { snapshot: withNames(NAMES), nameStyle: 'full', classDisplay })
    for (const [slot, expected] of Object.entries(FULL)) expect(nameOf(slot), slot).toBe(expected)
    expect(tower().getAttribute('data-name-style')).toBe('full')
  })

  it('shows a name that already contains "." exactly as sent', () => {
    render(StandingsTower, {
      snapshot: withNames({ 'car-1': 'J.R. Hildebrand', 'car-14': 'E.JAC' }),
      nameStyle: 'full',
    })
    expect(nameOf('car-1')).toBe('J.R. Hildebrand')
    expect(nameOf('car-14')).toBe('E.JAC')
  })
})

describe('StandingsTower — name style defaults and odd input (rules 46-48)', () => {
  it('renders short names when no nameStyle is passed', () => {
    render(StandingsTower, { snapshot: multiClass })
    expect(renderedNames()).toEqual(['VER', 'ALO', 'HAM', 'ROS', 'ALB', 'BOU'])
    expect(tower().getAttribute('data-name-style')).toBe('short')
  })

  it('handles other scripts, a punctuated first word, decomposed accents, ß and astral letters', () => {
    const cases = {
      'car-1': ['Виталий Петров', 'В.ПЕТ'],
      'car-14': ['(Erik) Jacobs', 'E.JAC'],
      // "Räikkönen" sent decomposed: a + U+0308, o + U+0308. NFC first, so the umlauts stay.
      'car-44': ['Kimi Räikkönen', 'K.RÄI'],
      // Three code points are taken, then uppercased: ß -> SS lengthens the code.
      'car-8': ['Jan Aßmann', 'J.ASSM'],
      // An astral letter (U+1D4D9) is one code point, never split into UTF-16 halves.
      'car-23': ['Erik \u{1D4D9}acobs', 'E.\u{1D4D9}AC'],
      'car-31': ['Sergio Pérez', 'S.PÉR'],
    }
    render(StandingsTower, {
      snapshot: withNames(Object.fromEntries(Object.entries(cases).map(([s, [n]]) => [s, n]))),
      nameStyle: 'short',
    })
    for (const [slot, [input, expected]] of Object.entries(cases)) {
      expect(nameOf(slot), `${input} -> ${expected}`).toBe(expected)
    }
  })

  it.each(['short', 'full'])('renders a non-string driver_name as an empty cell in %s style', (nameStyle) => {
    render(StandingsTower, { snapshot: withNames({ 'car-1': 44, 'car-14': null }), nameStyle })
    expect(nameOf('car-1')).toBe('')
    expect(nameOf('car-14')).toBe('')
  })
})
