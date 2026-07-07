import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import Harness from './LowerThirdShellHarness.svelte'
import { reduceMotion, lowerThirdOut, lowerThirdIn } from './LowerThirdShell.svelte'

// Motion is resolved from the root `data-motion` attribute (see lib/motion.js), not
// the OS media query. The global test setup (src/test-setup.js) defaults it to
// `reduced`; some cases below flip it to `full` to exercise the animated path.
function setReducedMotion(reduce) {
  document.documentElement.dataset.motion = reduce ? 'reduced' : 'full'
}

afterEach(() => {
  cleanup()
  setReducedMotion(true) // restore the global default
})

// happy-dom has no Web Animations API, but Svelte's animated (non-zero-duration)
// transitions call element.animate(). Install a minimal, timer-backed stand-in so
// the motion path can be driven under fake timers. With our transitions there is
// no `tick`/`css`, so Svelte only ever touches onfinish / cancel / effect here.
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

describe('LowerThirdShell — plate/bar structure around slotted content', () => {
  it('renders the .lt3 plate, .lt3__inner clip and .lt3__bar sweep, wrapping the slot', () => {
    const { container } = render(Harness, { show: true })

    const plate = container.querySelector('.lt3')
    const inner = container.querySelector('.lt3__inner')
    const bar = container.querySelector('.lt3__bar')
    expect(plate).not.toBeNull()
    expect(inner).not.toBeNull()
    expect(bar).not.toBeNull()

    // The clip wrapper and the bar are children of the plate frame.
    expect(inner.parentElement).toBe(plate)
    expect(bar.parentElement).toBe(plate)
    // Slotted content is rendered inside the clipped inner wrapper.
    const slot = container.querySelector('[data-testid="slotted-content"]')
    expect(slot).not.toBeNull()
    expect(inner.contains(slot)).toBe(true)
    // The bar is decorative / hidden from assistive tech.
    expect(bar.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('LowerThirdShell — reduceMotion()', () => {
  it('reports true when the media query matches reduce', () => {
    setReducedMotion(true)
    expect(reduceMotion()).toBe(true)
  })

  it('reports false under no-preference', () => {
    setReducedMotion(false)
    expect(reduceMotion()).toBe(false)
  })
})

describe('LowerThirdShell — lowerThirdOut exit transition', () => {
  it('tags .lt3--exit and holds ~620ms when motion is allowed', () => {
    setReducedMotion(false)
    const node = document.createElement('div')
    node.className = 'lt3'
    const config = lowerThirdOut(node)
    expect(config.duration).toBe(620)
    expect(node.classList.contains('lt3--exit')).toBe(true)
  })

  it('is instant (duration 0, no exit class) under reduced motion', () => {
    setReducedMotion(true)
    const node = document.createElement('div')
    node.className = 'lt3'
    const config = lowerThirdOut(node)
    expect(config.duration).toBe(0)
    expect(node.classList.contains('lt3--exit')).toBe(false)
  })

  it('unmounts instantly under the reduced-motion default (no lingering node)', async () => {
    const { rerender, container } = render(Harness, { show: true })
    expect(container.querySelector('.lt3')).not.toBeNull()

    await rerender({ show: false })
    await tick()
    // duration-0 out transition => the plate is gone immediately, which is what
    // keeps the existing behavioral tests (card in lockstep with `shown`) green.
    expect(container.querySelector('.lt3')).toBeNull()
  })
})

describe('LowerThirdShell — lowerThirdIn entrance transition', () => {
  it('strips a stale .lt3--exit and is instant (duration 0)', () => {
    const node = document.createElement('div')
    node.className = 'lt3 lt3--exit'
    const config = lowerThirdIn(node)
    expect(config.duration).toBe(0)
    expect(node.classList.contains('lt3--exit')).toBe(false)
  })
})

// Regression: a camera re-cut that re-shows the widget DURING its ~620ms animated
// exit makes Svelte cancel the outro and REUSE the same DOM node. Without the
// paired `in:` transition the `.lt3--exit` class (and its opacity:0 / off-screen
// `both`-fill keyframe) would stay stuck and strand the re-shown graphic invisible.
// The rest of the suite forces reduced-motion (duration 0, class never added), so
// this block explicitly opts into the animated path where the bug lived.
describe('LowerThirdShell — interrupted exit clears the stale exit class (motion path)', () => {
  let restoreAnimate
  beforeEach(() => {
    setReducedMotion(false)
    restoreAnimate = installAnimatePolyfill()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    restoreAnimate()
  })

  it('re-showing mid-exit reuses the node and removes .lt3--exit', async () => {
    const { rerender, container } = render(Harness, { show: true })
    const nodeA = container.querySelector('.lt3')
    expect(nodeA).not.toBeNull()
    expect(nodeA.classList.contains('lt3--exit')).toBe(false)

    // Hide: the animated out-transition starts and tags .lt3--exit.
    await rerender({ show: false })
    await vi.advanceTimersByTimeAsync(200) // sit 200ms into the ~620ms out window
    const midNode = container.querySelector('.lt3')
    expect(midNode).toBe(nodeA) // still mounted, mid-exit
    expect(midNode.classList.contains('lt3--exit')).toBe(true)

    // Re-cut re-shows within the out window: Svelte cancels the outro and reuses
    // the SAME node. The paired in: transition must strip the stale class.
    await rerender({ show: true })
    await tick()
    const afterNode = container.querySelector('.lt3')
    expect(afterNode).toBe(nodeA) // regression guard: node was reused, not recreated
    expect(afterNode.classList.contains('lt3--exit')).toBe(false) // not stranded invisible
  })

  it('a clean hide→show after the exit completes still works', async () => {
    const { rerender, container } = render(Harness, { show: true })
    const nodeA = container.querySelector('.lt3')

    await rerender({ show: false })
    await vi.advanceTimersByTimeAsync(800) // let the full exit finish and unmount
    await tick()
    expect(container.querySelector('.lt3')).toBeNull()

    await rerender({ show: true })
    await tick()
    const reshown = container.querySelector('.lt3')
    expect(reshown).not.toBeNull()
    expect(reshown).not.toBe(nodeA) // a fresh node this time
    expect(reshown.classList.contains('lt3--exit')).toBe(false)
  })
})
