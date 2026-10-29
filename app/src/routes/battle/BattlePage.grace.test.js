/* Battle box exit grace + caution hide (#204) on the standalone /battle route.
 *
 * Behavioral spec: .ai/spec/what/widgets.md rules 36-38, overlay-config.md rule 36,
 * ADR 0013. Drives the PAGE, not the bare widget, because the grace length comes from the
 * loaded profile and the page is where that is read. The SSE client is mocked so a test
 * pushes snapshots at the page, and timers are faked so the grace is exact.
 *
 * race-close-battle.json: Verstappen (car-1, P2) on camera, Hamilton ahead +0.4,
 * Leclerc behind +1.8, intensity 0.86.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushSync, tick } from 'svelte'
import { render, cleanup } from '@testing-library/svelte'
import BattlePage from './BattlePage.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
import fcy from '../../../../spec/v1/fixtures/race-session-fcy.json'

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

/** Same subject, battle over: both gaps null. */
const idleSame = () => {
  const s = clone(closeBattle)
  s.relationship = { gap_ahead: null, gap_behind: null, battle_intensity: 0 }
  return s
}
/** Same subject, battle back on with new numbers. */
const activeAgain = (ahead = 0.7) => {
  const s = clone(closeBattle)
  s.relationship = { gap_ahead: ahead, gap_behind: 2.4, battle_intensity: 0.5 }
  return s
}
/** Camera cut to Leclerc (car-16), who has nobody to fight. */
const idleOther = () => {
  const s = clone(closeBattle)
  s.subject = { slot_id: 'car-16', driver_name: 'Leclerc' }
  s.relationship = { gap_ahead: null, gap_behind: null, battle_intensity: 0 }
  return s
}
const withSession = (snap, session) => ({ ...clone(snap), session })

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

async function mountPage({ profile = null } = {}) {
  window.history.replaceState({}, '', profile ? '/battle?profile=p' : '/battle')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      profile
        ? { ok: true, status: 200, json: async () => profile }
        : { ok: false, status: 404, json: async () => ({}) },
    ),
  )
  render(BattlePage)
  for (let i = 0; i < 5; i++) await tick()
  flushSync()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

describe('battle box exit grace (rule 37)', () => {
  it('holds the last active battle for the default 5s after it goes idle, then shows clear air', async () => {
    await mountPage()
    push(closeBattle)
    expect(text()).toContain('+0.4')

    push(idleSame())
    // The producer keeps ticking idle snapshots; they must not restart the grace.
    advance(2000)
    push(idleSame())
    advance(2000)
    push(idleSame())
    advance(900) // t = 4.9s

    expect(text()).not.toContain('NO ACTIVE BATTLE')
    expect(text()).toContain('HAM')
    expect(text()).toContain('LEC')
    expect(text()).toContain('+0.4')
    expect(text()).toContain('+1.8')
    expect(text()).toContain('86')

    advance(200) // t = 5.1s, no further snapshot needed
    expect(text()).toContain('NO ACTIVE BATTLE')
    expect(text()).not.toContain('+0.4')
  })

  it('a battle that returns within the grace shows live numbers and earns a fresh full grace', async () => {
    await mountPage()
    push(closeBattle)
    push(idleSame())
    advance(3000)

    push(activeAgain(0.7))
    expect(text()).toContain('+0.7')
    expect(text()).not.toContain('+0.4')

    push(idleSame())
    advance(4900)
    // Still held, now on the NEW numbers — the earlier grace did not carry over.
    expect(text()).toContain('+0.7')
    expect(text()).not.toContain('NO ACTIVE BATTLE')

    advance(200)
    expect(text()).toContain('NO ACTIVE BATTLE')
  })

  it('reads the grace length from the loaded profile', async () => {
    await mountPage({ profile: { widgets: { battle: { idleGraceSeconds: 10 } } } })
    push(closeBattle)
    push(idleSame())
    advance(9900)
    expect(text()).toContain('+0.4')
    expect(text()).not.toContain('NO ACTIVE BATTLE')
    advance(200)
    expect(text()).toContain('NO ACTIVE BATTLE')
  })

  it('idleGraceSeconds 0 turns the hold off', async () => {
    await mountPage({ profile: { widgets: { battle: { idleGraceSeconds: 0 } } } })
    push(closeBattle)
    push(idleSame())
    expect(text()).toContain('NO ACTIVE BATTLE')
    expect(text()).not.toContain('+0.4')
  })
})

describe('the grace never outlives its subject (rule 38)', () => {
  it('a camera cut during the grace shows the new subject at once, never the old numbers', async () => {
    await mountPage()
    push(closeBattle)
    push(idleSame())
    advance(1000)

    push(idleOther())
    expect(text()).toContain('NO ACTIVE BATTLE')
    expect(text()).toContain('LEC')
    expect(text()).not.toContain('+0.4')
    expect(text()).not.toContain('+1.8')
  })

  it('a camera cut to an active battle during the grace shows that battle', async () => {
    await mountPage()
    push(closeBattle)
    push(idleSame())
    advance(1000)

    const other = clone(closeBattle)
    other.subject = { slot_id: 'car-16', driver_name: 'Leclerc' }
    other.relationship = { gap_ahead: 1.8, gap_behind: 0.9, battle_intensity: 0.4 }
    push(other)
    expect(text()).toContain('+0.9')
    expect(text()).not.toContain('+0.4')
  })

  it('leaving a racing mode during the grace renders nothing at once', async () => {
    await mountPage()
    push(closeBattle)
    push(idleSame())
    advance(1000)
    push({ ...idleSame(), mode: 'qualifying' })
    expect(box()).toBeNull()
  })
})

describe('caution hides the battle box (rule 36)', () => {
  it('renders nothing under full-course yellow + safety car, even with live gaps', async () => {
    await mountPage()
    // race-session-fcy: FCY and SC both true, gap_ahead 0.4 / gap_behind 1.8.
    push(fcy)
    expect(box()).toBeNull()
  })

  it('renders nothing under full-course yellow alone', async () => {
    await mountPage()
    push(withSession(closeBattle, { flag: 'yellow', full_course_yellow: true, safety_car: false }))
    expect(box()).toBeNull()
  })

  it('renders nothing under a safety car alone', async () => {
    await mountPage()
    push(withSession(closeBattle, { flag: 'green', full_course_yellow: false, safety_car: true }))
    expect(box()).toBeNull()
  })

  it('a local yellow flag alone does not hide it', async () => {
    await mountPage()
    push(withSession(closeBattle, { flag: 'yellow', full_course_yellow: false, safety_car: false }))
    expect(text()).toContain('+0.4')
  })

  it('caution during the grace ends it; when caution clears the current snapshot renders', async () => {
    await mountPage()
    push(closeBattle)
    push(idleSame())
    advance(1000)

    push(withSession(idleSame(), { full_course_yellow: true }))
    expect(box()).toBeNull()

    // Caution clears inside what would have been the old grace: no resurrected battle.
    advance(1000)
    push(withSession(idleSame(), { full_course_yellow: false }))
    expect(text()).toContain('NO ACTIVE BATTLE')
    expect(text()).not.toContain('+0.4')

    // And a live battle after caution shows at once.
    push(withSession(closeBattle, { full_course_yellow: false }))
    expect(text()).toContain('+0.4')
  })
})

describe('no timer outlives the page (#216)', () => {
  it('unmounting /battle mid-hold leaves no pending timer', async () => {
    await mountPage()
    push(closeBattle)
    push(idleSame())
    advance(1000)
    cleanup()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('the held name during an exit grace (rule 65)', () => {
  // GUARD: rule 65 already says the held snapshot's name shows; shipped code satisfies it.
  it('shows the held battle\'s name, not the live snapshot\'s, until the grace ends', async () => {
    const held = clone(closeBattle)
    held.subject.driver_name = 'Max Verstappen'
    const live = idleSame()
    live.subject.driver_name = 'Lando Norris'

    await mountPage()
    push(held)
    expect(box().querySelector('.bc-battle__focus-name')?.textContent.trim()).toBe('M.VER')

    push(live)
    advance(2000)
    push(live)

    expect(box().querySelector('.bc-battle__focus-name')?.textContent.trim()).toBe('M.VER')
    expect(text()).not.toContain('L.NOR') // the live name appears nowhere in the held box

    advance(3100) // grace over
    expect(box().querySelector('.bc-battle__idle-sub')?.textContent.trim()).toBe('CLEAR AIR — L.NOR')
  })
})
