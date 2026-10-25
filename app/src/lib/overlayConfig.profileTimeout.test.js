/* A profile request that hangs falls back like one that fails (#354 review). Render pages open
 * the producer feed only once loadConfig resolves, so without a timeout a stuck companion
 * server would hold the overlay blank. Each candidate gets PROFILE_FETCH_TIMEOUT_MS; a hung
 * server-mode request moves on to static mode, and both hanging resolves to the default.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { loadConfig, normalizeConfig, DEFAULT_CONFIG, PROFILE_FETCH_TIMEOUT_MS } from './overlayConfig.js'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** A fetch that never answers, but rejects once its signal aborts (as the browser's does). */
const hang = (url, opts) =>
  new Promise((_, reject) => opts?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))

describe('loadConfig with a profile request that hangs', () => {
  it('resolves to the default once both candidates time out, and aborts each request', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const signals = []
    const fetchImpl = vi.fn((url, opts) => {
      signals.push(opts.signal)
      return hang(url, opts)
    })
    let result = null
    loadConfig('?profile=p', { fetchImpl }).then((c) => (result = c))
    await vi.advanceTimersByTimeAsync(PROFILE_FETCH_TIMEOUT_MS - 1)
    expect(result, 'still waiting on the first candidate').toBeNull()
    await vi.advanceTimersByTimeAsync(PROFILE_FETCH_TIMEOUT_MS + 1)
    expect(result).toEqual(normalizeConfig(DEFAULT_CONFIG))
    expect(fetchImpl.mock.calls.map(([u]) => u)).toEqual(['/api/profiles/p', '/config/p.json'])
    expect(signals.map((s) => s.aborted)).toEqual([true, true])
  })

  it('a hung server-mode request falls through to the static profile', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((url, opts) =>
      url.startsWith('/api/')
        ? hang(url, opts)
        : Promise.resolve({ ok: true, json: async () => ({ reducedMotion: true }) }),
    )
    let result = null
    loadConfig('?profile=p', { fetchImpl }).then((c) => (result = c))
    await vi.advanceTimersByTimeAsync(PROFILE_FETCH_TIMEOUT_MS)
    expect(result?.reducedMotion).toBe(true)
  })

  it('a hung profile rejects in strict mode, so the live-reload poll keeps the current config', async () => {
    vi.useFakeTimers()
    const outcome = loadConfig('?profile=p', { fetchImpl: hang, strict: true }).then(
      () => 'resolved',
      () => 'rejected',
    )
    await vi.advanceTimersByTimeAsync(2 * PROFILE_FETCH_TIMEOUT_MS)
    expect(await outcome).toBe('rejected')
  })
})
