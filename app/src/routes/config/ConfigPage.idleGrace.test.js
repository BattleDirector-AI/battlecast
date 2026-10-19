import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* `/config` exposes the battle box exit grace (overlay-config.md rule 37, ADR 0013): a
 * number input in the battle row only, with its own help copy (rules 16/19), that
 * round-trips into the saved profile. The companion server is mocked "present" so the
 * Save path runs and the written config is inspectable. */
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
import { WIDGET_KEYS } from '../../lib/overlayConfig.js'
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

describe('config editor: battle exit grace', () => {
  it('gives the battle row a 0-30s number input at the 5s default, and no other widget one', async () => {
    const { container } = render(ConfigPage)
    await settle()

    const input = container.querySelector('[data-testid="idle-grace-battle"]')
    expect(input, 'no exit-grace control for battle').toBeTruthy()
    expect(input.type).toBe('number')
    expect(input.min).toBe('0')
    expect(input.max).toBe('30')
    expect(input.step).toBe('1')
    expect(Number(input.value)).toBe(5)

    for (const key of WIDGET_KEYS.filter((k) => k !== 'battle')) {
      expect(
        container.querySelector(`[data-testid="idle-grace-${key}"]`),
        `${key} got an exit-grace control`,
      ).toBeNull()
    }
  })

  it('round-trips the edited value into the saved profile', async () => {
    const { container } = render(ConfigPage)
    await settle()

    const input = container.querySelector('[data-testid="idle-grace-battle"]')
    expect(input, 'no exit-grace control for battle').toBeTruthy()
    await fireEvent.input(input, { target: { value: '8' } })
    await fireEvent.change(input) // a typed value applies on commit (rule 44)
    await tick()
    await fireEvent.click(container.querySelector('[data-testid="save"]'))
    await tick()

    expect(api.saveProfile).toHaveBeenCalledTimes(1)
    const saved = vi.mocked(api.saveProfile).mock.calls[0][1]
    expect(saved.widgets.battle.idleGraceSeconds).toBe(8)
  })

  it('explains the control in the UI', async () => {
    const { container } = render(ConfigPage)
    await settle()

    expect(container.querySelector('[data-testid="help-idle-grace-battle-text"]')).toBeNull()
    const btn = container.querySelector('[data-testid="help-idle-grace-battle"]')
    expect(btn, 'no exit-grace help for battle').toBeTruthy()
    await fireEvent.click(btn)
    await tick()
    const pop = container.querySelector('[data-testid="help-idle-grace-battle-text"]')
    expect(pop, 'exit-grace help did not open').toBeTruthy()
    expect(pop.textContent.trim()).toBe(FIELD_HELP.idleGraceSeconds)

    // The copy must say what the knob is for: holding an ended battle, and 0 = off.
    expect(FIELD_HELP.idleGraceSeconds.toLowerCase()).toMatch(/second/)
    expect(FIELD_HELP.idleGraceSeconds).toMatch(/\b0\b/)
  })
})
