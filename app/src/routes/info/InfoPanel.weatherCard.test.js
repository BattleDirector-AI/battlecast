/* Info panel — the weather card in the rotation (#208).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rules 77, 79-81, 88; overlay-config.md rules 54, 57;
 * ADR 0025. Drives the bare panel (props `snapshot`, `dwellSeconds`, `lines`, `weatherCard`,
 * `tempUnit`; how/renderer.md) with race-weather.json under fake timers. The fixture carries
 * event-info.json's event and three info_lines plus session.weather { air_temp: 22.4,
 * track_temp: 31.2, conditions: "Light rain" }, so its card reads AIR 22°C · TRACK 31°C ·
 * LIGHT RAIN. The card is off by default (overlay-config rule 57), so `mount` turns it on; the
 * first test renders without the prop to pin the default. Runs under the global reduced-motion default except the last block, which forces
 * full motion to show that a card text change never crossfades.
 *
 * The component is loaded through a non-static specifier so a missing weather card fails each
 * test with a named message rather than the whole file failing at import.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { flushSync, tick } from 'svelte'
import fixture from '../../../../spec/v1/fixtures/race-weather.json'

const MODULE = './InfoPanel.svelte'
async function loadPanel() {
  try {
    return (await import(/* @vite-ignore */ MODULE)).default
  } catch (err) {
    throw new Error(
      `could not load app/src/routes/info/InfoPanel.svelte: ${String(err?.message).split('\n')[0]}`,
      { cause: err },
    )
  }
}

const [L0, L1, L2] = fixture.info_lines
const CARD = 'AIR 22°C · TRACK 31°C · LIGHT RAIN'

/** race-weather.json with `info_lines` and/or `session.weather` replaced (`NO_WEATHER` deletes it). */
const NO_WEATHER = Symbol('no weather')
function snap({ lines = fixture.info_lines, weather = fixture.session.weather } = {}) {
  const s = structuredClone(fixture)
  s.info_lines = structuredClone(lines)
  if (weather === NO_WEATHER) delete s.session.weather
  else s.session.weather = structuredClone(weather)
  return s
}
const temps = (air, track) => ({ air_temp: air, track_temp: track, conditions: 'Light rain' })

let view
async function mount(props) {
  const Panel = await loadPanel()
  view = render(Panel, { snapshot: null, dwellSeconds: 8, lines: [], weatherCard: true, ...props })
  await tick()
  flushSync()
}
async function update(props) {
  await view.rerender(props)
  flushSync()
}
function advance(ms) {
  vi.advanceTimersByTime(ms)
  flushSync()
}
function lineTexts() {
  return [...view.container.querySelectorAll('[data-testid="info-line"]')].map((el) => el.textContent.trim())
}
function line() {
  const all = lineTexts()
  expect(all.length, 'reduced motion: at most one line element at a time').toBeLessThanOrEqual(1)
  return all[0] ?? null
}
/** Every line the rotation shows over one full cycle of `n` lines, from the one up now. */
function cycle(n, dwellMs = 8000) {
  const seen = [line()]
  for (let i = 1; i < n; i++) {
    advance(dwellMs)
    seen.push(line())
  }
  return seen
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('info panel — the weather card’s text and place (rules 77, 88)', () => {
  it('is off by default: with no weatherCard prop the list is exactly the text lines', async () => {
    const Panel = await loadPanel()
    view = render(Panel, { snapshot: fixture, dwellSeconds: 8, lines: [] }) // no weatherCard prop
    await tick()
    flushSync()
    expect(cycle(4)).toEqual([L0, L1, L2, L0])
  })

  it('comes last when on: producer lines, then broadcaster lines, then the card', async () => {
    await mount({ snapshot: fixture, lines: ['Follow us @battlecast'] }) // weatherCard: true
    expect(cycle(5)).toEqual([L0, L1, L2, 'Follow us @battlecast', CARD])
    advance(8000)
    expect(line(), 'the rotation wraps from the card to the first line').toBe(L0)
  })

  it('formats the card in the info widget’s tempUnit', async () => {
    await mount({ snapshot: snap({ lines: [] }), tempUnit: 'f' })
    expect(line()).toBe('AIR 72°F · TRACK 88°F · LIGHT RAIN')
  })

  it('is the only line when the producer sends weather and no lines: it stays up, no dwell', async () => {
    await mount({ snapshot: snap({ lines: [], weather: { track_temp: 31.2 } }) })
    expect(line()).toBe('TRACK 31°C')
    advance(60000)
    expect(line()).toBe('TRACK 31°C')
  })

  it('is left out while weatherCard is off: the list is exactly the text lines', async () => {
    await mount({ snapshot: fixture, weatherCard: false })
    expect(cycle(4)).toEqual([L0, L1, L2, L0])
  })

  it('is left out while the weather has no part', async () => {
    await mount({ snapshot: snap({ weather: { air_temp: 'warm', conditions: ' ' } }) })
    expect(cycle(4)).toEqual([L0, L1, L2, L0])
  })

  it('is never de-duplicated against a text line with the same text', async () => {
    await mount({ snapshot: snap({ lines: [L0, CARD] }) })
    expect(cycle(3), 'the producer line and the card both rotate').toEqual([L0, CARD, CARD])
    advance(8000)
    expect(line()).toBe(L0)
  })
})

describe('info panel — the weather card keeps its identity (rules 79-80, 88)', () => {
  // A card treated as a plain text line also passes this one (its text is not on screen, so the
  // list change keeps L0 under rule 80); the next test, with the card up, is the one that pins
  // the card's identity.
  it('does not move or restart the rotation when only the weather values change', async () => {
    await mount({ snapshot: snap({ lines: [L0] }) }) // [L0, card], L0 up from 0 s
    for (const t of [2, 4, 6]) {
      advance(2000)
      await update({ snapshot: snap({ lines: [L0], weather: temps(22.4 + t, 31.2 + t) }) })
      expect(line(), `a weather change at ${t} s must not replace the line on screen`).toBe(L0)
    }
    advance(1999) // t = 7.999 s
    expect(line()).toBe(L0)
    advance(1) // t = 8 s: L0's own dwell, never restarted
    expect(line(), 'then the card, with the latest values').toBe('AIR 28°C · TRACK 37°C · LIGHT RAIN')
  })

  it('updates the card’s text in place while it is up, keeping its dwell', async () => {
    await mount({ snapshot: snap({ lines: [L0] }) }) // [L0, card]
    advance(8000)
    expect(line()).toBe(CARD) // up since 8 s
    const el = view.container.querySelector('[data-testid="info-line"]')
    advance(3000)
    await update({ snapshot: snap({ lines: [L0], weather: temps(24.6, 35.5) }) }) // t = 11 s
    expect(line()).toBe('AIR 25°C · TRACK 36°C · LIGHT RAIN')
    expect(view.container.querySelector('[data-testid="info-line"]'), 'the same line element, updated in place').toBe(el)
    advance(4999) // t = 15.999 s
    expect(line()).toBe('AIR 25°C · TRACK 36°C · LIGHT RAIN')
    advance(1) // t = 16 s: the card's dwell, counted from 8 s
    expect(line()).toBe(L0)
  })

  it('updates the card’s text in place when tempUnit changes', async () => {
    await mount({ snapshot: snap({ lines: [L0] }) })
    advance(8000)
    expect(line()).toBe(CARD)
    advance(2000)
    await update({ tempUnit: 'f' }) // t = 10 s
    expect(line()).toBe('AIR 72°F · TRACK 88°F · LIGHT RAIN')
    advance(5999)
    expect(line()).toBe('AIR 72°F · TRACK 88°F · LIGHT RAIN')
    advance(1) // t = 16 s
    expect(line()).toBe(L0)
  })

  it('joins the list as a changed list when weather arrives: the line on screen stays', async () => {
    await mount({ snapshot: snap({ weather: NO_WEATHER }) }) // [L0, L1, L2]
    advance(8000)
    expect(line()).toBe(L1)
    await update({ snapshot: fixture }) // [L0, L1, L2, card]
    expect(line()).toBe(L1)
    advance(8000)
    expect(line()).toBe(L2)
    advance(8000)
    expect(line(), 'the card now follows the last text line').toBe(CARD)
  })

  it('leaves the list when the weather goes: the line at its place, or the first, replaces it at once', async () => {
    await mount({ snapshot: fixture })
    advance(24000)
    expect(line()).toBe(CARD) // index 3
    await update({ snapshot: snap({ weather: NO_WEATHER }) }) // [L0, L1, L2]: too short for index 3
    expect(line()).toBe(L0)
  })

  it('leaves the list when weatherCard is switched off while it is up', async () => {
    await mount({ snapshot: snap({ lines: [L0, L1] }), lines: ['Follow us @battlecast'] }) // [L0, L1, F, card]
    advance(24000)
    expect(line()).toBe(CARD)
    await update({ weatherCard: false }) // [L0, L1, F]
    expect(line()).toBe(L0)
    await update({ weatherCard: true }) // the card returns at the end; L0 stays up
    expect(line()).toBe(L0)
  })
})

// happy-dom has no Web Animations API; Svelte's non-zero-duration transitions call
// element.animate(). A timer-backed stand-in that records every element it animates.
const animated = new Set()
function installAnimatePolyfill() {
  const Ctor = window.Element ?? Element
  const original = Ctor.prototype.animate
  Ctor.prototype.animate = function (_keyframes, options) {
    const duration = (options && options.duration) || 0
    if (duration > 0) animated.add(this)
    const anim = {
      onfinish: null,
      effect: null,
      currentTime: 0,
      playState: 'running',
      _cancelled: false,
      _timer: null,
      cancel() {
        this._cancelled = true
        this.playState = 'idle'
        if (this._timer != null) clearTimeout(this._timer)
      },
    }
    anim._timer = setTimeout(() => {
      anim._timer = null
      anim.playState = 'finished'
      if (!anim._cancelled && typeof anim.onfinish === 'function') anim.onfinish()
    }, duration)
    return anim
  }
  return () => {
    Ctor.prototype.animate = original
  }
}

describe('info panel — a card text change never crossfades (rule 81)', () => {
  let restoreAnimate
  beforeEach(() => {
    document.documentElement.dataset.motion = 'full'
    animated.clear()
    restoreAnimate = installAnimatePolyfill()
  })
  afterEach(() => {
    restoreAnimate()
    document.documentElement.dataset.motion = 'reduced'
  })

  it('shows the new card text in the same element at once, with no second line element', async () => {
    await mount({ snapshot: snap({ lines: [L0] }) })
    advance(8000) // L0 -> card, a real crossfade
    advance(400) // let it finish
    const texts = lineTexts()
    expect(texts).toEqual([CARD])
    const el = view.container.querySelector('[data-testid="info-line"]')
    animated.clear()

    await update({ snapshot: snap({ lines: [L0], weather: temps(25, 36) }) })
    expect(lineTexts(), 'no outgoing copy of the old card text').toEqual(['AIR 25°C · TRACK 36°C · LIGHT RAIN'])
    expect(view.container.querySelector('[data-testid="info-line"]')).toBe(el)
    expect(animated.size, 'nothing fades for a card text change').toBe(0)
  })
})
