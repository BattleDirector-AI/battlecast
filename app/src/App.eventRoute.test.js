/* `/event` is a full-screen opaque takeover slide that shows the profile's `slides` section
 * (widgets.md rules 123–127, overlay-config.md rule 73, ADR 0041).
 *
 * App reads window.location.pathname at mount, so each test sets `/event?profile=p`. A stubbed
 * `fetch` plays the companion server and serves `served`; a test swaps it and runs the 5 s watch
 * interval to drive a live reload (rule 22). EventSource is the shared FakeEventSource double so
 * the test can prove the page opens no producer connection. The slide's content is profile data,
 * not producer state, so the profile is the fixture here.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick, flushSync } from 'svelte'
import App from './App.svelte'
import { FakeEventSource } from './lib/testing/fakeEventSource.js'

const FULL = {
  series: 'GT World Cup',
  round: 'Round 3',
  track: 'Spa-Francorchamps',
  logo: '/logos/gt-world-cup.png',
}

let served = null
let appEl

async function settle() {
  for (let i = 0; i < 6; i++) await tick()
  flushSync()
}

async function mount(profile, query = '') {
  served = profile
  window.history.replaceState({}, '', `/event?profile=p${query}`)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => structuredClone(served) })),
  )
  const view = render(App)
  await settle()
  return view.container
}

async function editProfile(profile) {
  served = profile
  await vi.advanceTimersByTimeAsync(5000)
  await settle()
}

const q = (root, testid) => root.querySelector(`[data-testid="${testid}"]`)
const text = (root, testid) => q(root, testid)?.textContent.trim() ?? null

/** The slide; fails with a message that names the missing route rather than a null deref. */
function slide(root) {
  const el = q(root, 'event-slide')
  expect(el, '/event renders no event slide').not.toBeNull()
  return el
}

/** The testids of the slide's parts, in document order. */
function partOrder(root) {
  return [...slide(root).querySelectorAll('[data-testid]')]
    .map((el) => el.dataset.testid)
    .filter((id) => ['event-logo', 'event-series', 'event-meta'].includes(id))
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
  window.history.replaceState({}, '', '/')
  document.documentElement.style.background = ''
  document.body.style.background = ''
  delete document.documentElement.dataset.theme
})

describe('/event route (widgets.md rule 123)', () => {
  it('is full-bleed and opaque: it does not force a transparent page', async () => {
    const root = await mount({ slides: FULL })
    slide(root)
    expect(appEl.style.maxWidth).toBe('none')
    expect(appEl.style.background).not.toBe('transparent')
    expect(document.body.style.background).not.toBe('transparent')
    expect(document.documentElement.style.background).not.toBe('transparent')
  })

  it('opens no producer connection, and shows the slide with no producer running', async () => {
    const root = await mount({ slides: FULL })
    expect(text(root, 'event-series')).toBe('GT World Cup')
    expect(FakeEventSource.opened, '/event opened a producer connection').toHaveLength(0)
  })

  it('ignores ?src=, ?class=, ?show= and ?hide=', async () => {
    const root = await mount({ slides: FULL }, '&src=http://x.test/events&class=GT3&hide=event,tower&show=battle')
    expect(text(root, 'event-series')).toBe('GT World Cup')
    expect(text(root, 'event-meta')).toBe('Round 3 · Spa-Francorchamps')
    expect(FakeEventSource.opened).toHaveLength(0)
  })

  it('is not composed into /all', async () => {
    served = { slides: FULL }
    window.history.replaceState({}, '', '/all?profile=p')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => structuredClone(served) })),
    )
    const { container } = render(App)
    await settle()
    // A guard: today's /all already has no slide. It must stay that way (rule 123).
    expect(q(container, 'event-slide')).toBeNull()
    expect(container.textContent).not.toContain('GT World Cup')
  })
})

describe('/event content (rule 124)', () => {
  it('shows logo, series name and meta line, in that order, from the profile', async () => {
    const root = await mount({ slides: FULL })
    expect(partOrder(root)).toEqual(['event-logo', 'event-series', 'event-meta'])

    const img = q(root, 'event-logo')
    expect(img.tagName).toBe('IMG')
    expect(img.getAttribute('src')).toBe('/logos/gt-world-cup.png')

    expect(text(root, 'event-series')).toBe('GT World Cup')
    expect(text(root, 'event-round')).toBe('Round 3')
    expect(text(root, 'event-track')).toBe('Spa-Francorchamps')
    // The meta line is the round, ` · `, and the track, and nothing else.
    expect(q(root, 'event-meta').textContent.trim()).toBe('Round 3 · Spa-Francorchamps')
    expect(q(root, 'event-meta').contains(q(root, 'event-round'))).toBe(true)
    expect(q(root, 'event-meta').contains(q(root, 'event-track'))).toBe(true)
  })

  it('shows the text as normalized (trimmed), with its case kept', async () => {
    const root = await mount({ slides: { series: '  gt World cup  ', round: ' round 3 ', track: 'Spa' } })
    expect(text(root, 'event-series')).toBe('gt World cup')
    expect(q(root, 'event-series').textContent).toBe('gt World cup')
    expect(q(root, 'event-meta').textContent.trim()).toBe('round 3 · Spa')
  })
})

describe('/event empty fields (rule 125)', () => {
  it('an empty logo gives no image element', async () => {
    const root = await mount({ slides: { ...FULL, logo: '' } })
    expect(text(root, 'event-series')).toBe('GT World Cup')
    expect(q(root, 'event-logo')).toBeNull()
    expect(slide(root).querySelector('img')).toBeNull()
    expect(partOrder(root)).toEqual(['event-series', 'event-meta'])
  })

  it('an empty series gives no series element', async () => {
    const root = await mount({ slides: { ...FULL, series: '' } })
    expect(q(root, 'event-series')).toBeNull()
    expect(partOrder(root)).toEqual(['event-logo', 'event-meta'])
  })

  it('an empty round gives no round element and no separator', async () => {
    const root = await mount({ slides: { ...FULL, round: '' } })
    slide(root)
    expect(q(root, 'event-round')).toBeNull()
    expect(q(root, 'event-meta').textContent.trim()).toBe('Spa-Francorchamps')
  })

  it('an empty track gives no track element and no separator', async () => {
    const root = await mount({ slides: { ...FULL, track: '  ' } })
    slide(root)
    expect(q(root, 'event-track')).toBeNull()
    expect(q(root, 'event-meta').textContent.trim()).toBe('Round 3')
  })

  it('with round and track both empty there is no meta line', async () => {
    const root = await mount({ slides: { ...FULL, round: '', track: '' } })
    expect(text(root, 'event-series')).toBe('GT World Cup')
    expect(q(root, 'event-meta')).toBeNull()
    expect(partOrder(root)).toEqual(['event-logo', 'event-series'])
  })

  it('with all four fields empty it shows only the board: no text, no image, no placeholder', async () => {
    for (const profile of [{ slides: { series: '', round: '', track: '', logo: '' } }, {}, { slides: null }]) {
      const root = await mount(profile)
      const board = slide(root)
      expect(board.textContent.trim(), JSON.stringify(profile)).toBe('')
      expect(board.querySelector('img')).toBeNull()
      expect(q(root, 'event-series')).toBeNull()
      expect(q(root, 'event-meta')).toBeNull()
      cleanup()
    }
  })
})

describe('/event reads slides, not a profile key named event (rule 123)', () => {
  it('a profile with only an event key shows the blank board', async () => {
    const root = await mount({ event: FULL })
    const board = slide(root)
    expect(board.textContent.trim()).toBe('')
    expect(board.querySelector('img')).toBeNull()
  })
})

describe('/event logo that does not load (rule 126)', () => {
  it('removes the image when it fails, and tries a new URL from a live reload', async () => {
    const root = await mount({ slides: FULL })
    const img = q(root, 'event-logo')
    expect(img, 'no logo image').not.toBeNull()

    await fireEvent.error(img)
    await settle()
    expect(q(root, 'event-logo'), 'a failed logo stays on the slide').toBeNull()
    expect(slide(root).querySelector('img')).toBeNull()
    expect(partOrder(root)).toEqual(['event-series', 'event-meta'])

    await editProfile({ slides: { ...FULL, logo: '/logos/other.png' } })
    const next = q(root, 'event-logo')
    expect(next, 'a new logo URL is not tried after a failure').not.toBeNull()
    expect(next.getAttribute('src')).toBe('/logos/other.png')
  })
})

describe('/event live reload and no entrance (rule 127, overlay-config rule 73)', () => {
  it('shows its content at once under full motion, and a live reload swaps it at once', async () => {
    // Full motion: an entrance or exit transition would hold or delay nodes here.
    document.documentElement.dataset.motion = 'full'
    served = { slides: FULL }
    window.history.replaceState({}, '', '/event?profile=p')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => structuredClone(served) })),
    )
    const { container } = render(App)
    await settle()
    expect(text(container, 'event-series')).toBe('GT World Cup')

    await editProfile({ slides: { ...FULL, series: 'Endurance Cup', round: '', track: '' } })
    expect(container.querySelectorAll('[data-testid="event-series"]')).toHaveLength(1)
    expect(text(container, 'event-series')).toBe('Endurance Cup')
    expect(q(container, 'event-meta'), 'the old meta line is still held by an exit').toBeNull()
  })

  it('writes data-theme and data-motion from the profile, and again on a live reload', async () => {
    await mount({ slides: FULL, theme: { preset: 'vintage70' }, reducedMotion: true })
    expect(document.documentElement.dataset.theme).toBe('vintage70')
    expect(document.documentElement.dataset.motion).toBe('reduced')

    await editProfile({ slides: FULL, theme: { preset: 'vintage80' }, reducedMotion: false })
    expect(document.documentElement.dataset.theme).toBe('vintage80')
    expect(document.documentElement.dataset.motion).toBe('full')
  })

  it('a ?theme= parameter wins over the profile', async () => {
    await mount({ slides: FULL, theme: { preset: 'vintage70' } }, '&theme=vintage80')
    expect(text(document.body, 'event-series')).toBe('GT World Cup')
    expect(document.documentElement.dataset.theme).toBe('vintage80')
  })
})
