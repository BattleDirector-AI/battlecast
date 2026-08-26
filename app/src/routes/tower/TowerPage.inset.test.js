/* Standalone /tower inset measurement (#152).
 *
 * Behavior: `.ai/spec/what/tower-overflow.md` rule 18 — the derived slot is the viewport
 * height less the route's safe-area inset top and bottom. Mechanism:
 * `.ai/spec/how/renderer.md`, "Measure the resolved padding, not the token".
 *
 * Why this file exists separately from TowerPage.rowBudget.test.js: that suite runs with
 * happy-dom's real (empty) style resolution, so it exercises only the FALLBACK branch of the
 * inset derivation. The measured branch — the one the budget's correctness actually rests on —
 * had no coverage at all. These tests stub `getComputedStyle` to make it observable.
 *
 * RED until the inset is read from resolved padding: today it parses the custom property's
 * authored text, so a `3rem` token yields 3 instead of 48.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import TowerPage from './TowerPage.svelte'

const sse = vi.hoisted(() => ({ emit: null }))
vi.mock('../../lib/sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: (_url, onState) => {
    sse.emit = onState
    return () => {}
  },
}))

const HEADER_PX = 38
const ROW_PX = 44

const field = (n) => ({
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

const rowCount = () => document.querySelectorAll('[data-testid="tower-row"]').length

/**
 * Stub `getComputedStyle` so the page element reports a resolved padding that DISAGREES with
 * the raw `--bc-inset-safe` text — which is exactly what a browser does for any token authored
 * in a relative unit. `paddingTop` is what the engine actually applied; the custom property is
 * the unresolved source text.
 *
 * Every other element keeps happy-dom's real style object, so `StandingsTower`'s own token
 * measurement is untouched and falls back to 38/44 as it does in the sibling suite.
 */
function stubStyles({ paddingPx, tokenText }) {
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
    const base = real(el, pseudo)
    if (!(el instanceof Element) || !el.classList.contains('tower-page')) return base
    return {
      ...base,
      paddingTop: `${paddingPx}px`,
      paddingBottom: `${paddingPx}px`,
      getPropertyValue: (prop) =>
        prop === '--bc-inset-safe' ? tokenText : base.getPropertyValue(prop),
    }
  })
}

const originalInnerHeight = window.innerHeight

async function mountAt(innerHeight, snapshot) {
  window.innerHeight = innerHeight
  window.history.replaceState({}, '', '/tower')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
  const result = render(TowerPage)
  await tick()
  await tick()
  expect(sse.emit, 'the page should have opened its state feed on mount').toBeTypeOf('function')
  sse.emit(snapshot)
  flushSync()
  await tick()
  return result
}

beforeEach(() => {
  sse.emit = null
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.innerHeight = originalInnerHeight
  window.history.replaceState({}, '', '/')
})

describe('standalone /tower — the inset is the resolved padding, not the token text (#152)', () => {
  it('honours a rem-authored inset token, which parses to a wrong number as raw text', async () => {
    // A theme authoring `--bc-inset-safe: 3rem` resolves to 48px at a 16px root. The engine
    // applies 48px; the custom property still reads "3rem".
    stubStyles({ paddingPx: 48, tokenText: '3rem' })
    await mountAt(500, field(30))

    // slot = 500 - 2*48 = 404 -> floor((404 - 38) / 44) = 8 rows.
    const expected = Math.floor((500 - 2 * 48 - HEADER_PX) / ROW_PX)
    expect(expected).toBe(8)
    expect(
      rowCount(),
      'parsing "3rem" as a length gives an inset of 3px, a 494px slot and 10 rows — a tower ' +
        'taller than its Browser Source, which is the defect the derived slot exists to prevent',
    ).toBe(8)
  })

  it('tracks the padding the engine actually applied when it differs from the token', async () => {
    // Same token text, different resolved padding (a larger root font size). The budget must
    // follow the padding that is really on the element.
    stubStyles({ paddingPx: 96, tokenText: '3rem' })
    await mountAt(500, field(30))

    // slot = 500 - 2*96 = 308 -> floor((308 - 38) / 44) = 6 rows.
    expect(rowCount()).toBe(Math.floor((500 - 2 * 96 - HEADER_PX) / ROW_PX))
    expect(rowCount()).toBe(6)
  })

  it('falls back to a bounded budget when padding is unreadable, never to an unbounded tower', async () => {
    // A style object that resolves nothing (the happy-dom baseline). The tower must still be
    // bounded by the viewport — degrading to Infinity is the #140 defect returning.
    stubStyles({ paddingPx: Number.NaN, tokenText: '' })
    await mountAt(500, field(30))

    expect(rowCount()).toBeGreaterThan(0)
    expect(rowCount(), 'an unreadable inset must not produce an unbounded tower').toBeLessThan(30)
  })
})
