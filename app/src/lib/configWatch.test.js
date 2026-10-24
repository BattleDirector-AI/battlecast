/* Tests for live config reload — watchConfig (#115 / overlay-config rule 22). */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { watchConfig } from './configWatch.js'
import { normalizeConfig, loadConfig } from './overlayConfig.js'

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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
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
    warn.mockRestore()
  })

  it('suppresses onChange when stop() is called while a load is in flight', async () => {
    vi.useFakeTimers()
    let resolveLoad
    const loadImpl = vi.fn(() => new Promise((r) => (resolveLoad = r)))
    const seen = []
    const stop = watchConfig('?profile=x', (c) => seen.push(c), {
      intervalMs: 1000,
      initial: null,
      loadImpl,
    })
    await vi.advanceTimersByTimeAsync(1000) // fires the poll, which awaits the pending load
    expect(loadImpl).toHaveBeenCalledTimes(1)
    stop() // stop while the load is still in flight
    resolveLoad(normalizeConfig({ widgets: { tower: { x: 5 } } })) // resolves after stop
    await Promise.resolve()
    await Promise.resolve()
    expect(seen).toHaveLength(0) // the post-await stopped-check suppresses it
  })
})

/* A failed poll keeps the current config (#353). These drive the DEFAULT load (real
 * `loadConfig`, strict) through a stubbed `fetch`, because the bug was the default load
 * resolving a failed fetch to the default layout, which the watcher then saw as a change. */
describe('watchConfig — a failed poll keeps the current config (#353)', () => {
  const PROFILE_A = { widgets: { tower: { x: 111 } } }
  const PROFILE_B = { widgets: { tower: { x: 222 } } }
  const ok = (body) => ({ ok: true, status: 200, json: async () => structuredClone(body) })

  /** What each companion-server failure mode looks like to `fetch`. */
  const FAILURES = {
    'a network error': async () => {
      throw new TypeError('Failed to fetch')
    },
    'a non-OK status': async () => ({ ok: false, status: 503, json: async () => ({}) }),
    'a deleted profile (404)': async () => ({ ok: false, status: 404, json: async () => ({}) }),
    'unparseable JSON': async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <')
      },
    }),
  }

  let respond
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function startOnA() {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    respond = async () => ok(PROFILE_A)
    vi.stubGlobal('fetch', vi.fn((url) => respond(url)))
    const initial = await loadConfig('?profile=p')
    expect(initial.widgets.tower.x, 'the page starts on profile A').toBe(111)
    const seen = []
    const stop = watchConfig('?profile=p', (c) => seen.push(c), { intervalMs: 1000, initial })
    return { seen, stop }
  }

  for (const [name, fail] of Object.entries(FAILURES)) {
    it(`${name}: no onChange, and recovery with the same profile fires nothing`, async () => {
      const { seen, stop } = await startOnA()
      respond = fail
      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(1000)
      expect(seen, 'a failed poll must not swap the config (to the default or anything)').toEqual([])

      respond = async () => ok(PROFILE_A) // server back, profile unchanged
      await vi.advanceTimersByTimeAsync(1000)
      expect(seen, 'no flip back either: A was never left').toEqual([])
      stop()
    })
  }

  it('recovery with a changed profile fires onChange once with the new profile', async () => {
    const { seen, stop } = await startOnA()
    respond = FAILURES['a network error']
    await vi.advanceTimersByTimeAsync(1000)
    respond = async () => ok(PROFILE_B) // server back with an edit made during the outage
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(seen.map((c) => c.widgets.tower.x)).toEqual([222])
    stop()
  })

  it('the initial load still resolves to the default when the profile cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn(FAILURES['a network error']))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = await loadConfig('?profile=p')
    expect(config).toEqual(normalizeConfig({}))
  })

  it('warns once when polls start failing, and again only after a poll has succeeded', async () => {
    const { stop } = await startOnA()
    const warn = console.warn
    respond = FAILURES['a network error']
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(warn, 'two failed polls in a row log one warning').toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(/profile poll failed; keeping the current layout/)

    respond = async () => ok(PROFILE_A)
    await vi.advanceTimersByTimeAsync(1000)
    expect(warn, 'a good poll logs nothing').toHaveBeenCalledTimes(1)

    respond = FAILURES['a non-OK status']
    await vi.advanceTimersByTimeAsync(1000)
    expect(warn, 'a new outage after a good poll warns again').toHaveBeenCalledTimes(2)
    stop()
  })

  it('strict mode resolves without a ?profile= (absent or blank) — there is nothing to fail', async () => {
    const fetchMock = vi.fn(FAILURES['a network error'])
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadConfig('', { strict: true })).resolves.toEqual(normalizeConfig({}))
    await expect(loadConfig('?profile=', { strict: true })).resolves.toEqual(normalizeConfig({}))
    await expect(loadConfig('?profile=%20%20', { strict: true })).resolves.toEqual(normalizeConfig({}))
    expect(fetchMock, 'no profile named, so nothing is fetched').not.toHaveBeenCalled()
  })
})
