import { it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

// Drive the editor with the companion server "present" so the upload path runs.
vi.mock('../../lib/configApi.js', () => ({
  serverAvailable: vi.fn(async () => true),
  listProfiles: vi.fn(async () => []),
  listLogos: vi.fn(async () => []),
  uploadLogo: vi.fn(async (file) => ({ name: file.name, url: `/logos/${file.name}` })),
  getProfile: vi.fn(),
  saveProfile: vi.fn(async () => ({ saved: true })),
  deleteLogo: vi.fn(async () => true),
}))

import ConfigPage from './ConfigPage.svelte'
import * as api from '../../lib/configApi.js'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it('uploads a logo, adds it to the rotation, and clears the input (no currentTarget bug)', async () => {
  const { getByTestId, container } = render(ConfigPage)
  await tick() // serverAvailable() resolves true
  await tick() // profile/logo lists load

  const input = getByTestId('upload')
  const file = new File([new Uint8Array([1, 2, 3])], 'sponsor.png', { type: 'image/png' })

  // Regression guard: onUpload awaits, so it must not touch event.currentTarget
  // after the await (it would be null). This would throw before the fix.
  await fireEvent.change(input, { target: { files: [file] } })
  await tick()
  await tick()

  expect(container.querySelector('[data-testid="rotation-list"]').textContent).toContain(
    '/logos/sponsor.png',
  )
  expect(input.value).toBe('')
})

it('deletes a logo from the server (not just the rotation) and refreshes the list', async () => {
  const logo = { name: 'old.png', url: '/logos/old.png' }
  // Present on mount, then gone after the delete refresh.
  vi.mocked(api.listLogos).mockResolvedValueOnce([logo]).mockResolvedValueOnce([])
  vi.stubGlobal('confirm', vi.fn(() => true))

  const { getByTestId, queryByTestId } = render(ConfigPage)
  // refreshFromServer awaits serverAvailable -> listProfiles -> listLogos.
  for (let i = 0; i < 5; i++) await tick()

  expect(getByTestId('delete-server-logo')).toBeTruthy()

  await fireEvent.click(getByTestId('delete-server-logo'))
  await tick()
  await tick()

  expect(api.deleteLogo).toHaveBeenCalledWith('old.png')
  // The server-logos list refreshed to empty, so the delete button is gone.
  expect(queryByTestId('delete-server-logo')).toBeNull()
})
