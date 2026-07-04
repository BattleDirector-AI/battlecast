import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import DriverLowerThird, { resolveSubject, isDriverSubjectIdle } from './DriverLowerThird.svelte'
import subjectA from '../../../../spec/v1/fixtures/driver-subject-a.json'
import subjectB from '../../../../spec/v1/fixtures/driver-subject-b.json'
import degraded from '../../../../spec/v1/fixtures/driver-degraded.json'
import noSubject from '../../../../spec/v1/fixtures/driver-no-subject.json'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const card = (c) => c.querySelector('[data-testid="driver-lower-third"]')
const nameOf = (c) => c.querySelector('[data-testid="driver-lt-name"]')?.textContent.trim()
const posOf = (c) => c.querySelector('[data-testid="driver-lt-pos"]')?.textContent.trim()
const recutKey = (c) => card(c)?.getAttribute('data-recut-key')

describe('DriverLowerThird — rendered identity card (#21)', () => {
  it('renders name, position and class for a valid on-camera subject', async () => {
    const { container } = render(DriverLowerThird, { snapshot: subjectA, widget: {} })
    await tick()

    expect(card(container)).not.toBeNull()
    expect(card(container).getAttribute('data-state')).toBe('valid')
    // Hamilton is P1; the name is broadcast-formatted (single name unchanged).
    expect(nameOf(container)).toBe('Hamilton')
    expect(posOf(container)).toBe('P1')
    // Class chip is rendered (gt3 -> GT3).
    expect(container.textContent).toContain('GT3')
  })

  it('formats a full name to "Initial. SURNAME" and shows the resolved position', async () => {
    const { container } = render(DriverLowerThird, { snapshot: subjectB, widget: {} })
    await tick()
    expect(nameOf(container)).toBe('C. Leclerc')
    expect(posOf(container)).toBe('P3')
  })

  it('degrades to name-only when the subject slot_id does not resolve to a vehicle', async () => {
    const { container } = render(DriverLowerThird, { snapshot: degraded, widget: {} })
    await tick()

    expect(card(container)).not.toBeNull()
    expect(card(container).getAttribute('data-state')).toBe('degraded')
    expect(nameOf(container)).toBe('O. Piastri')
    // No position and no class chip for a degraded subject.
    expect(container.querySelector('[data-testid="driver-lt-pos"]')).toBeNull()
    expect(container.textContent).not.toContain('GT3')
  })

  it('renders nothing (idle) when there is no valid subject', async () => {
    const { container } = render(DriverLowerThird, { snapshot: noSubject, widget: {} })
    await tick()
    expect(card(container)).toBeNull()
  })

  it('renders nothing before the first snapshot arrives', async () => {
    const { container } = render(DriverLowerThird, { snapshot: null, widget: {} })
    await tick()
    expect(card(container)).toBeNull()
  })
})

describe('DriverLowerThird — fire / dwell / switch behavior', () => {
  it('fires once on connect and auto-hides after the configured dwell', async () => {
    const { container } = render(DriverLowerThird, {
      snapshot: subjectA,
      widget: { trigger: 'dwell', dwellSeconds: 4 },
    })
    await tick()
    expect(card(container)).not.toBeNull() // fired on connect

    await vi.advanceTimersByTimeAsync(4000)
    await tick()
    expect(card(container)).toBeNull() // dwell elapsed -> hidden
  })

  it('does not fire on connect when showOnConnect is false, across the real null→snapshot sequence', async () => {
    // The render pages mount with snapshot=null and only later receive producer
    // data, so exercise that exact sequence (the null baseline must not count as
    // the connect fire).
    const { container, rerender } = render(DriverLowerThird, {
      snapshot: null,
      widget: { trigger: 'dwell', showOnConnect: false },
    })
    await tick()
    expect(card(container)).toBeNull()

    // First real snapshot arrives: this is the connect event -> suppressed.
    await rerender({ snapshot: subjectA, widget: { trigger: 'dwell', showOnConnect: false } })
    await tick()
    expect(card(container)).toBeNull()

    // A later genuine camera cut still fires.
    await rerender({ snapshot: subjectB, widget: { trigger: 'dwell', showOnConnect: false } })
    await tick()
    expect(card(container)).not.toBeNull()
    expect(nameOf(container)).toBe('C. Leclerc')
  })

  it('fires once on the first real subject after the null baseline (showOnConnect default)', async () => {
    const { container, rerender } = render(DriverLowerThird, {
      snapshot: null,
      widget: { trigger: 'dwell', dwellSeconds: 6 },
    })
    await tick()
    expect(card(container)).toBeNull() // null baseline: nothing yet

    await rerender({ snapshot: subjectA, widget: { trigger: 'dwell', dwellSeconds: 6 } })
    await tick()
    expect(card(container)).not.toBeNull()
    expect(nameOf(container)).toBe('Hamilton')
  })

  it('re-fires and updates the card in place on a camera cut', async () => {
    const { container, rerender } = render(DriverLowerThird, {
      snapshot: subjectA,
      widget: { trigger: 'dwell', dwellSeconds: 6 },
    })
    await tick()
    expect(nameOf(container)).toBe('Hamilton')

    // Camera cuts to Leclerc partway through Hamilton's dwell.
    await vi.advanceTimersByTimeAsync(3000)
    await rerender({ snapshot: subjectB, widget: { trigger: 'dwell', dwellSeconds: 6 } })
    await tick()
    expect(card(container)).not.toBeNull()
    expect(nameOf(container)).toBe('C. Leclerc')

    // The dwell was reset by the cut: still shown past Hamilton's original deadline.
    await vi.advanceTimersByTimeAsync(4000)
    await tick()
    expect(card(container)).not.toBeNull()
  })

  it('re-cut reveal: a camera cut remounts on the new identity and shows the new driver (#64)', async () => {
    // The re-cut reveal keys the shell on `subject.slot_id`, so a cut to a new
    // on-camera driver mid-dwell renders the NEW driver's content and advances the
    // recut key (the mechanism that remounts the shell to replay the reveal). Under
    // the test's reduced-motion default the remount is an instant, deterministic swap.
    const { container, rerender } = render(DriverLowerThird, {
      snapshot: subjectA,
      widget: { trigger: 'dwell', dwellSeconds: 6 },
    })
    await tick()
    expect(nameOf(container)).toBe('Hamilton')
    const keyA = recutKey(container)
    expect(keyA).toBe('car-44') // subjectA is Hamilton / car-44

    await vi.advanceTimersByTimeAsync(2000)
    await rerender({ snapshot: subjectB, widget: { trigger: 'dwell', dwellSeconds: 6 } })
    await tick()
    // New driver's content is rendered and the recut key advanced to the new slot.
    expect(nameOf(container)).toBe('C. Leclerc')
    expect(posOf(container)).toBe('P3')
    expect(recutKey(container)).toBe('car-16') // subjectB is Leclerc / car-16
    expect(recutKey(container)).not.toBe(keyA)
  })

  it('re-cut reveal: rapid A→B→A cuts leave exactly one card on the latest subject (#64)', async () => {
    // A→B→A within a dwell must not strand or stack orphan plates — keyed remounts
    // must resolve to a single card on the final subject.
    const { container, rerender } = render(DriverLowerThird, {
      snapshot: subjectA,
      widget: { trigger: 'dwell', dwellSeconds: 6 },
    })
    await tick()
    await rerender({ snapshot: subjectB, widget: { trigger: 'dwell', dwellSeconds: 6 } })
    await tick()
    await rerender({ snapshot: subjectA, widget: { trigger: 'dwell', dwellSeconds: 6 } })
    await tick()

    expect(
      container.querySelectorAll('[data-testid="driver-lower-third"]'),
    ).toHaveLength(1)
    expect(nameOf(container)).toBe('Hamilton')
    expect(recutKey(container)).toBe('car-44')
  })

  it('persistent mode stays shown while the subject is on camera (no dwell timeout)', async () => {
    const { container } = render(DriverLowerThird, {
      snapshot: subjectA,
      widget: { trigger: 'persistent' },
    })
    await tick()
    expect(card(container)).not.toBeNull()

    await vi.advanceTimersByTimeAsync(60000)
    await tick()
    expect(card(container)).not.toBeNull()
  })
})

describe('resolveSubject / isDriverSubjectIdle', () => {
  it('classifies valid, degraded and invalid subjects', () => {
    expect(resolveSubject(subjectA).state).toBe('valid')
    expect(resolveSubject(degraded).state).toBe('degraded')
    expect(resolveSubject(noSubject).state).toBe('invalid')
    expect(resolveSubject(null).state).toBe('invalid')
  })

  it('is idle only for an invalid subject', () => {
    expect(isDriverSubjectIdle(subjectA)).toBe(false)
    expect(isDriverSubjectIdle(degraded)).toBe(false)
    expect(isDriverSubjectIdle(noSubject)).toBe(true)
  })
})
