/* Auto-hide follows the battle box's exit grace (#204).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rules 36 and 39, ADR 0013. With
 * `hideWhenIdle` on, /all must keep the battle slot through the grace — dropping it on the
 * first idle snapshot is exactly the on/off flicker the issue reports — and must drop it
 * at once under caution. Timers are faked so the grace is exact.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import { isWidgetIdle } from '../../lib/widgetIdle.js'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
import fcy from '../../../../spec/v1/fixtures/race-session-fcy.json'

const clone = (o) => JSON.parse(JSON.stringify(o))
const idleSame = () => ({
  ...clone(closeBattle),
  relationship: { gap_ahead: null, gap_behind: null, battle_intensity: 0 },
})
const idleOther = () => ({
  ...idleSame(),
  subject: { slot_id: 'car-16', driver_name: 'Leclerc' },
})

const cfg = normalizeConfig({ widgets: { battle: { visible: true, hideWhenIdle: true } } })
const slot = (container) => container.querySelector('[data-testid="widget-battle"]')

function advance(ms) {
  vi.advanceTimersByTime(ms)
  flushSync()
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AllView — hideWhenIdle follows the battle exit grace (rule 39)', () => {
  it('keeps the battle slot, showing the held battle, through the grace; drops it after', async () => {
    const { container, rerender } = render(AllView, { snapshot: closeBattle, config: cfg })
    flushSync()
    expect(slot(container)?.textContent).toContain('+0.4')

    await rerender({ snapshot: idleSame(), config: cfg })
    advance(4900)
    expect(slot(container), 'battle slot dropped inside the grace').not.toBeNull()
    expect(slot(container).textContent).toContain('+0.4')

    advance(200)
    expect(slot(container)).toBeNull()
  })

  it('drops the slot at once when the camera cuts to an idle subject during the grace', async () => {
    const { container, rerender } = render(AllView, { snapshot: closeBattle, config: cfg })
    flushSync()
    await rerender({ snapshot: idleSame(), config: cfg })
    advance(1000)
    await rerender({ snapshot: idleOther(), config: cfg })
    flushSync()
    expect(slot(container)).toBeNull()
  })

  it('drops the slot under caution, even with live gaps', () => {
    const { container } = render(AllView, { snapshot: fcy, config: cfg })
    flushSync()
    expect(slot(container)).toBeNull()
  })
})

describe('battle idle predicate under caution (rule 36)', () => {
  const withSession = (session) => ({ ...clone(closeBattle), session })

  it('is idle under full-course yellow or a safety car', () => {
    expect(isWidgetIdle('battle', { snapshot: fcy })).toBe(true)
    expect(isWidgetIdle('battle', { snapshot: withSession({ full_course_yellow: true }) })).toBe(true)
    expect(isWidgetIdle('battle', { snapshot: withSession({ safety_car: true }) })).toBe(true)
  })

  it('is not idle for a live battle under a local yellow or no session at all', () => {
    expect(isWidgetIdle('battle', { snapshot: withSession({ flag: 'yellow' }) })).toBe(false)
    expect(isWidgetIdle('battle', { snapshot: closeBattle })).toBe(false)
  })
})
