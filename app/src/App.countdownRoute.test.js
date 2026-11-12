/* `/countdown` is a full-screen opaque takeover slide: the series logo, the series name and a live
 * countdown to the race start in the profile's `slides` section (widgets.md rules 131–138,
 * overlay-config.md rule 73, ADR 0042).
 *
 * App reads window.location.pathname at mount, so each test sets `/countdown?profile=p`. A stubbed
 * `fetch` plays the companion server and serves `served`; a test swaps it and runs the 5 s watch
 * interval to drive a live reload (rule 22). The slide's content is profile data, not producer
 * state, so the profile is the fixture here. EventSource is the shared FakeEventSource double so the
 * test can prove the page opens no producer connection.
 *
 * Time: fake timers own both the clock and the timer queue. `vi.setSystemTime` pins "now" before
 * the mount; `vi.advanceTimersByTimeAsync` moves the clock and fires due timers together, which is
 * how the countdown's own ticks run. `slides.start` is a zone-less local date and time, so the
 * expected moment is built with the local `Date` constructor (`at()`), never with `Date.UTC`. One
 * block stubs `TZ` to prove the start is read in the browser's zone.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick, flushSync } from 'svelte'
import App from './App.svelte'
import { FakeEventSource } from './lib/testing/fakeEventSource.js'

const START = '2026-11-20T19:00'
/** The local moment of START, in the zone in force when it is called. */
const at = () => new Date(2026, 10, 20, 19, 0, 0, 0).getTime()

const FULL = {
  series: 'GT World Cup',
  round: 'Round 3',
  track: 'Spa-Francorchamps',
  logo: '/logos/gt-world-cup.png',
  start: START,
}

let served = null
let appEl

async function settle() {
  for (let i = 0; i < 6; i++) await tick()
  flushSync()
}

/** Mount /countdown with the clock at `now` (ms since epoch). */
async function mount(profile, now, query = '') {
  vi.setSystemTime(now)
  served = profile
  window.history.replaceState({}, '', `/countdown?profile=p${query}`)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => structuredClone(served) })),
  )
  const view = render(App)
  await settle()
  return view.container
}

/** Move the clock and fire due timers, then let Svelte render. */
async function advance(ms) {
  await vi.advanceTimersByTimeAsync(ms)
  await settle()
}

async function editProfile(profile) {
  served = profile
  await advance(5000)
}

const q = (root, testid) => root.querySelector(`[data-testid="${testid}"]`)
const text = (root, testid) => q(root, testid)?.textContent.trim() ?? null

/** The slide; fails with a message that names the missing route rather than a null deref. */
function slide(root) {
  const el = q(root, 'countdown-slide')
  expect(el, '/countdown renders no countdown slide').not.toBeNull()
  return el
}

/** The timer text; fails with a message that names the gap. */
function timer(root) {
  slide(root)
  const el = q(root, 'countdown-timer')
  expect(el, 'the slide shows no timer').not.toBeNull()
  return el.textContent.trim()
}

/** The testids of the slide's parts, in document order. */
function partOrder(root) {
  const parts = ['countdown-logo', 'countdown-series', 'countdown-timer', 'countdown-started']
  return [...slide(root).querySelectorAll('[data-testid]')]
    .map((el) => el.dataset.testid)
    .filter((id) => parts.includes(id))
}

beforeEach(() => {
  appEl = document.createElement('div')
  appEl.id = 'app'
  document.body.appendChild(appEl)
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.useFakeTimers()
  delete document.documentElement.dataset.theme
})
afterEach(() => {
  cleanup()
  appEl.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  window.history.replaceState({}, '', '/')
  document.documentElement.style.background = ''
  document.body.style.background = ''
  delete document.documentElement.dataset.theme
})

describe('/countdown route (widgets.md rule 131)', () => {
  it('is full-bleed and opaque: it does not force a transparent page', async () => {
    const root = await mount({ slides: FULL }, at() - 600_000)
    slide(root)
    expect(appEl.style.maxWidth).toBe('none')
    expect(appEl.style.background).not.toBe('transparent')
    expect(document.body.style.background).not.toBe('transparent')
    expect(document.documentElement.style.background).not.toBe('transparent')
  })

  it('opens no producer connection, and counts with no producer running', async () => {
    const root = await mount({ slides: FULL }, at() - 600_000)
    expect(timer(root)).toBe('10:00')
    expect(FakeEventSource.opened, '/countdown opened a producer connection').toHaveLength(0)
  })

  it('ignores ?src=, ?class=, ?show= and ?hide=', async () => {
    const root = await mount(
      { slides: FULL },
      at() - 600_000,
      '&src=http://x.test/events&class=GT3&hide=countdown,tower&show=battle',
    )
    expect(text(root, 'countdown-series')).toBe('GT World Cup')
    expect(timer(root)).toBe('10:00')
    expect(FakeEventSource.opened).toHaveLength(0)
  })

  it('is not composed into /all', async () => {
    vi.setSystemTime(at() - 600_000)
    served = { slides: FULL }
    window.history.replaceState({}, '', '/all?profile=p')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => structuredClone(served) })),
    )
    const { container } = render(App)
    await settle()
    // A guard: today's /all has no slide. It must stay that way (rule 131).
    expect(q(container, 'countdown-slide')).toBeNull()
    expect(q(container, 'countdown-timer')).toBeNull()
  })
})

describe('/countdown content (rule 132)', () => {
  it('shows logo, series name and timer, in that order, and not the round or the track', async () => {
    const root = await mount({ slides: FULL }, at() - 600_000)
    expect(partOrder(root)).toEqual(['countdown-logo', 'countdown-series', 'countdown-timer'])

    const img = q(root, 'countdown-logo')
    expect(img.tagName).toBe('IMG')
    expect(img.getAttribute('src')).toBe('/logos/gt-world-cup.png')
    expect(text(root, 'countdown-series')).toBe('GT World Cup')
    expect(timer(root)).toBe('10:00')

    const board = slide(root).textContent
    expect(board).not.toContain('Round 3')
    expect(board).not.toContain('Spa-Francorchamps')
    expect(q(root, 'countdown-started'), 'the timer and the starting line show together').toBeNull()
  })

  it('shows the series name as normalized, with its case kept', async () => {
    const root = await mount({ slides: { ...FULL, series: '  gt World cup  ' } }, at() - 600_000)
    expect(q(root, 'countdown-series').textContent).toBe('gt World cup')
  })
})

describe('/countdown empty fields (rule 133)', () => {
  it('with no start there is no clock: no timer, no starting line, no placeholder digits', async () => {
    for (const start of ['', undefined, '2026-11-20T19:00Z', 'tomorrow']) {
      const root = await mount({ slides: { ...FULL, start } }, at() - 600_000)
      expect(text(root, 'countdown-series'), String(start)).toBe('GT World Cup')
      expect(q(root, 'countdown-timer'), `${start}: a timer shows`).toBeNull()
      expect(q(root, 'countdown-started'), `${start}: a starting line shows`).toBeNull()
      expect(slide(root).textContent, `${start}: digits show`).not.toMatch(/\d/)
      expect(partOrder(root)).toEqual(['countdown-logo', 'countdown-series'])
      cleanup()
    }
  })

  it('an empty logo gives no image, an empty series gives no series element', async () => {
    let root = await mount({ slides: { ...FULL, logo: '' } }, at() - 600_000)
    expect(slide(root).querySelector('img')).toBeNull()
    expect(partOrder(root)).toEqual(['countdown-series', 'countdown-timer'])
    cleanup()

    root = await mount({ slides: { ...FULL, series: '' } }, at() - 600_000)
    expect(q(root, 'countdown-series')).toBeNull()
    expect(partOrder(root)).toEqual(['countdown-logo', 'countdown-timer'])
  })

  it('with logo, series and start all empty it shows only the board', async () => {
    for (const profile of [{ slides: { round: 'Round 3', track: 'Spa' } }, {}, { slides: null }]) {
      const root = await mount(profile, at() - 600_000)
      const board = slide(root)
      expect(board.textContent.trim(), JSON.stringify(profile)).toBe('')
      expect(board.querySelector('img')).toBeNull()
      cleanup()
    }
  })

  it('removes a logo that fails to load, and tries a new URL from a live reload', async () => {
    const root = await mount({ slides: FULL }, at() - 600_000)
    const img = q(root, 'countdown-logo')
    expect(img, 'no logo image').not.toBeNull()
    await fireEvent.error(img)
    await settle()
    expect(slide(root).querySelector('img'), 'a failed logo stays on the slide').toBeNull()
    expect(partOrder(root)).toEqual(['countdown-series', 'countdown-timer'])

    await editProfile({ slides: { ...FULL, logo: '/logos/other.png' } })
    expect(q(root, 'countdown-logo')?.getAttribute('src')).toBe('/logos/other.png')
  })
})

describe('/countdown start and remaining time (rule 134)', () => {
  it('rounds the remaining time up to whole seconds', async () => {
    const root = await mount({ slides: FULL }, at() - 65_200)
    expect(timer(root)).toBe('01:06')
  })

  it('reads the start in the time zone of the browser', async () => {
    // Los Angeles, November: UTC-8. 19:00 local on 20 Nov is 03:00 UTC on 21 Nov.
    vi.stubEnv('TZ', 'America/Los_Angeles')
    expect(new Date(2026, 10, 20, 19).getTimezoneOffset(), 'the TZ stub did not apply').toBe(480)
    let root = await mount({ slides: FULL }, Date.UTC(2026, 10, 21, 2, 0, 0))
    expect(timer(root), '18:00 local is one hour before 19:00 local').toBe('1:00:00')
    cleanup()

    // Tokyo: UTC+9. 19:00 local on 20 Nov is 10:00 UTC on 20 Nov.
    vi.stubEnv('TZ', 'Asia/Tokyo')
    expect(new Date(2026, 10, 20, 19).getTimezoneOffset(), 'the TZ stub did not apply').toBe(-540)
    root = await mount({ slides: FULL }, Date.UTC(2026, 10, 20, 9, 0, 0))
    expect(timer(root), '18:00 local is one hour before 19:00 local').toBe('1:00:00')
  })
})

describe('/countdown timer format (rule 135)', () => {
  const CASES = [
    [1, '00:01'],
    [65, '01:05'],
    [600, '10:00'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3661, '1:01:01'],
    [36_000, '10:00:00'],
    [86_399, '23:59:59'],
    [86_400, '1 DAY 0:00:00'],
    [90_061, '1 DAY 1:01:01'],
    [172_800, '2 DAYS 0:00:00'],
    [266_706, '3 DAYS 2:05:06'],
  ]

  it.each(CASES)('%i seconds left shows %s', async (n, expected) => {
    // 0.4 s inside the second, so a rounded-down or rounded-to-nearest count shows another value.
    const root = await mount({ slides: FULL }, at() - (n * 1000 - 400))
    expect(timer(root)).toBe(expected)
  })
})

describe('/countdown changes each whole second, from the clock (rule 136)', () => {
  it('changes at each whole-second boundary of the remaining time, within 100 ms', async () => {
    const root = await mount({ slides: FULL }, at() - 65_500)
    expect(timer(root)).toBe('01:06')
    await advance(499) // 65.001 s left: still 66 whole seconds
    expect(timer(root)).toBe('01:06')
    await advance(101) // 0.1 s past the boundary at 65 s
    expect(timer(root), 'the change came later than 100 ms after the boundary').toBe('01:05')
    await advance(1000)
    expect(timer(root)).toBe('01:04')
    await advance(60_000)
    expect(timer(root)).toBe('00:04')
  })

  it('changes within 100 ms of the boundary at another mount phase too', async () => {
    // Mounted 0.3 s into the second: a fixed 250 ms or 500 ms poll from the mount misses the
    // boundary by more than 100 ms here. A boundary-aligned timer, or a poll of 100 ms, does not.
    const root = await mount({ slides: FULL }, at() - 65_300)
    expect(timer(root)).toBe('01:06')
    await advance(299) // 65.001 s left: still 66 whole seconds
    expect(timer(root)).toBe('01:06')
    await advance(100) // 0.1 s past the boundary at 65 s
    expect(timer(root), 'the change came later than 100 ms after the boundary').toBe('01:05')
  })

  it('reads the clock again at each change: a changed PC clock shows at the next change', async () => {
    const root = await mount({ slides: FULL }, at() - 120_000)
    expect(timer(root)).toBe('02:00')
    // The PC clock jumps 90 s ahead. No timer fires on the jump itself.
    vi.setSystemTime(at() - 30_200)
    await advance(1000)
    expect(timer(root), 'the slide counts by itself and does not read the clock').toBe('00:30')
  })
})

describe('/countdown at the start and after it (rule 137)', () => {
  it('the starting line replaces the timer within 100 ms of the start, and stays', async () => {
    const root = await mount({ slides: FULL }, at() - 1_500)
    expect(timer(root)).toBe('00:02')
    await advance(1_400) // 0.1 s left
    expect(timer(root), 'the timer reached 00:00 before the start').toBe('00:01')
    await advance(200) // 0.1 s after the start
    expect(q(root, 'countdown-timer'), 'the timer still shows after the start').toBeNull()
    expect(text(root, 'countdown-started')).toBe('STARTING NOW')
    expect(partOrder(root)).toEqual(['countdown-logo', 'countdown-series', 'countdown-started'])

    await advance(10 * 60_000)
    expect(q(root, 'countdown-timer'), 'the timer came back after the start').toBeNull()
    expect(text(root, 'countdown-started'), 'the starting line went away').toBe('STARTING NOW')
  })

  it('at the exact start moment, the page shows the starting line', async () => {
    const root = await mount({ slides: FULL }, at())
    slide(root)
    expect(q(root, 'countdown-timer')).toBeNull()
    expect(text(root, 'countdown-started')).toBe('STARTING NOW')
  })

  it('a start already in the past shows the starting line at once, never a timer', async () => {
    const root = await mount({ slides: FULL }, at() + 3 * 3600_000)
    slide(root)
    expect(q(root, 'countdown-timer')).toBeNull()
    expect(text(root, 'countdown-started')).toBe('STARTING NOW')
    expect(slide(root).textContent).not.toMatch(/\d/)
  })

  it('shows the profile starting text, with its case kept', async () => {
    const root = await mount({ slides: { ...FULL, startedText: '  Lights out  ' } }, at() + 1_000)
    expect(q(root, 'countdown-started')?.textContent).toBe('Lights out')
  })

  it('a live reload with a future start shows the timer again, and an empty start shows no clock', async () => {
    const root = await mount({ slides: FULL }, at() + 10_000)
    expect(text(root, 'countdown-started')).toBe('STARTING NOW')

    // The clock is at() + 15 s after the reload; 20:00 local is 3585 s away.
    await editProfile({ slides: { ...FULL, start: '2026-11-20T20:00' } })
    expect(q(root, 'countdown-started'), 'the starting line stayed for a future start').toBeNull()
    expect(timer(root)).toBe('59:45')

    await editProfile({ slides: { ...FULL, start: '' } })
    expect(q(root, 'countdown-timer')).toBeNull()
    expect(q(root, 'countdown-started')).toBeNull()
    expect(text(root, 'countdown-series')).toBe('GT World Cup')
  })
})

describe('/countdown no entrance (rule 138) and the profile look (overlay-config rule 73)', () => {
  it('under full motion the timer becomes the starting line at once, with no held exit', async () => {
    document.documentElement.dataset.motion = 'full'
    const root = await mount({ slides: FULL }, at() - 500)
    expect(timer(root)).toBe('00:01')
    await advance(600)
    expect(q(root, 'countdown-timer'), 'an exit transition holds the timer').toBeNull()
    expect(root.querySelectorAll('[data-testid="countdown-started"]')).toHaveLength(1)
  })

  it('a live reload swaps the series at once under full motion', async () => {
    document.documentElement.dataset.motion = 'full'
    const root = await mount({ slides: FULL }, at() - 600_000)
    await editProfile({ slides: { ...FULL, series: 'Endurance Cup' } })
    expect(root.querySelectorAll('[data-testid="countdown-series"]')).toHaveLength(1)
    expect(text(root, 'countdown-series')).toBe('Endurance Cup')
  })

  it('writes data-theme and data-motion from the profile, and again on a live reload', async () => {
    await mount({ slides: FULL, theme: { preset: 'vintage70' }, reducedMotion: true }, at() - 600_000)
    expect(document.documentElement.dataset.theme).toBe('vintage70')
    expect(document.documentElement.dataset.motion).toBe('reduced')

    await editProfile({ slides: FULL, theme: { preset: 'vintage80' }, reducedMotion: false })
    expect(document.documentElement.dataset.theme).toBe('vintage80')
    expect(document.documentElement.dataset.motion).toBe('full')
  })
})
