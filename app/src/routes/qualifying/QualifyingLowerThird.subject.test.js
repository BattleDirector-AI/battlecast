// The qualifying/sector lower-third's (#22) subject resolution on malformed producer data —
// widgets.md rules 14a (non-object `vehicles[]` entries are skipped) and 14b (which name the
// bar shows; a blank name counts as missing). Driven from qualifying-sector-a.json (subject
// car-16 Leclerc, P1: best 88.912, last 89.204), varied inside each test.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import QualifyingLowerThird, { isQualifyingIdle } from './QualifyingLowerThird.svelte'
import qualSectorA from '../../../../spec/v1/fixtures/qualifying-sector-a.json'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const card = (c) => c.querySelector('[data-testid="qualifying-lower-third"]')
const txt = (c, id) => c.querySelector(`[data-testid="${id}"]`)?.textContent.trim()

async function renderBar(snapshot) {
  const r = render(QualifyingLowerThird, { snapshot, widget: {} })
  await tick()
  return r.container
}

describe('rule 14a — non-object vehicles[] entries are skipped', () => {
  it('renders the subject\'s timing when vehicles[] holds null entries', async () => {
    const snap = { ...qualSectorA, vehicles: [null, ...qualSectorA.vehicles, null] }
    const container = await renderBar(snap)

    expect(card(container)).not.toBeNull()
    expect(txt(container, 'qt-name')).toBe('Leclerc')
    expect(txt(container, 'qt-best')).toBe('1:28.912')
    expect(txt(container, 'qt-last')).toBe('1:29.204')
    expect(isQualifyingIdle(snap)).toBe(false)
  })
})

describe('rule 14b — the name the bar shows', () => {
  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
  ])('a subject.driver_name that is %s falls back to the vehicle\'s driver_name', async (_label, blank) => {
    const snap = structuredClone(qualSectorA)
    snap.subject.driver_name = blank
    snap.vehicles[0].driver_name = 'Charles Leclerc'
    const container = await renderBar(snap)

    expect(txt(container, 'qt-name')).toBe('C. Leclerc')
    expect(txt(container, 'qt-best')).toBe('1:28.912')
  })

  it('with both names blank the bar still renders its timing, with no name', async () => {
    const snap = structuredClone(qualSectorA)
    snap.subject.driver_name = ' '
    snap.vehicles[0].driver_name = ''
    const container = await renderBar(snap)

    expect(card(container)).not.toBeNull()
    expect(txt(container, 'qt-best')).toBe('1:28.912')
    expect(txt(container, 'qt-name') ?? '').toBe('')
  })
})
