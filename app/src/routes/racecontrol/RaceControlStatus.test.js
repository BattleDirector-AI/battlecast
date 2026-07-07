import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import RaceControlStatus, { resolveFlag } from './RaceControlStatus.svelte'
// Component source, for the CSS-contract assertion on the cautionary border
// (happy-dom runs no CSS, so the ::after overlay can only be checked in source —
// mirrors BattleBox.test.js's technique for the same class of assertion).
import source from './RaceControlStatus.svelte?raw'

import fullSession from '../../../../spec/v1/fixtures/race-session-fcy.json'
import partialSession from '../../../../spec/v1/fixtures/race-session-partial.json'

afterEach(() => cleanup())

function statusRoot(container) {
  return container.querySelector('[data-testid="racecontrol-status"]')
}

describe('RaceControlStatus — flag / FCY / Safety-Car strip', () => {
  it('renders the local flag plus FCY and SC from the full fixture (race-session-fcy.json)', () => {
    const { container } = render(RaceControlStatus, {
      props: { session: fullSession.session, mode: fullSession.mode },
    })
    expect(statusRoot(container)).not.toBeNull()

    const flagEl = container.querySelector('[data-testid="racecontrol-flag"]')
    expect(flagEl.getAttribute('data-flag')).toBe('yellow')
    expect(flagEl.textContent).toContain('YELLOW FLAG')

    // FCY and a local yellow flag are DISTINCT — both are set on this fixture, so
    // both must render simultaneously.
    expect(container.querySelector('[data-testid="racecontrol-fcy"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="racecontrol-sc"]')).not.toBeNull()
    expect(container.textContent).toContain('FULL COURSE YELLOW')
    expect(container.textContent).toContain('SAFETY CAR')
  })

  it('renders just the flag (no FCY/SC) from the partial fixture', () => {
    const { container } = render(RaceControlStatus, {
      props: { session: partialSession.session, mode: partialSession.mode },
    })
    const flagEl = container.querySelector('[data-testid="racecontrol-flag"]')
    expect(flagEl.getAttribute('data-flag')).toBe('green')
    expect(flagEl.textContent).toContain('GREEN FLAG')
    expect(container.querySelector('[data-testid="racecontrol-fcy"]')).toBeNull()
    expect(container.querySelector('[data-testid="racecontrol-sc"]')).toBeNull()
  })

  it('does not render any session-clock / lap readout (that lives in the tower header)', () => {
    // Even a session rich in progress fields shows no progress text here.
    const { container } = render(RaceControlStatus, {
      props: {
        session: {
          flag: 'green',
          time_remaining: 272,
          session_length: 300,
          current_lap: 12,
          total_laps: 58,
        },
      },
    })
    expect(container.querySelector('[data-testid="session-progress"]')).toBeNull()
    expect(container.textContent).not.toMatch(/\d:\d\d/)
    expect(container.textContent).not.toContain('LAP')
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
    const { container } = render(RaceControlStatus, {
      props: { session: { full_course_yellow: true } },
    })
    expect(container.querySelector('[data-testid="racecontrol-fcy"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="racecontrol-sc"]')).toBeNull()
  })

  it('renders only the SC badge when safety_car is set without full_course_yellow', () => {
    const { container } = render(RaceControlStatus, {
      props: { session: { safety_car: true } },
    })
    expect(container.querySelector('[data-testid="racecontrol-sc"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="racecontrol-fcy"]')).toBeNull()
  })

  it('renders no flag chip when flag is "none", but other indicators still show', () => {
    const { container } = render(RaceControlStatus, {
      props: { session: { flag: 'none', safety_car: true } },
    })
    expect(container.querySelector('[data-testid="racecontrol-flag"]')).toBeNull()
    expect(container.querySelector('[data-testid="racecontrol-sc"]')).not.toBeNull()
  })
})

describe('RaceControlStatus — empty / absent session (dumb overlay, never crashes)', () => {
  it('renders nothing for a null session (no snapshot yet)', () => {
    const { container } = render(RaceControlStatus, { props: { session: null, mode: null } })
    expect(statusRoot(container)).toBeNull()
    expect(container.textContent.trim()).toBe('')
  })

  it('renders nothing when no props are passed at all', () => {
    const { container } = render(RaceControlStatus)
    expect(statusRoot(container)).toBeNull()
  })

  it('renders nothing for a session with no flag/FCY/SC (progress-only)', () => {
    // Progress fields alone no longer produce a status strip — they belong to the
    // tower header now.
    const { container } = render(RaceControlStatus, {
      props: { session: { time_remaining: 120, laps_remaining: 5 } },
    })
    expect(statusRoot(container)).toBeNull()
  })

  it('never throws on malformed/garbage field types', () => {
    expect(() =>
      render(RaceControlStatus, {
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

describe('RaceControlStatus — cautionary border wraps the whole widget (mirrors BattleBox #80)', () => {
  // Same construction as BattleBox's intensifying border: the pulsing ring must be
  // drawn on an ::after overlay gated to no-preference; a static reduced-motion
  // fallback replaces the pulse rather than removing the cue. Content rendering does
  // not depend on prefers-reduced-motion (no JS branch reads matchMedia), so the
  // behavioral tests above are valid regardless of the happy-dom `reduce` default —
  // only this CSS-source check targets motion.
  const noPref = /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(
    source,
  )?.[1]
  const reduce = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(
    source,
  )?.[1]

  it('animates the ring on the ::after overlay under no-preference, not the bare section', () => {
    expect(noPref).toBeTruthy()
    expect(noPref).toMatch(/\.bc-racecontrol--caution::after\s*\{[^}]*animation:\s*bc-racecontrol-pulse-ring/s)
    expect(
      /\.bc-racecontrol--caution\s*\{[^}]*animation:\s*bc-racecontrol-pulse-ring/s.test(source),
    ).toBe(false)
  })

  it('keeps a static ring under reduced motion (no pulse)', () => {
    expect(reduce).toBeTruthy()
    expect(reduce).toMatch(/\.bc-racecontrol--caution::after\s*\{[^}]*box-shadow/s)
  })

  it('applies the caution class only when FCY or SC is active', () => {
    const { container } = render(RaceControlStatus, {
      props: { session: { flag: 'green' } },
    })
    expect(statusRoot(container).classList.contains('bc-racecontrol--caution')).toBe(false)
  })
})
