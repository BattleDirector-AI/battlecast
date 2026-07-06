import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import SessionStatus, {
  resolveFlag,
  selectProgressMode,
  formatClock,
  formatLaps,
} from './SessionStatus.svelte'
// Component source, for the CSS-contract assertion on the cautionary border
// (happy-dom runs no CSS, so the ::after overlay can only be checked in source —
// mirrors BattleBox.test.js's technique for the same class of assertion).
import source from './SessionStatus.svelte?raw'

import fullSession from '../../../../spec/v1/fixtures/race-session-fcy.json'
import partialSession from '../../../../spec/v1/fixtures/race-session-partial.json'

afterEach(() => cleanup())

function statusRoot(container) {
  return container.querySelector('[data-testid="session-status"]')
}

describe('SessionStatus — present/full fixture (race-session-fcy.json)', () => {
  it('renders the local flag, FCY, SC, and a timed clock readout (basis: "time")', () => {
    const { container } = render(SessionStatus, {
      props: { session: fullSession.session, mode: fullSession.mode },
    })
    const root = statusRoot(container)
    expect(root).not.toBeNull()

    const flagEl = container.querySelector('[data-testid="session-flag"]')
    expect(flagEl.getAttribute('data-flag')).toBe('yellow')
    expect(flagEl.textContent).toContain('YELLOW FLAG')

    // FCY and a local yellow flag are DISTINCT — both are set on this fixture, so
    // both must render simultaneously.
    expect(container.querySelector('[data-testid="session-fcy"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="session-sc"]')).not.toBeNull()
    expect(container.textContent).toContain('FULL COURSE YELLOW')
    expect(container.textContent).toContain('SAFETY CAR')

    // basis:"time" + time_remaining 1284.5 / session_length 3600 -> "21:24 / 1:00:00".
    const progress = container.querySelector('[data-testid="session-progress"]')
    expect(progress).not.toBeNull()
    expect(progress.getAttribute('data-progress-mode')).toBe('time')
    expect(progress.textContent.trim()).toBe('21:24 / 1:00:00')
  })
})

describe('SessionStatus — partial fixture (race-session-partial.json)', () => {
  it('renders the flag and a lap counter, with no FCY/SC badges', () => {
    const { container } = render(SessionStatus, {
      props: { session: partialSession.session, mode: partialSession.mode },
    })

    const flagEl = container.querySelector('[data-testid="session-flag"]')
    expect(flagEl.getAttribute('data-flag')).toBe('green')
    expect(flagEl.textContent).toContain('GREEN FLAG')

    expect(container.querySelector('[data-testid="session-fcy"]')).toBeNull()
    expect(container.querySelector('[data-testid="session-sc"]')).toBeNull()

    // Producer-owned current_lap 47 / total_laps 58 -> "LAP 47 OF 58", rendered
    // verbatim (the widget derives no lap number).
    const progress = container.querySelector('[data-testid="session-progress"]')
    expect(progress).not.toBeNull()
    expect(progress.getAttribute('data-progress-mode')).toBe('laps')
    expect(progress.textContent.trim()).toBe('LAP 47 OF 58')
  })
})

describe('SessionStatus — timed vs lap auto-selection matrix (#25 / #90 contract)', () => {
  it('shows a plain clock when only time_remaining is present', () => {
    const { container } = render(SessionStatus, { props: { session: { time_remaining: 95 } } })
    const progress = container.querySelector('[data-testid="session-progress"]')
    expect(progress.getAttribute('data-progress-mode')).toBe('time')
    expect(progress.textContent.trim()).toBe('1:35')
  })

  it('renders the producer-owned current_lap verbatim as "LAP X OF Y"', () => {
    const { container } = render(SessionStatus, {
      props: { session: { current_lap: 8, total_laps: 10 } },
    })
    const progress = container.querySelector('[data-testid="session-progress"]')
    expect(progress.getAttribute('data-progress-mode')).toBe('laps')
    expect(progress.textContent.trim()).toBe('LAP 8 OF 10')
  })

  it('falls back to raw laps_remaining (no invented lap number) when current_lap is absent', () => {
    const { container } = render(SessionStatus, {
      props: { session: { laps_remaining: 3, total_laps: 10 } },
    })
    const progress = container.querySelector('[data-testid="session-progress"]')
    expect(progress.getAttribute('data-progress-mode')).toBe('laps')
    expect(progress.textContent.trim()).toBe('3 LAPS REMAINING')
  })

  it('the endurance flip: time_remaining set + basis:"laps" shows the lap counter, not the clock', () => {
    const { container } = render(SessionStatus, {
      props: {
        session: {
          time_remaining: 42,
          laps_remaining: 1,
          total_laps: 60,
          current_lap: 60,
          basis: 'laps',
        },
      },
    })
    const progress = container.querySelector('[data-testid="session-progress"]')
    expect(progress.getAttribute('data-progress-mode')).toBe('laps')
    expect(progress.textContent.trim()).toBe('LAP 60 OF 60')
    expect(container.textContent).not.toContain('0:42')
  })

  it('an explicit basis:"time" wins even when only lap fields are populated', () => {
    const { container } = render(SessionStatus, {
      props: { session: { laps_remaining: 5, total_laps: 20, basis: 'time' } },
    })
    const progress = container.querySelector('[data-testid="session-progress"]')
    expect(progress.getAttribute('data-progress-mode')).toBe('time')
    // No time_remaining to format -> best-effort placeholder, not the lap text.
    expect(progress.textContent.trim()).toBe('—')
    expect(container.textContent).not.toContain('LAP')
  })

  it('hides the progress readout entirely when neither time nor lap fields are present', () => {
    // Flag/FCY/SC can still render per the contract; only the readout hides.
    const { container } = render(SessionStatus, {
      props: { session: { flag: 'green', full_course_yellow: true } },
    })
    expect(container.querySelector('[data-testid="session-progress"]')).toBeNull()
    expect(container.querySelector('[data-testid="session-flag"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="session-fcy"]')).not.toBeNull()
  })
})

describe('selectProgressMode — pure helper', () => {
  it('honors an explicit basis over the data, in both directions', () => {
    expect(selectProgressMode({ basis: 'time', laps_remaining: 5 })).toBe('time')
    expect(selectProgressMode({ basis: 'laps', time_remaining: 5 })).toBe('laps')
    // Case-insensitive.
    expect(selectProgressMode({ basis: 'LAPS', time_remaining: 5 })).toBe('laps')
  })

  it('falls back to time_remaining, then laps fields, then none', () => {
    expect(selectProgressMode({ time_remaining: 10 })).toBe('time')
    expect(selectProgressMode({ laps_remaining: 2 })).toBe('laps')
    expect(selectProgressMode({ total_laps: 40 })).toBe('laps')
    expect(selectProgressMode({ current_lap: 5 })).toBe('laps')
    expect(selectProgressMode({})).toBe('none')
  })

  it('tolerates a missing/null/malformed session without throwing', () => {
    expect(selectProgressMode(null)).toBe('none')
    expect(selectProgressMode(undefined)).toBe('none')
    expect(selectProgressMode({ time_remaining: 'not-a-number' })).toBe('none')
  })

  it('treats 0 as a real value, not falsy-absent (lap 0 / 0s remaining)', () => {
    // Guards the headline invariant: a truthy check would regress these.
    expect(selectProgressMode({ current_lap: 0 })).toBe('laps')
    expect(selectProgressMode({ laps_remaining: 0 })).toBe('laps')
    expect(selectProgressMode({ time_remaining: 0 })).toBe('time')
  })
})

describe('flag / FCY / Safety-Car indicators', () => {
  it('resolves the common flag values to a label + color', () => {
    expect(resolveFlag('green')).toMatchObject({ key: 'green', label: 'GREEN FLAG' })
    expect(resolveFlag('yellow')).toMatchObject({ key: 'yellow', label: 'YELLOW FLAG' })
    expect(resolveFlag('red')).toMatchObject({ key: 'red', label: 'RED FLAG' })
    expect(resolveFlag('white')).toMatchObject({ key: 'white', label: 'WHITE FLAG' })
    expect(resolveFlag('checkered')).toMatchObject({ key: 'checkered', label: 'CHECKERED FLAG' })
  })

  it('tolerates an unknown flag string (best-effort render, not a crash)', () => {
    expect(resolveFlag('blue')).toMatchObject({ key: 'blue', label: 'BLUE FLAG' })
    expect(resolveFlag(' Blue ')).toMatchObject({ key: 'blue' })
  })

  it('treats "none", blank, and absent as no flag shown', () => {
    expect(resolveFlag('none')).toBeNull()
    expect(resolveFlag('')).toBeNull()
    expect(resolveFlag('   ')).toBeNull()
    expect(resolveFlag(null)).toBeNull()
    expect(resolveFlag(undefined)).toBeNull()
  })

  it('renders only the FCY badge when full_course_yellow is set without safety_car', () => {
    const { container } = render(SessionStatus, {
      props: { session: { full_course_yellow: true, time_remaining: 10 } },
    })
    expect(container.querySelector('[data-testid="session-fcy"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="session-sc"]')).toBeNull()
  })

  it('renders only the SC badge when safety_car is set without full_course_yellow', () => {
    const { container } = render(SessionStatus, {
      props: { session: { safety_car: true, time_remaining: 10 } },
    })
    expect(container.querySelector('[data-testid="session-sc"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="session-fcy"]')).toBeNull()
  })

  it('renders no flag chip when flag is "none", but other indicators still show', () => {
    const { container } = render(SessionStatus, {
      props: { session: { flag: 'none', safety_car: true } },
    })
    expect(container.querySelector('[data-testid="session-flag"]')).toBeNull()
    expect(container.querySelector('[data-testid="session-sc"]')).not.toBeNull()
  })
})

describe('SessionStatus — empty / absent session (dumb overlay, never crashes)', () => {
  it('renders nothing for a null session (no snapshot yet)', () => {
    const { container } = render(SessionStatus, { props: { session: null, mode: null } })
    expect(statusRoot(container)).toBeNull()
    expect(container.textContent.trim()).toBe('')
  })

  it('renders nothing when no props are passed at all', () => {
    const { container } = render(SessionStatus)
    expect(statusRoot(container)).toBeNull()
  })

  it('renders nothing for a fully empty session object', () => {
    const { container } = render(SessionStatus, { props: { session: {} } })
    expect(statusRoot(container)).toBeNull()
  })

  it('never throws on malformed/garbage field types', () => {
    expect(() =>
      render(SessionStatus, {
        props: {
          session: {
            flag: 123,
            full_course_yellow: 'yes',
            safety_car: null,
            time_remaining: 'abc',
            laps_remaining: {},
            basis: 42,
          },
        },
      }),
    ).not.toThrow()
  })
})

describe('SessionStatus — cautionary border wraps the whole widget (mirrors BattleBox #80)', () => {
  // Same construction as BattleBox's intensifying border: the pulsing ring must be
  // drawn on an ::after overlay ABOVE the header (so the opaque header background
  // can't clip it along the top edge), gated to no-preference; a static reduced-
  // motion fallback replaces the pulse rather than removing the cue. Content
  // rendering itself does not depend on prefers-reduced-motion (no JS branch reads
  // matchMedia), so the behavioral tests above are valid regardless of the
  // happy-dom `reduce` default — only this CSS-source check targets motion.
  const noPref = /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(
    source,
  )?.[1]
  const reduce = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(
    source,
  )?.[1]

  it('animates the ring on the ::after overlay under no-preference, not the bare section', () => {
    expect(noPref).toBeTruthy()
    expect(noPref).toMatch(/\.bc-session--caution::after\s*\{[^}]*animation:\s*bc-session-pulse-ring/s)
    expect(
      /\.bc-session--caution\s*\{[^}]*animation:\s*bc-session-pulse-ring/s.test(source),
    ).toBe(false)
  })

  it('keeps a static ring under reduced motion (no pulse)', () => {
    expect(reduce).toBeTruthy()
    expect(reduce).toMatch(/\.bc-session--caution::after\s*\{[^}]*box-shadow/s)
  })

  it('applies the caution class only when FCY or SC is active', () => {
    const { container } = render(SessionStatus, {
      props: { session: { flag: 'green', laps_remaining: 5 } },
    })
    expect(statusRoot(container).classList.contains('bc-session--caution')).toBe(false)
  })
})

describe('formatClock / formatLaps — pure helpers', () => {
  it('formats a bare remaining time without a denominator', () => {
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(3661)).toBe('1:01:01')
  })

  it('formats remaining + total as "remaining / total"', () => {
    expect(formatClock(90, 120)).toBe('1:30 / 2:00')
  })

  it('falls back to a dash for a missing/invalid remaining time', () => {
    expect(formatClock(null)).toBe('—')
    expect(formatClock(undefined)).toBe('—')
    expect(formatClock('nope')).toBe('—')
  })

  it('renders producer-owned current_lap verbatim (no derivation)', () => {
    // formatLaps(currentLap, totalLaps, lapsRemaining)
    expect(formatLaps(47, 58)).toBe('LAP 47 OF 58')
    expect(formatLaps(60, 60)).toBe('LAP 60 OF 60')
    expect(formatLaps(1, 58)).toBe('LAP 1 OF 58')
    // current_lap alone, without a scheduled total.
    expect(formatLaps(47, null)).toBe('LAP 47')
    // 0 is a real lap/count, never falsy-hidden.
    expect(formatLaps(0, 10)).toBe('LAP 0 OF 10')
    expect(formatLaps(null, null, 0)).toBe('0 LAPS REMAINING')
  })

  it('falls back to the raw laps the producer sent when current_lap is absent', () => {
    expect(formatLaps(null, null, 4)).toBe('4 LAPS REMAINING')
    expect(formatLaps(null, null, 1)).toBe('1 LAP REMAINING')
    expect(formatLaps(null, 30, null)).toBe('30 LAPS')
    expect(formatLaps(null, 1, null)).toBe('1 LAP')
    expect(formatLaps(null, null, null)).toBe('—')
  })
})
