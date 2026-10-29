/* Battle box exit grace with junk in the saved `lastActive.vehicles`: protocol-contract.md
 * rule 21, widgets.md rules 37 and 59. The hold renders the live snapshot over the frozen
 * battle's `vehicles`, so a junk entry in the snapshot that was active must not crash the held
 * box or cost it a neighbour. Driven from race-close-battle.json (Verstappen car-1 P2 on
 * camera, Hamilton ahead +0.4, Leclerc behind +1.8) via the standalone /battle page.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import BattlePage from './BattlePage.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

const sse = vi.hoisted(() => ({ emit: null }))
vi.mock('../../lib/sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: (_url, onState) => {
    sse.emit = onState
    return () => {}
  },
}))

const clone = (o) => JSON.parse(JSON.stringify(o))
const box = () => document.querySelector('[aria-label="Battle for position"]')
const text = () => box()?.textContent ?? ''
const push = (s) => {
  sse.emit(s)
  flushSync()
}

/** The active battle with junk entries spliced into vehicles[]. */
const activeWithJunk = (junk) => {
  const s = clone(closeBattle)
  s.vehicles = [junk, ...s.vehicles, junk, true]
  return s
}
/** Same subject, battle over, live vehicles empty: the hold must use the saved junk-laden list. */
const idleSame = () => {
  const s = clone(closeBattle)
  s.relationship = { gap_ahead: null, gap_behind: null, battle_intensity: 0 }
  s.vehicles = []
  return s
}

beforeEach(async () => {
  vi.useFakeTimers()
  window.history.replaceState({}, '', '/battle')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
  render(BattlePage)
  for (let i = 0; i < 5; i++) await tick()
  flushSync()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

// The number and string cases guard against crashes only (reading .slot_id of them does not
// throw); the array decoy below is the case that fails if the filter is removed.
describe('battle exit grace with junk saved vehicles (rule 21)', () => {
  it.each([
    ['null', null],
    ['a number', 7],
    ['a string', 'car-1'],
  ])('holds the battle with the real neighbours when the saved vehicles carry %s', (_l, junk) => {
    push(activeWithJunk(junk))
    expect(text()).toContain('HAM')
    expect(text()).toContain('LEC')

    push(idleSame())
    vi.advanceTimersByTime(4000)
    flushSync()
    expect(text()).not.toContain('NO ACTIVE BATTLE')
    expect(text()).toContain('HAM')
    expect(text()).toContain('LEC')
    expect(text()).toContain('+0.4')
    expect(text()).toContain('+1.8')

    vi.advanceTimersByTime(1200)
    flushSync()
    expect(text()).toContain('NO ACTIVE BATTLE')
  })

  it('an array carrying vehicle fields before the real cars is not the subject or a neighbour', () => {
    const decoy = Object.assign(['x'], { slot_id: 'car-1', position: 1, driver_name: 'Junk Ahead' })
    const s = clone(closeBattle)
    s.vehicles = [decoy, ...s.vehicles]
    push(s)
    expect(text()).toContain('HAM')
    expect(text()).not.toContain('J.AHE')

    push(idleSame())
    vi.advanceTimersByTime(4000)
    flushSync()
    expect(text()).toContain('HAM')
    expect(text()).not.toContain('J.AHE')
  })
})
