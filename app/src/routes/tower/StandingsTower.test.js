import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
import noBattle from '../../../../spec/v1/fixtures/race-no-battle.json'

afterEach(() => cleanup())

function renderedNames() {
  return Array.from(document.querySelectorAll('[data-testid="driver-name"]')).map(
    (el) => el.textContent.trim(),
  )
}

function rowFor(slotId) {
  return document.querySelector(`[data-testid="tower-row"][data-slot="${slotId}"]`)
}

describe('StandingsTower — running order', () => {
  it('renders driver names in position order (close-battle fixture)', () => {
    render(StandingsTower, { snapshot: closeBattle })
    // Fixture positions: 1 Hamilton, 2 Verstappen, 3 Leclerc, 4 Norris
    expect(renderedNames()).toEqual([
      'Hamilton',
      'Verstappen',
      'Leclerc',
      'Norris',
    ])
  })

  it('sorts by position even when the vehicles array is out of order', () => {
    const shuffled = {
      ...closeBattle,
      vehicles: [
        closeBattle.vehicles[3], // Norris P4
        closeBattle.vehicles[1], // Verstappen P2
        closeBattle.vehicles[0], // Hamilton P1
        closeBattle.vehicles[2], // Leclerc P3
      ],
    }
    render(StandingsTower, { snapshot: shuffled })
    expect(renderedNames()).toEqual([
      'Hamilton',
      'Verstappen',
      'Leclerc',
      'Norris',
    ])
  })
})

describe('StandingsTower — on-camera highlight', () => {
  it('highlights only the subject row (Verstappen / car-1)', () => {
    render(StandingsTower, { snapshot: closeBattle })

    const verstappen = rowFor('car-1')
    expect(verstappen).not.toBeNull()
    expect(verstappen.getAttribute('data-oncam')).toBe('true')
    expect(verstappen.classList.contains('row--oncam')).toBe(true)
    expect(verstappen.getAttribute('aria-current')).toBe('true')

    const highlighted = document.querySelectorAll(
      '[data-testid="tower-row"][data-oncam="true"]',
    )
    expect(highlighted).toHaveLength(1)

    for (const slot of ['car-44', 'car-16', 'car-4']) {
      expect(rowFor(slot).getAttribute('data-oncam')).toBe('false')
      expect(rowFor(slot).classList.contains('row--oncam')).toBe(false)
    }
  })

  it('moves the highlight with the subject (Hamilton / car-44 in no-battle fixture)', () => {
    render(StandingsTower, { snapshot: noBattle })

    expect(rowFor('car-44').getAttribute('data-oncam')).toBe('true')
    expect(rowFor('car-1').getAttribute('data-oncam')).toBe('false')
    expect(
      document.querySelectorAll('[data-testid="tower-row"][data-oncam="true"]'),
    ).toHaveLength(1)
  })

  it('re-cut reveal: highlight lands on the new subject row after a camera cut (#64)', async () => {
    // The rows are slot-keyed and persistent; on a camera cut the newly-selected
    // row GAINS `row--oncam` (the class add is what fires the mint glow-in animation)
    // and the previous row cleanly returns to normal — exactly one row highlighted.
    const { rerender } = render(StandingsTower, { snapshot: closeBattle })
    expect(rowFor('car-1').classList.contains('row--oncam')).toBe(true) // Verstappen on cam

    // Cut to Hamilton (car-44): highlight moves off car-1 and onto car-44.
    await rerender({
      snapshot: { ...closeBattle, subject: { slot_id: 'car-44', driver_name: 'Hamilton' } },
    })
    expect(rowFor('car-44').classList.contains('row--oncam')).toBe(true)
    expect(rowFor('car-1').classList.contains('row--oncam')).toBe(false)
    expect(
      document.querySelectorAll('[data-testid="tower-row"][data-oncam="true"]'),
    ).toHaveLength(1)
  })
})

describe('StandingsTower — rendering details', () => {
  it('shows position numerals and the header label', () => {
    render(StandingsTower, { snapshot: closeBattle })
    expect(document.querySelector('.tower__header').textContent.trim()).toBe(
      'RUNNING ORDER',
    )
    const positions = Array.from(
      document.querySelectorAll('[data-testid="tower-row"]'),
    ).map((r) => r.getAttribute('data-position'))
    expect(positions).toEqual(['1', '2', '3', '4'])
  })

  it('renders an idle state when there is no snapshot', () => {
    render(StandingsTower, { snapshot: null })
    expect(document.querySelector('[data-testid="tower-empty"]')).not.toBeNull()
    expect(document.querySelectorAll('[data-testid="tower-row"]')).toHaveLength(0)
  })

  it('renders best-effort for an unknown schemaVersion', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(StandingsTower, { snapshot: { ...closeBattle, schemaVersion: '99' } })
    // Presentational component still renders the field it understands.
    expect(renderedNames()).toEqual([
      'Hamilton',
      'Verstappen',
      'Leclerc',
      'Norris',
    ])
    warn.mockRestore()
  })
})
