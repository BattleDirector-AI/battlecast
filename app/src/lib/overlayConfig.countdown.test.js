/* The Countdown keys of the profile's `slides` section (overlay-config.md rule 73, steps 5 and 6;
 * ADR 0042).
 *
 * `start` is a local date and time with no zone, `YYYY-MM-DDTHH:MM`, kept only when it names a
 * real calendar date and time; every other value gives '' (no start). `startedText` is text as
 * step 2 says, and a blank or non-string value gives the default 'STARTING NOW'. Each case feeds
 * `normalizeConfig` a raw profile and reads the normalized section.
 */
import { describe, it, expect } from 'vitest'
import { normalizeConfig, DEFAULT_CONFIG } from './overlayConfig.js'

const sl = (slides) => normalizeConfig({ slides }).slides

describe('countdown defaults (rule 73)', () => {
  it('the built-in default has no start and the STARTING NOW text', () => {
    expect(DEFAULT_CONFIG.slides.start).toBe('')
    expect(DEFAULT_CONFIG.slides.startedText).toBe('STARTING NOW')
  })

  it('a profile with no slides, or a slides that is not an object, gets them too', () => {
    for (const raw of [{}, { slides: null }, { slides: [] }, { slides: 'x' }]) {
      const out = normalizeConfig(raw).slides
      expect(out.start, JSON.stringify(raw)).toBe('')
      expect(out.startedText, JSON.stringify(raw)).toBe('STARTING NOW')
    }
  })

  it('an object slides without the two keys gets their defaults', () => {
    const out = sl({ series: 'GT Cup' })
    expect(out.start).toBe('')
    expect(out.startedText).toBe('STARTING NOW')
    expect(out.series).toBe('GT Cup')
  })
})

describe('slides.start (rule 73, step 5)', () => {
  it('keeps a real local date and time in the form YYYY-MM-DDTHH:MM, trimmed', () => {
    expect(sl({ start: '2026-11-20T19:00' }).start).toBe('2026-11-20T19:00')
    expect(sl({ start: ' 2026-11-20T19:00 ' }).start).toBe('2026-11-20T19:00')
    expect(sl({ start: '2026-01-01T00:00' }).start).toBe('2026-01-01T00:00')
    expect(sl({ start: '2026-12-31T23:59' }).start).toBe('2026-12-31T23:59')
    expect(sl({ start: '2028-02-29T12:30' }).start, 'a leap day is a real date').toBe('2028-02-29T12:30')
  })

  it('keeps a start in the past: normalization does not compare it with the clock', () => {
    expect(sl({ start: '2001-05-04T08:15' }).start).toBe('2001-05-04T08:15')
  })

  it('a date or time that does not exist gives no start', () => {
    for (const bad of [
      '2026-02-30T19:00', // 30 February
      '2027-02-29T19:00', // not a leap year
      '2026-04-31T19:00', // April has 30 days
      '2026-13-01T19:00', // month 13
      '2026-00-10T19:00', // month 0
      '2026-11-00T19:00', // day 0
      '2026-11-20T24:00', // hour 24
      '2026-11-20T19:60', // minute 60
    ]) {
      expect(sl({ start: bad }).start, bad).toBe('')
    }
  })

  it('any other form gives no start: a zone, seconds, a space, short parts, words', () => {
    for (const bad of [
      '2026-11-20T19:00Z',
      '2026-11-20T19:00+02:00',
      '2026-11-20T19:00:00',
      '2026-11-20T19:00:00.000Z',
      '2026-11-20 19:00',
      '2026-11-20t19:00',
      '2026-11-20',
      '19:00',
      '2026-1-20T19:00',
      '2026-11-20T9:00',
      '+02026-11-20T19:00',
      'tomorrow',
      '',
      '   ',
    ]) {
      expect(sl({ start: bad }).start, JSON.stringify(bad)).toBe('')
    }
  })

  it('a value that is not a string gives no start', () => {
    for (const bad of [1795201200000, null, true, ['2026-11-20T19:00'], { at: '2026-11-20T19:00' }]) {
      expect(sl({ start: bad }).start, JSON.stringify(bad)).toBe('')
    }
    expect(sl({ start: new Date(2026, 10, 20, 19, 0) }).start, 'a Date object').toBe('')
  })
})

describe('slides.startedText (rule 73, step 6)', () => {
  it('is text as step 2 says: trimmed, cut to 80 characters, trimmed again, case kept', () => {
    expect(sl({ startedText: '  Lights out  ' }).startedText).toBe('Lights out')
    expect(sl({ startedText: 'Race  is LIVE' }).startedText).toBe('Race  is LIVE')
    expect(sl({ startedText: 'A'.repeat(79) + ' ' + 'B'.repeat(20) }).startedText).toBe('A'.repeat(79))
    expect(sl({ startedText: 'S'.repeat(120) }).startedText).toBe('S'.repeat(80))
  })

  it('a blank or non-string value gives the default STARTING NOW', () => {
    for (const bad of ['', '   ', '\n\t', null, 5, true, ['GO'], { text: 'GO' }]) {
      expect(sl({ startedText: bad }).startedText, JSON.stringify(bad)).toBe('STARTING NOW')
    }
  })
})

describe('the countdown keys leave the rest of the section alone (rule 73, step 4)', () => {
  it('keeps the event fields and unknown keys, and an invalid start drops nothing else', () => {
    const out = sl({
      series: ' GT Cup ',
      logo: '/logos/a.png',
      start: '2026-11-20T19:00Z',
      startedText: 'Green flag',
      schedule: [{ round: 1 }],
    })
    expect(out).toEqual({
      series: 'GT Cup',
      round: '',
      track: '',
      logo: '/logos/a.png',
      start: '',
      startedText: 'Green flag',
      schedule: [{ round: 1 }],
    })
  })
})
