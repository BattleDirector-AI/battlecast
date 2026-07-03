import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import QualifyingLowerThird, { hasTiming, isQualifyingIdle } from './QualifyingLowerThird.svelte'
import qualTarget from '../../../../spec/v1/fixtures/qualifying-target.json'
import qualSectorA from '../../../../spec/v1/fixtures/qualifying-sector-a.json'
import qualNoTiming from '../../../../spec/v1/fixtures/qualifying-no-timing.json'
import racePreClassBest from '../../../../spec/v1/fixtures/race-pre-class-best.json'
import raceClassBest from '../../../../spec/v1/fixtures/race-class-best.json'
import raceCloseBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
import noSubject from '../../../../spec/v1/fixtures/driver-no-subject.json'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const card = (c) => c.querySelector('[data-testid="qualifying-lower-third"]')
const txt = (c, id) => c.querySelector(`[data-testid="${id}"]`)?.textContent.trim()

describe('QualifyingLowerThird — rendered timing bar (#22)', () => {
  it('renders best, last and sector times for the on-camera subject', async () => {
    // qualifying-target: subject car-1 Verstappen — best 91.088, last 91.204,
    // sectors [28.512, 31.150, 31.426].
    const { container } = render(QualifyingLowerThird, { snapshot: qualTarget, widget: {} })
    await tick()

    expect(card(container)).not.toBeNull()
    expect(txt(container, 'qt-name')).toBe('Verstappen')
    expect(txt(container, 'qt-best')).toBe('1:31.088')
    expect(txt(container, 'qt-last')).toBe('1:31.204')
    expect(txt(container, 'qt-s1')).toBe('28.512')
    expect(txt(container, 'qt-s2')).toBe('31.150')
    expect(txt(container, 'qt-s3')).toBe('31.426')
  })

  it('shows target and delta when the producer provides them', async () => {
    const { container } = render(QualifyingLowerThird, { snapshot: qualTarget, widget: {} })
    await tick()
    // target_lap 90.912 -> 1:30.912; delta_to_target 0.176 -> +0.176.
    expect(txt(container, 'qt-target')).toBe('1:30.912')
    expect(txt(container, 'qt-delta')).toBe('+0.176')
  })

  it('omits target/delta when the producer does not provide them', async () => {
    // qualifying-sector-a has best/last/sectors but no target_lap / delta_to_target.
    const { container } = render(QualifyingLowerThird, { snapshot: qualSectorA, widget: {} })
    await tick()
    expect(card(container)).not.toBeNull()
    expect(txt(container, 'qt-best')).toBe('1:28.912')
    expect(container.querySelector('[data-testid="qt-target-cell"]')).toBeNull()
    expect(container.querySelector('[data-testid="qt-delta-cell"]')).toBeNull()
  })
})

describe('QualifyingLowerThird — mode-gating (Decision C)', () => {
  it('fires on a camera cut in qualifying mode', async () => {
    // Connect on subject A (Leclerc), let the dwell expire, then cut to B (car-1).
    const { container, rerender } = render(QualifyingLowerThird, {
      snapshot: qualSectorA,
      widget: { trigger: 'dwell', dwellSeconds: 4 },
    })
    await tick()
    expect(card(container)).not.toBeNull() // connect fire in an eligible mode
    expect(txt(container, 'qt-name')).toBe('Leclerc')

    await vi.advanceTimersByTimeAsync(4000)
    await tick()
    expect(card(container)).toBeNull() // dwelled out

    // Camera cuts to car-1 (Verstappen) — a genuine cut in qualifying mode fires.
    await rerender({ snapshot: qualTarget, widget: { trigger: 'dwell', dwellSeconds: 4 } })
    await tick()
    expect(card(container)).not.toBeNull()
    expect(txt(container, 'qt-name')).toBe('Verstappen')
  })

  it('does NOT fire on a camera cut in race mode (mode-gated out)', async () => {
    // race-pre-class-best: subject Alonso, NOT a class best -> baseline, no fire.
    const { container, rerender } = render(QualifyingLowerThird, {
      snapshot: racePreClassBest,
      widget: { trigger: 'dwell', dwellSeconds: 6 },
    })
    await tick()
    expect(card(container)).toBeNull() // race + no class best -> nothing on connect

    // A camera cut to another race car (car-1, also no class best) still does nothing.
    await rerender({ snapshot: raceCloseBattle, widget: { trigger: 'dwell', dwellSeconds: 6 } })
    await tick()
    expect(card(container)).toBeNull()
  })
})

describe('QualifyingLowerThird — class-best flash (Decision C extension)', () => {
  it('fires the flash in race when the subject flag flips false→true', async () => {
    // Baseline: Alonso NOT class best (race, mode-gated out) -> no card.
    const { container, rerender } = render(QualifyingLowerThird, {
      snapshot: racePreClassBest,
      widget: { trigger: 'dwell', dwellSeconds: 5, fireOnClassBest: true },
    })
    await tick()
    expect(card(container)).toBeNull()

    // Same subject (Alonso) now flagged class best by the producer: false→true edge.
    await rerender({
      snapshot: raceClassBest,
      widget: { trigger: 'dwell', dwellSeconds: 5, fireOnClassBest: true },
    })
    await tick()
    expect(card(container)).not.toBeNull()
    expect(txt(container, 'qt-name')).toBe('Alonso')
    expect(txt(container, 'qt-label')).toBe('CLASS BEST') // flash badge in a gated mode

    // It is a dwell flash: auto-hides after dwellSeconds.
    await vi.advanceTimersByTimeAsync(5000)
    await tick()
    expect(card(container)).toBeNull()
  })

  it('does NOT flash for a pre-existing class-best flag on the baseline snapshot', async () => {
    // The very first snapshot already has class_best_lap: true — a pre-existing flag,
    // not a fresh achievement, so it must not fire (no false→true edge yet).
    const { container } = render(QualifyingLowerThird, {
      snapshot: raceClassBest,
      widget: { trigger: 'dwell', dwellSeconds: 5, fireOnClassBest: true },
    })
    await tick()
    expect(card(container)).toBeNull()
  })

  it('does not flash when fireOnClassBest is disabled', async () => {
    const { container, rerender } = render(QualifyingLowerThird, {
      snapshot: racePreClassBest,
      widget: { trigger: 'dwell', dwellSeconds: 5, fireOnClassBest: false },
    })
    await tick()
    expect(card(container)).toBeNull()

    await rerender({
      snapshot: raceClassBest,
      widget: { trigger: 'dwell', dwellSeconds: 5, fireOnClassBest: false },
    })
    await tick()
    expect(card(container)).toBeNull() // flash suppressed
  })
})

describe('QualifyingLowerThird — trigger reuse (dwell / showOnConnect)', () => {
  it('auto-hides after the configured dwell in an eligible mode', async () => {
    const { container } = render(QualifyingLowerThird, {
      snapshot: qualTarget,
      widget: { trigger: 'dwell', dwellSeconds: 3 },
    })
    await tick()
    expect(card(container)).not.toBeNull()
    await vi.advanceTimersByTimeAsync(3000)
    await tick()
    expect(card(container)).toBeNull()
  })

  it('does not fire on connect when showOnConnect is false, across the null→snapshot sequence', async () => {
    const { container, rerender } = render(QualifyingLowerThird, {
      snapshot: null,
      widget: { trigger: 'dwell', showOnConnect: false },
    })
    await tick()
    expect(card(container)).toBeNull()

    // First real (qualifying) snapshot is the connect event -> suppressed.
    await rerender({ snapshot: qualSectorA, widget: { trigger: 'dwell', showOnConnect: false } })
    await tick()
    expect(card(container)).toBeNull()

    // A later genuine cut still fires.
    await rerender({ snapshot: qualTarget, widget: { trigger: 'dwell', showOnConnect: false } })
    await tick()
    expect(card(container)).not.toBeNull()
    expect(txt(container, 'qt-name')).toBe('Verstappen')
  })

  it('persistent mode shows while the eligible subject is on camera (no dwell timeout)', async () => {
    const { container } = render(QualifyingLowerThird, {
      snapshot: qualTarget,
      widget: { trigger: 'persistent' },
    })
    await tick()
    expect(card(container)).not.toBeNull()
    await vi.advanceTimersByTimeAsync(60000)
    await tick()
    expect(card(container)).not.toBeNull()
  })
})

describe('QualifyingLowerThird — idle', () => {
  it('renders nothing for an invalid subject', async () => {
    const { container } = render(QualifyingLowerThird, { snapshot: noSubject, widget: {} })
    await tick()
    expect(card(container)).toBeNull()
  })

  it('renders nothing when the subject has no timing at all', async () => {
    const { container } = render(QualifyingLowerThird, { snapshot: qualNoTiming, widget: {} })
    await tick()
    expect(card(container)).toBeNull()
  })
})

describe('hasTiming / isQualifyingIdle', () => {
  it('hasTiming is true only when best/last/sectors exist', () => {
    expect(hasTiming(qualTarget.vehicles[1])).toBe(true) // car-1 has timing
    expect(hasTiming(qualNoTiming.vehicles[0])).toBe(false)
    expect(hasTiming(undefined)).toBe(false)
  })

  it('isQualifyingIdle is true for invalid subject or no timing, false with timing', () => {
    expect(isQualifyingIdle(noSubject)).toBe(true)
    expect(isQualifyingIdle(qualNoTiming)).toBe(true)
    expect(isQualifyingIdle(qualTarget)).toBe(false)
  })
})
