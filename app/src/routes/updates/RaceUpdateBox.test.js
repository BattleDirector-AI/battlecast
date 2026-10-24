/* Race update box — baseline, show-once, dwell, queue, hide (#27).
 *
 * Behavioral spec: .ai/spec/what/widgets.md rules 69-73, ADR 0023. Drives the bare widget
 * (props `snapshot`, `dwellSeconds`, `preview`; how/renderer.md) with spec/v1 snapshots built
 * from race-events.json and asserts the rendered card under fake timers. Runs under the global
 * reduced-motion default (test-setup.js), so a card unmounts the moment it ends; the animated
 * path is RaceUpdateBox.motion.test.js.
 *
 * race-events.json lists five events, oldest first: ev-101 overall fastest lap (K. Estre
 * 3:28.977), ev-102 GT3 fastest lap (R. Lietz 3:47.640, "Lap 14"), ev-103 new leader
 * (M. Conway), ev-104 GT3 retirement DNF (B. Barker, "Gearbox"), ev-105 penalty (K. Bachler,
 * "Drive-through").
 *
 * The component is loaded through a non-static specifier so its absence fails each test with
 * a message naming it, rather than failing the whole file at import time.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { flushSync, tick } from 'svelte'
import fixture from '../../../../spec/v1/fixtures/race-events.json'

const MODULE = './RaceUpdateBox.svelte'
async function loadBox() {
  try {
    return (await import(/* @vite-ignore */ MODULE)).default
  } catch (err) {
    throw new Error(
      `could not load app/src/routes/updates/RaceUpdateBox.svelte: ${String(err?.message).split('\n')[0]}`,
      { cause: err },
    )
  }
}

const clone = (o) => structuredClone(o)
/** The fixture with no events listed. */
const quiet = () => ({ ...clone(fixture), race_events: [] })
/** The fixture listing exactly `events`. */
const listing = (events) => ({ ...clone(fixture), race_events: clone(events) })
/** A valid penalty event. */
const pen = (id, extra = {}) => ({ id, type: 'penalty', driver_name: 'Klaus Bachler', penalty: '+5s', ...extra })

let view
async function mount(props) {
  const Box = await loadBox()
  view = render(Box, { snapshot: null, dwellSeconds: 8, ...props })
  await tick()
  flushSync()
}
async function push(snapshot, extra = {}) {
  await view.rerender({ snapshot, ...extra })
  flushSync()
}
function advance(ms) {
  vi.advanceTimersByTime(ms)
  flushSync()
}

const card = () => view.container.querySelector('[data-testid="race-update"]')
const shownId = () => card()?.getAttribute('data-event-id') ?? null
const part = (testid) => card()?.querySelector(`[data-testid="${testid}"]`)?.textContent.trim() ?? null

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('race update box — cards in order, one at a time (rules 70, 72, 73)', () => {
  it('shows race-events.json oldest first, each for the 8 s default, then hides', async () => {
    await mount({ snapshot: quiet() }) // empty baseline
    expect(card()).toBeNull()

    await push(fixture)
    expect(shownId()).toBe('ev-101')
    expect(card().getAttribute('data-event-type')).toBe('fastest_lap')
    expect(part('update-label')).toBe('FASTEST LAP')
    expect(part('update-name')).toBe('K. Estre')
    expect(part('update-value')).toBe('3:28.977')
    expect(part('update-detail')).toBeNull()

    // The producer keeps re-sending the same list; that neither restarts nor repeats a card.
    advance(4000)
    await push(fixture)
    advance(3999)
    expect(shownId()).toBe('ev-101')
    advance(1)
    expect(shownId()).toBe('ev-102')
    expect(part('update-label')).toBe('GT3 FASTEST LAP')
    expect(part('update-name')).toBe('R. Lietz')
    expect(part('update-value')).toBe('3:47.640')
    expect(part('update-detail')).toBe('Lap 14')

    await push(fixture)
    advance(8000)
    expect(shownId()).toBe('ev-103')
    expect(part('update-label')).toBe('NEW LEADER')
    expect(part('update-name')).toBe('M. Conway')
    expect(part('update-value'), 'a leader change has no value element').toBeNull()
    expect(part('update-detail')).toBe('Passes K. Estre into the first chicane')

    advance(8000)
    expect(shownId()).toBe('ev-104')
    expect(part('update-label')).toBe('GT3 RETIRED')
    expect(part('update-name')).toBe('B. Barker')
    expect(part('update-value'), 'a retirement has no value element').toBeNull()
    expect(part('update-detail')).toBe('Gearbox')

    advance(8000)
    expect(shownId()).toBe('ev-105')
    expect(part('update-label')).toBe('PENALTY')
    expect(part('update-name')).toBe('K. Bachler')
    expect(part('update-value')).toBe('Drive-through')
    expect(part('update-detail')).toBe('Speeding in the pit lane')

    advance(7999)
    expect(shownId()).toBe('ev-105')
    advance(1)
    expect(card(), 'the queue is empty, so the box hides').toBeNull()
    expect(view.container.textContent.trim()).toBe('')

    // Still listed, but every id has been seen: nothing comes back.
    await push(fixture)
    advance(30000)
    expect(card()).toBeNull()
  })

  it('reads DISQUALIFIED for a retirement with finish_status 3, in any mode', async () => {
    await mount({ snapshot: quiet() })
    await push({
      ...listing([{ id: 'dq', type: 'retirement', driver_name: 'Ben Barker', finish_status: 3 }]),
      mode: 'qualifying',
    })
    expect(shownId()).toBe('dq')
    expect(part('update-label')).toBe('DISQUALIFIED')
    expect(part('update-name')).toBe('B. Barker')
    expect(part('update-value')).toBeNull()
  })
})

describe('race update box — the baseline (rule 71)', () => {
  it('never shows events already listed in the first snapshot (an OBS reload)', async () => {
    await mount({ snapshot: fixture })
    expect(card()).toBeNull()
    advance(10000)
    await push(fixture)
    advance(30000)
    expect(card(), 'events present at start must never replay').toBeNull()

    // A genuinely new event still shows, and alone: the baselined ones were never queued.
    await push(listing([...fixture.race_events, pen('ev-106')]))
    expect(shownId()).toBe('ev-106')
    advance(8000)
    expect(card()).toBeNull()
  })

  it('takes the first non-null snapshot as the baseline, not a null before it', async () => {
    await mount({ snapshot: null })
    await push(fixture)
    expect(card()).toBeNull()
    advance(30000)
    expect(card()).toBeNull()
  })

  it('a first snapshot with no race_events is an empty baseline: later events are new', async () => {
    const without = clone(fixture)
    delete without.race_events
    await mount({ snapshot: without })
    await push(fixture)
    expect(shownId()).toBe('ev-101')
  })

  it('takes no baseline in the /config preview: the first snapshot shows its events', async () => {
    await mount({ snapshot: fixture, preview: true })
    expect(shownId()).toBe('ev-101')
    expect(part('update-label')).toBe('FASTEST LAP')
  })
})

describe('race update box — each id once (rule 72)', () => {
  it('never shows an id twice: re-sent, dropped and re-listed, or repeated in one snapshot', async () => {
    await mount({ snapshot: quiet() })
    await push(listing([pen('a')]))
    expect(shownId()).toBe('a')
    advance(8000)
    expect(card()).toBeNull()

    await push(listing([pen('a')]))
    expect(card(), 're-sent id').toBeNull()
    await push(quiet())
    await push(listing([pen('a')]))
    expect(card(), 'id dropped from the list and re-listed').toBeNull()

    await push(listing([pen('b'), pen('b', { penalty: '+10s' })]))
    expect(shownId()).toBe('b')
    expect(part('update-value'), 'the first entry with the id is the event').toBe('+5s')
    advance(8000)
    expect(card(), 'the repeated id was not queued').toBeNull()
  })
})

describe('race update box — dwell and the waiting queue (rule 73)', () => {
  it('a card holds its full dwell even when its event leaves the list; a waiting event gets a full dwell of its own', async () => {
    await mount({ snapshot: quiet() })
    await push(listing([pen('a')]))
    advance(3000)
    await push(listing([pen('a'), pen('b', { penalty: '+10s' })]))
    expect(shownId(), 'b waits behind a').toBe('a')
    await push(quiet()) // both events leave the producer's list
    advance(4999) // t = 7.999 s
    expect(shownId()).toBe('a')
    advance(1) // t = 8 s
    expect(shownId()).toBe('b')
    expect(part('update-value')).toBe('+10s')
    advance(7999)
    expect(shownId()).toBe('b')
    advance(1)
    expect(card()).toBeNull()
  })

  it('keeps at most 5 waiting: a burst of 7 drops the oldest waiting event, never to return', async () => {
    await mount({ snapshot: quiet() })
    const burst = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'].map((id) => pen(id))
    await push(listing(burst))
    const seen = [shownId()]
    for (let i = 0; i < 7; i++) {
      advance(8000)
      await push(listing(burst))
      seen.push(shownId())
    }
    expect(seen).toEqual(['e1', 'e3', 'e4', 'e5', 'e6', 'e7', null, null])
  })

  it('a burst arriving while a card is up also caps the queue at 5', async () => {
    await mount({ snapshot: quiet() })
    await push(listing([pen('a')]))
    const later = ['b', 'c', 'd', 'e', 'f', 'g'].map((id) => pen(id))
    await push(listing([pen('a'), ...later]))
    const seen = [shownId()]
    for (let i = 0; i < 6; i++) {
      advance(8000)
      seen.push(shownId())
    }
    expect(seen).toEqual(['a', 'c', 'd', 'e', 'f', 'g', null])
  })

  it('uses the dwellSeconds it is given', async () => {
    await mount({ snapshot: quiet(), dwellSeconds: 3 })
    await push(listing([pen('a')]))
    advance(2999)
    expect(shownId()).toBe('a')
    advance(1)
    expect(card()).toBeNull()
  })

  it('a dwell change applies from the next card; the card that is up keeps its own', async () => {
    await mount({ snapshot: quiet(), dwellSeconds: 3 })
    await push(listing([pen('a'), pen('b')]))
    advance(1000)
    await push(listing([pen('a'), pen('b')]), { dwellSeconds: 10 })
    advance(1999)
    expect(shownId()).toBe('a')
    advance(1) // t = 3 s: a ends on its original dwell
    expect(shownId()).toBe('b')
    advance(9999)
    expect(shownId(), 'b runs the new 10 s dwell').toBe('b')
    advance(1)
    expect(card()).toBeNull()
  })
})

describe('race update box — entries that are not events (rule 69)', () => {
  it('skips unreadable entries without stopping the rest, and queues none of them', async () => {
    await mount({ snapshot: quiet() })
    await push(
      listing([
        null,
        42,
        'ev-x',
        ['ev-y'],
        { type: 'penalty', driver_name: 'Klaus Bachler', penalty: '+5s' },
        pen('   '),
        { id: 'u', type: 'overtake', driver_name: 'Kevin Estre' },
        { id: 'f', type: 'fastest_lap', driver_name: 'Kevin Estre' },
        { id: 'r', type: 'retirement', driver_name: 'Ben Barker', finish_status: 1 },
        pen('n', { driver_name: '  ' }),
        pen('good'),
      ]),
    )
    expect(shownId(), 'the only valid entry shows at once').toBe('good')
    advance(8000)
    expect(card(), 'nothing skipped was queued').toBeNull()

    // A skipped entry marked nothing seen: the same id sent later as a valid event is new.
    await push(listing([{ id: 'f', type: 'fastest_lap', driver_name: 'Kevin Estre', lap_time: 208.977 }]))
    expect(shownId()).toBe('f')
    expect(part('update-value')).toBe('3:28.977')
  })

  it.each([
    ['an object', { id: 'ev-1' }],
    ['a string', 'ev-1'],
    ['null', null],
  ])('a race_events that is %s holds no events and breaks nothing', async (_label, value) => {
    await mount({ snapshot: quiet() })
    await push({ ...clone(fixture), race_events: value })
    expect(card()).toBeNull()
    await push(listing([pen('after')]))
    expect(shownId()).toBe('after')
  })
})
