import { describe, it, expect, afterEach } from 'vitest'
import {
  resolveMotion,
  applyMotion,
  prefersReducedMotion,
  MOTION_FULL,
  MOTION_REDUCED,
} from './motion.js'

afterEach(() => {
  // Restore the suite's reduced-motion default (test-setup sets it before each test).
  if (typeof document !== 'undefined') document.documentElement.dataset.motion = 'reduced'
})

describe('resolveMotion — animate by default, opt out explicitly', () => {
  it('defaults to full motion (no param, no config)', () => {
    expect(resolveMotion('')).toBe(MOTION_FULL)
    expect(resolveMotion('?src=http://x/events')).toBe(MOTION_FULL)
  })

  it('honors ?motion=reduced (and its aliases)', () => {
    for (const v of ['reduced', 'reduce', 'off', 'min', 'low', 'none', '0', 'false']) {
      expect(resolveMotion(`?motion=${v}`)).toBe(MOTION_REDUCED)
    }
  })

  it('honors ?motion=full (and its aliases), even when config asks for reduced', () => {
    for (const v of ['full', 'on', 'yes', '1', 'true']) {
      expect(resolveMotion(`?motion=${v}`, { reducedMotion: true })).toBe(MOTION_FULL)
    }
  })

  it('falls back to the config reducedMotion when no URL param is given', () => {
    expect(resolveMotion('', { reducedMotion: true })).toBe(MOTION_REDUCED)
    expect(resolveMotion('', { reducedMotion: false })).toBe(MOTION_FULL)
  })

  it('URL param wins over config (both directions)', () => {
    expect(resolveMotion('?motion=full', { reducedMotion: true })).toBe(MOTION_FULL)
    expect(resolveMotion('?motion=reduced', { reducedMotion: false })).toBe(MOTION_REDUCED)
  })

  it('ignores an unrecognized ?motion= value, falling through to the default/config', () => {
    expect(resolveMotion('?motion=sideways')).toBe(MOTION_FULL)
    expect(resolveMotion('?motion=sideways', { reducedMotion: true })).toBe(MOTION_REDUCED)
  })

  it('is case-insensitive and tolerant of a malformed search string', () => {
    expect(resolveMotion('?motion=REDUCED')).toBe(MOTION_REDUCED)
    expect(resolveMotion('not a query')).toBe(MOTION_FULL)
  })
})

describe('applyMotion / prefersReducedMotion — the root data-motion hook', () => {
  it('writes data-motion and reads it back', () => {
    applyMotion(MOTION_REDUCED)
    expect(document.documentElement.dataset.motion).toBe('reduced')
    expect(prefersReducedMotion()).toBe(true)

    applyMotion(MOTION_FULL)
    expect(document.documentElement.dataset.motion).toBe('full')
    expect(prefersReducedMotion()).toBe(false)
  })

  it('normalizes an unknown mode to full', () => {
    applyMotion('bogus')
    expect(document.documentElement.dataset.motion).toBe('full')
    expect(prefersReducedMotion()).toBe(false)
  })
})
