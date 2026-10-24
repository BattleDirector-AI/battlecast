import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* `/config` exposes the race update box (overlay-config.md rule 51, ADR 0023): an `updates` row
 * with a 2-60 s dwell input carrying its own help copy, plate opacity and text size, no
 * lower-third trigger or hide-when-idle control, and a preview that shows a sample card. The
 * companion server is mocked "present" so the Save path runs and the written config is
 * inspectable (as ConfigPage.idleGrace.test.js does). */
vi.mock('../../lib/configApi.js', () => ({
  serverAvailable: vi.fn(async () => true),
  listProfiles: vi.fn(async () => []),
  listLogos: vi.fn(async () => []),
  getProfile: vi.fn(),
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
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

async function settle() {
  for (let i = 0; i < 5; i++) await tick()
}

const q = (container, testid) => container.querySelector(`[data-testid="${testid}"]`)

describe('config editor: the updates row (rule 51)', () => {
  it('offers a 2-60 s dwell input in 0.5 s steps at the 8 s default, plus plate opacity and text size', async () => {
    const { container } = render(ConfigPage)
    await settle()

    const input = q(container, 'dwell-updates')
    expect(input, 'no dwell control for updates').toBeTruthy()
    expect(input.type).toBe('number')
    expect(input.min).toBe('2')
    expect(input.max).toBe('60')
    expect(input.step).toBe('0.5')
    expect(input.disabled).toBe(false)
    expect(Number(input.value)).toBe(8)

    expect(q(container, 'plate-alpha-updates'), 'no plate-opacity control for updates').toBeTruthy()
    expect(q(container, 'text-scale-updates'), 'no text-size control for updates').toBeTruthy()
  })

  it('offers no lower-third trigger and no hide-when-idle control', async () => {
    const { container } = render(ConfigPage)
    await settle()
    expect(q(container, 'dwell-updates'), 'no updates row').toBeTruthy()
    expect(q(container, 'trigger-updates')).toBeNull()
    expect(q(container, 'hide-idle-updates')).toBeNull()
  })

  it('explains the dwell in terms of update cards, not camera cuts', async () => {
    const { container } = render(ConfigPage)
    await settle()
    const btn = q(container, 'help-dwell-updates')
    expect(btn, 'no dwell help for updates').toBeTruthy()
    await fireEvent.click(btn)
    await tick()
    const pop = q(container, 'help-dwell-updates-text')
    expect(pop, 'dwell help did not open').toBeTruthy()
    const text = pop.textContent.trim()
    expect(text.length).toBeGreaterThan(0)
    expect(text, 'the lower-third dwell copy talks about camera cuts').not.toBe(FIELD_HELP.dwellSeconds)
  })

  it('saves a committed dwell, and refuses one outside 2-60 by keeping the stored value', async () => {
    const { container } = render(ConfigPage)
    await settle()

    const input = q(container, 'dwell-updates')
    expect(input, 'no dwell control for updates').toBeTruthy()
    await fireEvent.input(input, { target: { value: '12' } })
    await fireEvent.change(input) // a typed value applies on commit (rule 44)
    await tick()
    await fireEvent.input(input, { target: { value: '90' } })
    await fireEvent.change(input)
    await tick()
    expect(Number(input.value), 'a refused commit shows the stored value again').toBe(12)

    await fireEvent.click(q(container, 'save'))
    await tick()
    expect(api.saveProfile).toHaveBeenCalledTimes(1)
    const saved = vi.mocked(api.saveProfile).mock.calls[0][1]
    expect(saved.widgets.updates.dwellSeconds).toBe(12)
  })

  it('shows a sample update card in the preview', async () => {
    const { container } = render(ConfigPage)
    await settle()
    const slot = q(container, 'widget-updates')
    expect(slot, 'no updates widget in the preview').toBeTruthy()
    const card = slot.querySelector('[data-testid="race-update"]')
    expect(card, 'the preview shows no update card').toBeTruthy()
    expect(card.querySelector('[data-testid="update-label"]').textContent.trim().length).toBeGreaterThan(0)
  })
})
