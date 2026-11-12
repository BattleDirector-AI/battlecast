/* The battle box during a replay on the standalone /battle route (#447): widgets.md rules 38 and
 * 122, overlay-config.md rule 72. ADR 0040.
 *
 * Drives the PAGE, not the bare widget, because the setting comes from the loaded profile and the
 * page is where that is read. The SSE client is mocked so a test pushes snapshots at the page,
 * and timers are faked so the exit grace is exact.
 *
 * race-close-battle.json: Verstappen (car-1) on camera, Hamilton ahead +0.4, Leclerc behind
 * +1.8, `mode: "race"`. A replay is the same snapshot with only `mode` changed.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import BattlePage from './BattlePage.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

const sse = vi.hoisted(() => ({ emit: null }))
vi.mock('../../lib/sseClient.js', () => ({
  DEFAULT_SRC: 'http://localhost:8080/events',
  resolveSrc: () => 'http://producer.test/events',
  connect: (_url, onState) => {
    sse.emit = onState
    return () => {}
  },
}))

const clone = (o) => JSON.parse(JSON.stringify(o))
const withMode = (mode) => ({ ...clone(closeBattle), mode })
const idleSame = (mode) => ({
  ...clone(closeBattle),
  mode,
  relationship: { gap_ahead: null, gap_behind: null, battle_intensity: 0 },
})

const box = () => document.querySelector('[aria-label="Battle for position"]')
const text = () => box()?.textContent ?? ''

function push(snapshot) {
  sse.emit(snapshot)
  flushSync()
}
function advance(ms) {
  vi.advanceTimersByTime(ms)
  flushSync()
}

/** `profile` may be a function, read on every fetch, so a test can change it between polls. */
async function mountPage({ profile = null } = {}) {
  const current = () => (typeof profile === 'function' ? profile() : profile)
  window.history.replaceState({}, '', profile ? '/battle?profile=p' : '/battle')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      current()
        ? { ok: true, status: 200, json: async () => current() }
        : { ok: false, status: 404, json: async () => ({}) },
    ),
  )
  render(BattlePage)
  for (let i = 0; i < 5; i++) await tick()
  flushSync()
}

const hideProfile = { widgets: { battle: { hideDuringReplay: true } } }

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

describe('/battle — hideDuringReplay off (the default) keeps the box during a replay (rule 122.1)', () => {
  it('with no profile, a replay still shows the live battle', async () => {
    await mountPage()
    push(withMode('replay'))
    expect(box(), 'the default hid the battle box during a replay').not.toBeNull()
    expect(text()).toContain('+0.4')
  })

  it('the exit grace still runs during a replay', async () => {
    await mountPage()
    push(withMode('replay'))
    expect(text()).toContain('+0.4')
    push(idleSame('replay'))
    advance(1000)
    expect(text(), 'the default ended the hold during a replay').toContain('+0.4')
    expect(text()).not.toContain('NO ACTIVE BATTLE')
  })
})

describe('/battle — hideDuringReplay on, read from the loaded profile (rule 122)', () => {
  it('renders no battle box during a replay, and the live battle at once after it', async () => {
    await mountPage({ profile: hideProfile })
    push(withMode('race'))
    expect(text()).toContain('+0.4')

    push(withMode(' Replay '))
    expect(box(), 'the battle box rendered during a replay').toBeNull()

    push(withMode('race'))
    expect(text()).toContain('+0.4')
    expect(text()).toContain('+1.8')
  })

  it('a replay ends a running exit grace at once, and the end of the replay starts with no hold', async () => {
    await mountPage({ profile: hideProfile })
    push(withMode('race'))
    push(idleSame('race'))
    advance(1000)
    expect(text(), 'precondition: the grace holds the ended battle').toContain('+0.4')

    push(idleSame('replay'))
    expect(box(), 'the held battle stayed up when the replay started').toBeNull()

    advance(1000)
    push(idleSame('race'))
    expect(text()).toContain('NO ACTIVE BATTLE')
    expect(text()).not.toContain('+0.4')
  })

  it('a change of the setting during a replay applies at the next profile poll', async () => {
    let stored = { widgets: { battle: { hideDuringReplay: false } } }
    await mountPage({ profile: () => stored })
    push(withMode('replay'))
    expect(text(), 'precondition: the setting is off, so the box shows').toContain('+0.4')

    stored = hideProfile
    vi.advanceTimersByTime(5000) // the profile poll (overlay-config.md rule 22)
    for (let i = 0; i < 5; i++) await tick()
    flushSync()
    expect(box(), 'turning the setting on during a replay did not hide the box').toBeNull()

    stored = { widgets: { battle: { hideDuringReplay: false } } }
    vi.advanceTimersByTime(5000)
    for (let i = 0; i < 5; i++) await tick()
    flushSync()
    expect(text(), 'turning the setting off during a replay did not bring the box back').toContain('+0.4')
  })
})
