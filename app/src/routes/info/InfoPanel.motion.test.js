/* Info panel — the reveal and the line crossfade under real motion (#62).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rule 81, overlay-config.md rule 10, ADR 0024.
 * The rest of the suite runs under the global reduced-motion default, where the lower-third
 * shell's exit and the line fade have duration 0, so it cannot see the wipe or the crossfade.
 * These cases force full motion (the root `data-motion` attribute, lib/motion.js) and assert
 * the panel sits in the shared lower-third plate, wipes out when it empties, does not re-wipe
 * on a line or header change, crossfades one line into the next over 300 ms, and shows the
 * first line after an empty list (and drops the last one before it) at once, with no fade.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { flushSync, tick } from 'svelte'
import fixture from '../../../../spec/v1/fixtures/event-info.json'

const MODULE = './InfoPanel.svelte'
async function loadPanel() {
  try {
    return (await import(/* @vite-ignore */ MODULE)).default
  } catch (err) {
    throw new Error(
      `could not load app/src/routes/info/InfoPanel.svelte: ${String(err?.message).split('\n')[0]}`,
      { cause: err },
    )
  }
}

// happy-dom has no Web Animations API; Svelte's non-zero-duration transitions call
// element.animate(). A minimal timer-backed stand-in (as DriverLowerThird.motion.test.js).
// Every element handed to animate() is recorded in `animated`, so a test can tell whether a
// line was faded at all.
const animated = new Set()
function installAnimatePolyfill() {
  const Ctor = window.Element ?? Element
  const original = Ctor.prototype.animate
  Ctor.prototype.animate = function (_keyframes, options) {
    const duration = (options && options.duration) || 0
    if (duration > 0) animated.add(this)
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

const [L0, L1] = fixture.info_lines
const bare = () => {
  const s = structuredClone(fixture)
  delete s.event
  delete s.info_lines
  return s
}
const lineTexts = (container) =>
  [...container.querySelectorAll('[data-testid="info-line"]')].map((el) => el.textContent.trim())

describe('info panel — wipe and crossfade under real motion (rule 81)', () => {
  let restoreAnimate
  beforeEach(() => {
    document.documentElement.dataset.motion = 'full'
    animated.clear()
    restoreAnimate = installAnimatePolyfill()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    restoreAnimate()
    document.documentElement.dataset.motion = 'reduced'
    cleanup()
  })

  it('sits in the lower-third plate and plays the wipe-out when it goes back to drawing nothing', async () => {
    const Panel = await loadPanel()
    const { container, rerender } = render(Panel, { snapshot: fixture, dwellSeconds: 8, lines: [] })
    await tick()
    flushSync()

    const plate = container.querySelector('.lt3')
    expect(plate, 'the panel must sit in the shared lower-third shell').not.toBeNull()
    expect(plate.querySelector('[data-testid="info-panel"]')).not.toBeNull()
    expect(plate.classList.contains('lt3--exit')).toBe(false)

    await rerender({ snapshot: bare() })
    flushSync()
    const exiting = container.querySelector('.lt3')
    expect(exiting, 'the plate lingers for the wipe-out instead of vanishing').not.toBeNull()
    expect(exiting.classList.contains('lt3--exit')).toBe(true)

    vi.advanceTimersByTime(700)
    flushSync()
    expect(container.querySelector('.lt3'), 'gone once the wipe-out finishes').toBeNull()
  })

  it('does not replay the wipe on a line change or a header change', async () => {
    const Panel = await loadPanel()
    const { container, rerender } = render(Panel, { snapshot: fixture, dwellSeconds: 8, lines: [] })
    await tick()
    flushSync()
    const plate = container.querySelector('.lt3')
    expect(plate, 'no lower-third plate').not.toBeNull()

    vi.advanceTimersByTime(8000) // L0 -> L1
    flushSync()
    await rerender({ snapshot: { ...structuredClone(fixture), event: { round: 4, track: 'Monza' } } })
    flushSync()
    vi.advanceTimersByTime(400)
    flushSync()

    const plates = [...container.querySelectorAll('.lt3')]
    expect(plates, 'one plate throughout').toHaveLength(1)
    expect(plates[0], 'the same plate node: it was never remounted').toBe(plate)
    expect(plates[0].classList.contains('lt3--exit')).toBe(false)
  })

  it('crossfades a line change over 300 ms: both lines for the fade, then only the new one', async () => {
    const Panel = await loadPanel()
    const { container } = render(Panel, { snapshot: fixture, dwellSeconds: 8, lines: [] })
    await tick()
    flushSync()
    expect(lineTexts(container)).toEqual([L0])

    vi.advanceTimersByTime(8000) // the dwell ends: L1 replaces L0
    flushSync()
    expect(lineTexts(container).sort(), 'the outgoing and incoming lines share the row').toEqual([L0, L1].sort())

    vi.advanceTimersByTime(250)
    flushSync()
    expect(lineTexts(container), 'still fading at 250 ms').toHaveLength(2)

    vi.advanceTimersByTime(100) // 350 ms
    flushSync()
    expect(lineTexts(container), 'the outgoing line is gone once the fade ends').toEqual([L1])
  })

  it('shows the first line after an empty list, and drops the last line before one, at once with no fade', async () => {
    const Panel = await loadPanel()
    const headerOnly = { ...structuredClone(fixture), info_lines: [] }
    const { container, rerender } = render(Panel, { snapshot: headerOnly, dwellSeconds: 8, lines: [] })
    await tick()
    flushSync()
    expect(container.querySelector('[data-testid="info-header"]'), 'the panel is up with its header').not.toBeNull()
    expect(lineTexts(container)).toEqual([])

    await rerender({ snapshot: { ...headerOnly, info_lines: ['First line'] } })
    flushSync()
    const first = container.querySelector('[data-testid="info-line"]')
    expect(first, 'the first line appears at once').not.toBeNull()
    expect(first.textContent.trim()).toBe('First line')
    expect(animated.has(first), 'the first line after an empty list must not fade in').toBe(false)

    await rerender({ snapshot: headerOnly })
    flushSync()
    expect(lineTexts(container), 'the last line goes at once, with no fade-out').toEqual([])
    expect(container.querySelector('[data-testid="info-header"]')).not.toBeNull()
  })
})
