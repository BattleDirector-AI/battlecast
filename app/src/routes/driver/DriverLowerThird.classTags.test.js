/* #21 driver lower-third — class tags in a single-class session (widgets.md rules 60, 62,
 * ADR 0022). `race-single-class.json`: Jacobs (car-7, P2, class "Default") on camera,
 * `session.multiclass: false`. The card reads the snapshot's session and the broadcaster
 * setting as `classTags`. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import DriverLowerThird from './DriverLowerThird.svelte'
import singleClass from '../../../../spec/v1/fixtures/race-single-class.json'
import subjectA from '../../../../spec/v1/fixtures/driver-subject-a.json'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const withSession = (fixture, session) => ({ ...fixture, session })
const card = (c) => c.querySelector('[data-testid="driver-lower-third"]')
const chips = (c) => Array.from(c.querySelectorAll('.bc-class-chip')).map((el) => el.textContent.trim())
const nameOf = (c) => c.querySelector('[data-testid="driver-lt-name"]')?.textContent.trim()
const posOf = (c) => c.querySelector('[data-testid="driver-lt-pos"]')?.textContent.trim()

async function mount(snapshot, props = {}) {
  const r = render(DriverLowerThird, { snapshot, widget: {}, ...props })
  await tick()
  return r
}

describe('driver lower-third class chip', () => {
  it('auto + multiclass false: the card shows name and position, no class chip', async () => {
    const { container } = await mount(singleClass, { classTags: 'auto' })
    expect(card(container)).not.toBeNull()
    expect(nameOf(container)).toBe('E. Jacobs')
    expect(posOf(container)).toBe('P2')
    expect(chips(container)).toEqual([])
    expect(container.textContent).not.toMatch(/DEFAULT/i)
  })

  it('auto is the default when the card is given no classTags', async () => {
    const { container } = await mount(singleClass)
    expect(card(container)).not.toBeNull()
    expect(chips(container)).toEqual([])
  })

  it('auto + multiclass absent: the chip shows', async () => {
    const { container } = await mount(withSession(singleClass, { flag: 'green' }), { classTags: 'auto' })
    expect(chips(container)).toEqual(['DEFAULT'])
  })

  it('show + multiclass false: the chip shows', async () => {
    const { container } = await mount(singleClass, { classTags: 'show' })
    expect(chips(container)).toEqual(['DEFAULT'])
  })

  it('hide + a multi-class field with no flag: no chip, the card still fires', async () => {
    const { container } = await mount(subjectA, { classTags: 'hide' })
    expect(nameOf(container)).toBe('Hamilton')
    expect(posOf(container)).toBe('P1')
    expect(chips(container)).toEqual([])
  })

  it('a card on screen loses its chip with the latest snapshot and keeps its dwell (no re-fire)', async () => {
    const widget = { trigger: 'dwell', dwellSeconds: 4 }
    const { container, rerender } = await mount(withSession(singleClass, { multiclass: true }), {
      widget,
      classTags: 'auto',
    })
    expect(chips(container)).toEqual(['DEFAULT'])

    await vi.advanceTimersByTimeAsync(2000)
    await rerender({ snapshot: singleClass, widget, classTags: 'auto' })
    await tick()
    expect(card(container), 'the card went away').not.toBeNull()
    expect(nameOf(container)).toBe('E. Jacobs')
    expect(chips(container)).toEqual([])

    // The original 4 s dwell still ends the card: hiding the chip did not restart it.
    await vi.advanceTimersByTimeAsync(2000)
    await tick()
    expect(card(container), 'the card re-fired on the chip change').toBeNull()
  })
})
