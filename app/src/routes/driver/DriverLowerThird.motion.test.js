import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import DriverLowerThird from './DriverLowerThird.svelte'
import subjectA from '../../../../spec/v1/fixtures/driver-subject-a.json'
import subjectB from '../../../../spec/v1/fixtures/driver-subject-b.json'
import noSubject from '../../../../spec/v1/fixtures/driver-no-subject.json'

// #68 — the shipped exit choreography never fires under REAL motion because the
// shell's `out:` transition was local, so an ANCESTOR block teardown (the widget's
// `{#if shown}` / `{#key slot}`) removed the plate synchronously instead of playing
// the wipe-out. The rest of the suite runs under the global reduced-motion stub
// (duration 0), which masked this entirely — so these cases force no-preference and
// assert the exit actually lingers/animates.
function setReducedMotion(reduce) {
  window.matchMedia = (query) => ({
    matches: reduce && /prefers-reduced-motion:\s*reduce/.test(String(query)),
    media: String(query),
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })
}

// happy-dom has no Web Animations API; Svelte's non-zero-duration transitions call
// element.animate(). Install a minimal, timer-backed stand-in so the motion path
// can be driven under fake timers (mirrors LowerThirdShell.test.js).
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

const plate = (c) => c.querySelector('.lt3')
const card = (c) => c.querySelector('[data-testid="driver-lower-third"]')

describe('DriverLowerThird — exit animates under real motion (#68)', () => {
  let restoreAnimate
  beforeEach(() => {
    setReducedMotion(false)
    restoreAnimate = installAnimatePolyfill()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    restoreAnimate()
    setReducedMotion(true) // restore the global default
    cleanup()
  })

  it('plays the wipe-out on hide: the plate lingers with .lt3--exit instead of vanishing', async () => {
    const { container, rerender } = render(DriverLowerThird, {
      snapshot: subjectA,
      widget: { trigger: 'dwell', dwellSeconds: 6 },
    })
    await tick()
    expect(plate(container)).not.toBeNull() // fired on connect

    // Camera cuts away to an idle subject -> shown flips false -> the widget's
    // `{#if shown}` removes the shell. With a working exit the plate must HOLD for
    // the wipe-out (tagged .lt3--exit), not disappear synchronously.
    await rerender({ snapshot: noSubject, widget: { trigger: 'dwell', dwellSeconds: 6 } })
    await tick()

    const lingering = plate(container)
    expect(lingering).not.toBeNull() // exit engaged: node still mounted mid-transition
    expect(lingering.classList.contains('lt3--exit')).toBe(true)

    // After the full exit choreography the plate is gone (no stranded node).
    await vi.advanceTimersByTimeAsync(800)
    await tick()
    expect(plate(container)).toBeNull()
    expect(card(container)).toBeNull()
  })

  it('a driver change does wipe-out (old plate) -> wipe-in (new plate)', async () => {
    const { container, rerender } = render(DriverLowerThird, {
      snapshot: subjectA,
      widget: { trigger: 'dwell', dwellSeconds: 6 },
    })
    await tick()
    const first = plate(container)
    expect(first).not.toBeNull()

    // Cut to a new on-camera driver mid-dwell: the {#key slot} remounts. The OLD
    // shell must play its exit while the NEW shell enters.
    await rerender({ snapshot: subjectB, widget: { trigger: 'dwell', dwellSeconds: 6 } })
    await tick()

    const exiting = container.querySelector('.lt3.lt3--exit')
    expect(exiting).not.toBeNull() // old plate is animating out
    // The INCOMING plate (not the one exiting) shows the new driver.
    const incoming = container.querySelector('.lt3:not(.lt3--exit)')
    expect(incoming).not.toBeNull()
    expect(
      incoming.querySelector('[data-testid="driver-lt-name"]').textContent.trim(),
    ).toBe('C. Leclerc')

    // Once the exit finishes exactly one plate (the new one) remains.
    await vi.advanceTimersByTimeAsync(800)
    await tick()
    expect(container.querySelectorAll('.lt3')).toHaveLength(1)
    expect(container.querySelectorAll('[data-testid="driver-lower-third"]')).toHaveLength(1)
    expect(
      container.querySelector('[data-testid="driver-lt-name"]').textContent.trim(),
    ).toBe('C. Leclerc')
  })

  it('rapid A->B->A cuts do not strand or stack plates', async () => {
    const { container, rerender } = render(DriverLowerThird, {
      snapshot: subjectA,
      widget: { trigger: 'dwell', dwellSeconds: 6 },
    })
    await tick()
    await rerender({ snapshot: subjectB, widget: { trigger: 'dwell', dwellSeconds: 6 } })
    await tick()
    await rerender({ snapshot: subjectA, widget: { trigger: 'dwell', dwellSeconds: 6 } })
    await tick()

    // Let every outro settle.
    await vi.advanceTimersByTimeAsync(1200)
    await tick()

    expect(container.querySelectorAll('.lt3')).toHaveLength(1)
    expect(container.querySelectorAll('[data-testid="driver-lower-third"]')).toHaveLength(1)
    expect(
      container.querySelector('[data-testid="driver-lt-name"]').textContent.trim(),
    ).toBe('Hamilton')
  })
})

describe('DriverLowerThird — reduced motion stays instant (#68 regression guard)', () => {
  beforeEach(() => {
    setReducedMotion(true)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('hides synchronously with no lingering plate and no .lt3--exit', async () => {
    const { container, rerender } = render(DriverLowerThird, {
      snapshot: subjectA,
      widget: { trigger: 'dwell', dwellSeconds: 6 },
    })
    await tick()
    expect(plate(container)).not.toBeNull()

    await rerender({ snapshot: noSubject, widget: { trigger: 'dwell', dwellSeconds: 6 } })
    await tick()
    // duration-0 exit => gone immediately, nothing lingers.
    expect(plate(container)).toBeNull()
    expect(container.querySelector('.lt3--exit')).toBeNull()
  })
})
