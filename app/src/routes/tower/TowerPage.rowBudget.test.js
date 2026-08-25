/* Standalone /tower row budget — derived from the Browser Source viewport (#140).
 *
 * Behavioral spec: .ai/spec/what/tower-overflow.md rules 18-20 (with 1, 2, 4, 5, 7).
 * These drive the PAGE (not the bare widget) because the derivation lives there: the
 * standalone route has no configured slot, so it must derive one from the viewport and
 * source the tower's overflow config from the loaded profile, the way /all sources both.
 *
 * happy-dom does no layout, so — exactly as StandingsTower.test.js's overflow block does —
 * the token heights fall back to their defaults (getComputedStyle resolves no CSS custom
 * properties here): header 38px, row 44px, safe inset 48px per edge. That makes the budget
 * arithmetic deterministic:
 *   slot   = innerHeight - 2 * 48
 *   budget = floor((slot - 38) / 44)
 *   innerHeight 500 -> slot 404 -> 8 rows      innerHeight 800 -> slot 704 -> 15 rows
 *   innerHeight 130 -> slot  34 -> 0 rows (header alone)
 * The 8 is load-bearing: deriving from a RAW innerHeight of 500 (ignoring the .tower-page
 * safe inset) would give 10 rows and a tower 96px taller than its Browser Source.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import TowerPage from './TowerPage.svelte'
import AllView from '../all/AllView.svelte'

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

/** A field of n cars in running order; `subject` puts one on camera. */
const bigField = (n, subject = null) => ({
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
  subject: subject ? { slot_id: subject, driver_name: subject } : {},
  relationship: {},
})

const names = (root = document) =>
  Array.from(root.querySelectorAll('[data-testid="driver-name"]')).map((el) =>
    el.textContent.trim(),
  )
const rowCount = (root = document) => root.querySelectorAll('[data-testid="tower-row"]').length

const originalInnerHeight = window.innerHeight

/** Mount the standalone route at a given Browser Source height, then push a snapshot. */
async function mountTower(innerHeight, snapshot, { search = '', profile = null } = {}) {
  window.innerHeight = innerHeight
  window.history.replaceState({}, '', `/tower${search}`)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      profile
        ? { ok: true, status: 200, json: async () => profile }
        : { ok: false, status: 404, json: async () => ({}) },
    ),
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

/** Resize the Browser Source live, as OBS can. */
async function resizeTo(innerHeight) {
  window.innerHeight = innerHeight
  window.dispatchEvent(new Event('resize'))
  flushSync()
  await tick()
}

beforeEach(() => {
  sse.emit = null
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  window.innerHeight = originalInnerHeight
  window.history.replaceState({}, '', '/')
})

describe('standalone /tower — viewport-derived row budget (#140, rules 18-20)', () => {
  it('bounds the tower to the rows its Browser Source viewport fits (rules 1, 2, 18)', async () => {
    await mountTower(500, bigField(30))

    // slot = 500 - 96 = 404 -> floor((404 - 38) / 44) = 8 whole rows.
    expect(budgetFor(500)).toBe(8)
    expect(rowCount()).toBe(8)
    // The rows shown are the top of the field, in running order — not all 30.
    expect(names()).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'])
    expect(names()).not.toContain('D30')
  })

  it('pins the leaders and the on-camera car when the viewport overflows (rules 4, 18)', async () => {
    // car-25 is on camera and far outside the first window page.
    await mountTower(500, bigField(30, 'car-25'))

    expect(rowCount()).toBe(8)
    const shown = names()
    // pinTop 3 (profile default) keeps the top three; pinSubject keeps the on-camera car.
    expect(shown.slice(0, 3)).toEqual(['D1', 'D2', 'D3'])
    expect(shown).toContain('D25')
    // Pins keep their true positions: the subject sits in running order, not bolted on top.
    expect(shown.indexOf('D25')).toBeGreaterThan(shown.indexOf('D3'))
  })

  it('turns the cycling window on the standalone route the way it does in /all (rules 5, 18)', async () => {
    vi.useFakeTimers()
    await mountTower(500, bigField(30))

    const firstPage = names()
    expect(firstPage).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'])

    // Default dwell is 8s (overlay-config rule 12).
    await vi.advanceTimersByTimeAsync(8000)
    flushSync()

    // Pins hold; the window advances to the next five non-pinned cars.
    expect(names()).toEqual(['D1', 'D2', 'D3', 'D9', 'D10', 'D11', 'D12', 'D13'])
    expect(rowCount()).toBe(8)
  })

  it('renders the header alone when the viewport is too short for one row (rules 2, 18)', async () => {
    await mountTower(130, bigField(30))

    // slot = 130 - 96 = 34, below the 38px header — not even one whole row fits.
    expect(budgetFor(130)).toBe(0)
    expect(rowCount()).toBe(0)
    expect(document.querySelector('[data-testid="tower-header"]')).not.toBeNull()
  })

  it('re-derives the budget when the Browser Source is resized (rule 19)', async () => {
    await mountTower(800, bigField(30))

    // slot = 704 -> 15 rows.
    expect(budgetFor(800)).toBe(15)
    expect(rowCount()).toBe(15)

    await resizeTo(500)

    // Shrinking the source re-fits the tower to 8 rows rather than leaving it clipped.
    expect(rowCount()).toBe(8)
    expect(names().slice(0, 3)).toEqual(['D1', 'D2', 'D3'])
  })

  it('shows the whole field and never turns when it fits the viewport (rule 7)', async () => {
    vi.useFakeTimers()
    await mountTower(800, bigField(6))

    const all = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']
    expect(names()).toEqual(all)

    await vi.advanceTimersByTimeAsync(8000 * 3)
    flushSync()

    // A fitting field is inert: same cars, same order, no paging.
    expect(names()).toEqual(all)
  })

  it('lets an explicit integer maxRows cap below the viewport-derived budget (rule 20)', async () => {
    // A profile that caps the tower at 5 rows; the viewport alone would allow 15.
    await mountTower(800, bigField(30), {
      search: '?profile=capped',
      profile: { widgets: { tower: { maxRows: 5 } } },
    })

    expect(budgetFor(800)).toBe(15)
    expect(rowCount()).toBe(5)
    expect(names().slice(0, 3)).toEqual(['D1', 'D2', 'D3'])
  })
})

describe('/all — non-regression: the tower budget stays the configured slot (rule 18)', () => {
  it('ignores the viewport and uses the configured tower height', async () => {
    // A viewport far taller than the configured 400px tower slot: if /all ever started
    // deriving from the viewport, this would render far more than 8 rows.
    window.innerHeight = 2000
    const { container } = render(AllView, {
      snapshot: bigField(30),
      config: { widgets: { tower: { h: 400 } } },
    })
    flushSync()
    await tick()

    // floor((400 - 38) / 44) = 8, exactly as before this change.
    expect(rowCount(container)).toBe(8)
    expect(names(container).slice(0, 3)).toEqual(['D1', 'D2', 'D3'])
  })
})
