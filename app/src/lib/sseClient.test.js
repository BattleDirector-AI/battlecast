/* The single shared SSE client (#158) — behavior contract for `src/lib/sseClient.js`: snapshot
 * delivery, the `onOpen`/`onError` transport lifecycle `/config` renders, and the disposer.
 * Rules: `.ai/spec/how/renderer.md`. Rationale: `docs/decisions/0006-config-producer-feed-status.md`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  connect,
  parseState,
  resolveSrc,
  DEFAULT_SRC,
  SUPPORTED_SCHEMA_VERSION,
} from './sseClient.js'
import closeBattle from '../../../spec/v1/fixtures/race-close-battle.json'
import { FakeEventSource } from './testing/fakeEventSource.js'

beforeEach(() => {
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const stateEvent = (snapshot) => ({ data: JSON.stringify(snapshot) })

describe('connect — snapshot delivery', () => {
  it('opens against the given URL and delivers each parsed `state` snapshot', () => {
    const seen = []
    connect('http://producer.test:8080/events', (s) => seen.push(s))

    const es = FakeEventSource.last
    expect(es.url).toBe('http://producer.test:8080/events')

    es.emit('state', stateEvent(closeBattle))

    // Assert on the delivered content, not that a handler ran.
    expect(seen).toHaveLength(1)
    expect(seen[0].vehicles.map((v) => v.driver_name)).toEqual([
      'Hamilton',
      'Verstappen',
      'Leclerc',
      'Norris',
    ])
    expect(seen[0].subject.slot_id).toBe('car-1')
    expect(seen[0].relationship.gap_ahead).toBe(closeBattle.relationship.gap_ahead)
  })

  it('ignores the default unnamed `message` event — only `state` carries a snapshot', () => {
    const seen = []
    connect(DEFAULT_SRC, (s) => seen.push(s))
    FakeEventSource.last.emit('message', stateEvent(closeBattle))
    expect(seen).toEqual([])
  })

  it('keeps delivering after a malformed event rather than tearing the feed down', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const seen = []
    connect(DEFAULT_SRC, (s) => seen.push(s))
    const es = FakeEventSource.last

    es.emit('state', { data: '{not json' })
    es.emit('state', stateEvent(closeBattle))

    expect(seen.map((s) => s.subject.driver_name)).toEqual(['Verstappen'])
    expect(es.closed).toBe(false)
  })
})

describe('connect — connection lifecycle (rule 25)', () => {
  it('reports the connection opening through onOpen', () => {
    const events = []
    connect(DEFAULT_SRC, () => {}, {
      onOpen: () => events.push('open'),
      onError: () => events.push('error'),
    })

    FakeEventSource.last.emit('open', {})

    expect(events).toEqual(['open'])
  })

  it('reports a dropped connection through onError, and a recovery through onOpen again', () => {
    const events = []
    connect(DEFAULT_SRC, () => {}, {
      onOpen: () => events.push('open'),
      onError: () => events.push('error'),
    })
    const es = FakeEventSource.last

    es.emit('open', {})
    es.emit('error', {})
    es.emit('open', {})

    expect(events).toEqual(['open', 'error', 'open'])
  })

  it('needs neither callback — a render page passes onState alone', () => {
    const seen = []
    expect(() => {
      connect(DEFAULT_SRC, (s) => seen.push(s))
      const es = FakeEventSource.last
      es.emit('open', {})
      es.emit('error', {})
      es.emit('state', stateEvent(closeBattle))
    }).not.toThrow()
    expect(seen).toHaveLength(1)
  })

  it('returns a disposer that closes the connection and stops delivery', () => {
    const events = []
    const seen = []
    const disconnect = connect(DEFAULT_SRC, (s) => seen.push(s), {
      onOpen: () => events.push('open'),
      onError: () => events.push('error'),
    })
    const es = FakeEventSource.last

    es.emit('open', {})
    es.emit('state', stateEvent(closeBattle))
    expect(seen).toHaveLength(1)

    disconnect()

    // A closed connection is inert, so nothing the producer sends afterwards can be rendered.
    // Asserting `close()` alone would pass a client that closed the socket and left its
    // listeners wired.
    es.emit('state', stateEvent(closeBattle))
    es.emit('open', {})
    es.emit('error', {})

    expect(es.closed).toBe(true)
    expect(seen).toHaveLength(1)
    expect(events).toEqual(['open'])
    expect(FakeEventSource.opened).toHaveLength(1) // no reconnect of our own
  })

  it('does not report a malformed snapshot through onError — that is the transport signal', () => {
    // `/config` renders `onError` as "not connected" (`what/overlay-config.md` rule 25). Routing a
    // parse failure through it would read as a dead feed on a connection that is open and
    // delivering, which rule 26 forbids. The tower's copy does exactly that; the merge must not.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const events = []
    const seen = []
    connect(DEFAULT_SRC, (s) => seen.push(s), {
      onOpen: () => events.push('open'),
      onError: () => events.push('error'),
    })
    const es = FakeEventSource.last

    es.emit('open', {})
    es.emit('state', { data: '{not json' })
    es.emit('state', stateEvent(closeBattle))

    expect(events).toEqual(['open'])
    expect(seen.map((s) => s.subject.driver_name)).toEqual(['Verstappen'])
  })
})

describe('resolveSrc / parseState', () => {
  it('reads the producer URL from ?src=, else falls back to the default', () => {
    expect(resolveSrc('?src=http://host:9000/events')).toBe('http://host:9000/events')
    expect(resolveSrc('')).toBe(DEFAULT_SRC)
    expect(resolveSrc('?other=1')).toBe(DEFAULT_SRC)
    expect(resolveSrc('?src=')).toBe(DEFAULT_SRC)
    expect(DEFAULT_SRC).toBe('http://localhost:8080/events')
  })

  it('called with NO argument, reads the page URL', () => {
    // The merge trap. `BattlePage`, `RaceControlPage` and `OnBoardHudPage` all call
    // `resolveSrc()` bare and rely on the parameter default; the tower copy is the one
    // WITHOUT a default and is always called as `resolveSrc(location.search)`. Merging onto
    // the tower's signature makes the bare calls `new URLSearchParams('')` and silently drops
    // `?src=` on those three routes — with every other test in this file still green, because
    // they all pass an explicit string. See ADR 0006, "One SSE client, merged first".
    const original = window.location.href
    try {
      history.replaceState({}, '', '/battle?src=http://race-pc.lan:9100/events')
      expect(resolveSrc()).toBe('http://race-pc.lan:9100/events')

      history.replaceState({}, '', '/battle')
      expect(resolveSrc()).toBe(DEFAULT_SRC)
    } finally {
      history.replaceState({}, '', original)
    }
  })

  it('parses a v1 snapshot without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const snapshot = parseState(JSON.stringify(closeBattle))
    expect(snapshot.vehicles).toHaveLength(4)
    expect(snapshot.subject.driver_name).toBe('Verstappen')
    expect(warn).not.toHaveBeenCalled()
    expect(SUPPORTED_SCHEMA_VERSION).toBe('1')
  })

  it('warns but still returns the snapshot on an unknown schemaVersion (best-effort render)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const snapshot = parseState(JSON.stringify({ ...closeBattle, schemaVersion: '99' }))
    expect(snapshot.schemaVersion).toBe('99')
    expect(snapshot.vehicles.map((v) => v.driver_name)).toContain('Hamilton')
    expect(warn).toHaveBeenCalledOnce()
  })
})
