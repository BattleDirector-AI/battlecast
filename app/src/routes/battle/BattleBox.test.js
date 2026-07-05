import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import BattleBox, { isActiveBattle, isRacingMode } from './BattleBox.svelte'
// Component source, for the CSS-contract assertion on the intensifying border
// (happy-dom runs no CSS, so the ::after overlay can only be checked in source).
import source from './BattleBox.svelte?raw'

import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
import noBattle from '../../../../spec/v1/fixtures/race-no-battle.json'
import idleBattle from '../../../../spec/v1/fixtures/race-idle-battle.json'

// The battle box is gated to racing modes; the race-* fixtures carry mode "race",
// so thread it through (an absent mode renders nothing — see the mode-gate suite).
function renderFixture(fixture) {
  return render(BattleBox, {
    props: {
      subject: fixture.subject,
      relationship: fixture.relationship,
      vehicles: fixture.vehicles,
      mode: fixture.mode,
    },
  })
}

afterEach(() => cleanup())

describe('BattleBox — active battle', () => {
  it('shows the named on-camera driver and their ahead/behind gaps and intensity', () => {
    const { container } = renderFixture(closeBattle)
    const text = container.textContent

    // Named on-camera driver (subject is Verstappen / car-1).
    expect(text).toContain('Verstappen')
    // gap_ahead 0.4 and gap_behind 1.8, signed to one decimal.
    expect(text).toContain('+0.4')
    expect(text).toContain('+1.8')
    // battle_intensity 0.86 -> IntensityMeter renders 86 (0..100).
    expect(text).toContain('86')

    // Adjacent drivers surfaced from vehicles[] (P1 Hamilton ahead, P3 Leclerc behind).
    expect(text).toContain('Hamilton')
    expect(text).toContain('Leclerc')

    // NOT the idle state.
    expect(text).not.toContain('NO ACTIVE BATTLE')
  })

  it('renders the behind gap for a leader who still has a car behind', () => {
    // race-no-battle: Hamilton leads (gap_ahead null) with a 12.4s gap behind.
    // A leader with someone behind is still a (weak) battle, not idle.
    const { container } = renderFixture(noBattle)
    const text = container.textContent

    expect(text).toContain('Hamilton')
    expect(text).toContain('+12.4')
    expect(text).not.toContain('NO ACTIVE BATTLE')
  })
})

describe('BattleBox — idle (no active battle)', () => {
  it('renders an explicit idle state, not stale or blank data', () => {
    const { container } = renderFixture(idleBattle)
    const text = container.textContent

    expect(text).toContain('NO ACTIVE BATTLE')
    // The idle car (Alonso) is named so the box reads as "off", not blank.
    expect(text).toContain('Alonso')
    // No numeric gap should appear in the idle state.
    expect(text).not.toMatch(/[+-]\d/)
  })

  it('does not retain a previous battle gap when the state goes idle', () => {
    // Drive with an active fight first, then re-render with the idle snapshot:
    // the previously-shown +0.4 / +1.8 gaps must be gone, not stale.
    const { container, rerender } = renderFixture(closeBattle)
    expect(container.textContent).toContain('+0.4')

    rerender({
      subject: idleBattle.subject,
      relationship: idleBattle.relationship,
      vehicles: idleBattle.vehicles,
      mode: idleBattle.mode,
    })

    const text = container.textContent
    expect(text).toContain('NO ACTIVE BATTLE')
    expect(text).not.toContain('+0.4')
    expect(text).not.toContain('+1.8')
  })
})

describe('isActiveBattle heuristic', () => {
  it('is active when at least one adjacent gap is a real number', () => {
    expect(isActiveBattle({ gap_ahead: 0.4, gap_behind: 1.8, battle_intensity: 0.86 })).toBe(true)
    expect(isActiveBattle({ gap_ahead: null, gap_behind: 12.4, battle_intensity: 0.03 })).toBe(true)
  })

  it('is inactive when both gaps are null/absent, regardless of battle_intensity', () => {
    expect(isActiveBattle({ gap_ahead: null, gap_behind: null, battle_intensity: 0 })).toBe(false)
    expect(isActiveBattle({ battle_intensity: 0 })).toBe(false)
    // Even a nonzero (stale) intensity must not force an active state.
    expect(isActiveBattle({ gap_ahead: null, gap_behind: null, battle_intensity: 0.9 })).toBe(false)
  })

  it('is inactive for a missing relationship', () => {
    expect(isActiveBattle(undefined)).toBe(false)
  })
})

describe('BattleBox — racing-mode gate (#81)', () => {
  it('isRacingMode is true only for race/replay', () => {
    expect(isRacingMode('race')).toBe(true)
    expect(isRacingMode('replay')).toBe(true)
    for (const m of ['qualifying', 'practice', 'grid', 'results', 'unknown', null, undefined]) {
      expect(isRacingMode(m)).toBe(false)
    }
  })

  it('renders NOTHING outside a racing mode, even with an active-battle relationship', () => {
    // Qualifying still emits gap_ahead/gap_behind, but a "battle for position" is a
    // race concept — the box must not appear.
    const { container } = render(BattleBox, {
      props: {
        subject: closeBattle.subject,
        relationship: closeBattle.relationship,
        vehicles: closeBattle.vehicles,
        mode: 'qualifying',
      },
    })
    expect(container.querySelector('.bc-battle')).toBeNull()
    expect(container.textContent.trim()).toBe('')
  })

  it('renders the box in a racing mode', () => {
    const { container } = renderFixture(closeBattle) // mode "race"
    expect(container.querySelector('.bc-battle')).not.toBeNull()
  })
})

describe('BattleBox — intensifying border wraps the whole widget (#80)', () => {
  // The pulsing ring must be drawn on an overlay ABOVE the header, not as an inset
  // shadow on the section (which the header's opaque background covered along the
  // top). Assert the source draws the pulse on a `.bc-battle--hot::after` overlay
  // and NOT on the bare `.bc-battle--hot` element. Red on the pre-fix source.
  it('animates bc-pulse on the ::after overlay, not the section itself', () => {
    expect(/\.bc-battle--hot::after\s*\{[^}]*animation:\s*bc-pulse/s.test(source)).toBe(true)
    expect(/\.bc-battle--hot\s*\{[^}]*animation:\s*bc-pulse/s.test(source)).toBe(false)
  })
})
