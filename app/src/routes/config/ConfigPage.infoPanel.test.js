import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'

/* `/config` exposes the info panel (overlay-config.md rule 53, ADR 0024): an `info` row with a
 * 2-60 s dwell input carrying its own help copy, plate opacity and text size, an info lines
 * list (add, edit, remove, with rule 52's limits), no lower-third trigger or hide-when-idle
 * control, and a preview that shows the panel. The companion server is mocked "present" so the
 * Save path runs and the written config is inspectable (as ConfigPage.raceUpdates.test.js
 * does). */
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
import eventInfo from '../../../../spec/v1/fixtures/event-info.json'

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

async function mountEditor() {
  const view = render(ConfigPage)
  await settle()
  return view.container
}

/** Type `text` into the new-line input and press Add. */
async function addLine(container, text) {
  const input = q(container, 'info-line-new')
  expect(input, 'no new-line input for info lines').toBeTruthy()
  await fireEvent.input(input, { target: { value: text } })
  await fireEvent.click(q(container, 'info-line-add'))
  await tick()
}

/** The stored lines as the editor shows them, in order. */
function shownLines(container) {
  const out = []
  for (let i = 0; q(container, `info-line-${i}`); i++) out.push(q(container, `info-line-${i}`).value)
  return out
}

/** The line the preview's info panel shows now. */
function previewLine(container) {
  const slot = q(container, 'widget-info')
  expect(slot, 'no info widget in the preview').toBeTruthy()
  return slot.querySelector('[data-testid="info-line"]')?.textContent.trim() ?? null
}

/** Save, and return the `info` widget the editor wrote. */
async function savedInfo(container) {
  await fireEvent.click(q(container, 'save'))
  await tick()
  expect(api.saveProfile).toHaveBeenCalledTimes(1)
  return vi.mocked(api.saveProfile).mock.calls[0][1].widgets.info
}

describe('config editor: the info row (rule 53)', () => {
  it('offers a 2-60 s dwell input in 0.5 s steps at the 8 s default, plus plate opacity and text size', async () => {
    const container = await mountEditor()
    const input = q(container, 'dwell-info')
    expect(input, 'no dwell control for info').toBeTruthy()
    expect(input.type).toBe('number')
    expect(input.min).toBe('2')
    expect(input.max).toBe('60')
    expect(input.step).toBe('0.5')
    expect(input.disabled).toBe(false)
    expect(Number(input.value)).toBe(8)

    expect(q(container, 'plate-alpha-info'), 'no plate-opacity control for info').toBeTruthy()
    expect(q(container, 'text-scale-info'), 'no text-size control for info').toBeTruthy()
  })

  it('offers no lower-third trigger and no hide-when-idle control', async () => {
    const container = await mountEditor()
    expect(q(container, 'dwell-info'), 'no info row').toBeTruthy()
    expect(q(container, 'trigger-info')).toBeNull()
    expect(q(container, 'hide-idle-info')).toBeNull()
  })

  it('explains the dwell in terms of info lines, not camera cuts or update cards', async () => {
    const container = await mountEditor()
    const btn = q(container, 'help-dwell-info')
    expect(btn, 'no dwell help for info').toBeTruthy()
    await fireEvent.click(btn)
    await tick()
    const pop = q(container, 'help-dwell-info-text')
    expect(pop, 'dwell help did not open').toBeTruthy()
    const text = pop.textContent.trim()
    expect(text.length).toBeGreaterThan(0)
    expect(text, 'the lower-third dwell copy talks about camera cuts').not.toBe(FIELD_HELP.dwellSeconds)
    expect(text, 'the race update dwell copy talks about update cards').not.toBe(FIELD_HELP.updatesDwellSeconds)
  })

  it('explains the info lines list behind its own ⓘ', async () => {
    const container = await mountEditor()
    const btn = q(container, 'help-info-lines')
    expect(btn, 'no help for the info lines').toBeTruthy()
    await fireEvent.click(btn)
    await tick()
    const pop = q(container, 'help-info-lines-text')
    expect(pop, 'info lines help did not open').toBeTruthy()
    expect(pop.textContent.trim().length).toBeGreaterThan(0)
  })

  it('saves a committed dwell, and refuses one outside 2-60 by keeping the stored value', async () => {
    const container = await mountEditor()
    const input = q(container, 'dwell-info')
    expect(input, 'no dwell control for info').toBeTruthy()
    await fireEvent.input(input, { target: { value: '12' } })
    await fireEvent.change(input)
    await tick()
    await fireEvent.input(input, { target: { value: '1' } })
    await fireEvent.change(input)
    await tick()
    expect(Number(input.value), 'a refused commit shows the stored value again').toBe(12)
    expect((await savedInfo(container)).dwellSeconds).toBe(12)
  })

  it('shows the event header and a line in the preview', async () => {
    const container = await mountEditor()
    const slot = q(container, 'widget-info')
    expect(slot, 'no info widget in the preview').toBeTruthy()
    const header = slot.querySelector('[data-testid="info-header"]')
    expect(header, 'the preview shows no info header').toBeTruthy()
    expect(header.textContent.trim().length).toBeGreaterThan(0)
    const line = slot.querySelector('[data-testid="info-line"]')
    expect(line, 'the preview shows no info line').toBeTruthy()
    expect(line.textContent.trim().length).toBeGreaterThan(0)
  })
})

describe('config editor: the info lines list (rules 52-53)', () => {
  it('starts empty, with a 120-character new-line input', async () => {
    const container = await mountEditor()
    expect(shownLines(container)).toEqual([])
    const input = q(container, 'info-line-new')
    expect(input, 'no new-line input for info lines').toBeTruthy()
    expect(input.maxLength).toBe(120)
  })

  it('appends a trimmed line on Add, clears the input, and saves it', async () => {
    const container = await mountEditor()
    await addLine(container, '  Follow us @battlecast  ')
    await addLine(container, 'Sponsored by Example')
    expect(shownLines(container)).toEqual(['Follow us @battlecast', 'Sponsored by Example'])
    expect(q(container, 'info-line-new').value, 'Add clears the input').toBe('')
    expect(q(container, 'info-line-0').maxLength).toBe(120)
    expect((await savedInfo(container)).lines).toEqual(['Follow us @battlecast', 'Sponsored by Example'])
  })

  it('writes nothing for a blank line or a duplicate, and keeps the input’s text', async () => {
    const container = await mountEditor()
    await addLine(container, 'Follow us @battlecast')
    await addLine(container, '   ')
    expect(shownLines(container)).toEqual(['Follow us @battlecast'])
    expect(q(container, 'info-line-new').value).toBe('   ')
    await addLine(container, ' Follow us @battlecast ')
    expect(shownLines(container), 'a duplicate is not appended').toEqual(['Follow us @battlecast'])
    expect(q(container, 'info-line-new').value).toBe(' Follow us @battlecast ')
    expect((await savedInfo(container)).lines).toEqual(['Follow us @battlecast'])
  })

  it('disables Add while 10 lines are stored, and enables it again after a remove', async () => {
    const container = await mountEditor()
    for (let i = 1; i <= 10; i++) await addLine(container, `Line ${i}`)
    expect(shownLines(container)).toHaveLength(10)
    expect(q(container, 'info-line-add').disabled, 'Add must be disabled at 10 lines').toBe(true)
    await fireEvent.click(q(container, 'info-line-remove-0'))
    await tick()
    expect(q(container, 'info-line-add').disabled).toBe(false)
  })

  it('commits an edited line, trimmed, in place', async () => {
    const container = await mountEditor()
    await addLine(container, 'A')
    await addLine(container, 'B')
    const input = q(container, 'info-line-0')
    await fireEvent.input(input, { target: { value: '  A, corrected ' } })
    await fireEvent.change(input) // commits when focus leaves the input
    await tick()
    expect(shownLines(container)).toEqual(['A, corrected', 'B'])
    expect((await savedInfo(container)).lines).toEqual(['A, corrected', 'B'])
  })

  it('refuses an edit to blank or to another stored line, showing the stored line again', async () => {
    const container = await mountEditor()
    await addLine(container, 'A')
    await addLine(container, 'B')
    const input = q(container, 'info-line-1')
    await fireEvent.input(input, { target: { value: '   ' } })
    await fireEvent.change(input)
    await tick()
    expect(q(container, 'info-line-1').value, 'a blank commit is refused').toBe('B')
    await fireEvent.input(q(container, 'info-line-1'), { target: { value: 'A' } })
    await fireEvent.change(q(container, 'info-line-1'))
    await tick()
    expect(q(container, 'info-line-1').value, 'a duplicate commit is refused').toBe('B')
    expect((await savedInfo(container)).lines).toEqual(['A', 'B'])
  })

  it('removes a line, moving the lines after it up one place', async () => {
    const container = await mountEditor()
    for (const text of ['A', 'B', 'C']) await addLine(container, text)
    await fireEvent.click(q(container, 'info-line-remove-1'))
    await tick()
    expect(shownLines(container)).toEqual(['A', 'C'])
    expect(q(container, 'info-line-remove-2')).toBeNull()
    expect((await savedInfo(container)).lines).toEqual(['A', 'C'])
  })

  it('applies nothing on keystrokes: before the commit the preview and Save keep the stored line; Enter commits', async () => {
    const container = await mountEditor()
    await addLine(container, 'A')
    expect(previewLine(container)).toBe('A')
    const input = q(container, 'info-line-0')
    await fireEvent.input(input, { target: { value: 'A, corrected' } })
    await tick()
    expect(previewLine(container), 'an uncommitted edit must not reach the preview').toBe('A')
    await fireEvent.keyDown(input, { key: 'Enter' })
    await tick()
    expect(shownLines(container)).toEqual(['A, corrected'])
    expect(previewLine(container), 'Enter commits, and the preview follows at once').toBe('A, corrected')
    expect((await savedInfo(container)).lines).toEqual(['A, corrected'])
  })

  it('does not save an uncommitted edit', async () => {
    const container = await mountEditor()
    await addLine(container, 'A')
    await fireEvent.input(q(container, 'info-line-0'), { target: { value: 'A, typed but not committed' } })
    await tick()
    expect((await savedInfo(container)).lines).toEqual(['A'])
  })
})

describe('config editor: the preview’s sample lines (rule 53)', () => {
  it('shows sample producer lines while the profile has no lines, and the broadcaster’s line at once when one is added', async () => {
    const container = await mountEditor()
    expect(eventInfo.info_lines, 'sample lines come from event-info.json').toContain(previewLine(container))

    await addLine(container, 'Follow us @battlecast')
    expect(previewLine(container), 'the sample lines leave the preview, so the new line shows at once').toBe(
      'Follow us @battlecast',
    )
    await fireEvent.click(q(container, 'info-line-remove-0'))
    await tick()
    expect(eventInfo.info_lines, 'removing the last line brings the samples back').toContain(previewLine(container))
  })
})
