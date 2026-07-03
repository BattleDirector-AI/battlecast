import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import Harness from './LowerThirdShellHarness.svelte'
import { reduceMotion, lowerThirdOut } from './LowerThirdShell.svelte'

// The global test setup (src/test-setup.js) stubs matchMedia to report
// `prefers-reduced-motion: reduce`. Some cases below re-stub it to no-preference
// to exercise the animated path; restore the reduced default afterwards.
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

afterEach(() => {
  cleanup()
  setReducedMotion(true) // restore the global default
})

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
