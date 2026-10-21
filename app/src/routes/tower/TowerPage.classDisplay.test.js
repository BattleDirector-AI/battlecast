/* Standalone /tower — class display (widgets.md rules 3, 67). The standalone route renders the
 * `classDisplay` of the loaded profile exactly as the tower inside /all does. Drives the PAGE,
 * because that is where the setting is sourced. The fixture is grid-multiclass.json: six cars in
 * GTP (car-1, car-44), GT3 (car-14, car-23) and LMP2 (car-8, car-31), overall order
 * 1, 14, 44, 8, 23, 31, producer `multiclass: true` so the class tags show.
 *
 * The grouped tests are red until the page passes `classDisplay` through; the inline, no-profile
 * and URL-knob tests pass today and assert rule 67's own default clauses.
 *
 * The clamp test covers tower-overflow.md Scope and rule 18: a grouped tower is bounded at the
 * derived slot (viewport less the two safe-area insets). happy-dom does no layout, so geometry
 * cannot be measured; the test asserts the style bound instead: the tower root carries an
 * inline `max-height` (never a fixed `height`) equal to the slot in px. With innerHeight 500 and the 48px
 * inset fallback the slot is 500 - 96 = 404px.
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

async function mountTower(search, profile, snapshot = multiClass, innerHeight = 1000) {
  window.innerHeight = innerHeight
  window.history.replaceState({}, '', `/tower${search}`)
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

const root = () => document.querySelector('[data-testid="standings-tower"]')
const groups = () =>
  Array.from(document.querySelectorAll('[data-testid="tower-group"]')).map((g) => ({
    carClass: g.getAttribute('data-class'),
    count: g.querySelector('.group__count')?.textContent.trim(),
    slots: Array.from(g.querySelectorAll('[data-testid="tower-row"]')).map((r) => r.getAttribute('data-slot')),
    positions: Array.from(g.querySelectorAll('[data-testid="tower-row"] [data-col="pos"]')).map((p) =>
      p.textContent.trim(),
    ),
  }))
const allSlots = () =>
  Array.from(document.querySelectorAll('[data-testid="tower-row"]')).map((r) => r.getAttribute('data-slot'))

beforeEach(() => {
  sse.emit = null
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

const GROUPED = { widgets: { tower: { classDisplay: 'grouped' } } }
const INLINE = { widgets: { tower: { classDisplay: 'inline' } } }

describe('standalone /tower — class display from the profile (rule 67)', () => {
  it('grouped profile: one headed section per class, rows in within-class order', async () => {
    await mountTower('?profile=p', GROUPED)
    expect(root().getAttribute('data-class-display')).toBe('grouped')
    const g = groups()
    expect(g.map((x) => x.carClass).sort()).toEqual(['GT3', 'GTP', 'LMP2'])
    const bySlots = Object.fromEntries(g.map((x) => [x.carClass, x.slots]))
    expect(bySlots).toEqual({
      GTP: ['car-1', 'car-44'],
      GT3: ['car-14', 'car-23'],
      LMP2: ['car-8', 'car-31'],
    })
    expect(g.every((x) => x.count === '2 cars')).toBe(true)
  })

  it('grouped profile: positions restart at 1 in each class', async () => {
    await mountTower('?profile=p', GROUPED)
    expect(groups().map((x) => x.positions)).toEqual([['1', '2'], ['1', '2'], ['1', '2']])
  })

  it('grouped profile + ?class=GT3: only the GT3 section, headed, with its two cars', async () => {
    await mountTower('?profile=p&class=GT3', GROUPED)
    expect(groups().map((x) => [x.carClass, x.slots])).toEqual([['GT3', ['car-14', 'car-23']]])
  })

  it('inline profile: one overall list in position order and no group headers', async () => {
    await mountTower('?profile=p', INLINE)
    expect(root().getAttribute('data-class-display')).toBe('inline')
    expect(document.querySelectorAll('[data-testid="tower-group"]')).toHaveLength(0)
    expect(allSlots()).toEqual(['car-1', 'car-14', 'car-44', 'car-8', 'car-23', 'car-31'])
  })

  it('no profile: the default inline list', async () => {
    await mountTower('', {})
    expect(root().getAttribute('data-class-display')).toBe('inline')
    expect(document.querySelectorAll('[data-testid="tower-group"]')).toHaveLength(0)
  })

  it('inline profile + ?classDisplay=grouped: the URL has no say, the tower stays inline', async () => {
    await mountTower('?profile=p&classDisplay=grouped', INLINE)
    expect(root().getAttribute('data-class-display')).toBe('inline')
    expect(document.querySelectorAll('[data-testid="tower-group"]')).toHaveLength(0)
  })
})

// Rule 18: slot = viewport height less the safe-area inset at the top and the bottom. happy-dom
// resolves no padding, so the page falls back to 48px, the value of `--bc-inset-safe`.
const INNER_HEIGHT = 500
const SAFE_INSET_PX = 48

/** 30 cars over three classes, ten each, taller than any 404px slot. */
const bigMulticlass = {
  ...multiClass,
  vehicles: Array.from({ length: 30 }, (_, i) => ({
    slot_id: `car-${i + 1}`,
    driver_name: `D${i + 1}`,
    vehicle_class: ['GTP', 'GT3', 'LMP2'][i % 3],
    position: i + 1,
    gap_to_leader: i === 0 ? 0 : i,
  })),
}

describe('standalone /tower — a grouped tower is bounded at the derived slot (rule 18)', () => {
  it('grouped profile, 30 cars, innerHeight 500: the tower is clamped to the 404px slot', async () => {
    await mountTower('?profile=p', GROUPED, bigMulticlass, INNER_HEIGHT)
    expect(document.querySelectorAll('[data-testid="tower-group"]')).toHaveLength(3)
    const tower = root()
    // Only the tower root clips its own rows (a wrapper with no overflow does not), and the
    // check reads inline style only: a bound set in a stylesheet would not be seen here.
    const slotPx = `${INNER_HEIGHT - 2 * SAFE_INSET_PX}px`
    expect(tower.style.maxHeight, 'the tower root is not bounded to the slot').toBe(slotPx)
    // A fixed height would draw a tall empty plate under a short grouped field.
    expect(tower.style.height).toBe('')
  })

  it('inline profile, 30 cars: the inline layout gets no inline bound (selection, not the clamp, bounds it)', async () => {
    await mountTower('?profile=p', INLINE, bigMulticlass, INNER_HEIGHT)
    expect(root().getAttribute('data-class-display')).toBe('inline')
    expect(root().style.maxHeight).toBe('')
    expect(root().style.height).toBe('')
  })

  it('grouped profile with the class tags hidden renders inline and gets no inline bound', async () => {
    const singleClass = { ...bigMulticlass, session: { ...bigMulticlass.session, multiclass: false } }
    await mountTower('?profile=p', GROUPED, singleClass, INNER_HEIGHT)
    expect(root().getAttribute('data-class-display')).toBe('inline')
    expect(document.querySelectorAll('[data-testid="tower-group"]')).toHaveLength(0)
    expect(root().style.maxHeight).toBe('')
    expect(root().style.height).toBe('')
  })
})
