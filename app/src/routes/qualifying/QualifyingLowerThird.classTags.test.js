/* #22 qualifying lower-third — class tags in a single-class session (widgets.md rules 60, 62,
 * ADR 0022). `race-single-class.json` re-moded to `qualifying` so the card fires on connect for
 * Jacobs (car-7, best 1:38.320, class "Default"); the fixture says `session.multiclass: false`. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import QualifyingLowerThird from './QualifyingLowerThird.svelte'
import singleClass from '../../../../spec/v1/fixtures/race-single-class.json'
import qualTarget from '../../../../spec/v1/fixtures/qualifying-target.json'
import racePreClassBest from '../../../../spec/v1/fixtures/race-pre-class-best.json'
import raceClassBest from '../../../../spec/v1/fixtures/race-class-best.json'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const qual = { ...singleClass, mode: 'qualifying' }
const withSession = (fixture, session) => ({ ...fixture, session })
const card = (c) => c.querySelector('[data-testid="qualifying-lower-third"]')
const chips = (c) => Array.from(c.querySelectorAll('.bc-class-chip')).map((el) => el.textContent.trim())
const txt = (c, id) => c.querySelector(`[data-testid="${id}"]`)?.textContent.trim()

async function mount(snapshot, props = {}) {
  const r = render(QualifyingLowerThird, { snapshot, widget: {}, ...props })
  await tick()
  return r
}

describe('qualifying lower-third class chip', () => {
  it('auto + multiclass false: timing renders, no class chip', async () => {
    const { container } = await mount(qual, { classTags: 'auto' })
    expect(card(container)).not.toBeNull()
    expect(txt(container, 'qt-best')).toBe('1:38.320')
    expect(chips(container)).toEqual([])
    expect(container.textContent).not.toMatch(/DEFAULT/i)
  })

  it('auto is the default when the card is given no classTags', async () => {
    const { container } = await mount(qual)
    expect(card(container)).not.toBeNull()
    expect(chips(container)).toEqual([])
  })

  it('auto + multiclass absent: the chip shows', async () => {
    const { container } = await mount(withSession(qual, { flag: 'green' }), { classTags: 'auto' })
    expect(chips(container)).toEqual(['DEFAULT'])
  })

  it('show + multiclass false: the chip shows', async () => {
    const { container } = await mount(qual, { classTags: 'show' })
    expect(chips(container)).toEqual(['DEFAULT'])
  })

  it('hide + a field with no flag: no chip, timing unchanged', async () => {
    const { container } = await mount(qualTarget, { classTags: 'hide' })
    expect(txt(container, 'qt-best')).toBe('1:31.088')
    expect(chips(container)).toEqual([])
  })

  it('a class-best flash on screen loses its chip mid-flash, keeps flashing, and ends on its own timer', async () => {
    // Qualifying, no connect fire, so the only card is the flash. Alonso (car-14, GT3) on camera.
    const widget = { trigger: 'dwell', dwellSeconds: 6, fireOnClassBest: true, showOnConnect: false }
    const at = (fixture, multiclass) => ({ ...fixture, mode: 'qualifying', session: { multiclass } })
    const { container, rerender } = await mount(at(racePreClassBest, true), { widget, classTags: 'auto' })
    expect(card(container)).toBeNull()

    // The producer flags Alonso's class best: the flash fires, with his GT3 chip.
    await rerender({ snapshot: at(raceClassBest, true), widget, classTags: 'auto' })
    await tick()
    expect(txt(container, 'qt-label')).toBe('CLASS BEST')
    expect(txt(container, 'qt-name')).toBe('Alonso')
    expect(chips(container)).toEqual(['GT3'])

    // Mid-flash the producer reports a single-class session.
    await vi.advanceTimersByTimeAsync(2000)
    await rerender({ snapshot: at(raceClassBest, false), widget, classTags: 'auto' })
    await tick()
    expect(card(container), 'the flash ended early').not.toBeNull()
    expect(txt(container, 'qt-label')).toBe('CLASS BEST')
    expect(txt(container, 'qt-name')).toBe('Alonso')
    expect(chips(container)).toEqual([])

    // Still up just before the original 6 s, gone right after it: no re-fire, no restart.
    await vi.advanceTimersByTimeAsync(3900)
    await tick()
    expect(card(container), 'the flash ended early').not.toBeNull()
    await vi.advanceTimersByTimeAsync(200)
    await tick()
    expect(card(container), 'the flash outlived its original timer').toBeNull()
  })
})
