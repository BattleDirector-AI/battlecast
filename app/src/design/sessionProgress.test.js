import { describe, it, expect } from 'vitest'
import {
  selectProgressMode,
  formatClock,
  formatLaps,
  sessionProgressText,
} from './sessionProgress.js'

describe('selectProgressMode', () => {
  it('honors an explicit basis over the data, in both directions', () => {
    expect(selectProgressMode({ basis: 'time', laps_remaining: 5 })).toBe('time')
    expect(selectProgressMode({ basis: 'laps', time_remaining: 5 })).toBe('laps')
    expect(selectProgressMode({ basis: 'LAPS', time_remaining: 5 })).toBe('laps') // case-insensitive
  })

  it('falls back to time_remaining, then lap fields, then none', () => {
    expect(selectProgressMode({ time_remaining: 10 })).toBe('time')
    expect(selectProgressMode({ laps_remaining: 2 })).toBe('laps')
    expect(selectProgressMode({ total_laps: 40 })).toBe('laps')
    expect(selectProgressMode({ current_lap: 5 })).toBe('laps')
    expect(selectProgressMode({})).toBe('none')
  })

  it('tolerates a missing/null/malformed session without throwing', () => {
    expect(selectProgressMode(null)).toBe('none')
    expect(selectProgressMode(undefined)).toBe('none')
    expect(selectProgressMode({ time_remaining: 'not-a-number' })).toBe('none')
  })

  it('treats 0 as a real value, not falsy-absent', () => {
    expect(selectProgressMode({ current_lap: 0 })).toBe('laps')
    expect(selectProgressMode({ laps_remaining: 0 })).toBe('laps')
    expect(selectProgressMode({ time_remaining: 0 })).toBe('time')
  })
})

describe('formatClock', () => {
  it('formats a bare remaining time without a denominator', () => {
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(3661)).toBe('1:01:01')
  })

  it('formats remaining + total as "remaining / total" when a length is given', () => {
    expect(formatClock(90, 120)).toBe('1:30 / 2:00')
  })

  it('falls back to a dash for a missing/invalid remaining time', () => {
    expect(formatClock(null)).toBe('—')
    expect(formatClock(undefined)).toBe('—')
    expect(formatClock('nope')).toBe('—')
  })
})

describe('formatLaps — producer-owned lap position, rendered verbatim', () => {
  it('renders current_lap verbatim (no derivation)', () => {
    // formatLaps(currentLap, totalLaps, lapsRemaining)
    expect(formatLaps(47, 58)).toBe('LAP 47 OF 58')
    expect(formatLaps(60, 60)).toBe('LAP 60 OF 60')
    expect(formatLaps(47, null)).toBe('LAP 47')
    // 0 is a real lap/count, never falsy-hidden.
    expect(formatLaps(0, 10)).toBe('LAP 0 OF 10')
    expect(formatLaps(null, null, 0)).toBe('0 LAPS REMAINING')
  })

  it('falls back to raw laps when current_lap is absent', () => {
    expect(formatLaps(null, null, 4)).toBe('4 LAPS REMAINING')
    expect(formatLaps(null, null, 1)).toBe('1 LAP REMAINING')
    expect(formatLaps(null, 30, null)).toBe('30 LAPS')
    expect(formatLaps(null, 1, null)).toBe('1 LAP')
    expect(formatLaps(null, null, null)).toBe('—')
  })
})

describe('sessionProgressText — the tower-header readout', () => {
  it('returns a compact remaining-time clock in a timed session', () => {
    // Compact for a header: remaining only, not "remaining / total".
    expect(sessionProgressText({ time_remaining: 272, session_length: 300 })).toBe('4:32')
  })

  it('returns the producer-owned lap counter in a lap-limited session', () => {
    expect(sessionProgressText({ current_lap: 47, total_laps: 58 })).toBe('LAP 47 OF 58')
    expect(sessionProgressText({ laps_remaining: 12, total_laps: 58 })).toBe('12 LAPS REMAINING')
  })

  it('honors basis (the endurance flip) and returns null when there is no progress', () => {
    expect(sessionProgressText({ time_remaining: 42, current_lap: 60, total_laps: 60, basis: 'laps' })).toBe(
      'LAP 60 OF 60',
    )
    expect(sessionProgressText({ flag: 'green' })).toBeNull()
    expect(sessionProgressText(null)).toBeNull()
  })
})
