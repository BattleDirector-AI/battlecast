/* Standalone /tower — a grouped tower whose class tags are hidden renders the inline layout, and
 * the viewport-derived row budget and cycling then apply to it (widgets.md rule 61,
 * tower-overflow.md rules 18-20, ADR 0022). Same arithmetic as TowerPage.rowBudget.test.js:
 * innerHeight 500 -> slot 404 -> floor((404 - 38) / 44) = 8 rows; default cycle pinTop 3, 8 s.
 * The profile sets `classDisplay: 'grouped'`; the snapshot says `session.multiclass: false`.
 *
 * The two hidden-tag tests pass today and are regression guards: TowerPage does not pass
 * `classDisplay` to the tower at all, so the standalone route renders the inline layout whatever
 * the profile says, which is also what hiding the tags requires. They pin that hiding the tags
 * keeps the viewport budget and the page turn intact on this route; the grouped -> inline
 * overflow fallback itself is pinned in StandingsTower.classTagsOverflow.test.js. The last test is
 * their counterpart (widgets.md rule 67): with the tags showing, the same profile gives the
 * grouped layout on this route. It is red until the page passes `classDisplay` through.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import TowerPage from './TowerPage.svelte'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'

const sse = vi.hoisted(() => ({ emit: null }))
vi.mock('../../lib/sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: (_url, onState) => {
    sse.emit = onState
    return () => {}
  },
}))

const singleClassField = (n, session) => ({
  schemaVersion: '1',
  mode: 'race',
  vehicles: Array.from({ length: n }, (_, i) => ({
    slot_id: `car-${i + 1}`,
    driver_name: `D${i + 1}`,
    vehicle_class: 'Default',
    position: i + 1,
    gap_to_leader: i === 0 ? 0 : i,
  })),
  subject: {},
  relationship: {},
  session,
})

const names = () =>
  Array.from(document.querySelectorAll('[data-testid="driver-name"]')).map((el) => el.textContent.trim())
const d = (...ns) => ns.map((n) => `D${n}`)

async function mountTower(innerHeight, snapshot, profile) {
  window.innerHeight = innerHeight
  window.history.replaceState({}, '', '/tower?profile=p')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => profile })),
  )
  render(TowerPage)
  for (let i = 0; i < 5; i++) await tick()
  expect(sse.emit, 'the page should have opened its state feed on mount').toBeTypeOf('function')
  sse.emit(snapshot)
  flushSync()
  await tick()
}

const originalInnerHeight = window.innerHeight
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

const GROUPED = { widgets: { tower: { classDisplay: 'grouped' } } }

describe('standalone /tower — hidden class tags keep the viewport budget and cycling (rule 61)', () => {
  it('auto + multiclass false: 8 rows, pins + window, and the window turns after 8 s', async () => {
    vi.useFakeTimers()
    await mountTower(500, singleClassField(30, { multiclass: false }), GROUPED)
    expect(document.querySelectorAll('[data-testid="tower-group"]')).toHaveLength(0)
    expect(names()).toEqual(d(1, 2, 3, 4, 5, 6, 7, 8))

    await vi.advanceTimersByTimeAsync(8000)
    flushSync()
    expect(names()).toEqual(d(1, 2, 3, 9, 10, 11, 12, 13))
  })

  it('profile hide + no flag: the same inline overflow', async () => {
    vi.useFakeTimers()
    await mountTower(500, singleClassField(30, { flag: 'green' }), {
      ...GROUPED,
      theme: { classTags: 'hide' },
    })
    expect(names()).toEqual(d(1, 2, 3, 4, 5, 6, 7, 8))
    await vi.advanceTimersByTimeAsync(8000)
    flushSync()
    expect(names()).toEqual(d(1, 2, 3, 9, 10, 11, 12, 13))
  })
})

describe('standalone /tower — shown class tags render the grouped layout from the profile (rules 61, 67)', () => {
  it('multiclass true + grouped profile: class sections, not the inline list the hidden-tag case gets', async () => {
    await mountTower(1000, multiClass, GROUPED)
    const root = document.querySelector('[data-testid="standings-tower"]')
    expect(root.getAttribute('data-class-display')).toBe('grouped')
    expect(document.querySelectorAll('[data-testid="tower-group"]')).not.toHaveLength(0)
  })
})
