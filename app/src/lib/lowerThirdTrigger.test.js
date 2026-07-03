import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createLowerThirdTrigger, DEFAULT_DWELL_SECONDS } from './lowerThirdTrigger.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** Convenience: build an engine and record every shown-state flip it emits. */
function makeEngine() {
  const changes = []
  const engine = createLowerThirdTrigger({ onChange: (v) => changes.push(v) })
  return { engine, changes }
}

describe('lowerThirdTrigger — dwell mode (default)', () => {
  it('fires once for the current subject on connect (showOnConnect default)', () => {
    const { engine } = makeEngine()
    engine.sync({ subjectSlotId: 'car-1', active: true })
    expect(engine.shown).toBe(true)
  })

  it('does not fire on connect when showOnConnect is false, but still fires on the next cut', () => {
    const { engine } = makeEngine()
    engine.sync({ subjectSlotId: 'car-1', active: true, showOnConnect: false })
    expect(engine.shown).toBe(false)

    // A genuine change to a new subject still fires.
    engine.sync({ subjectSlotId: 'car-9', active: true, showOnConnect: false })
    expect(engine.shown).toBe(true)
  })

  it('auto-hides after dwellSeconds even though the subject stays on camera', () => {
    const { engine } = makeEngine()
    engine.sync({ subjectSlotId: 'car-1', active: true, dwellSeconds: 6 })
    expect(engine.shown).toBe(true)

    // The camera stays on car-1: the producer keeps sending the same subject.
    vi.advanceTimersByTime(5999)
    engine.sync({ subjectSlotId: 'car-1', active: true, dwellSeconds: 6 })
    expect(engine.shown).toBe(true) // still within the dwell window

    vi.advanceTimersByTime(1)
    expect(engine.shown).toBe(false) // dwell elapsed -> auto-hidden
  })

  it('uses the default dwell of 6s when none is given', () => {
    const { engine } = makeEngine()
    engine.sync({ subjectSlotId: 'car-1', active: true })
    vi.advanceTimersByTime(DEFAULT_DWELL_SECONDS * 1000 - 1)
    expect(engine.shown).toBe(true)
    vi.advanceTimersByTime(1)
    expect(engine.shown).toBe(false)
  })

  it('re-fires and resets the dwell in place on a camera cut (no hide→show flicker)', () => {
    const { engine, changes } = makeEngine()
    engine.sync({ subjectSlotId: 'car-1', active: true, dwellSeconds: 6 })
    expect(changes).toEqual([true])

    vi.advanceTimersByTime(4000) // partway through car-1's dwell
    // Cut to car-9: the card updates in place and the dwell restarts.
    engine.sync({ subjectSlotId: 'car-9', active: true, dwellSeconds: 6 })
    expect(engine.shown).toBe(true)
    // It never flickered off: `shown` only ever emitted `true` once so far.
    expect(changes).toEqual([true])

    // The dwell was reset: it survives past the original car-1 deadline...
    vi.advanceTimersByTime(3000) // total 7s from start, but only 3s into car-9
    expect(engine.shown).toBe(true)
    // ...and hides a full 6s after the cut.
    vi.advanceTimersByTime(3000)
    expect(engine.shown).toBe(false)
  })

  it('is edge-triggered: an unchanged subject repeated every snapshot does not re-fire', () => {
    const { engine } = makeEngine()
    engine.sync({ subjectSlotId: 'car-1', active: true, dwellSeconds: 6 })
    vi.advanceTimersByTime(6000)
    expect(engine.shown).toBe(false) // dwelled out

    // The camera is still on car-1; the same subject repeats. It must NOT re-fire.
    engine.sync({ subjectSlotId: 'car-1', active: true, dwellSeconds: 6 })
    expect(engine.shown).toBe(false)
  })

  it('re-fires on A → null → A (a genuine new cut back to A)', () => {
    const { engine } = makeEngine()
    engine.sync({ subjectSlotId: 'car-1', active: true, dwellSeconds: 6 })
    expect(engine.shown).toBe(true)

    // Cut away to nothing: hides immediately.
    engine.sync({ subjectSlotId: null, active: false, dwellSeconds: 6 })
    expect(engine.shown).toBe(false)

    // Cut back to car-1: a real edge, so it fires again.
    engine.sync({ subjectSlotId: 'car-1', active: true, dwellSeconds: 6 })
    expect(engine.shown).toBe(true)
  })

  it('cutting to an idle/invalid subject hides the card right away', () => {
    const { engine } = makeEngine()
    engine.sync({ subjectSlotId: 'car-1', active: true })
    expect(engine.shown).toBe(true)
    engine.sync({ subjectSlotId: null, active: false })
    expect(engine.shown).toBe(false)
  })

  it('stop() cancels a pending dwell so it never fires after teardown', () => {
    const { engine, changes } = makeEngine()
    engine.sync({ subjectSlotId: 'car-1', active: true, dwellSeconds: 6 })
    engine.stop()
    vi.advanceTimersByTime(10000)
    // Only the initial fire was emitted; the auto-hide was cancelled.
    expect(changes).toEqual([true])
    expect(engine.shown).toBe(true)
  })
})

describe('lowerThirdTrigger — persistent mode', () => {
  it('shows whenever the subject is active and hides when it goes invalid, with no timer', () => {
    const { engine } = makeEngine()
    engine.sync({ subjectSlotId: 'car-1', active: true, trigger: 'persistent' })
    expect(engine.shown).toBe(true)

    // No dwell timer: it stays shown indefinitely while active.
    vi.advanceTimersByTime(60000)
    engine.sync({ subjectSlotId: 'car-1', active: true, trigger: 'persistent' })
    expect(engine.shown).toBe(true)

    // Goes invalid -> hides immediately (level-triggered).
    engine.sync({ subjectSlotId: null, active: false, trigger: 'persistent' })
    expect(engine.shown).toBe(false)
  })
})
