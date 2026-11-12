import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* The logo rotation upload's error paths (#469): the file input is cleared whatever happens, a
 * failed file does not stop the next one, a failed list refresh is reported as a server error, and
 * the server list is refreshed after the uploads. The companion server is mocked "present".
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

async function mountEditor() {
  vi.mocked(api.listLogos).mockResolvedValue([])
  const view = render(ConfigPage)
  await settle()
  return view.container
}

// Choose files on the rotation upload input; returns what the page wrote to its value.
async function chooseFiles(container, names) {
  const input = q(container, 'upload')
  Object.defineProperty(input, 'files', {
    value: names.map((n) => new File(['png'], n, { type: 'image/png' })),
    configurable: true,
  })
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
  return writes
}

const rotationText = (container) => q(container, 'rotation-list').textContent
const status = (container) => q(container, 'status').textContent

describe('config editor: logo rotation upload error paths', () => {
  it('a failed upload still clears the file input and reports the failure', async () => {
    vi.mocked(api.uploadLogo).mockRejectedValue(new Error('disk full'))
    const container = await mountEditor()
    const writes = await chooseFiles(container, ['a.png'])
    expect(status(container)).toBe('Upload failed: disk full')
    expect(writes, 'the file input was not cleared').toContain('')
  })

  it('a failed list refresh reports "Server error" and still clears the file input', async () => {
    vi.mocked(api.uploadLogo).mockResolvedValue({ name: 'a.png', url: '/logos/a.png' })
    const container = await mountEditor()
    vi.mocked(api.listLogos).mockRejectedValue(new Error('server went away'))
    const writes = await chooseFiles(container, ['a.png'])
    expect(status(container)).toBe('Server error: server went away')
    expect(rotationText(container)).toContain('/logos/a.png')
    expect(writes, 'the file input was not cleared').toContain('')
  })

  it('keeps uploading the remaining files after one fails', async () => {
    vi.mocked(api.uploadLogo).mockImplementation(async (file) => {
      if (file.name === 'bad.png') throw new Error('rejected')
      return { name: file.name, url: `/logos/${file.name}` }
    })
    const container = await mountEditor()
    await chooseFiles(container, ['one.png', 'bad.png', 'three.png'])
    expect(api.uploadLogo).toHaveBeenCalledTimes(3)
    const text = rotationText(container)
    expect(text).toContain('/logos/one.png')
    expect(text).not.toContain('/logos/bad.png')
    expect(text).toContain('/logos/three.png')
    expect(status(container)).toBe('Upload failed: rejected')
  })

  it('refreshes the server logo list after the uploads', async () => {
    vi.mocked(api.uploadLogo).mockResolvedValue({ name: 'a.png', url: '/logos/a.png' })
    const container = await mountEditor()
    vi.mocked(api.listLogos).mockResolvedValue([{ name: 'a.png', url: '/logos/a.png', size: 3 }])
    expect(container.textContent).not.toContain('+ a.png')
    await chooseFiles(container, ['a.png'])
    expect(container.textContent).toContain('+ a.png')
  })
})
