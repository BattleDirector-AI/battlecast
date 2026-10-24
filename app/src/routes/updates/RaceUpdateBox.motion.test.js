/* Race update box — the reveal under real motion (#27).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rule 74, overlay-config.md rule 10, ADR 0023.
 * The rest of the suite runs under the global reduced-motion default, where the lower-third
 * shell's exit has duration 0, so it cannot see whether the box uses the shared skewed
 * bar-wipe. These cases force full motion (the root `data-motion` attribute, lib/motion.js)
 * and assert the card sits in the shell's plate and plays the wipe-out when it ends, as
 * DriverLowerThird.motion.test.js does for the driver card.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { flushSync, tick } from 'svelte'
import fixture from '../../../../spec/v1/fixtures/race-events.json'

const MODULE = './RaceUpdateBox.svelte'
async function loadBox() {
  try {
    return (await import(/* @vite-ignore */ MODULE)).default
  } catch (err) {
    throw new Error(
      `could not load app/src/routes/updates/RaceUpdateBox.svelte: ${String(err?.message).split('\n')[0]}`,
      { cause: err },
    )
  }
}

// happy-dom has no Web Animations API; Svelte's non-zero-duration transitions call
// element.animate(). A minimal timer-backed stand-in (as DriverLowerThird.motion.test.js).
function installAnimatePolyfill() {
  const Ctor = window.Element ?? Element
  const original = Ctor.prototype.animate
  Ctor.prototype.animate = function (_keyframes, options) {
    const duration = (options && options.duration) || 0
    const anim = {
      onfinish: null,
      effect: null,
      currentTime: 0,
      playState: 'running',
      _cancelled: false,
      _timer: null,
      cancel() {
        this._cancelled = true
        this.playState = 'idle'
        if (this._timer != null) clearTimeout(this._timer)
      },
    }
    anim._timer = setTimeout(() => {
      anim._timer = null
      anim.playState = 'finished'
      if (!anim._cancelled && typeof anim.onfinish === 'function') anim.onfinish()
    }, duration)
    return anim
  }
  return () => {
    Ctor.prototype.animate = original
  }
}

const quiet = () => ({ ...structuredClone(fixture), race_events: [] })
const pen = (id) => ({ id, type: 'penalty', driver_name: 'Klaus Bachler', penalty: '+5s' })

describe('race update box — skewed bar-wipe under real motion (rule 74)', () => {
  let restoreAnimate
  beforeEach(() => {
    document.documentElement.dataset.motion = 'full'
    restoreAnimate = installAnimatePolyfill()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    restoreAnimate()
    document.documentElement.dataset.motion = 'reduced'
    cleanup()
  })

  it('renders the card inside the lower-third plate and plays the wipe-out when the box hides', async () => {
    const Box = await loadBox()
    const { container, rerender } = render(Box, { snapshot: quiet(), dwellSeconds: 8 })
    await tick()
    await rerender({ snapshot: { ...quiet(), race_events: [pen('a')] } })
    flushSync()

    const plate = container.querySelector('.lt3')
    expect(plate, 'the card must sit in the shared lower-third shell').not.toBeNull()
    expect(plate.querySelector('[data-testid="race-update"]').getAttribute('data-event-id')).toBe('a')
    expect(plate.classList.contains('lt3--exit')).toBe(false)

    vi.advanceTimersByTime(8000) // dwell over, nothing waiting
    flushSync()
    const exiting = container.querySelector('.lt3')
    expect(exiting, 'the plate lingers for the wipe-out instead of vanishing').not.toBeNull()
    expect(exiting.classList.contains('lt3--exit')).toBe(true)

    vi.advanceTimersByTime(700)
    flushSync()
    expect(container.querySelector('.lt3'), 'gone once the wipe-out finishes').toBeNull()
  })

  it('a waiting card replaces the one on screen with a fresh plate: old wipes out while new wipes in', async () => {
    const Box = await loadBox()
    const { container, rerender } = render(Box, { snapshot: quiet(), dwellSeconds: 8 })
    await tick()
    await rerender({ snapshot: { ...quiet(), race_events: [pen('a'), pen('b')] } })
    flushSync()
    const first = container.querySelector('.lt3')
    expect(first.querySelector('[data-testid="race-update"]').getAttribute('data-event-id')).toBe('a')

    vi.advanceTimersByTime(8000) // a's dwell ends; b is waiting
    flushSync()
    const plates = [...container.querySelectorAll('.lt3')]
    expect(plates, 'the swap is two plates for the length of the wipe, not new text in one').toHaveLength(2)
    const exiting = plates.filter((p) => p.classList.contains('lt3--exit'))
    const entering = plates.filter((p) => !p.classList.contains('lt3--exit'))
    expect(exiting).toHaveLength(1)
    expect(exiting[0], 'the outgoing plate is the original node, wiping out').toBe(first)
    expect(exiting[0].querySelector('[data-testid="race-update"]').getAttribute('data-event-id')).toBe('a')
    expect(entering).toHaveLength(1)
    expect(entering[0].querySelector('[data-testid="race-update"]').getAttribute('data-event-id')).toBe('b')

    vi.advanceTimersByTime(700) // the wipe-out finishes
    flushSync()
    const after = [...container.querySelectorAll('.lt3')]
    expect(after).toHaveLength(1)
    expect(after[0].querySelector('[data-testid="race-update"]').getAttribute('data-event-id')).toBe('b')

    // b's dwell counts from the swap at t = 8 s, not from when the wipe-out finished.
    vi.advanceTimersByTime(8000 - 700 - 1) // t = 15.999 s
    flushSync()
    expect(container.querySelector('.lt3:not(.lt3--exit)')).not.toBeNull()
    vi.advanceTimersByTime(1) // t = 16 s
    flushSync()
    expect(container.querySelector('.lt3:not(.lt3--exit)'), 'b ends a full dwell after the swap').toBeNull()
  })
})
