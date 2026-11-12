/* The battle box during a replay, inside `/all` (#447): widgets.md rules 38, 39 and 122,
 * overlay-config.md rule 72. ADR 0040.
 *
 * Drives AllView through its public `snapshot` / `config` props, with timers faked so the exit
 * grace is exact. race-close-battle.json: Verstappen (car-1) on camera, Hamilton ahead +0.4,
 * Leclerc behind +1.8, `mode: "race"`, no caution. A replay is the same snapshot with only `mode`
 * changed, so the only thing that can hide the box is the replay itself.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import AllView from './AllView.svelte'
import { normalizeConfig } from '../../lib/overlayConfig.js'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

const clone = (o) => JSON.parse(JSON.stringify(o))
const withMode = (snap, mode) => ({ ...clone(snap), mode })
const idleSame = (mode = 'race') => ({
  ...clone(closeBattle),
  mode,
  relationship: { gap_ahead: null, gap_behind: null, battle_intensity: 0 },
})
const cfg = (battle = {}) => normalizeConfig({ widgets: { battle: { visible: true, ...battle } } })

let view
async function mount(props) {
  view = render(AllView, props)
  await tick()
  flushSync()
}
async function push(props) {
  await view.rerender(props)
  flushSync()
}
function advance(ms) {
  vi.advanceTimersByTime(ms)
  flushSync()
}

const slot = (key) => view.container.querySelector(`[data-testid="widget-${key}"]`)
/** The battle box element, or null when the box renders nothing. */
const box = () => slot('battle')?.querySelector('[aria-label="Battle for position"]') ?? null
const boxText = () => box()?.textContent ?? ''

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('/all — hideDuringReplay off (the default) keeps the battle box during a replay (rule 122.1)', () => {
  it('a replay with the default profile still shows the live battle', async () => {
    await mount({ snapshot: withMode(closeBattle, 'replay'), config: cfg() })
    expect(box(), 'the default hid the battle box during a replay').not.toBeNull()
    expect(boxText()).toContain('+0.4')
    expect(boxText()).toContain('+1.8')
  })

  it('with hideWhenIdle on, the default still keeps the slot and the battle during a replay', async () => {
    await mount({ snapshot: withMode(closeBattle, 'replay'), config: cfg({ hideWhenIdle: true }) })
    expect(slot('battle'), 'the battle slot dropped out during a replay').not.toBeNull()
    expect(boxText()).toContain('+0.4')
  })

  it('the exit grace still runs during a replay', async () => {
    const config = cfg()
    await mount({ snapshot: withMode(closeBattle, 'replay'), config })
    expect(boxText()).toContain('+0.4')
    await push({ snapshot: idleSame('replay'), config })
    advance(1000)
    expect(boxText(), 'the default ended the hold during a replay').toContain('+0.4')
    expect(boxText()).not.toContain('NO ACTIVE BATTLE')
  })
})

describe('/all — hideDuringReplay on (rule 122.2-122.5)', () => {
  it('renders no battle box during a replay, and the replay badge still shows', async () => {
    await mount({ snapshot: withMode(closeBattle, 'replay'), config: cfg({ hideDuringReplay: true }) })
    expect(box(), 'the battle box rendered during a replay').toBeNull()
    expect(slot('battle')?.textContent.trim() ?? '').toBe('')
    expect(slot('replay')?.querySelector('[data-testid="replay-label"]')?.textContent.trim()).toBe('REPLAY')
  })

  it.each([
    ['Replay', 'Replay'],
    ['  REPLAY  ', '  REPLAY  '],
  ])('reads mode as the badge does: %j hides the box', async (_label, mode) => {
    await mount({ snapshot: withMode(closeBattle, mode), config: cfg({ hideDuringReplay: true }) })
    expect(box(), `mode ${JSON.stringify(mode)} did not hide the box`).toBeNull()
  })

  it('leaves the box up for a mode that is not a replay', async () => {
    await mount({ snapshot: withMode(closeBattle, 'replays'), config: cfg({ hideDuringReplay: true }) })
    expect(boxText()).toContain('+0.4')
    await push({ snapshot: withMode(closeBattle, 'race'), config: cfg({ hideDuringReplay: true }) })
    expect(boxText()).toContain('+0.4')
  })

  it('leaves at once when a replay starts, and shows the live battle at once when it ends', async () => {
    const config = cfg({ hideDuringReplay: true })
    await mount({ snapshot: closeBattle, config })
    expect(boxText()).toContain('+0.4')

    await push({ snapshot: withMode(closeBattle, 'replay'), config })
    expect(box(), 'the box stayed when the replay started').toBeNull()

    const live = withMode(closeBattle, 'race')
    live.relationship = { gap_ahead: 0.9, gap_behind: 2.2, battle_intensity: 0.5 }
    await push({ snapshot: live, config })
    expect(boxText()).toContain('+0.9')
    expect(boxText()).toContain('+2.2')
  })

  it('a replay ends a running exit grace at once, and the end of the replay starts with no hold', async () => {
    const config = cfg({ hideDuringReplay: true })
    await mount({ snapshot: closeBattle, config })
    await push({ snapshot: idleSame('race'), config })
    advance(1000)
    expect(boxText(), 'precondition: the grace holds the ended battle').toContain('+0.4')

    await push({ snapshot: idleSame('replay'), config })
    expect(box(), 'the held battle stayed up when the replay started').toBeNull()

    // Back to live within what would have been the grace: the box shows clear air at once,
    // not the battle that was held before the replay.
    advance(1000)
    await push({ snapshot: idleSame('race'), config })
    expect(boxText()).toContain('NO ACTIVE BATTLE')
    expect(boxText()).not.toContain('+0.4')
  })

  it('with hideWhenIdle on, the battle slot drops out during a replay and returns after', async () => {
    const config = cfg({ hideDuringReplay: true, hideWhenIdle: true })
    await mount({ snapshot: closeBattle, config })
    expect(slot('battle')).not.toBeNull()

    await push({ snapshot: withMode(closeBattle, 'replay'), config })
    expect(slot('battle'), 'the battle slot stayed mounted during a replay').toBeNull()

    await push({ snapshot: withMode(closeBattle, 'race'), config })
    expect(slot('battle'), 'the battle slot did not return after the replay').not.toBeNull()
    expect(boxText()).toContain('+0.4')
  })

  it('a change of the setting during a replay applies at once', async () => {
    const replay = withMode(closeBattle, 'replay')
    await mount({ snapshot: replay, config: cfg() })
    expect(boxText()).toContain('+0.4')

    await push({ snapshot: replay, config: cfg({ hideDuringReplay: true }) })
    expect(box(), 'turning the setting on during a replay did not hide the box').toBeNull()

    await push({ snapshot: replay, config: cfg({ hideDuringReplay: false }) })
    expect(boxText(), 'turning the setting off during a replay did not bring the box back').toContain('+0.4')
  })

  it('turning the setting on during a replay ends a running hold, so turning it off again shows clear air', async () => {
    await mount({ snapshot: withMode(closeBattle, 'replay'), config: cfg() })
    await push({ snapshot: idleSame('replay'), config: cfg() })
    expect(boxText(), 'precondition: the grace holds the ended battle in a replay').toContain('+0.4')

    await push({ snapshot: idleSame('replay'), config: cfg({ hideDuringReplay: true }) })
    await push({ snapshot: idleSame('replay'), config: cfg({ hideDuringReplay: false }) })
    expect(boxText()).toContain('NO ACTIVE BATTLE')
    expect(boxText(), 'the hold survived turning the setting on').not.toContain('+0.4')
  })
})
