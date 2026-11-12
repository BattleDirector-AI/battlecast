import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* `/config` exposes the Event section (overlay-config.md rules 74–75, ADR 0041), which writes the
 * profile's `slides` section: series name,
 * round and track text inputs that commit on Enter or blur, a series-logo select over the
 * companion server's logo store, and an upload into that same store that sets the series logo
 * without touching the logo rotation. Every control has help behind an ⓘ. The companion server
 * is mocked "present" (as ConfigPage.infoPanel.test.js does) so the Save path runs and the
 * written config is inspectable. `getProfile` serves the profile the editor opens (rule 69).
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

const SERVER_LOGOS = [
  { name: 'series.png', url: '/logos/series.png', size: 100 },
  { name: 'sponsor.png', url: '/logos/sponsor.png', size: 200 },
]

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

async function mountEditor({ profile = null, logos = [] } = {}) {
  vi.mocked(api.getProfile).mockResolvedValue(profile)
  vi.mocked(api.listLogos).mockResolvedValue(logos)
  const view = render(ConfigPage)
  await settle()
  return view.container
}

/** The section; fails with a message that names the gap rather than a null deref. */
function section(container) {
  const el = q(container, 'event-section')
  expect(el, 'the editor has no Event section').not.toBeNull()
  return el
}

/** Type into a text input, then commit it the way the broadcaster does. */
async function typeAndCommit(input, value, how = 'enter') {
  await fireEvent.input(input, { target: { value } })
  if (how === 'enter') await fireEvent.keyDown(input, { key: 'Enter' })
  else {
    await fireEvent.change(input, { target: { value } })
    await fireEvent.blur(input)
  }
  await settle()
}

/** Save, and return the `slides` section the editor wrote. */
async function savedEvent(container) {
  await fireEvent.click(q(container, 'save'))
  await settle()
  expect(api.saveProfile).toHaveBeenCalled()
  return vi.mocked(api.saveProfile).mock.calls.at(-1)[1].slides
}

const options = (select) => [...select.querySelectorAll('option')].map((o) => [o.value, o.textContent.trim()])

describe('config editor: the Event section (rule 74)', () => {
  it('is its own section, in no widget row, headed Event, with its controls in order', async () => {
    const container = await mountEditor()
    const sec = section(container)
    expect(sec.closest('fieldset.widget-row')).toBeNull()
    expect(sec.querySelector('h2')?.textContent).toContain('Event')

    const order = [...sec.querySelectorAll('[data-testid^="event-"]')]
      .map((el) => el.dataset.testid)
      .filter((id) => ['event-series', 'event-round', 'event-track', 'event-logo', 'event-logo-upload'].includes(id))
    expect(order).toEqual(['event-series', 'event-round', 'event-track', 'event-logo', 'event-logo-upload'])

    for (const id of ['event-series', 'event-round', 'event-track']) {
      const input = q(container, id)
      expect(input.tagName, id).toBe('INPUT')
      expect(input.type, id).toBe('text')
      expect(input.getAttribute('maxlength'), id).toBe('80')
    }
    expect(q(container, 'event-logo').tagName).toBe('SELECT')
    expect(q(container, 'event-logo-upload').type).toBe('file')
  })

  it('labels each control for a broadcaster', async () => {
    const container = await mountEditor()
    section(container)
    expect(q(container, 'event-series').closest('label').textContent).toContain('series name')
    expect(q(container, 'event-round').closest('label').textContent).toContain('round')
    expect(q(container, 'event-track').closest('label').textContent).toContain('track')
    expect(q(container, 'event-logo').closest('label').textContent).toContain('series logo')
    expect(q(container, 'event-logo-upload').closest('label').textContent).toContain('upload logo')
  })

  it('shows the stored values of the opened profile', async () => {
    const container = await mountEditor({
      profile: { slides: { series: 'GT World Cup', round: 'Round 3', track: 'Spa', logo: '/logos/series.png' } },
      logos: SERVER_LOGOS,
    })
    section(container)
    expect(q(container, 'event-series').value).toBe('GT World Cup')
    expect(q(container, 'event-round').value).toBe('Round 3')
    expect(q(container, 'event-track').value).toBe('Spa')
    expect(q(container, 'event-logo').value).toBe('/logos/series.png')
  })

  it('commits on Enter, trimmed, and Save writes it', async () => {
    const container = await mountEditor()
    section(container)
    await typeAndCommit(q(container, 'event-series'), '  Endurance Cup  ')
    expect(q(container, 'event-series').value).toBe('Endurance Cup')
    await typeAndCommit(q(container, 'event-round'), 'Round 3 of 8', 'blur')
    await typeAndCommit(q(container, 'event-track'), ' Spa-Francorchamps ', 'blur')
    const ev = await savedEvent(container)
    expect(ev).toEqual({ series: 'Endurance Cup', round: 'Round 3 of 8', track: 'Spa-Francorchamps', logo: '' })
  })

  it('keystrokes before the commit change nothing', async () => {
    const container = await mountEditor({ profile: { slides: { series: 'GT World Cup' } } })
    section(container)
    await fireEvent.input(q(container, 'event-series'), { target: { value: 'Half-typed' } })
    await settle()
    // Save without a commit of the series input: the stored value is what Save writes.
    const btn = q(container, 'save')
    await fireEvent.click(btn)
    await settle()
    expect(vi.mocked(api.saveProfile).mock.calls.at(-1)[1].slides.series).toBe('GT World Cup')
  })

  it('a blank commit clears the field', async () => {
    const container = await mountEditor({ profile: { slides: { series: 'GT World Cup', round: 'Round 3' } } })
    section(container)
    await typeAndCommit(q(container, 'event-round'), '   ')
    expect(q(container, 'event-round').value).toBe('')
    const ev = await savedEvent(container)
    expect(ev.round).toBe('')
    expect(ev.series).toBe('GT World Cup')
  })

  it('never changes another key of slides', async () => {
    const start = '2026-11-20T19:00:00Z'
    const container = await mountEditor({ profile: { slides: { series: 'GT Cup', start, crew: ['A'] } } })
    section(container)
    await typeAndCommit(q(container, 'event-track'), 'Monza')
    const ev = await savedEvent(container)
    expect(ev.track).toBe('Monza')
    expect(ev.start).toBe(start)
    expect(ev.crew).toEqual(['A'])
  })
})

describe('config editor: the series logo uses the logo store (rule 75)', () => {
  it('offers none, then each server image in list order, with the file name as text', async () => {
    const container = await mountEditor({ logos: SERVER_LOGOS })
    section(container)
    expect(options(q(container, 'event-logo'))).toEqual([
      ['', 'none'],
      ['/logos/series.png', 'series.png'],
      ['/logos/sponsor.png', 'sponsor.png'],
    ])
    expect(q(container, 'event-logo').value).toBe('')
  })

  it('keeps a stored URL that is not on the server as its own option', async () => {
    const container = await mountEditor({
      profile: { slides: { logo: 'logos/static-host.png' } },
      logos: SERVER_LOGOS,
    })
    section(container)
    expect(options(q(container, 'event-logo'))).toEqual([
      ['', 'none'],
      ['/logos/series.png', 'series.png'],
      ['/logos/sponsor.png', 'sponsor.png'],
      ['logos/static-host.png', 'logos/static-host.png'],
    ])
    expect(q(container, 'event-logo').value).toBe('logos/static-host.png')
  })

  it('choosing an option writes slides.logo and leaves the logo rotation alone', async () => {
    const container = await mountEditor({ logos: SERVER_LOGOS })
    section(container)
    await fireEvent.change(q(container, 'event-logo'), { target: { value: '/logos/series.png' } })
    await settle()
    await fireEvent.click(q(container, 'save'))
    await settle()
    const saved = vi.mocked(api.saveProfile).mock.calls.at(-1)[1]
    expect(saved.slides.logo).toBe('/logos/series.png')
    expect(saved.logoRotation.images).toEqual([])
  })

  it('an upload goes to the same store, sets slides.logo, and is not added to the rotation', async () => {
    const uploaded = { name: 'new-series.png', url: '/logos/new-series.png' }
    vi.mocked(api.uploadLogo).mockResolvedValue(uploaded)
    const container = await mountEditor({ logos: SERVER_LOGOS })
    section(container)
    vi.mocked(api.listLogos).mockResolvedValue([...SERVER_LOGOS, { ...uploaded, size: 50 }])

    const input = q(container, 'event-logo-upload')
    expect(input.disabled).toBe(false)
    const file = new File(['png'], 'new-series.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await fireEvent.change(input)
    await settle()

    expect(api.uploadLogo).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.uploadLogo).mock.calls[0][0]).toBe(file)
    expect(q(container, 'event-logo').value).toBe('/logos/new-series.png')
    expect(options(q(container, 'event-logo')).map(([v]) => v)).toContain('/logos/new-series.png')
    expect(q(container, 'rotation-empty'), 'the upload added the image to the rotation').not.toBeNull()

    const saved = await savedEvent(container)
    expect(saved.logo).toBe('/logos/new-series.png')
    expect(vi.mocked(api.saveProfile).mock.calls.at(-1)[1].logoRotation.images).toEqual([])
  })

  it('a failed upload leaves slides.logo unchanged and reports the error', async () => {
    vi.mocked(api.uploadLogo).mockRejectedValue(new Error('too large'))
    const container = await mountEditor({ profile: { slides: { logo: '/logos/series.png' } }, logos: SERVER_LOGOS })
    section(container)
    const input = q(container, 'event-logo-upload')
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'big.png', { type: 'image/png' })],
      configurable: true,
    })
    await fireEvent.change(input)
    await settle()
    expect(q(container, 'event-logo').value).toBe('/logos/series.png')
    expect(container.textContent).toContain('too large')
  })

  it('with no companion server the upload is disabled and the select has no server images', async () => {
    // With no server the editor opens the default layout and loads no profile (rule 69), so
    // `slides.logo` is empty here: there is no path that seeds a stored logo without a server.
    vi.mocked(api.serverAvailable).mockResolvedValueOnce(false)
    const container = await mountEditor({ profile: null, logos: SERVER_LOGOS })
    section(container)
    expect(q(container, 'event-logo-upload').disabled).toBe(true)
    expect(options(q(container, 'event-logo'))).toEqual([['', 'none']])
    expect(api.getProfile).not.toHaveBeenCalled()
  })

  it('keeps the stored URL as an option when the server lists no images', async () => {
    // The reachable twin of the no-server case: a stored logo and an empty server list.
    const container = await mountEditor({ profile: { slides: { logo: '/logos/gone.png' } }, logos: [] })
    section(container)
    expect(options(q(container, 'event-logo'))).toEqual([
      ['', 'none'],
      ['/logos/gone.png', '/logos/gone.png'],
    ])
    expect(q(container, 'event-logo').value).toBe('/logos/gone.png')
  })

  it('deleting the server image that slides.logo names clears slides.logo (rule 75)', async () => {
    vi.stubGlobal('confirm', () => true)
    const container = await mountEditor({
      profile: { slides: { series: 'GT Cup', logo: '/logos/series.png' } },
      logos: SERVER_LOGOS,
    })
    section(container)
    expect(q(container, 'event-logo').value).toBe('/logos/series.png')
    vi.mocked(api.listLogos).mockResolvedValue([SERVER_LOGOS[1]])

    // The Logo rotation section lists the server images in list order: series.png is first.
    const del = container.querySelectorAll('[data-testid="delete-server-logo"]')
    expect(del).toHaveLength(2)
    await fireEvent.click(del[0])
    await settle()

    expect(api.deleteLogo).toHaveBeenCalledWith('series.png')
    expect(q(container, 'event-logo').value).toBe('')
    const ev = await savedEvent(container)
    expect(ev.logo).toBe('')
    expect(ev.series).toBe('GT Cup')
  })

  it('deleting a different server image leaves slides.logo alone', async () => {
    vi.stubGlobal('confirm', () => true)
    const container = await mountEditor({
      profile: { slides: { logo: '/logos/series.png' } },
      logos: SERVER_LOGOS,
    })
    section(container)
    vi.mocked(api.listLogos).mockResolvedValue([SERVER_LOGOS[0]])
    const del = container.querySelectorAll('[data-testid="delete-server-logo"]')
    await fireEvent.click(del[1])
    await settle()
    expect(api.deleteLogo).toHaveBeenCalledWith('sponsor.png')
    expect(q(container, 'event-logo').value).toBe('/logos/series.png')
    expect((await savedEvent(container)).logo).toBe('/logos/series.png')
  })
})

describe('config editor: Event help (rules 16, 19, 21, 74)', () => {
  const HELP = [
    ['help-event', 'eventSection'],
    ['help-event-series', 'eventSeries'],
    ['help-event-round', 'eventRound'],
    ['help-event-track', 'eventTrack'],
    ['help-event-logo', 'eventLogo'],
    ['help-event-logo-upload', 'eventLogoUpload'],
  ]

  it('gives the heading and every control an ⓘ that opens its own copy', async () => {
    const container = await mountEditor()
    const sec = section(container)
    for (const [testid, key] of HELP) {
      expect(typeof FIELD_HELP[key], `no FIELD_HELP.${key}`).toBe('string')
      const btn = sec.querySelector(`[data-testid="${testid}"]`)
      expect(btn, `no ${testid} in the Event section`).not.toBeNull()
      await fireEvent.click(btn)
      await tick()
      const pop = q(container, `${testid}-text`)
      expect(pop, `${testid} did not open`).not.toBeNull()
      expect(pop.textContent.trim()).toBe(FIELD_HELP[key])
      await fireEvent.keyDown(document, { key: 'Escape' })
      await tick()
    }
    // Each control's copy is its own, not one text shared by all.
    const texts = HELP.map(([, key]) => FIELD_HELP[key])
    expect(new Set(texts).size).toBe(texts.length)
  })

  it('every label in the section that holds a control holds its ⓘ', async () => {
    const container = await mountEditor()
    const sec = section(container)
    const labels = [...sec.querySelectorAll('label')].filter((l) => l.querySelector('input, select'))
    expect(labels.length).toBeGreaterThanOrEqual(5)
    for (const label of labels) {
      expect(label.querySelector('[data-testid^="help-event"]'), label.textContent.trim()).not.toBeNull()
    }
  })

  it('the section help names the /event Browser Source, the solid board, the preview and empty fields', () => {
    const copy = FIELD_HELP.eventSection
    expect(typeof copy, 'no FIELD_HELP.eventSection').toBe('string')
    expect(copy).toContain('/event')
    expect(copy).toContain('?profile=')
    expect(copy.toLowerCase()).toMatch(/browser source/)
    expect(copy.toLowerCase()).toMatch(/full screen|fills the screen/)
    expect(copy.toLowerCase()).toMatch(/preview/)
    expect(copy.toLowerCase()).toMatch(/empty|blank/)
  })

  it('the upload help says the image goes to the shared logo store but not into the rotation', () => {
    const copy = FIELD_HELP.eventLogoUpload
    expect(typeof copy, 'no FIELD_HELP.eventLogoUpload').toBe('string')
    expect(copy.toLowerCase()).toMatch(/companion server/)
    // The meaning is the negation: the upload does NOT add the image to the rotation.
    expect(copy.toLowerCase()).toMatch(/\b(not|never)\b[^.]*rotation/)
    expect(copy.toLowerCase()).not.toMatch(/(^|\.\s*)(it |this )?(also )?adds? (the image|it) to the (logo )?rotation/)
  })
})
