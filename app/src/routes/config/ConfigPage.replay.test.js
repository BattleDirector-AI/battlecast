import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* The editor's `replay` row and preview (#60): overlay-config.md rules 16, 17, 19, 21, 23, 40,
 * 71; widgets.md rule 120; ADR 0039. The companion server is mocked "present" so the Save path
 * runs and the written config is inspectable. The preview sample is a race, so the badge in the
 * preview proves rule 71's "the badge always shows in the preview". */
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
import { WIDGET_HELP } from '../../lib/configHelp.js'

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

describe('config editor: the replay row (rule 71)', () => {
  it('shows the title and a summary that says the badge draws nothing outside a replay', async () => {
    const container = await mountEditor()
    const blurb = q(container, 'blurb-replay')
    expect(blurb, 'no replay row').toBeTruthy()
    const text = blurb.textContent.toLowerCase()
    expect(text).toMatch(/replay/)
    expect(text, 'the summary does not say the badge draws nothing outside a replay').toMatch(
      /nothing|only while|only during/,
    )
    expect(WIDGET_HELP.replay?.title).toBeTruthy()
    // Rule 16: written for broadcasters — no protocol identifiers, no issue numbers.
    expect(WIDGET_HELP.replay.summary).not.toMatch(/`|mode:|#\d|\brule\b/)
  })

  it('offers geometry, visibility, plate opacity and text size', async () => {
    const container = await mountEditor()
    for (const field of ['x', 'y', 'w', 'h']) {
      expect(q(container, `${field}-replay`), `no ${field} control for replay`).toBeTruthy()
    }
    expect(q(container, 'visible-replay'), 'no visibility control for replay').toBeTruthy()
    expect(q(container, 'plate-alpha-replay'), 'no plate-opacity control for replay').toBeTruthy()
    expect(q(container, 'text-scale-replay'), 'no text-size control for replay').toBeTruthy()
  })

  it('offers no trigger, dwell or hide-when-idle control', async () => {
    const container = await mountEditor()
    expect(q(container, 'blurb-replay'), 'no replay row').toBeTruthy()
    expect(q(container, 'trigger-replay')).toBeNull()
    expect(q(container, 'dwell-replay')).toBeNull()
    expect(q(container, 'hide-idle-replay')).toBeNull()
  })

  it('saves the geometry the broadcaster sets', async () => {
    const container = await mountEditor()
    const x = q(container, 'x-replay')
    expect(x, 'no x control for replay').toBeTruthy()
    x.value = '100'
    await fireEvent.input(x)
    await fireEvent.change(x)
    await tick()
    await fireEvent.click(q(container, 'save'))
    await tick()
    expect(vi.mocked(api.saveProfile).mock.calls[0][1].widgets.replay.x).toBe(100)
  })
})

describe('config editor: the replay badge in the preview (rule 71)', () => {
  it('shows the badge in its preview slot although the sample is not a replay', async () => {
    const container = await mountEditor()
    const slot = q(container, 'widget-replay')
    expect(slot, 'no replay widget in the preview').toBeTruthy()
    expect(slot.querySelector('[data-testid="replay-badge"]'), 'the preview shows no badge').toBeTruthy()
    expect(slot.querySelector('[data-testid="replay-label"]').textContent.trim()).toBe('REPLAY')
    // Only the replay widget sees a replay: the rest of the preview keeps the race sample, so
    // the preview tower's header still reads the race mode.
    const header = q(container, 'widget-tower')?.querySelector('[data-testid="tower-header"]')
    expect(header, 'no tower header in the preview').toBeTruthy()
    expect(header.textContent).toMatch(/RACE/)
    expect(header.textContent).not.toMatch(/REPLAY/)
  })
})
