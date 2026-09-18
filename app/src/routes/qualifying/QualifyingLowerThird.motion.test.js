import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import QualifyingLowerThird from './QualifyingLowerThird.svelte'
import qualTarget from '../../../../spec/v1/fixtures/qualifying-target.json'
import qualSectorA from '../../../../spec/v1/fixtures/qualifying-sector-a.json'

// #185 — same shared-shell mechanism as DriverLowerThird.motion.test.js: a mid-dwell
// recut keeps the OLD plate mounted for its full exit while the NEW one mounts
// immediately, so both exist at once for ~620ms. Under this suite's global reduced-
// motion default (test-setup.js) that window collapses to 0ms and the bug never
// shows up in a test — so, like the driver widget, this needs real motion forced on.
function setReducedMotion(reduce) {
  document.documentElement.dataset.motion = reduce ? 'reduced' : 'full'
}

// happy-dom has no Web Animations API; mirrors DriverLowerThird.motion.test.js.
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

describe('QualifyingLowerThird — recut plates share one anchor under real motion (#185)', () => {
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

  it('the exiting and entering plates share one stable anchor, not the raw container', async () => {
    // Same mechanism and same environment limitation as the driver widget's
    // equivalent test: happy-dom resolves neither `getComputedStyle` nor scoped
    // `<style>` text for Svelte components, so this asserts the DOM shape the fix
    // requires (a single stable `.lt3-anchor` parenting both plates) rather than
    // the CSS `position` value itself.
    const { container, rerender } = render(QualifyingLowerThird, {
      snapshot: qualSectorA, // car-16, Leclerc — fires on connect
      widget: { trigger: 'dwell', dwellSeconds: 6, modes: ['qualifying', 'practice'] },
    })
    await tick()
    expect(container.querySelector('.lt3')).not.toBeNull()

    // Cut to a different on-camera driver mid-dwell (well under the 6s dwell).
    await rerender({
      snapshot: qualTarget, // car-1, Verstappen
      widget: { trigger: 'dwell', dwellSeconds: 6, modes: ['qualifying', 'practice'] },
    })
    await tick()

    const exiting = container.querySelector('.lt3.lt3--exit')
    const incoming = container.querySelector('.lt3:not(.lt3--exit)')
    expect(exiting).not.toBeNull() // old plate still animating out
    expect(incoming).not.toBeNull() // new plate already mounted
    expect(
      incoming.querySelector('[data-testid="qt-name"]').textContent.trim(),
    ).toBe('Verstappen')

    const anchor = container.querySelector('.lt3-anchor')
    expect(anchor).not.toBeNull()
    expect(exiting.parentElement).toBe(anchor)
    expect(incoming.parentElement).toBe(anchor)

    // Once the exit finishes, exactly one plate remains under the same anchor.
    await vi.advanceTimersByTimeAsync(800)
    await tick()
    expect(container.querySelectorAll('.lt3')).toHaveLength(1)
    expect(container.querySelector('.lt3').parentElement).toBe(anchor)
  })
})
