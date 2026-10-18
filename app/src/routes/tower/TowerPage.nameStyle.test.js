/* Standalone /tower — driver name style (widgets.md rule 46, overlay-config.md rule 42,
 * tower-overflow.md rule 20, ADR 0018). The standalone route renders short names with no
 * profile, and reads `nameStyle` from the same loaded profile it reads `maxRows`/`cycle`
 * from. Drives the PAGE, not the bare widget, because that is where the setting is sourced.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import TowerPage from './TowerPage.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

// The page opens an SSE feed on mount; happy-dom has no EventSource. Capture the state
// callback so the test can push a fixture at it.
const sse = vi.hoisted(() => ({ emit: null }))
vi.mock('../../lib/sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: (_url, onState) => {
    sse.emit = onState
    return () => {}
  },
}))

/** race-close-battle with two-word names. Order: Hamilton P1, Verstappen P2, Leclerc P3,
 *  Norris P4. */
const FIRST = { 'car-44': 'Lewis', 'car-1': 'Max', 'car-16': 'Charles', 'car-4': 'Lando' }
const named = {
  ...closeBattle,
  vehicles: closeBattle.vehicles.map((v) => ({
    ...v,
    driver_name: `${FIRST[v.slot_id]} ${v.driver_name}`,
  })),
}

const names = () =>
  Array.from(document.querySelectorAll('[data-testid="driver-name"]')).map((el) => el.textContent.trim())
const towerStyle = () => document.querySelector('[data-testid="standings-tower"]').style
const styleAttr = () =>
  document.querySelector('[data-testid="standings-tower"]')?.getAttribute('data-name-style')

async function mountTower(snapshot, { search = '', profile = null } = {}) {
  window.innerHeight = 800
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

const originalInnerHeight = window.innerHeight

// Full-style width hook (rule 48): canvas text measurement stubbed at 10px per code point.
let originalGetContext
beforeEach(() => {
  sse.emit = null
  // The name font counts as loaded (rule 48 measures only once it is).
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { check: () => true, ready: Promise.resolve(), addEventListener() {}, removeEventListener() {} },
  })
  originalGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function getContext(kind) {
    if (kind !== '2d') return null
    return { font: '', measureText: (text) => ({ width: [...String(text)].length * 10 }) }
  }
})
afterEach(() => {
  cleanup()
  HTMLCanvasElement.prototype.getContext = originalGetContext
  delete document.fonts
  vi.unstubAllGlobals()
  window.innerHeight = originalInnerHeight
  window.history.replaceState({}, '', '/')
})

describe('standalone /tower — name style', () => {
  it('renders short names with no profile', async () => {
    await mountTower(named)
    expect(names()).toEqual(['L.HAM', 'M.VER', 'C.LEC', 'L.NOR'])
    expect(styleAttr()).toBe('short')
    expect(towerStyle().minWidth).toBe('')
  })

  it('renders short names for a profile without the key', async () => {
    await mountTower(named, { search: '?profile=plain', profile: { widgets: { tower: { maxRows: 'auto' } } } })
    expect(names()).toEqual(['L.HAM', 'M.VER', 'C.LEC', 'L.NOR'])
  })

  it('renders full names when the loaded profile sets nameStyle: full', async () => {
    await mountTower(named, { search: '?profile=full', profile: { widgets: { tower: { nameStyle: 'full' } } } })
    expect(names()).toEqual(['L. Hamilton', 'M. Verstappen', 'C. Leclerc', 'L. Norris'])
    expect(styleAttr()).toBe('full')
    // No configured width on this route: --bc-tower-width, which happy-dom does not resolve,
    // so the 380 fallback. 'M. Verstappen' (130px) fits inside it.
    expect(towerStyle().minWidth).toBe('380px')
  })
})
