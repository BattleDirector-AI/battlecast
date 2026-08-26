/* Standalone /tower resize coalescing — one re-fit per animation frame (#155).
 *
 * Behavioral spec: .ai/spec/what/tower-overflow.md rule 21 (with 19).
 * Mechanism: .ai/spec/how/renderer.md, "Re-fitting coalesces to one measurement per frame".
 *
 * WHY THIS FILE STUBS THE FRAME. happy-dom pumps no animation frames, so the trailing catch-up
 * measurement never runs on its own and the leading edge answers any single-event test
 * synchronously — TowerPage.rowBudget.test.js's resize test dispatches exactly one event, so the
 * entire rAF gate could be deleted and it would stay green (#155). requestAnimationFrame /
 * cancelAnimationFrame are therefore replaced with a manual queue: dispatching a burst without
 * pumping is "inside one frame", and `pumpFrame()` IS the frame boundary. Measurements are
 * counted by spying on getComputedStyle for the `.tower-page` element, which is what
 * `measureSlot()` reads its resolved safe-area padding from (#152).
 *
 * Budget arithmetic matches TowerPage.rowBudget.test.js — happy-dom does no layout, so the
 * tokens fall back to their defaults (header 38px, row 44px, safe inset 48px per edge):
 *   budget = floor((innerHeight - 2 * 48 - 38) / 44)
 *   800 -> 15 rows   1200 -> 24 rows   500 -> 8 rows   700 -> 12 rows   300 -> 3 rows
 * The sizes below are chosen so every step is a DIFFERENT row count: a burst that measured an
 * intermediate size, or settled on the wrong one, renders a visibly different tower.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import TowerPage from './TowerPage.svelte'

// The page opens an SSE feed on mount; happy-dom has no EventSource. Capture the
// state callback instead so a test can push fixtures at it.
const sse = vi.hoisted(() => ({ emit: null }))
vi.mock('./sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: (_url, onState) => {
    sse.emit = onState
    return () => {}
  },
}))

const HEADER_PX = 38
const ROW_PX = 44
const INSET_PX = 48
const budgetFor = (innerHeight) =>
  Math.max(0, Math.floor((innerHeight - 2 * INSET_PX - HEADER_PX) / ROW_PX))

/** A field of n cars in running order. */
const bigField = (n) => ({
  schemaVersion: '1',
  mode: 'race',
  vehicles: Array.from({ length: n }, (_, i) => ({
    slot_id: `car-${i + 1}`,
    driver_name: `D${i + 1}`,
    vehicle_class: ['GTP', 'LMP2', 'GT3'][i % 3],
    position: i + 1,
    best_lap: 90 + i,
    gap_to_leader: i === 0 ? 0 : i,
  })),
  subject: {},
  relationship: {},
})

const names = () =>
  Array.from(document.querySelectorAll('[data-testid="driver-name"]')).map((el) =>
    el.textContent.trim(),
  )
const rowCount = () => document.querySelectorAll('[data-testid="tower-row"]').length

const originalInnerHeight = window.innerHeight

// --- the manual frame ---------------------------------------------------------------------
let frameQueue = []
let nextFrameId = 0

/** Run every frame callback queued so far. This is the frame boundary. */
async function pumpFrame() {
  const due = frameQueue
  frameQueue = []
  for (const { cb } of due) cb(0)
  flushSync()
  await tick()
}

// --- measurement counting -----------------------------------------------------------------
let pageMeasurements = 0
const resetMeasurements = () => {
  pageMeasurements = 0
}

beforeEach(() => {
  sse.emit = null
  frameQueue = []
  nextFrameId = 0
  resetMeasurements()

  vi.stubGlobal('requestAnimationFrame', (cb) => {
    const id = ++nextFrameId
    frameQueue.push({ id, cb })
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id) => {
    frameQueue = frameQueue.filter((frame) => frame.id !== id)
  })

  const realGetComputedStyle = window.getComputedStyle.bind(window)
  vi.stubGlobal('getComputedStyle', (el, ...rest) => {
    if (el?.classList?.contains?.('tower-page')) pageMeasurements += 1
    return realGetComputedStyle(el, ...rest)
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.innerHeight = originalInnerHeight
  window.history.replaceState({}, '', '/')
})

/** Mount the standalone route at a given Browser Source height, then push a snapshot. */
async function mountTower(innerHeight, snapshot) {
  window.innerHeight = innerHeight
  window.history.replaceState({}, '', '/tower')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
  )
  const result = render(TowerPage)
  await tick()
  await tick()
  expect(sse.emit, 'the page should have opened its state feed on mount').toBeTypeOf('function')
  sse.emit(snapshot)
  flushSync()
  await tick()
  return result
}

/** One `resize` event of a drag — dispatched WITHOUT letting a frame run. */
async function resizeTo(innerHeight) {
  window.innerHeight = innerHeight
  window.dispatchEvent(new Event('resize'))
  flushSync()
  await tick()
}

describe('standalone /tower — resize coalescing (#155, rule 21)', () => {
  it('re-fits on the first event of a burst, then drops the rest until the frame runs', async () => {
    await mountTower(800, bigField(30))
    expect(rowCount()).toBe(budgetFor(800)) // 15
    resetMeasurements()

    // The drag starts: nothing is pending, so this one re-fits at once (rule 21).
    await resizeTo(500)
    expect(pageMeasurements).toBe(1)
    expect(rowCount()).toBe(budgetFor(500)) // 8

    // The drag continues inside the same frame. Every one of these is dropped.
    await resizeTo(1200)
    await resizeTo(700)
    await resizeTo(300)

    expect(pageMeasurements, 'events inside an open frame must not measure').toBe(1)
    // The tower keeps the LEADING budget — not 24 (1200), not 12 (700), not 3 (300).
    expect(rowCount()).toBe(budgetFor(500))
    expect(names()).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'])
  })

  it('settles on the size the burst ended at, not an intermediate one', async () => {
    await mountTower(800, bigField(30))
    resetMeasurements()

    // A drag that grows to 1200 and then collapses to 300: the biggest size in the burst is
    // an intermediate, so a catch-up that re-used a stale size would render a taller tower.
    await resizeTo(500)
    await resizeTo(1200)
    await resizeTo(300)

    await pumpFrame()

    expect(pageMeasurements, 'a burst re-fits exactly twice: leading + catch-up').toBe(2)
    expect(rowCount()).toBe(budgetFor(300)) // 3 — the size the drag ended at
    expect(rowCount()).not.toBe(budgetFor(1200))
    expect(rowCount()).not.toBe(budgetFor(500))
    // Budget 3 with a 30-car field is under-subscribed, so the pins fill it (rule 8).
    expect(names()).toEqual(['D1', 'D2', 'D3'])
  })

  it('takes no catch-up measurement when the burst was a single event', async () => {
    await mountTower(800, bigField(30))
    resetMeasurements()

    await resizeTo(500)
    expect(pageMeasurements).toBe(1)
    expect(rowCount()).toBe(budgetFor(500)) // 8

    await pumpFrame()

    // Nothing was dropped, so the frame has nothing to catch up on — a lone resize costs
    // one measurement, not two.
    expect(pageMeasurements).toBe(1)
    expect(rowCount()).toBe(budgetFor(500))
  })

  it('re-fits at most once per frame while a drag runs across several frames', async () => {
    await mountTower(800, bigField(30))
    resetMeasurements()

    // Frame 1 — leading re-fit at 500, the rest dropped, catch-up settles on 1200.
    await resizeTo(500)
    await resizeTo(900)
    await resizeTo(1200)
    expect(pageMeasurements).toBe(1)
    await pumpFrame()
    expect(pageMeasurements).toBe(2)
    expect(rowCount()).toBe(budgetFor(1200)) // 24

    // Frame 2 — the drag has not stopped. The catch-up opened the next gate, so these land
    // inside it and the tower must hold 24 rows until the frame comes due.
    await resizeTo(700)
    await resizeTo(300)
    expect(pageMeasurements, 'the catch-up must open the next frame’s gate').toBe(2)
    expect(rowCount()).toBe(budgetFor(1200))

    await pumpFrame()
    expect(pageMeasurements).toBe(3)
    expect(rowCount()).toBe(budgetFor(300)) // 3

    // Frame 3 — the drag stopped, so this frame has nothing left to catch up on.
    await pumpFrame()
    expect(pageMeasurements).toBe(3)
    expect(rowCount()).toBe(budgetFor(300))
  })

  it('re-opens the gate for a later, separate drag', async () => {
    await mountTower(800, bigField(30))

    await resizeTo(500)
    await resizeTo(300)
    await pumpFrame()
    await pumpFrame() // the drag is over; the gate the catch-up opened closes empty
    expect(rowCount()).toBe(budgetFor(300)) // 3
    resetMeasurements()

    // A second drag, minutes later: its first event must re-fit immediately again rather
    // than wait for a frame — the coalescing gate is per-burst, not one-shot.
    await resizeTo(700)
    expect(pageMeasurements).toBe(1)
    expect(rowCount()).toBe(budgetFor(700)) // 12
    expect(names().slice(0, 3)).toEqual(['D1', 'D2', 'D3'])
  })
})
