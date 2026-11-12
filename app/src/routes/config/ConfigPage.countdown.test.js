import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* `/config` exposes the Countdown section (overlay-config.md rule 76, ADR 0042), which writes the
 * two Countdown keys of the profile's `slides` section: the race start, a datetime-local input that
 * commits on `change`, and the starting text, a text input that commits on Enter or blur and falls
 * back to STARTING NOW when blank (rule 73, steps 5-6). The section has no series name or logo
 * control: those stay in the Event section. Every control has help behind an ⓘ. The companion
 * server is mocked "present", as ConfigPage.event.test.js does, so Save runs and the written config
 * is inspectable.
 */
vi.mock('../../lib/configApi.js', () => ({
  serverAvailable: vi.fn(async () => true),
  listProfiles: vi.fn(async () => []),
  listLogos: vi.fn(async () => []),
  getProfile: vi.fn(async () => null),
  saveProfile: vi.fn(async () => ({ saved: true })),
  uploadLogo: vi.fn(),
  deleteLogo: vi.fn(async () => true),
  deleteProfile: vi.fn(async () => true),
}))

import ConfigPage from './ConfigPage.svelte'
import { FakeEventSource } from '../../lib/testing/fakeEventSource.js'
import * as api from '../../lib/configApi.js'
import { FIELD_HELP } from '../../lib/configHelp.js'

beforeEach(() => {
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
  window.localStorage?.clear?.()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

async function settle() {
  for (let i = 0; i < 8; i++) await tick()
}

const q = (container, testid) => container.querySelector(`[data-testid="${testid}"]`)

async function mountEditor({ profile = null } = {}) {
  vi.mocked(api.getProfile).mockResolvedValue(profile)
  const view = render(ConfigPage)
  await settle()
  return view.container
}

/** The section; fails with a message that names the gap rather than a null deref. */
function section(container) {
  const el = q(container, 'countdown-section')
  expect(el, 'the editor has no Countdown section').not.toBeNull()
  return el
}

/** Type into the starting text input, then commit it the way the broadcaster does. */
async function typeAndCommit(input, value, how = 'enter') {
  await fireEvent.input(input, { target: { value } })
  if (how === 'enter') await fireEvent.keyDown(input, { key: 'Enter' })
  else {
    await fireEvent.change(input, { target: { value } })
    await fireEvent.blur(input)
  }
  await settle()
}

/** Set the datetime-local input as the browser does: a complete value, then `change`. */
async function setStart(input, value) {
  await fireEvent.input(input, { target: { value } })
  await fireEvent.change(input, { target: { value } })
  await settle()
}

/** Save, and return the `slides` section the editor wrote. */
async function savedSlides(container) {
  await fireEvent.click(q(container, 'save'))
  await settle()
  expect(api.saveProfile).toHaveBeenCalled()
  return vi.mocked(api.saveProfile).mock.calls.at(-1)[1].slides
}

describe('config editor: the Countdown section (rule 76)', () => {
  it('is its own section, after the Event section, headed Countdown, with its two controls in order', async () => {
    const container = await mountEditor()
    const sec = section(container)
    expect(sec.closest('fieldset.widget-row')).toBeNull()
    expect(sec.querySelector('h2')?.textContent).toContain('Countdown')

    const event = q(container, 'event-section')
    expect(event, 'the editor has no Event section').not.toBeNull()
    expect(event.nextElementSibling, 'the Countdown section does not follow the Event section').toBe(sec)

    const ids = [...sec.querySelectorAll('input, select, textarea, button:not([data-testid^="help-"])')].map(
      (el) => el.dataset.testid,
    )
    expect(ids).toEqual(['countdown-start', 'countdown-start-clear', 'countdown-started-text'])

    const start = q(container, 'countdown-start')
    expect(start.tagName).toBe('INPUT')
    expect(start.getAttribute('type')).toBe('datetime-local')
    expect(start.getAttribute('step')).toBe('60')
    const startedText = q(container, 'countdown-started-text')
    expect(startedText.getAttribute('type')).toBe('text')
    expect(startedText.getAttribute('maxlength')).toBe('80')
  })

  it('has no series name or logo control', async () => {
    const container = await mountEditor()
    const sec = section(container)
    expect(sec.querySelector('select')).toBeNull()
    expect(sec.querySelector('input[type="file"]')).toBeNull()
    expect(sec.querySelector('[data-testid^="event-"]')).toBeNull()
  })

  it('labels each control for a broadcaster', async () => {
    const container = await mountEditor()
    section(container)
    expect(q(container, 'countdown-start').closest('label').textContent).toContain('race start')
    expect(q(container, 'countdown-started-text').closest('label').textContent).toContain('starting text')
  })

  it('shows the stored values of the opened profile', async () => {
    const container = await mountEditor({
      profile: { slides: { series: 'GT Cup', start: '2026-11-20T19:00', startedText: 'Lights out' } },
    })
    section(container)
    expect(q(container, 'countdown-start').value).toBe('2026-11-20T19:00')
    expect(q(container, 'countdown-started-text').value).toBe('Lights out')
  })

  it('shows an empty start and the default starting text for a profile without them', async () => {
    const container = await mountEditor({ profile: { slides: { series: 'GT Cup' } } })
    section(container)
    expect(q(container, 'countdown-start').value).toBe('')
    expect(q(container, 'countdown-started-text').value).toBe('STARTING NOW')
  })

  it('the race start commits on change, and Save writes it', async () => {
    const container = await mountEditor()
    section(container)
    await setStart(q(container, 'countdown-start'), '2026-11-20T19:00')
    const slides = await savedSlides(container)
    expect(slides.start).toBe('2026-11-20T19:00')
  })

  it('an empty race start clears the start', async () => {
    const container = await mountEditor({ profile: { slides: { start: '2026-11-20T19:00' } } })
    section(container)
    await setStart(q(container, 'countdown-start'), '')
    expect(q(container, 'countdown-start').value).toBe('')
    expect((await savedSlides(container)).start).toBe('')
  })

  it('a partly typed start (bad input) changes nothing', async () => {
    const container = await mountEditor({ profile: { slides: { start: '2026-11-20T19:00' } } })
    section(container)
    const input = q(container, 'countdown-start')
    // Chrome: the hour field is emptied to be typed again. The value is '' and badInput is true.
    Object.defineProperty(input, 'validity', { configurable: true, value: { badInput: true, valid: false } })
    await setStart(input, '')
    expect((await savedSlides(container)).start, 'a partly typed start cleared the stored start').toBe(
      '2026-11-20T19:00',
    )
  })

  it('the clear button empties the start, and is disabled while there is no start', async () => {
    const container = await mountEditor({ profile: { slides: { start: '2026-11-20T19:00' } } })
    section(container)
    const clear = q(container, 'countdown-start-clear')
    expect(clear, 'the section has no clear button').not.toBeNull()
    expect(clear.tagName).toBe('BUTTON')
    expect(clear.textContent).toContain('clear')
    expect(clear.disabled).toBe(false)
    await fireEvent.click(clear)
    await settle()
    expect(q(container, 'countdown-start').value).toBe('')
    expect(q(container, 'countdown-start-clear').disabled, 'clear stays enabled with no start').toBe(true)
    expect((await savedSlides(container)).start).toBe('')
  })

  it('the starting text commits on Enter or blur, trimmed', async () => {
    const container = await mountEditor()
    section(container)
    await typeAndCommit(q(container, 'countdown-started-text'), '  Lights out  ')
    expect(q(container, 'countdown-started-text').value).toBe('Lights out')
    expect((await savedSlides(container)).startedText).toBe('Lights out')

    await typeAndCommit(q(container, 'countdown-started-text'), 'Green flag', 'blur')
    expect((await savedSlides(container)).startedText).toBe('Green flag')
  })

  it('keystrokes in the starting text before the commit change nothing', async () => {
    const container = await mountEditor({ profile: { slides: { startedText: 'Lights out' } } })
    section(container)
    await fireEvent.input(q(container, 'countdown-started-text'), { target: { value: 'Half-typ' } })
    await settle()
    expect((await savedSlides(container)).startedText).toBe('Lights out')
  })

  it('a blank starting text commits the default STARTING NOW, and the input shows it', async () => {
    const container = await mountEditor({ profile: { slides: { startedText: 'Lights out' } } })
    section(container)
    await typeAndCommit(q(container, 'countdown-started-text'), '   ')
    expect(q(container, 'countdown-started-text').value).toBe('STARTING NOW')
    expect((await savedSlides(container)).startedText).toBe('STARTING NOW')
  })

  it('never changes another key of slides', async () => {
    const container = await mountEditor({
      profile: {
        slides: { series: 'GT Cup', round: 'Round 3', track: 'Spa', logo: '/logos/a.png', crew: ['A'] },
      },
    })
    section(container)
    await setStart(q(container, 'countdown-start'), '2026-11-20T19:00')
    await typeAndCommit(q(container, 'countdown-started-text'), 'Lights out')
    expect(await savedSlides(container)).toEqual({
      series: 'GT Cup',
      round: 'Round 3',
      track: 'Spa',
      logo: '/logos/a.png',
      start: '2026-11-20T19:00',
      startedText: 'Lights out',
      crew: ['A'],
    })
  })
})

describe('config editor: Countdown help (rules 16, 19, 21, 76)', () => {
  const HELP = [
    ['help-countdown', 'countdownSection'],
    ['help-countdown-start', 'countdownStart'],
    ['help-countdown-start-clear', 'countdownStartClear'],
    ['help-countdown-started-text', 'countdownStartedText'],
  ]

  it('gives the heading and every control an ⓘ that opens its own copy', async () => {
    const container = await mountEditor()
    const sec = section(container)
    for (const [testid, key] of HELP) {
      expect(typeof FIELD_HELP[key], `no FIELD_HELP.${key}`).toBe('string')
      const btn = sec.querySelector(`[data-testid="${testid}"]`)
      expect(btn, `no ${testid} in the Countdown section`).not.toBeNull()
      await fireEvent.click(btn)
      await tick()
      const pop = q(container, `${testid}-text`)
      expect(pop, `${testid} did not open`).not.toBeNull()
      expect(pop.textContent.trim()).toBe(FIELD_HELP[key])
      await fireEvent.keyDown(document, { key: 'Escape' })
      await tick()
    }
    const texts = HELP.map(([, key]) => FIELD_HELP[key])
    expect(new Set(texts).size).toBe(texts.length)
  })

  it('every label in the section that holds a control holds its ⓘ', async () => {
    const container = await mountEditor()
    const sec = section(container)
    const labels = [...sec.querySelectorAll('label')].filter((l) => l.querySelector('input, select'))
    expect(labels.length).toBe(2)
    for (const label of labels) {
      expect(label.querySelector('[data-testid^="help-countdown-"]'), label.textContent.trim()).not.toBeNull()
    }
  })

  it('the section help names the /countdown Browser Source, the board, the preview, the Event section, no start and zero', () => {
    const copy = FIELD_HELP.countdownSection
    expect(typeof copy, 'no FIELD_HELP.countdownSection').toBe('string')
    const low = copy.toLowerCase()
    expect(copy).toContain('/countdown')
    expect(copy).toContain('?profile=')
    expect(low).toMatch(/browser source/)
    expect(low).toMatch(/full screen|fills the screen/)
    expect(low).toMatch(/preview/)
    expect(low).toMatch(/event section/)
    expect(low).toMatch(/no (race )?start[^.]*no timer|no timer[^.]*no (race )?start/)
    expect(low).toMatch(/starting text/)
    // The line stays while the start is in the past (not "until the scene changes").
    expect(low).toMatch(/stays[^.]*past/)
    expect(low).not.toMatch(/scene/)
  })

  it('the start help names local time, no restart on reload, and a past start', () => {
    const copy = FIELD_HELP.countdownStart
    expect(typeof copy, 'no FIELD_HELP.countdownStart').toBe('string')
    const low = copy.toLowerCase()
    expect(low).toMatch(/local time/)
    expect(low).toMatch(/reload/)
    // The meaning is the negation: a reload does NOT restart the countdown.
    expect(low).toMatch(/\b(not|never)\b[^.]*restart|reload[^.]*\b(not|never)\b/)
    expect(low).toMatch(/past/)
  })
})
