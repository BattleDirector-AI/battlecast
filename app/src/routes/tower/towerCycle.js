/* Standings-tower overflow selection + cycling.
 *
 * Behavioral spec: .ai/spec/what/tower-overflow.md (ADR 0003). Pure selection
 * logic plus a small stateful controller; `StandingsTower.svelte` measures the slot
 * (happy-dom does no layout) and drives these. The CSS clamp is a separate, permanent
 * bound underneath all of this.
 */

/** Minimum seconds per cycling page — below this the tower is unreadable (spec rule 14/16). */
export const MIN_PER_PAGE_SECONDS = 4

/** Default per-page dwell when a configured value is missing/garbage. */
const DEFAULT_PER_PAGE_SECONDS = 8

/** Sort a field by running position ascending, without mutating the source. */
function byPosition(field) {
  return [...(field ?? [])].sort((a, b) => a.position - b.position)
}

/**
 * Row budget = floor((slotHeight - headerHeight) / rowHeight), never negative
 * (spec rules 2-4). Pure arithmetic; the caller supplies the measured heights.
 */
export function computeRowBudget(slotHeight, headerHeight, rowHeight) {
  if (!(rowHeight > 0)) return 0
  return Math.max(0, Math.floor((slotHeight - headerHeight) / rowHeight))
}

/** Clamp a configured per-page dwell to the readable floor (spec rule 14/16). */
export function clampPerPageSeconds(seconds) {
  const n = Number(seconds)
  if (!Number.isFinite(n)) return DEFAULT_PER_PAGE_SECONDS
  return Math.max(MIN_PER_PAGE_SECONDS, n)
}

/**
 * The pinned cars for a field (spec rule 6): `pinTop` leaders — of the whole field
 * (`pinScope: 'overall'`) or of each class (`'class'`) — plus the subject when
 * `pinSubject`, de-duplicated by `slot_id`, returned in position order.
 */
export function selectPins(field, opts = {}) {
  const { pinTop = 0, pinScope = 'overall', pinSubject = false, subjectSlotId = null } = opts
  const sorted = byPosition(field)
  const picked = new Map() // slot_id -> car (dedup by slot_id, never driver name)
  const add = (car) => {
    if (car && !picked.has(car.slot_id)) picked.set(car.slot_id, car)
  }

  if (pinScope === 'class') {
    const perClass = {}
    for (const car of sorted) {
      const key = String(car.vehicle_class ?? '').toLowerCase()
      const seen = perClass[key] ?? 0
      if (seen < pinTop) {
        add(car)
        perClass[key] = seen + 1
      }
    }
  } else {
    for (const car of sorted.slice(0, Math.max(0, pinTop))) add(car)
  }

  if (pinSubject && subjectSlotId != null) {
    add(sorted.find((c) => c.slot_id === subjectSlotId))
  }

  return byPosition([...picked.values()])
}

/** Pins + non-pinned split and window sizing shared by selectRows / createTowerCycle. */
function partition(field, budget, cycle, subjectSlotId) {
  const sorted = byPosition(field)
  const pins = selectPins(sorted, {
    pinTop: cycle.pinTop ?? 0,
    pinScope: cycle.pinScope ?? 'overall',
    pinSubject: cycle.pinSubject ?? false,
    subjectSlotId,
  })
  const windowSize = Math.max(0, budget - pins.length)
  const pinnedSlots = new Set(pins.map((p) => p.slot_id))
  const nonPinned = sorted.filter((c) => !pinnedSlots.has(c.slot_id))
  const pageCount = windowSize > 0 ? Math.max(1, Math.ceil(nonPinned.length / windowSize)) : 1
  return { pins, windowSize, nonPinned, pageCount }
}

/**
 * Select the rows to render for a given page (spec rules 6-11): pins first in
 * position order, then the current window page; never exceeding `budget`; the window
 * inert (single page) when the field fits; pins truncated when they alone exceed the
 * budget; the page index wrapped/clamped into range.
 */
export function selectRows(field, opts = {}) {
  const { budget = 0, cycle = {}, page = 0, subjectSlotId = null } = opts
  if (budget < 1) return { pinned: [], window: [], rendered: [], pageCount: 1 }

  const { pins, windowSize, nonPinned, pageCount } = partition(field, budget, cycle, subjectSlotId)

  // Pins alone do not fit: pins win, truncated from the top; the window gets nothing.
  if (windowSize <= 0) {
    const rendered = pins.slice(0, budget)
    return { pinned: rendered, window: [], rendered, pageCount: 1 }
  }

  // Field fits (or cycling disabled): render one static page, no turning.
  if (nonPinned.length <= windowSize || cycle.enabled === false) {
    const window = nonPinned.slice(0, windowSize)
    return { pinned: pins, window, rendered: [...pins, ...window], pageCount: 1 }
  }

  const eff = ((page % pageCount) + pageCount) % pageCount
  const window = nonPinned.slice(eff * windowSize, eff * windowSize + windowSize)
  return { pinned: pins, window, rendered: [...pins, ...window], pageCount }
}

/**
 * Stateful cycling controller (spec rules 10-13, 17). Holds the page cursor and the
 * frozen window membership: `sync` re-renders live (pins/subject update every tick)
 * against the frozen membership; `turn` advances the page and re-freezes membership;
 * a `mode` change resets the cursor to the first page.
 */
export function createTowerCycle(config = {}) {
  const budget = config.budget ?? 0
  const cycle = config.cycle ?? {}
  let page = 0
  let membership = null // slot_ids frozen for the current window page, or null to (re)compute
  let lastMode
  let rendered = []

  function render(snapshot, recompute) {
    const field = snapshot?.vehicles ?? []
    const subjectSlotId = snapshot?.subject?.slot_id ?? null
    if (budget < 1) {
      rendered = []
      return rendered
    }
    const { pins, windowSize, nonPinned, pageCount } = partition(field, budget, cycle, subjectSlotId)

    // Pins alone do not fit.
    if (windowSize <= 0) {
      membership = []
      rendered = pins.slice(0, budget)
      return rendered
    }

    // Field fits: cycling is inert — everyone shows, cursor home.
    if (nonPinned.length <= windowSize) {
      page = 0
      membership = nonPinned.map((c) => c.slot_id)
      rendered = [...pins, ...nonPinned]
      return rendered
    }

    // Clamp the cursor into range (field may have shrunk).
    if (page >= pageCount) page = ((page % pageCount) + pageCount) % pageCount

    if (recompute || membership === null) {
      const start = page * windowSize
      membership = nonPinned.slice(start, start + windowSize).map((c) => c.slot_id)
    }

    // Render the frozen members that still exist, in current position order. If they
    // have all left the field, fall back to the current page slice.
    const memberSet = new Set(membership)
    let win = nonPinned.filter((c) => memberSet.has(c.slot_id))
    if (win.length === 0) {
      const start = page * windowSize
      win = nonPinned.slice(start, start + windowSize)
      membership = win.map((c) => c.slot_id)
    }
    rendered = [...pins, ...win]
    return rendered
  }

  return {
    get page() {
      return page
    },
    sync(snapshot) {
      const mode = snapshot?.mode
      let recompute = false
      if (lastMode !== undefined && mode !== lastMode) {
        page = 0
        membership = null // reset cursor + membership on a session-phase change (rule 17)
        recompute = true
      }
      lastMode = mode
      return render(snapshot, recompute)
    },
    turn(snapshot) {
      const { pageCount } = partition(
        snapshot?.vehicles ?? [],
        budget,
        cycle,
        snapshot?.subject?.slot_id ?? null,
      )
      page = (page + 1) % pageCount
      membership = null // re-freeze membership for the new page
      return render(snapshot, true)
    },
    rows() {
      return rendered
    },
  }
}
