/* Standings-tower overflow selection + cycling — SPEC-FIRST SKELETON.
 *
 * Behavioral spec: .ai/spec/what/tower-overflow.md (ADR 0003). This module is an
 * unimplemented skeleton: it declares the API surface the failing tests in
 * towerCycle.test.js pin down, but every function throws until the feature is
 * implemented against the approved spec. Do NOT ship this as-is — the whole point
 * of the spec-first draft is that these throw (tests red) until step 3 (implement).
 */

const TODO = (name, ...args) => {
  void args // placeholder consumes the forwarded params so the skeleton lints clean
  throw new Error(
    `not implemented: ${name} — implement against .ai/spec/what/tower-overflow.md`,
  )
}

/** Minimum seconds per cycling page (spec rule 16). */
export const MIN_PER_PAGE_SECONDS = 4

/**
 * Row budget = floor((slotHeight - headerHeight) / rowHeight), never negative
 * (spec rules 3-4). Pure arithmetic; the caller measures the heights.
 * @param {number} slotHeight @param {number} headerHeight @param {number} rowHeight
 * @returns {number}
 */
export function computeRowBudget(slotHeight, headerHeight, rowHeight) {
  return TODO('computeRowBudget', slotHeight, headerHeight, rowHeight)
}

/** Clamp a configured per-page dwell to the 4s floor (spec rule 16). */
export function clampPerPageSeconds(seconds) {
  return TODO('clampPerPageSeconds', seconds)
}

/**
 * The pinned cars for a field (spec rule 6): `pinTop` leaders (overall or per
 * class), plus the subject when `pinSubject`, de-duplicated by `slot_id`, in
 * position order.
 * @param {object[]} field
 * @param {{pinTop:number,pinScope:'overall'|'class',pinSubject?:boolean,subjectSlotId?:string}} opts
 * @returns {object[]}
 */
export function selectPins(field, opts) {
  return TODO('selectPins', field, opts)
}

/**
 * Select the rows to render for a given page (spec rules 7-11): pins first (position
 * order), then the current window page; never exceeding `budget`; window inert when
 * the field fits; pins truncated when they alone exceed the budget; page index
 * clamped into range.
 * @param {object[]} field
 * @param {{budget:number,cycle:object,page:number,subjectSlotId?:string}} opts
 * @returns {{pinned:object[],window:object[],rendered:object[],pageCount:number}}
 */
export function selectRows(field, opts) {
  return TODO('selectRows', field, opts)
}

/**
 * Stateful cycling controller (spec rules 11-13, 20): holds the page cursor and the
 * frozen window membership, updates pins/subject live on every `sync`, advances on
 * `turn`, clamps on field shrink, and resets the cursor on a `mode` change.
 * @param {{budget:number,cycle:object}} config
 * @returns {{sync:(snapshot:object)=>object[], turn:(snapshot:object)=>object[], rows:()=>object[], page:number}}
 */
export function createTowerCycle(config) {
  return TODO('createTowerCycle', config)
}
