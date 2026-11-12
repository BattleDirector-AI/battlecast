import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* `/config` marks unsaved changes, asks before it goes away with them, and opens the last profile
 * (overlay-config.md rules 67-69, #440). A broadcaster edited the preview, never saved, and
 * reloaded /config to find the default layout again, so OBS "did not update".
 *
 * The companion server is mocked. `getProfile` answers from `SERVER`: a profile object, or `null`
 * when the server does not have it (the real API's 404). The rules name no storage key, so these
 * tests clear all of `localStorage`. They prove rule 69 step 2 by a save or load in one editor,
 * then a second editor that opens with no `?profile=`. */
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

// Saved profiles on the mock server. Each differs from the default layout in the driver name
// style (default `short`), so a test can see which config the editor shows.
const SERVER = {
  race: { name: 'race', theme: { nameStyle: 'full' } },
  quali: { name: 'quali', theme: { nameStyle: 'full', preset: 'vintage70' } },
}

beforeEach(() => {
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
  window.localStorage.clear()
  // Export clicks a download link, and happy-dom then leaves the page for `about:blank`. A
  // relative `replaceState` cannot leave `about:blank`, so set the page address first.
  window.happyDOM?.setURL('http://localhost:3000/config')
  window.history.replaceState({}, '', '/config')
  // happy-dom has no `confirm`. Delete asks with it, and rule 68 says a load does not.
  vi.stubGlobal('confirm', vi.fn(() => true))
  if (window !== globalThis) window.confirm = globalThis.confirm
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete SERVER.default
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
const status = (c) => $(c, 'status').textContent

async function setNameStyle(c, value) {
  const el = $(c, 'name-style')
  el.value = value
  await fireEvent.change(el)
  await settle()
  expect(nameStyle(c), 'the helper did not change the name style').toBe(value)
}
async function setProfileName(c, value) {
  const el = $(c, 'profile-name')
  el.value = value
  await fireEvent.input(el)
  await settle()
  expect(profileName(c), 'the helper did not change the profile name').toBe(value)
}
async function save(c) {
  await fireEvent.click($(c, 'save'))
  await settle()
}
async function load(c, name) {
  const el = $(c, 'load')
  el.value = name
  await fireEvent.change(el)
  await settle()
}
/** Dispatch a cancelable `beforeunload` and report if the editor asked the browser to ask. */
function asksBeforeLeaving() {
  const ev = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(ev)
  return ev.defaultPrevented
}
/** Open one editor, run `steps` in it, close it, and return a second editor opened after it. */
async function reopenAfter(steps) {
  const first = render(ConfigPage)
  await settle()
  await steps(first.container)
  first.unmount()
  vi.clearAllMocks()
  const second = render(ConfigPage)
  await settle()
  return second.container
}

describe('config editor: the unsaved-changes marker (rule 67)', () => {
  it('shows "No unsaved changes" in the same row as Save when the editor opens', async () => {
    const { container } = render(ConfigPage)
    await settle()

    expect(marker(container), 'no save-state marker').toBe('No unsaved changes')
    expect($(container, 'save').closest('.row')?.contains($(container, 'save-state'))).toBe(true)
  })

  it('shows "Unsaved changes" after an edit, and "No unsaved changes" after a save', async () => {
    const { container } = render(ConfigPage)
    await settle()

    await setNameStyle(container, 'full')
    expect(marker(container)).toBe('Unsaved changes')

    await save(container)
    expect(api.saveProfile).toHaveBeenCalledTimes(1)
    expect(marker(container)).toBe('No unsaved changes')
  })

  it('an edit changed back to the saved value gives "No unsaved changes" again', async () => {
    const { container } = render(ConfigPage)
    await settle()

    await setNameStyle(container, 'full')
    expect(marker(container)).toBe('Unsaved changes')
    await setNameStyle(container, 'short')
    expect(marker(container)).toBe('No unsaved changes')
  })

  it('a new profile name is an unsaved change', async () => {
    const { container } = render(ConfigPage)
    await settle()

    await setProfileName(container, 'endurance')
    expect(marker(container)).toBe('Unsaved changes')
  })

  it('a failed save keeps "Unsaved changes"', async () => {
    api.saveProfile.mockRejectedValueOnce(new Error('disk full'))
    const { container } = render(ConfigPage)
    await settle()

    await setNameStyle(container, 'full')
    await save(container)
    expect(marker(container)).toBe('Unsaved changes')
  })

  it('Export JSON runs to the end and does not count as a save', async () => {
    const created = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:captured')
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const { container } = render(ConfigPage)
    await settle()

    await setNameStyle(container, 'full')
    await fireEvent.click($(container, 'export'))
    await settle()
    expect(created, 'the export did not run').toHaveBeenCalledTimes(1)
    expect(revoked, 'the export did not run to the end').toHaveBeenCalledTimes(1)
    expect(marker(container)).toBe('Unsaved changes')
  })

  it('a profile load sets the saved state to that profile', async () => {
    const { container } = render(ConfigPage)
    await settle()

    await load(container, 'quali')
    expect(profileName(container)).toBe('quali')
    expect(marker(container)).toBe('No unsaved changes')

    await setNameStyle(container, 'short')
    expect(marker(container)).toBe('Unsaved changes')
  })

  it('a failed load keeps the saved state', async () => {
    const { container } = render(ConfigPage)
    await settle()
    api.getProfile.mockRejectedValueOnce(new Error('server gone'))

    await setNameStyle(container, 'full')
    await load(container, 'race')
    expect(marker(container)).toBe('Unsaved changes')
  })

  it('deleting the open profile clears the saved state', async () => {
    const { container } = render(ConfigPage)
    await settle()
    await load(container, 'quali')
    expect(marker(container)).toBe('No unsaved changes')

    await fireEvent.click($(container, 'delete-profile'))
    await settle()
    expect(api.deleteProfile).toHaveBeenCalledWith('quali')
    expect(marker(container)).toBe('Unsaved changes')
  })
})

describe('config editor: ask before going away with unsaved changes (rule 68)', () => {
  it('asks only while there are unsaved changes', async () => {
    const { container } = render(ConfigPage)
    await settle()

    expect(asksBeforeLeaving(), 'asked with nothing unsaved').toBe(false)
    await setNameStyle(container, 'full')
    expect(asksBeforeLeaving(), 'did not ask with an unsaved edit').toBe(true)
    await save(container)
    expect(asksBeforeLeaving(), 'asked after the save').toBe(false)
  })

  it('a load from the Load list does not ask, and replaces the unsaved changes', async () => {
    const { container } = render(ConfigPage)
    await settle()
    await setNameStyle(container, 'full')
    expect(marker(container)).toBe('Unsaved changes')

    await load(container, 'quali')
    expect(globalThis.confirm).not.toHaveBeenCalled()
    expect(profileName(container)).toBe('quali')
    expect(marker(container)).toBe('No unsaved changes')
    expect(asksBeforeLeaving()).toBe(false)
  })

  it('stops asking once the editor is gone', async () => {
    const { container, unmount } = render(ConfigPage)
    await settle()
    await setNameStyle(container, 'full')
    expect(asksBeforeLeaving()).toBe(true)
    unmount()
    expect(asksBeforeLeaving()).toBe(false)
  })
})

describe('config editor: open the last profile (rule 69)', () => {
  it('opens the profile named in the editor URL', async () => {
    window.history.replaceState({}, '', '/config?profile=race')
    const { container } = render(ConfigPage)
    await settle()

    expect(api.getProfile).toHaveBeenCalledWith('race')
    expect(profileName(container)).toBe('race')
    expect(nameStyle(container)).toBe('full')
    expect(marker(container)).toBe('No unsaved changes')
  })

  it('opens the profile of the last successful save', async () => {
    const container = await reopenAfter(async (c) => {
      await setProfileName(c, 'race')
      await save(c)
    })
    expect(api.getProfile).toHaveBeenCalledWith('race')
    expect(profileName(container)).toBe('race')
    expect(nameStyle(container)).toBe('full')
  })

  it('opens the profile of the last successful load', async () => {
    const container = await reopenAfter((c) => load(c, 'quali'))
    expect(api.getProfile).toHaveBeenCalledWith('quali')
    expect(profileName(container)).toBe('quali')
  })

  it('a name typed but not saved is not the last profile', async () => {
    await reopenAfter((c) => setProfileName(c, 'race'))
    expect(api.getProfile).not.toHaveBeenCalledWith('race')
    expect(api.getProfile).toHaveBeenCalledWith('default')
  })

  it('a failed save does not change the stored name', async () => {
    await reopenAfter(async (c) => {
      await load(c, 'quali')
      await setProfileName(c, 'race')
      api.saveProfile.mockRejectedValueOnce(new Error('disk full'))
      await save(c)
    })
    expect(api.getProfile).toHaveBeenCalledWith('quali')
    expect(api.getProfile).not.toHaveBeenCalledWith('race')
  })

  it('a failed load does not change the stored name', async () => {
    await reopenAfter(async (c) => {
      await load(c, 'quali')
      api.getProfile.mockRejectedValueOnce(new Error('server gone'))
      await load(c, 'race')
    })
    expect(api.getProfile).toHaveBeenCalledWith('quali')
    expect(api.getProfile).not.toHaveBeenCalledWith('race')
  })

  it('deleting the profile with the stored name deletes the stored name', async () => {
    await reopenAfter(async (c) => {
      await load(c, 'quali')
      await fireEvent.click($(c, 'delete-profile'))
      await settle()
    })
    expect(api.getProfile).not.toHaveBeenCalledWith('quali')
    expect(api.getProfile).toHaveBeenCalledWith('default')
  })

  it('deleting a different profile keeps the stored name', async () => {
    await reopenAfter(async (c) => {
      await load(c, 'quali')
      await setProfileName(c, 'race')
      await fireEvent.click($(c, 'delete-profile'))
      await settle()
      expect(api.deleteProfile).toHaveBeenCalledWith('race')
    })
    expect(api.getProfile).toHaveBeenCalledWith('quali')
  })

  it('the URL wins over the stored name', async () => {
    await reopenAfter((c) => load(c, 'quali'))
    vi.clearAllMocks()
    cleanup()
    window.history.replaceState({}, '', '/config?profile=race')
    const { container } = render(ConfigPage)
    await settle()
    expect(api.getProfile).toHaveBeenCalledWith('race')
    expect(api.getProfile).not.toHaveBeenCalledWith('quali')
    expect(profileName(container)).toBe('race')
  })

  it('with no other name, opens the server profile "default"', async () => {
    SERVER.default = { name: 'default', theme: { nameStyle: 'full' } }
    const { container } = render(ConfigPage)
    await settle()

    expect(api.getProfile).toHaveBeenCalledWith('default')
    expect(profileName(container)).toBe('default')
    expect(nameStyle(container), 'the server "default" was not loaded').toBe('full')
    expect(marker(container)).toBe('No unsaved changes')
  })

  it('a profile the server does not have opens the default layout under that name, saved', async () => {
    window.history.replaceState({}, '', '/config?profile=new-show')
    const { container } = render(ConfigPage)
    await settle()

    expect(api.getProfile).toHaveBeenCalledWith('new-show')
    expect(profileName(container)).toBe('new-show')
    expect(nameStyle(container)).toBe('short')
    expect(marker(container)).toBe('No unsaved changes')
  })

  it('a load that fails another way keeps the default layout, unsaved, and names the profile', async () => {
    api.getProfile.mockRejectedValueOnce(new Error('timeout'))
    window.history.replaceState({}, '', '/config?profile=race')
    const { container } = render(ConfigPage)
    await settle()

    expect(profileName(container)).toBe('race')
    expect(nameStyle(container)).toBe('short')
    expect(marker(container)).toBe('Unsaved changes')
    expect(status(container)).toMatch(/race/)
  })

  it('with no companion server, loads nothing and the default layout is the saved state', async () => {
    api.serverAvailable.mockResolvedValueOnce(false)
    window.history.replaceState({}, '', '/config?profile=race')
    const { container } = render(ConfigPage)
    await settle()

    expect(api.getProfile).not.toHaveBeenCalled()
    expect(profileName(container)).toBe('race')
    expect(nameStyle(container)).toBe('short')
    expect(marker(container)).toBe('No unsaved changes')
  })

  it('the load result replaces edits made while the load was in progress', async () => {
    let answer
    api.getProfile.mockImplementationOnce(() => new Promise((r) => (answer = r)))
    window.history.replaceState({}, '', '/config?profile=race')
    const { container } = render(ConfigPage)
    await settle()
    expect(api.getProfile).toHaveBeenCalledWith('race')
    // Until the load answers, the default layout under "race" is the saved state.
    expect(profileName(container)).toBe('race')
    expect(marker(container), 'unsaved while the opening load is in progress').toBe('No unsaved changes')
    expect(asksBeforeLeaving(), 'asks while the opening load is in progress').toBe(false)

    await setProfileName(container, 'typed-while-loading')
    answer({ name: 'race', theme: { nameStyle: 'full' } })
    await settle()
    expect(profileName(container)).toBe('race')
    expect(nameStyle(container)).toBe('full')
    expect(marker(container)).toBe('No unsaved changes')
  })

  it('opens and saves when the browser blocks storage', async () => {
    // Real blocked storage throws on the read of `window.localStorage` itself, not only on its
    // methods. Keep the originals (own or inherited) to put them back.
    const targets = globalThis === window ? [window] : [window, globalThis]
    const originals = targets.map((t) => Object.getOwnPropertyDescriptor(t, 'localStorage'))
    const blocked = { configurable: true, get() { throw new Error('storage blocked') } }
    for (const t of targets) Object.defineProperty(t, 'localStorage', blocked)
    try {
      const { container } = render(ConfigPage)
      await settle()
      expect(api.getProfile).toHaveBeenCalledWith('default')
      expect(profileName(container)).toBe('default')
      await setNameStyle(container, 'full')
      await save(container)
      expect(api.saveProfile).toHaveBeenCalledTimes(1)
      expect(status(container)).toMatch(/Saved profile/)
      expect(marker(container)).toBe('No unsaved changes')
    } finally {
      targets.forEach((t, i) => {
        if (originals[i]) Object.defineProperty(t, 'localStorage', originals[i])
        else delete t.localStorage
      })
      expect(() => window.localStorage.clear(), 'storage was not restored').not.toThrow()
    }
  })
})
