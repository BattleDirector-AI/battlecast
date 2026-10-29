/* The race update box inside `/all` (#27).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rules 70, 71, 75; overlay-config.md rule 50;
 * ADR 0023. Drives AllView with race-events.json and a normalized profile, under fake timers.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { flushSync, tick } from 'svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import fixture from '../../../../spec/v1/fixtures/race-events.json'

const withNew = (event) => ({
  ...structuredClone(fixture),
  race_events: [...structuredClone(fixture.race_events), event],
})
const classLap = { id: 'ev-106', type: 'fastest_lap', driver_name: 'Klaus Bachler', vehicle_class: 'GT3', lap_time: 227.12 }

let view
async function mount(props) {
  view = render(AllView, props)
  await tick()
  flushSync()
}
async function push(snapshot) {
  await view.rerender({ snapshot })
  flushSync()
}
const slot = () => view.container.querySelector('[data-testid="widget-updates"]')
const card = () => slot()?.querySelector('[data-testid="race-update"]') ?? null
const part = (testid) => card()?.querySelector(`[data-testid="${testid}"]`)?.textContent.trim() ?? null

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('/all — the updates widget (widgets rule 75, overlay-config rule 50)', () => {
  it('is placed by default at its default geometry, baselines the first snapshot, and shows a new event', async () => {
    await mount({ snapshot: fixture })
    expect(slot(), 'no updates slot in the default /all layout').not.toBeNull()
    expect(slot().style.left).toBe('1376px')
    expect(slot().style.top).toBe('24px')
    expect(slot().style.width).toBe('520px')
    expect(slot().style.height).toBe('120px')
    expect(slot().style.zIndex).toBe('8')
    expect(card(), 'events listed in the first snapshot must not show').toBeNull()

    await push(withNew(classLap))
    expect(card().getAttribute('data-event-id')).toBe('ev-106')
    expect(part('update-label')).toBe('GT3 FASTEST LAP')
    expect(part('update-name')).toBe('K.BAC')
    expect(part('update-value')).toBe('3:47.120')

    vi.advanceTimersByTime(8000)
    flushSync()
    expect(card()).toBeNull()
    expect(slot(), 'the slot stays placed while no card is up').not.toBeNull()
  })

  it("reads the updates widget's own dwellSeconds", async () => {
    await mount({ snapshot: fixture, config: normalizeConfig({ widgets: { updates: { dwellSeconds: 3 } } }) })
    await push(withNew(classLap))
    vi.advanceTimersByTime(2999)
    flushSync()
    expect(card()).not.toBeNull()
    vi.advanceTimersByTime(1)
    flushSync()
    expect(card()).toBeNull()
  })

  it('is not mounted while not visible', async () => {
    await mount({ snapshot: fixture, config: normalizeConfig({ widgets: { updates: { visible: false } } }) })
    await push(withNew(classLap))
    expect(slot()).toBeNull()
    expect(view.container.querySelector('[data-testid="race-update"]')).toBeNull()
  })

  it('keeps its slot with hideWhenIdle set: the box has no idle predicate', async () => {
    await mount({ snapshot: fixture, config: normalizeConfig({ widgets: { updates: { hideWhenIdle: true } } }) })
    expect(slot()).not.toBeNull()
    await push(withNew(classLap))
    expect(card()).not.toBeNull()
  })

  it('keeps the class in the label when class tags are hidden', async () => {
    await mount({ snapshot: fixture, config: normalizeConfig({ theme: { classTags: 'hide' } }) })
    await push(withNew(classLap))
    expect(part('update-label')).toBe('GT3 FASTEST LAP')
  })

  it('shows the first snapshot’s events in the /config preview (no baseline)', async () => {
    await mount({ snapshot: fixture, preview: true })
    expect(card(), 'the preview must show a sample card').not.toBeNull()
    expect(card().getAttribute('data-event-id')).toBe('ev-101')
    expect(part('update-label')).toBe('FASTEST LAP')
  })
})
