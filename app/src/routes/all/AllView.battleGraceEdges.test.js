/* Battle box exit grace — edge cases (#216): widgets.md rules 37, 37a, 37b, 39.
 *
 * Drives /all through AllView's public `snapshot` / `config` props, with timers faked so
 * the grace is exact. race-close-battle.json: Verstappen (car-1) on camera, Hamilton
 * ahead +0.4, Leclerc behind +1.8.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

const clone = (o) => JSON.parse(JSON.stringify(o))
const idleSame = () => ({
  ...clone(closeBattle),
  relationship: { gap_ahead: null, gap_behind: null, battle_intensity: 0 },
})
const cfg = (battle = {}) => normalizeConfig({ widgets: { battle: { visible: true, ...battle } } })
const battleText = (container) =>
  container.querySelector('[data-testid="widget-battle"]')?.textContent ?? ''

function advance(ms) {
  vi.advanceTimersByTime(ms)
  flushSync()
}

/** Mount on a live battle, then push the same subject going idle. */
async function holdStarted(config) {
  const r = render(AllView, { snapshot: closeBattle, config })
  flushSync()
  await r.rerender({ snapshot: idleSame(), config })
  flushSync()
  return r
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('grace length changed mid-hold (rule 37a)', () => {
  it('setting it to 0 ends the running hold at once', async () => {
    const { container, rerender } = await holdStarted(cfg())
    advance(1000)
    expect(battleText(container)).toContain('+0.4')

    await rerender({ snapshot: idleSame(), config: cfg({ idleGraceSeconds: 0 }) })
    flushSync()
    expect(battleText(container)).toContain('NO ACTIVE BATTLE')
    expect(battleText(container)).not.toContain('+0.4')
  })

  it('any other new value keeps the running hold on its original length and applies from the next exit', async () => {
    const { container, rerender } = await holdStarted(cfg())
    advance(1000)
    await rerender({ snapshot: idleSame(), config: cfg({ idleGraceSeconds: 10 }) })
    flushSync()

    advance(3900) // t = 4.9 s on the original 5 s hold
    expect(battleText(container)).toContain('+0.4')
    advance(200) // t = 5.1 s: the original length still governs
    expect(battleText(container)).toContain('NO ACTIVE BATTLE')

    // The next exit runs the new 10 s length.
    await rerender({ snapshot: closeBattle, config: cfg({ idleGraceSeconds: 10 }) })
    flushSync()
    await rerender({ snapshot: idleSame(), config: cfg({ idleGraceSeconds: 10 }) })
    flushSync()
    advance(9900)
    expect(battleText(container)).toContain('+0.4')
    advance(200)
    expect(battleText(container)).toContain('NO ACTIVE BATTLE')
  })
})

describe('a subject without a slot_id gets no hold (rule 37b)', () => {
  it('goes straight to the placeholder', async () => {
    const noSlot = (snap) => ({ ...snap, subject: { driver_name: 'Verstappen' } })
    const r = render(AllView, { snapshot: noSlot(closeBattle), config: cfg() })
    flushSync()
    expect(battleText(r.container)).toContain('+0.4')

    await r.rerender({ snapshot: noSlot(idleSame()), config: cfg() })
    flushSync()
    expect(battleText(r.container)).toContain('NO ACTIVE BATTLE')
    expect(battleText(r.container)).not.toContain('+0.4')
  })
})

describe('/all without hideWhenIdle (rule 37)', () => {
  it('keeps the slot and shows the held battle through the grace, then the placeholder', async () => {
    const { container } = await holdStarted(cfg({ hideWhenIdle: false }))
    advance(4900)
    expect(battleText(container)).toContain('HAM')
    expect(battleText(container)).toContain('+1.8')
    expect(battleText(container)).not.toContain('NO ACTIVE BATTLE')

    advance(200)
    expect(container.querySelector('[data-testid="widget-battle"]')).not.toBeNull()
    expect(battleText(container)).toContain('NO ACTIVE BATTLE')
  })
})

describe('no timer outlives the page', () => {
  it('unmounting /all mid-hold leaves no pending timer', async () => {
    const { unmount } = await holdStarted(cfg())
    advance(1000)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
