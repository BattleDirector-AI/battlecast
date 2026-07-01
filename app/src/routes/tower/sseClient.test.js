import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveSrc, parseState, DEFAULT_SRC } from './sseClient.js'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

afterEach(() => vi.restoreAllMocks())

describe('resolveSrc', () => {
  it('reads the producer URL from ?src=', () => {
    expect(resolveSrc('?src=http://host:9000/events')).toBe('http://host:9000/events')
  })

  it('falls back to the default when ?src= is absent or empty', () => {
    expect(resolveSrc('')).toBe(DEFAULT_SRC)
    expect(resolveSrc('?other=1')).toBe(DEFAULT_SRC)
    expect(resolveSrc('?src=')).toBe(DEFAULT_SRC)
  })
})

describe('parseState', () => {
  it('parses a valid v1 snapshot without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const snapshot = parseState(JSON.stringify(closeBattle))
    expect(snapshot.subject.slot_id).toBe('car-1')
    expect(snapshot.vehicles).toHaveLength(4)
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns but still returns the snapshot on an unknown schemaVersion', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const snapshot = parseState(JSON.stringify({ ...closeBattle, schemaVersion: '99' }))
    expect(snapshot.schemaVersion).toBe('99')
    expect(warn).toHaveBeenCalledOnce()
  })
})
