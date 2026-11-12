import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* Regression guards for the opening load of `/config` (overlay-config.md rules 67-69, #440).
 * The opening load can answer late. A save, a Load-list load or a delete that the broadcaster
 * makes before it answers is newer, so the late answer must not replace it. Also: a late answer
 * after the editor is gone, a 404 and an edit made while a save is in flight.
 *
 * Same harness as `ConfigPage.unsaved.test.js`. The stored name is read back by opening a second
 * editor with no `?profile=` and checking which profile it asks the server for. */
vi.mock('../../lib/configApi.js', () => ({
  serverAvailable: vi.fn(async () => true),
  listProfiles: vi.fn(async () => Object.keys(SERVER)),
  listLogos: vi.fn(async () => []),
  getProfile: vi.fn(async (name) => SERVER[name] ?? null),
  saveProfile: vi.fn(async () => ({ saved: true })),
  uploadLogo: vi.fn(),
  deleteLogo: vi.fn(async () => true),
  deleteProfile: vi.fn(async () => true),
}))

import ConfigPage from './ConfigPage.svelte'
import { FakeEventSource } from '../../lib/testing/fakeEventSource.js'
import * as api from '../../lib/configApi.js'

const SERVER = {
  race: { name: 'race', theme: { nameStyle: 'full' } },
  quali: { name: 'quali', theme: { nameStyle: 'full', preset: 'vintage70' } },
}
// What a late opening load of "race" answers: the default name style, so a test can see it land.
const STALE_RACE = { name: 'race', theme: { nameStyle: 'short' } }

beforeEach(() => {
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
  window.localStorage.clear()
  // Export elsewhere can leave happy-dom on `about:blank`; a relative replaceState cannot leave it.
  window.happyDOM?.setURL('http://localhost:3000/config')
  window.history.replaceState({}, '', '/config')
  vi.stubGlobal('confirm', vi.fn(() => true))
  if (window !== globalThis) window.confirm = globalThis.confirm
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/config')
})

async function settle() {
  for (let i = 0; i < 8; i++) await tick()
  await new Promise((r) => setTimeout(r, 0))
  for (let i = 0; i < 4; i++) await tick()
}

const $ = (c, id) => c.querySelector(`[data-testid="${id}"]`)
const marker = (c) => $(c, 'save-state')?.textContent.trim()
const nameStyle = (c) => $(c, 'name-style').value
const profileName = (c) => $(c, 'profile-name').value

async function setNameStyle(c, value) {
  const el = $(c, 'name-style')
  el.value = value
  await fireEvent.change(el)
  await settle()
  expect(nameStyle(c), 'the helper did not change the name style').toBe(value)
}
async function load(c, name) {
  const el = $(c, 'load')
  el.value = name
  await fireEvent.change(el)
  await settle()
}
/** Hold the next `getProfile` call. Returns a function that answers it. */
function holdNextLoad() {
  let answer
  api.getProfile.mockImplementationOnce(() => new Promise((r) => (answer = r)))
  return (value) => answer(value)
}
/** Open an editor with no `?profile=` and return the name it asked the server for. */
async function storedNameSeenByNextEditor() {
  window.history.replaceState({}, '', '/config')
  vi.clearAllMocks()
  render(ConfigPage)
  await settle()
  return api.getProfile.mock.calls[0]?.[0]
}

describe('config editor: a newer action stops the opening load', () => {
  it('a save made while the opening load is in progress is not replaced by its late answer', async () => {
    const answer = holdNextLoad()
    window.history.replaceState({}, '', '/config?profile=race')
    const { container } = render(ConfigPage)
    await settle()

    await setNameStyle(container, 'full')
    await fireEvent.click($(container, 'save'))
    await settle()
    expect(api.saveProfile).toHaveBeenCalledTimes(1)

    answer(STALE_RACE)
    await settle()
    expect(nameStyle(container), 'the late opening load replaced the saved config').toBe('full')
    expect(marker(container)).toBe('No unsaved changes')
  })

  it('a Load-list load made while the opening load is in progress wins over its late answer', async () => {
    const answer = holdNextLoad()
    window.history.replaceState({}, '', '/config?profile=race')
    const { container, unmount } = render(ConfigPage)
    await settle()

    await load(container, 'quali')
    expect(profileName(container)).toBe('quali')

    answer(STALE_RACE)
    await settle()
    expect(profileName(container), 'the late opening load replaced the Load-list load').toBe('quali')
    expect($(container, 'theme-preset').value).toBe('vintage70')
    expect(nameStyle(container)).toBe('full')
    expect(marker(container)).toBe('No unsaved changes')

    unmount()
    expect(await storedNameSeenByNextEditor()).toBe('quali')
  })

  it('a delete made while the opening load is in progress keeps the stored name deleted', async () => {
    // First editor: a successful save stores "race".
    {
      const { container, unmount } = render(ConfigPage)
      await settle()
      const el = $(container, 'profile-name')
      el.value = 'race'
      await fireEvent.input(el)
      await settle()
      await fireEvent.click($(container, 'save'))
      await settle()
      unmount()
    }
    // Second editor opens "race" from the stored name, and the broadcaster deletes it mid-load.
    vi.clearAllMocks()
    const answer = holdNextLoad()
    const { container, unmount } = render(ConfigPage)
    await settle()
    expect(api.getProfile).toHaveBeenCalledWith('race')
    await fireEvent.click($(container, 'delete-profile'))
    await settle()
    expect(api.deleteProfile).toHaveBeenCalledWith('race')

    answer(SERVER.race)
    await settle()
    expect(marker(container), 'the late opening load restored a saved state').toBe('Unsaved changes')
    unmount()
    expect(await storedNameSeenByNextEditor(), 'the late opening load stored the deleted name').toBe('default')
  })
})

describe('config editor: the opening load and the stored name', () => {
  it('a late answer after the editor is gone does not store its name', async () => {
    const answer = holdNextLoad()
    window.history.replaceState({}, '', '/config?profile=race')
    const { unmount } = render(ConfigPage)
    await settle()
    unmount()
    answer(SERVER.race)
    await settle()

    expect(await storedNameSeenByNextEditor()).toBe('default')
  })

  it('a profile the server does not have is not stored', async () => {
    window.history.replaceState({}, '', '/config?profile=new-show')
    const { unmount } = render(ConfigPage)
    await settle()
    expect(api.getProfile).toHaveBeenCalledWith('new-show')
    unmount()

    expect(await storedNameSeenByNextEditor()).toBe('default')
  })
})

describe('config editor: an edit made while a save is in flight', () => {
  it('is still an unsaved change after the save answers', async () => {
    const { container } = render(ConfigPage)
    await settle()

    let answer
    api.saveProfile.mockImplementationOnce(() => new Promise((r) => (answer = r)))
    await setNameStyle(container, 'full')
    await fireEvent.click($(container, 'save'))
    await settle()
    await setNameStyle(container, 'short')

    answer({ saved: true })
    await settle()
    expect(marker(container), 'the save marked an edit it did not send as saved').toBe('Unsaved changes')
  })
})

describe('config editor: a failed action during the opening load', () => {
  it('a failed save that stops the opening load leaves no saved state', async () => {
    const answer = holdNextLoad()
    window.history.replaceState({}, '', '/config?profile=race')
    const { container } = render(ConfigPage)
    await settle()

    api.saveProfile.mockRejectedValueOnce(new Error('disk full'))
    await fireEvent.click($(container, 'save'))
    await settle()
    answer(SERVER.race)
    await settle()
    // The editor shows the default layout, and the server has "race" with the full name style.
    expect(nameStyle(container)).toBe('short')
    expect(marker(container), 'claims the default layout is what the server has').toBe('Unsaved changes')
  })

  it('a failed Load-list load that stops the opening load leaves no saved state', async () => {
    const answer = holdNextLoad()
    window.history.replaceState({}, '', '/config?profile=race')
    const { container } = render(ConfigPage)
    await settle()

    api.getProfile.mockRejectedValueOnce(new Error('server gone'))
    await load(container, 'quali')
    answer(SERVER.race)
    await settle()
    expect(nameStyle(container)).toBe('short')
    expect(marker(container), 'claims the default layout is what the server has').toBe('Unsaved changes')
  })

  it('a late failed opening load does not clear the state of a newer good save', async () => {
    let fail
    api.getProfile.mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
    window.history.replaceState({}, '', '/config?profile=race')
    const { container } = render(ConfigPage)
    await settle()

    await setNameStyle(container, 'full')
    await fireEvent.click($(container, 'save'))
    await settle()
    fail(new Error('timeout'))
    await settle()
    expect(nameStyle(container)).toBe('full')
    expect(marker(container), 'the stopped opening load cleared the saved state').toBe('No unsaved changes')
  })
})
