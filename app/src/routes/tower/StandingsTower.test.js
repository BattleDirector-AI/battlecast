import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import StandingsTower from './StandingsTower.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
import noBattle from '../../../../spec/v1/fixtures/race-no-battle.json'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'
import classBest from '../../../../spec/v1/fixtures/race-class-best.json'
import qualifying from '../../../../spec/v1/fixtures/qualifying-sector-a.json'

afterEach(() => cleanup())

function renderedNames() {
  return Array.from(document.querySelectorAll('[data-testid="driver-name"]')).map(
    (el) => el.textContent.trim(),
  )
}

function renderedPositions() {
  return Array.from(document.querySelectorAll('[data-testid="tower-row"] .row__pos')).map(
    (el) => el.textContent.trim(),
  )
}

function classBadges() {
  return Array.from(document.querySelectorAll('[data-testid="class-pos"]')).map(
    (el) => el.textContent.trim(),
  )
}

function rowFor(slotId) {
  return document.querySelector(`[data-testid="tower-row"][data-slot="${slotId}"]`)
}

function groupClasses() {
  return Array.from(document.querySelectorAll('[data-testid="tower-group"]')).map(
    (el) => el.getAttribute('data-class'),
  )
}

const headerText = () =>
  document.querySelector('[data-testid="tower-header"]').textContent.trim()

const gapFor = (slotId) =>
  rowFor(slotId)?.querySelector('[data-testid="row-gap"]')?.textContent.trim()

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
  it('shows position numerals and the session-mode header', () => {
    render(StandingsTower, { snapshot: closeBattle })
    // closeBattle carries mode 'race' -> the header reflects the session.
    expect(headerText()).toBe('RACE')
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

describe('StandingsTower — session-mode header', () => {
  it('reflects a qualifying session', () => {
    render(StandingsTower, { snapshot: qualifying })
    expect(headerText()).toBe('QUALIFYING')
  })

  it('uppercases an unknown mode string gracefully', () => {
    render(StandingsTower, { snapshot: { ...closeBattle, mode: 'warmup' } })
    expect(headerText()).toBe('WARMUP')
  })

  it('falls back to the label when the snapshot carries no mode', () => {
    const { mode, ...noMode } = closeBattle
    void mode
    render(StandingsTower, { snapshot: noMode })
    expect(headerText()).toBe('RUNNING ORDER')
  })

  it('honors an explicit label override when there is no mode', () => {
    const { mode, ...noMode } = closeBattle
    void mode
    render(StandingsTower, { snapshot: noMode, label: 'STANDINGS' })
    expect(headerText()).toBe('STANDINGS')
  })
})

describe('StandingsTower — inline class positions (default)', () => {
  // race-class-best overall order: 1 Verstappen/GTP, 2 Hamilton/GTP,
  //                                3 Alonso/GT3, 4 Albon/GT3.
  it('keeps one overall-order list and badges each row with its class rank', () => {
    render(StandingsTower, { snapshot: classBest })
    expect(renderedNames()).toEqual(['Verstappen', 'Hamilton', 'Alonso', 'Albon'])
    // Position column stays the overall running order.
    expect(renderedPositions()).toEqual(['1', '2', '3', '4'])
    // Each row is badged rank/total WITHIN its class: GTP 1/2,2/2 and GT3 1/2,2/2.
    expect(classBadges()).toEqual(['1/2', '2/2', '1/2', '2/2'])
    // No per-class section headers in inline mode.
    expect(groupClasses()).toEqual([])
  })

  it('computes class rank across an interleaved multi-class field', () => {
    render(StandingsTower, { snapshot: multiClass })
    // Overall: 1 Verstappen/GTP, 2 Alonso/GT3, 3 Hamilton/GTP, 4 Rossi/LMP2,
    //          5 Albon/GT3, 6 Bourdais/LMP2.
    expect(renderedNames()).toEqual([
      'Verstappen',
      'Alonso',
      'Hamilton',
      'Rossi',
      'Albon',
      'Bourdais',
    ])
    expect(classBadges()).toEqual(['1/2', '1/2', '2/2', '1/2', '2/2', '2/2'])
  })
})

describe('StandingsTower — grouped class sections', () => {
  it('renders per-class sections in registry order with positions restarting', () => {
    render(StandingsTower, { snapshot: multiClass, classDisplay: 'grouped' })

    // Sections appear in class-registry order: GTP (0), LMP2 (1), GT3 (2).
    expect(groupClasses()).toEqual(['GTP', 'LMP2', 'GT3'])

    // DOM order = grouped; names bucketed by class, each group by position.
    expect(renderedNames()).toEqual([
      'Verstappen',
      'Hamilton',
      'Rossi',
      'Bourdais',
      'Alonso',
      'Albon',
    ])
    // Positions restart within each class: GTP[1,2], LMP2[1,2], GT3[1,2].
    expect(renderedPositions()).toEqual(['1', '2', '1', '2', '1', '2'])
    // No inline class badges in grouped mode (the position IS the class rank).
    expect(classBadges()).toEqual([])
  })

  it('preserves the on-camera highlight for a row inside its group', () => {
    // race-class-best subject is car-14 (Alonso, GT3).
    render(StandingsTower, { snapshot: classBest, classDisplay: 'grouped' })
    const alonso = rowFor('car-14')
    expect(alonso.getAttribute('data-oncam')).toBe('true')
    expect(alonso.classList.contains('row--oncam')).toBe(true)
    // The subject-keyed flash overlay is present on the on-camera grouped row.
    expect(alonso.querySelector('[data-testid="row-oncam-flash"]')).not.toBeNull()
    expect(
      document.querySelectorAll('[data-testid="tower-row"][data-oncam="true"]'),
    ).toHaveLength(1)
  })
})

describe('StandingsTower — class filter', () => {
  it('inline: narrows to a single class, case-insensitively', () => {
    render(StandingsTower, { snapshot: multiClass, classFilter: 'lmp2' })
    expect(renderedNames()).toEqual(['Rossi', 'Bourdais'])
    // Class rank/total is stable regardless of the filter (still /2 of the LMP2 field).
    expect(classBadges()).toEqual(['1/2', '2/2'])
    // The header surfaces the active class filter chip.
    expect(document.querySelector('[data-testid="tower-filter"]')).not.toBeNull()
  })

  it('grouped: collapses to the single requested section', () => {
    render(StandingsTower, {
      snapshot: multiClass,
      classDisplay: 'grouped',
      classFilter: 'GT3',
    })
    expect(groupClasses()).toEqual(['GT3'])
    expect(renderedNames()).toEqual(['Alonso', 'Albon'])
    expect(renderedPositions()).toEqual(['1', '2'])
  })

  it('renders the no-match empty state when the filter matches nothing', () => {
    render(StandingsTower, { snapshot: multiClass, classFilter: 'TCR' })
    const empty = document.querySelector('[data-testid="tower-empty"]')
    expect(empty).not.toBeNull()
    expect(empty.getAttribute('data-reason')).toBe('no-match')
    expect(document.querySelectorAll('[data-testid="tower-row"]')).toHaveLength(0)
  })

  it('keeps the waiting placeholder (no-state) when there is no snapshot', () => {
    render(StandingsTower, { snapshot: null, classFilter: 'GTP' })
    const empty = document.querySelector('[data-testid="tower-empty"]')
    expect(empty.getAttribute('data-reason')).toBe('no-state')
    expect(empty.textContent.trim()).toBe('Waiting for state…')
  })
})

describe('StandingsTower — gap to leader (#28)', () => {
  it('inline: the leader reads LEADER, others show the gap to the overall leader', () => {
    render(StandingsTower, { snapshot: closeBattle })
    // race-close-battle: Hamilton P1 (LEADER), then the field by gap_to_leader.
    expect(gapFor('car-44')).toBe('LEADER')
    expect(gapFor('car-1')).toBe('+0.400')
    expect(gapFor('car-16')).toBe('+2.200')
    expect(gapFor('car-4')).toBe('+3.700')
  })

  it('grouped: each class restarts at LEADER; gaps are to the CLASS leader', () => {
    render(StandingsTower, { snapshot: multiClass, classDisplay: 'grouped' })
    // GTP: Verstappen (also the overall leader) leads the class; Hamilton +0.128.
    expect(gapFor('car-1')).toBe('LEADER')
    expect(gapFor('car-44')).toBe('+0.128')
    // LMP2: Rossi leads its class; Bourdais +0.475 to Rossi (7.243 − 6.768), NOT
    // his +7.243 gap to the overall leader — the class-leader subtraction.
    expect(gapFor('car-8')).toBe('LEADER')
    expect(gapFor('car-31')).toBe('+0.475')
    // GT3: Alonso leads its class; Albon +0.656 (15.000 − 14.344).
    expect(gapFor('car-14')).toBe('LEADER')
    expect(gapFor('car-23')).toBe('+0.656')
  })

  it('tolerates an older producer that omits gap_to_leader (renders an em dash)', () => {
    // Additive field: strip it to mimic a producer that never sends it. The leader
    // still reads LEADER (position-based); a non-leader with no gap shows '—'.
    const stripped = {
      ...closeBattle,
      vehicles: closeBattle.vehicles.map((v) => {
        const clone = { ...v }
        delete clone.gap_to_leader
        return clone
      }),
    }
    render(StandingsTower, { snapshot: stripped })
    expect(gapFor('car-44')).toBe('LEADER')
    expect(gapFor('car-1')).toBe('—')
  })

  it('qualifying: the leader shows its pole lap time, not LEADER (inline)', () => {
    // qualifying-sector-a (mode: qualifying): car-16 on pole with best_lap 88.912.
    render(StandingsTower, { snapshot: qualifying })
    expect(gapFor('car-16')).toBe('1:28.912')
  })

  it('qualifying: the class leader shows its pole lap time (grouped)', () => {
    render(StandingsTower, { snapshot: qualifying, classDisplay: 'grouped' })
    expect(gapFor('car-16')).toBe('1:28.912')
  })

  it('qualifying: a leader with no best lap falls back to LEADER', () => {
    const noLap = {
      ...qualifying,
      vehicles: qualifying.vehicles.map((v) => {
        if (v.position !== 1) return v
        const clone = { ...v }
        delete clone.best_lap
        return clone
      }),
    }
    render(StandingsTower, { snapshot: noLap })
    expect(gapFor('car-16')).toBe('LEADER')
  })
})
