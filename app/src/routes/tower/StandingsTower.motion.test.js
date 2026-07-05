import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import StandingsTower from './StandingsTower.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

// #68 — the on-camera highlight glow never replayed when the camera cut to a NEW
// driver. The animation was `animation: row-oncam-in` on the persistent, constantly
// re-sorted `.row--oncam` node, and relying on a class ADD to (re)start a keyframe
// on a node that merely GAINS the class is unreliable. The fix renders a fresh,
// subject-keyed flash element only for the on-camera row, guaranteeing a new node
// (hence a fresh animation) on every switch. The whole suite ran under reduced
// motion (animation inert), which hid the problem — force no-preference here.
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

function rowFor(slotId) {
  return document.querySelector(`[data-testid="tower-row"][data-slot="${slotId}"]`)
}
const flashIn = (row) => row?.querySelector('[data-testid="row-oncam-flash"]')

describe('StandingsTower — on-camera highlight replays on switch under real motion (#68)', () => {
  beforeEach(() => setReducedMotion(false))
  afterEach(() => {
    setReducedMotion(true)
    cleanup()
  })

  it('renders a fresh flash element only for the on-camera row', () => {
    render(StandingsTower, { snapshot: closeBattle })
    // Verstappen (car-1) is on camera in this fixture.
    const oncam = rowFor('car-1')
    expect(oncam.getAttribute('data-oncam')).toBe('true')
    expect(flashIn(oncam)).not.toBeNull()

    // No other row carries a flash element.
    for (const slot of ['car-44', 'car-16', 'car-4']) {
      expect(flashIn(rowFor(slot))).toBeNull()
    }
  })

  it('mounts a NEW flash node when the on-camera subject changes (fresh animation)', async () => {
    const { rerender } = render(StandingsTower, { snapshot: closeBattle })
    const before = flashIn(rowFor('car-1'))
    expect(before).not.toBeNull()

    // Camera cut to Hamilton (car-44): the highlight moves. The new on-camera row
    // must carry a freshly-mounted flash element, and the old row must drop its own.
    await rerender({
      snapshot: { ...closeBattle, subject: { slot_id: 'car-44', driver_name: 'Hamilton' } },
    })
    await tick()

    const afterOncam = flashIn(rowFor('car-44'))
    expect(afterOncam).not.toBeNull()
    expect(flashIn(rowFor('car-1'))).toBeNull() // old row released the flash
    // Exactly one flash element in the whole tower.
    expect(document.querySelectorAll('[data-testid="row-oncam-flash"]')).toHaveLength(1)
  })

  it('re-mounts the flash even when the SAME row stays on camera but is re-cut to', async () => {
    // Cutting away and back to the same driver must replay the glow: because the
    // flash is keyed on the subject slot, a change away and back mounts a new node.
    const { rerender } = render(StandingsTower, { snapshot: closeBattle })
    const first = flashIn(rowFor('car-1'))
    expect(first).not.toBeNull()

    await rerender({
      snapshot: { ...closeBattle, subject: { slot_id: 'car-44', driver_name: 'Hamilton' } },
    })
    await tick()
    await rerender({ snapshot: closeBattle }) // back to car-1
    await tick()

    const second = flashIn(rowFor('car-1'))
    expect(second).not.toBeNull()
    expect(second).not.toBe(first) // a genuinely fresh node -> fresh animation
  })
})

describe('StandingsTower — flash under reduced motion (#68 regression guard)', () => {
  beforeEach(() => setReducedMotion(true))
  afterEach(() => cleanup())

  it('still marks the on-camera row without motion side effects', () => {
    render(StandingsTower, { snapshot: closeBattle })
    // The steady on-camera styling is unchanged; the flash element may still exist
    // but its animation is gated to no-preference so reduced-motion viewers get an
    // instant highlight (no glow keyframe).
    const oncam = rowFor('car-1')
    expect(oncam.classList.contains('row--oncam')).toBe(true)
    expect(oncam.getAttribute('aria-current')).toBe('true')
  })
})
