import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* `/config` exposes the battle box's replay hide (overlay-config.md rule 72, widgets.md rule 122,
 * ADR 0040): a **Hide during replay** checkbox on the `battle` row only, immediately after the
 * exit grace field, unchecked by default, with its own help. The companion server is mocked
 * "present" so the Save path runs and the written config is inspectable (as
 * ConfigPage.weather.test.js does). */
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
import { WIDGET_KEYS } from '../../lib/overlayConfig.js'
import * as api from '../../lib/configApi.js'

const HELP =
  'Hide the battle box while your producer shows a replay. The box comes back when the replay ' +
  'ends. Off by default: the box then stays up during a replay and shows the live gaps.'

beforeEach(() => {
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

async function mountEditor() {
  const view = render(ConfigPage)
  for (let i = 0; i < 5; i++) await tick()
  return view.container
}
const q = (container, testid) => container.querySelector(`[data-testid="${testid}"]`)

async function saved(container) {
  await fireEvent.click(q(container, 'save'))
  await tick()
  expect(api.saveProfile).toHaveBeenCalledTimes(1)
  return vi.mocked(api.saveProfile).mock.calls[0][1].widgets
}

async function openHelp(container, testid) {
  const btn = q(container, testid)
  expect(btn, `no ${testid}`).toBeTruthy()
  await fireEvent.click(btn)
  await tick()
  const pop = q(container, `${testid}-text`)
  expect(pop, `${testid} did not open`).toBeTruthy()
  return pop.textContent.trim()
}

describe('config editor: the battle row’s Hide during replay checkbox (rule 72)', () => {
  it('is an unchecked checkbox labelled "Hide during replay", immediately after the exit grace field', async () => {
    const container = await mountEditor()
    const boxEl = q(container, 'hide-replay-battle')
    expect(boxEl, 'no Hide during replay control on the battle row').toBeTruthy()
    expect(boxEl.type).toBe('checkbox')
    expect(boxEl.checked).toBe(false)
    const label = boxEl.closest('label')
    expect(label?.textContent.replace(/\s+/g, ' ').trim()).toMatch(/^Hide during replay\b/)
    const graceLabel = q(container, 'idle-grace-battle')?.closest('label')
    expect(graceLabel, 'no exit grace field on the battle row').toBeTruthy()
    expect(graceLabel.nextElementSibling, 'the checkbox is not immediately after the exit grace field').toBe(label)
  })

  it('shows a stored true as checked, and Save with no click keeps it', async () => {
    vi.mocked(api.listProfiles).mockResolvedValueOnce(['replay-hide'])
    vi.mocked(api.getProfile).mockResolvedValueOnce({
      configVersion: '1',
      name: 'replay-hide',
      widgets: { tower: { x: 60 }, battle: { hideDuringReplay: true } },
    })
    const container = await mountEditor()
    await fireEvent.change(q(container, 'load'), { target: { value: 'replay-hide' } })
    for (let i = 0; i < 5; i++) await tick()

    // The profile really loaded (guards this test's own setup, independent of the control).
    expect(q(container, 'widget-tower').style.left).toBe('60px')
    const boxEl = q(container, 'hide-replay-battle')
    expect(boxEl, 'no Hide during replay control on the battle row').toBeTruthy()
    expect(boxEl.checked, 'a stored true shows unchecked').toBe(true)
    expect((await saved(container)).battle.hideDuringReplay).toBe(true)
  })

  it('is offered on the battle row only', async () => {
    const container = await mountEditor()
    expect(q(container, 'hide-replay-battle'), 'no Hide during replay control on the battle row').toBeTruthy()
    const all = [...container.querySelectorAll('[data-testid^="hide-replay-"]')].map((el) => el.dataset.testid)
    expect(all).toEqual(['hide-replay-battle'])
    for (const key of WIDGET_KEYS.filter((k) => k !== 'battle')) {
      expect(q(container, `hide-replay-${key}`), key).toBeNull()
    }
  })

  it('explains itself behind its own ⓘ with the rule 72 help text', async () => {
    const container = await mountEditor()
    expect(await openHelp(container, 'help-hide-replay-battle')).toBe(HELP)
    // happy-dom forwards a click inside a label even when it starts on a button, which real
    // browsers do not. So assert the cancel that protects real browsers, as
    // ConfigPage.help.test.js does, not the checkbox state.
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
    q(container, 'help-hide-replay-battle').dispatchEvent(ev)
    expect(ev.defaultPrevented, 'the ⓘ click was not cancelled, so it would reach the checkbox').toBe(true)
  })

  it('checking it saves hideDuringReplay true on the battle widget only', async () => {
    const container = await mountEditor()
    const boxEl = q(container, 'hide-replay-battle')
    expect(boxEl, 'no Hide during replay control on the battle row').toBeTruthy()
    await fireEvent.click(boxEl)
    await tick()
    expect(boxEl.checked).toBe(true)
    const widgets = await saved(container)
    expect(widgets.battle.hideDuringReplay).toBe(true)
    for (const key of Object.keys(widgets).filter((k) => k !== 'battle')) {
      expect(widgets[key], key).not.toHaveProperty('hideDuringReplay')
    }
  })

  it('clearing it again saves false', async () => {
    const container = await mountEditor()
    const boxEl = q(container, 'hide-replay-battle')
    expect(boxEl, 'no Hide during replay control on the battle row').toBeTruthy()
    await fireEvent.click(boxEl)
    await tick()
    await fireEvent.click(boxEl)
    await tick()
    expect(boxEl.checked).toBe(false)
    expect((await saved(container)).battle.hideDuringReplay).toBe(false)
  })

  it('the preview battle box still shows with the setting on, as the sample is not a replay', async () => {
    const container = await mountEditor()
    const boxEl = q(container, 'hide-replay-battle')
    expect(boxEl, 'no Hide during replay control on the battle row').toBeTruthy()
    await fireEvent.click(boxEl)
    await tick()
    const preview = q(container, 'preview-stage')
    const battle = preview?.querySelector('[data-testid="widget-battle"] [aria-label="Battle for position"]')
    expect(battle, 'the preview battle box disappeared with the setting on').toBeTruthy()
    expect(battle.textContent).toContain('+0.4')
  })
})
