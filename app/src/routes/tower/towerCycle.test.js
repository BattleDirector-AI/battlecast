/* Spec-first failing tests for the standings-tower overflow selection + cycling
 * logic (.ai/spec/what/tower-overflow.md, ADR 0003). The module under test —
 * ./towerCycle.js — does NOT exist yet; these tests encode the behavioral spec
 * and are expected to fail (red) until the feature is implemented against them.
 *
 * Scope note: the MEASURED row budget and the CSS clamp need real layout, which
 * happy-dom does not do (see the spec's Constraints + the #118 clamp). These tests
 * cover the pure selection/stability logic; `computeRowBudget` is tested as pure
 * arithmetic (the caller supplies the measured heights). */

import { describe, it, expect } from 'vitest'
import {
  MIN_PER_PAGE_SECONDS,
  computeRowBudget,
  clampPerPageSeconds,
  selectPins,
  selectRows,
  createTowerCycle,
} from './towerCycle.js'

// --- helpers ---------------------------------------------------------------

/** Build a vehicle. */
function car(position, slot_id, vehicle_class = 'GTP') {
  return { position, slot_id, driver_name: slot_id, vehicle_class }
}

/** A 6-car, 3-class field in position order: GTP P1-2, GT3 P3-4, LMP2 P5-6. */
function field6() {
  return [
    car(1, 'car-1', 'GTP'),
    car(2, 'car-2', 'GTP'),
    car(3, 'car-3', 'GT3'),
    car(4, 'car-4', 'GT3'),
    car(5, 'car-5', 'LMP2'),
    car(6, 'car-6', 'LMP2'),
  ]
}

const slots = (rows) => rows.map((v) => v.slot_id)

function snapshot(vehicles, subjectSlotId = null, mode = 'race') {
  return {
    mode,
    vehicles,
    subject: subjectSlotId ? { slot_id: subjectSlotId, driver_name: subjectSlotId } : {},
    relationship: {},
  }
}

// --- row budget (spec rules 3–4) -------------------------------------------

describe('computeRowBudget', () => {
  it('is floor((slotHeight - headerHeight) / rowHeight)', () => {
    // (400 - 38) / 44 = 8.22 -> 8
    expect(computeRowBudget(400, 38, 44)).toBe(8)
  })

  it('returns 0 (header only) when nothing fits', () => {
    expect(computeRowBudget(40, 38, 44)).toBe(0)
  })

  it('never goes negative', () => {
    expect(computeRowBudget(0, 38, 44)).toBe(0)
  })
})

// --- perPageSeconds floor (spec rule 16) -----------------------------------

describe('clampPerPageSeconds', () => {
  it('floors at 4 seconds', () => {
    expect(MIN_PER_PAGE_SECONDS).toBe(4)
    expect(clampPerPageSeconds(1)).toBe(4)
    expect(clampPerPageSeconds(4)).toBe(4)
  })

  it('passes through a sane value', () => {
    expect(clampPerPageSeconds(8)).toBe(8)
  })
})

// --- pins (spec rule 6) ----------------------------------------------------

describe('selectPins', () => {
  it('pinScope "overall" takes the top N by position', () => {
    const pins = selectPins(field6(), { pinTop: 3, pinScope: 'overall', pinSubject: false })
    expect(slots(pins)).toEqual(['car-1', 'car-2', 'car-3'])
  })

  it('pinScope "class" takes the leader of each class', () => {
    const pins = selectPins(field6(), { pinTop: 1, pinScope: 'class', pinSubject: false })
    // class leaders in position order: GTP car-1, GT3 car-3, LMP2 car-5
    expect(slots(pins)).toEqual(['car-1', 'car-3', 'car-5'])
  })

  it('pinSubject adds the on-camera car when it is not already pinned', () => {
    const pins = selectPins(field6(), {
      pinTop: 3,
      pinScope: 'overall',
      pinSubject: true,
      subjectSlotId: 'car-5',
    })
    // pins stay in position order; the subject (P5) joins the top-3
    expect(slots(pins)).toEqual(['car-1', 'car-2', 'car-3', 'car-5'])
  })

  it('de-duplicates by slot_id when the subject is already a leader', () => {
    const pins = selectPins(field6(), {
      pinTop: 3,
      pinScope: 'overall',
      pinSubject: true,
      subjectSlotId: 'car-1',
    })
    expect(slots(pins)).toEqual(['car-1', 'car-2', 'car-3'])
  })
})

// --- selection (spec rules 7–11) -------------------------------------------

describe('selectRows', () => {
  const cycle = {
    enabled: true,
    perPageSeconds: 8,
    pinTop: 1,
    pinScope: 'overall',
    pinSubject: false,
  }

  it('renders the whole field and is inert when the field fits the budget', () => {
    const out = selectRows(field6(), { budget: 10, cycle, page: 0 })
    expect(slots(out.rendered)).toEqual(['car-1', 'car-2', 'car-3', 'car-4', 'car-5', 'car-6'])
    expect(out.pageCount).toBe(1) // cycling disappears, not a single "page"
  })

  it('renders pins + the current window page, never exceeding the budget', () => {
    // budget 4, 1 pin -> window size 3 over the 5 non-pinned cars -> 2 pages
    const p0 = selectRows(field6(), { budget: 4, cycle, page: 0 })
    expect(slots(p0.pinned)).toEqual(['car-1'])
    expect(slots(p0.rendered)).toEqual(['car-1', 'car-2', 'car-3', 'car-4'])
    expect(p0.rendered.length).toBeLessThanOrEqual(4)
    expect(p0.pageCount).toBe(2)

    const p1 = selectRows(field6(), { budget: 4, cycle, page: 1 })
    expect(slots(p1.rendered)).toEqual(['car-1', 'car-5', 'car-6'])
  })

  it('pins win and the window is empty when pins alone exceed the budget', () => {
    const out = selectRows(field6(), {
      budget: 2,
      cycle: { ...cycle, pinTop: 1, pinScope: 'class' }, // 3 class leaders > budget 2
      page: 0,
    })
    expect(slots(out.rendered)).toEqual(['car-1', 'car-3']) // truncated from the top
    expect(out.window).toEqual([])
  })

  it('renders nothing (header only) when the budget is below 1', () => {
    const out = selectRows(field6(), { budget: 0, cycle, page: 0 })
    expect(out.rendered).toEqual([])
  })

  it('clamps an out-of-range page index rather than rendering an empty page', () => {
    // page 5 with only 2 pages -> clamps into range, non-empty
    const out = selectRows(field6(), { budget: 4, cycle, page: 5 })
    expect(out.rendered.length).toBeGreaterThan(0)
  })
})

// --- page stability + lifecycle (spec rules 11–13, 20) ---------------------

describe('createTowerCycle — page-membership stability', () => {
  const cycle = {
    enabled: true,
    perPageSeconds: 8,
    pinTop: 1,
    pinScope: 'overall',
    pinSubject: false,
  }

  it('freezes window membership across ticks until the page turns', () => {
    const c = createTowerCycle({ budget: 4, cycle })
    // page 0: pin car-1 + window [car-2,car-3,car-4]
    expect(slots(c.sync(snapshot(field6())))).toEqual(['car-1', 'car-2', 'car-3', 'car-4'])

    // turn -> page 1: window membership {car-5, car-6}
    c.turn(snapshot(field6()))
    expect(new Set(slots(c.rows()).slice(1))).toEqual(new Set(['car-5', 'car-6']))

    // a NON-window car (car-3) leaps up the order mid-page; window set must not
    // recompute — car-5/car-6 stay, and no jitter pulls car-3 into the window.
    const reordered = field6().map((v) =>
      v.slot_id === 'car-3' ? { ...v, position: 1 } : { ...v, position: v.position + 1 },
    )
    const rows = c.sync(snapshot(reordered))
    expect(new Set(slots(rows).slice(1))).toEqual(new Set(['car-5', 'car-6']))
  })

  it('updates the subject pin immediately on a camera cut (rule 12)', () => {
    const c = createTowerCycle({
      budget: 4,
      cycle: { ...cycle, pinSubject: true },
    })
    c.sync(snapshot(field6(), 'car-2'))
    const rows = c.sync(snapshot(field6(), 'car-6')) // camera cuts to P6
    expect(slots(rows)).toContain('car-6')
  })

  it('clamps the page when the field shrinks mid-cycle (rule 11)', () => {
    const c = createTowerCycle({ budget: 4, cycle })
    c.sync(snapshot(field6()))
    c.turn(snapshot(field6())) // page 1
    // cars 5 & 6 retire -> only 4 cars remain, which now fit the budget
    const smaller = field6().filter((v) => !['car-5', 'car-6'].includes(v.slot_id))
    const rows = c.sync(snapshot(smaller))
    expect(rows.length).toBeGreaterThan(0)
    expect(slots(rows)).toEqual(['car-1', 'car-2', 'car-3', 'car-4'])
  })

  it('resets the window cursor to page 1 on a session-phase (mode) change (rule 20)', () => {
    const c = createTowerCycle({ budget: 4, cycle })
    c.sync(snapshot(field6(), null, 'qualifying'))
    c.turn(snapshot(field6(), null, 'qualifying')) // page 1
    // mode flips qualifying -> race: cursor resets to page 0
    const rows = c.sync(snapshot(field6(), null, 'race'))
    expect(slots(rows)).toEqual(['car-1', 'car-2', 'car-3', 'car-4'])
    expect(c.page).toBe(0)
  })

  it('never exceeds the budget when a camera cut adds the subject pin (rules 1-2)', () => {
    const field = Array.from({ length: 20 }, (_, i) =>
      car(i + 1, `car-${i + 1}`, ['GTP', 'LMP2', 'GT3'][i % 3]),
    )
    const c = createTowerCycle({
      budget: 8,
      cycle: { enabled: true, perPageSeconds: 8, pinTop: 3, pinScope: 'overall', pinSubject: true },
    })
    // Subject on a top-3 car: pins {car-1,car-2,car-3}, a 5-wide window frozen.
    let rows = c.sync(snapshot(field, 'car-2'))
    expect(rows.length).toBeLessThanOrEqual(8)
    // Camera cuts to an off-page mid-field car: the subject becomes a 4th pin, so the
    // window must shrink — the frozen membership must NOT render a budget+1 row.
    rows = c.sync(snapshot(field, 'car-15'))
    expect(rows.length).toBeLessThanOrEqual(8)
    expect(slots(rows)).toContain('car-15') // subject pinned immediately (rule 10)
    expect(slots(rows)).toContain('car-1') // leader still pinned
  })
})
