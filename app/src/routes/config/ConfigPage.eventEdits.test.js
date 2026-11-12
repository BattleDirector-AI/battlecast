import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* The Event section's edges (overlay-config.md rules 74–75), added after review of #467: a commit
 * that normalizes to the stored text re-shows the stored text, Escape reverts, a stored URL that
 * is on the server is listed once, an uploaded logo is listed by its file name, and a logo list
 * that fails to refresh after an upload is reported, not thrown. The companion server is mocked
 * "present", as ConfigPage.event.test.js does.
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
const options = (select) => [...select.querySelectorAll('option')].map((o) => [o.value, o.textContent.trim()])

async function mountEditor({ profile = null, logos = [] } = {}) {
  vi.mocked(api.getProfile).mockResolvedValue(profile)
  vi.mocked(api.listLogos).mockResolvedValue(logos)
  const view = render(ConfigPage)
  await settle()
  expect(q(view.container, 'event-section'), 'the editor has no Event section').not.toBeNull()
  return view.container
}

async function savedSlides(container) {
  await fireEvent.click(q(container, 'save'))
  await settle()
  return vi.mocked(api.saveProfile).mock.calls.at(-1)[1].slides
}

describe('config editor: Event text inputs show the stored value (rule 74)', () => {
  it('a commit that normalizes to the stored text shows the stored text', async () => {
    const container = await mountEditor({ profile: { slides: { track: 'Spa' } } })
    const input = q(container, 'event-track')
    expect(input.value).toBe('Spa')
    await fireEvent.input(input, { target: { value: ' Spa ' } })
    await fireEvent.keyDown(input, { key: 'Enter' })
    await settle()
    expect(input.value).toBe('Spa')
    expect((await savedSlides(container)).track).toBe('Spa')
  })

  it('Escape shows the stored text again and commits nothing', async () => {
    const container = await mountEditor({ profile: { slides: { track: 'Spa' } } })
    const input = q(container, 'event-track')
    await fireEvent.input(input, { target: { value: 'Monza' } })
    await fireEvent.keyDown(input, { key: 'Escape' })
    await settle()
    expect(input.value).toBe('Spa')
    expect((await savedSlides(container)).track).toBe('Spa')
  })
})

describe('config editor: series logo select entries (rule 75)', () => {
  it('a stored URL that is on the server is listed once, as that server image', async () => {
    const container = await mountEditor({ profile: { slides: { logo: '/logos/series.png' } }, logos: SERVER_LOGOS })
    expect(options(q(container, 'event-logo'))).toEqual([
      ['', 'none'],
      ['/logos/series.png', 'series.png'],
      ['/logos/sponsor.png', 'sponsor.png'],
    ])
    expect(q(container, 'event-logo').value).toBe('/logos/series.png')
  })

  it('an uploaded logo is listed by its file name', async () => {
    const uploaded = { name: 'new-series.png', url: '/logos/new-series.png' }
    vi.mocked(api.uploadLogo).mockResolvedValue(uploaded)
    const container = await mountEditor({ logos: SERVER_LOGOS })
    vi.mocked(api.listLogos).mockResolvedValue([...SERVER_LOGOS, { ...uploaded, size: 50 }])
    const input = q(container, 'event-logo-upload')
    Object.defineProperty(input, 'files', {
      value: [new File(['png'], 'new-series.png', { type: 'image/png' })],
      configurable: true,
    })
    await fireEvent.change(input)
    await settle()
    expect(options(q(container, 'event-logo'))).toEqual([
      ['', 'none'],
      ['/logos/series.png', 'series.png'],
      ['/logos/sponsor.png', 'sponsor.png'],
      ['/logos/new-series.png', 'new-series.png'],
    ])
  })
})

describe('config editor: Event upload when the logo list cannot refresh (rule 75)', () => {
  it('keeps the new series logo, reports the error and clears the file input', async () => {
    const uploaded = { name: 'new-series.png', url: '/logos/new-series.png' }
    vi.mocked(api.uploadLogo).mockResolvedValue(uploaded)
    const container = await mountEditor({ logos: SERVER_LOGOS })
    vi.mocked(api.listLogos).mockRejectedValue(new Error('server went away'))

    const input = q(container, 'event-logo-upload')
    Object.defineProperty(input, 'files', {
      value: [new File(['png'], 'new-series.png', { type: 'image/png' })],
      configurable: true,
    })
    // Record what the page writes to the file input's value.
    const writes = []
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => '',
      set: (v) => {
        writes.push(v)
      },
    })
    await fireEvent.change(input)
    await settle()

    expect(q(container, 'status').textContent).toContain('server went away')
    expect(writes, 'the file input was not cleared').toContain('')
    expect(q(container, 'event-logo').value).toBe('/logos/new-series.png')
  })
})
