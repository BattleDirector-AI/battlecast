/* Spec-first failing tests for live config reload (#115 / overlay-config rule 15).
 * watchConfig is an unimplemented skeleton, so these are RED until it lands. */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { watchConfig } from './configWatch.js'
import { normalizeConfig } from './overlayConfig.js'

afterEach(() => vi.useRealTimers())

describe('watchConfig — live profile reload (#115)', () => {
  it('re-reads on an interval and fires onChange only when the config actually changes', async () => {
    vi.useFakeTimers()
    const cfgA = normalizeConfig({ widgets: { tower: { x: 1 } } })
    const cfgB = normalizeConfig({ widgets: { tower: { x: 999 } } })
    const loadImpl = vi.fn(async () => cfgB) // every poll returns B
    const seen = []
    const stop = watchConfig('?profile=x', (c) => seen.push(c), {
      intervalMs: 1000,
      initial: cfgA,
      loadImpl,
    })

    await vi.advanceTimersByTimeAsync(1000) // poll -> B differs from A -> fire once
    await vi.advanceTimersByTimeAsync(1000) // poll -> B same as last -> no fire
    expect(seen).toHaveLength(1)
    expect(seen[0].widgets.tower.x).toBe(999)

    // stop() ends polling — no further loads.
    stop()
    const calls = loadImpl.mock.calls.length
    await vi.advanceTimersByTimeAsync(3000)
    expect(loadImpl.mock.calls.length).toBe(calls)
  })

  it('keeps polling (best-effort) when a load rejects — a failed poll just delays the change', async () => {
    vi.useFakeTimers()
    const cfgA = normalizeConfig({ widgets: { tower: { x: 1 } } })
    const cfgB = normalizeConfig({ widgets: { tower: { x: 2 } } })
    let n = 0
    const loadImpl = vi.fn(async () => {
      n += 1
      if (n === 1) throw new Error('network down')
      return cfgB
    })
    const seen = []
    const stop = watchConfig('?profile=x', (c) => seen.push(c), {
      intervalMs: 1000,
      initial: cfgA,
      loadImpl,
    })
    await vi.advanceTimersByTimeAsync(1000) // poll 1 rejects -> no fire, keep going
    await vi.advanceTimersByTimeAsync(1000) // poll 2 -> B -> fire
    expect(seen.map((c) => c.widgets.tower.x)).toEqual([2])
    stop()
  })
})
