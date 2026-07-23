import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import ResultsSlide from './ResultsSlide.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'
import classBest from '../../../../spec/v1/fixtures/race-class-best.json'

afterEach(() => cleanup())

function renderedNames() {
  return Array.from(document.querySelectorAll('[data-testid="driver-name"]')).map(
    (el) => el.textContent.trim(),
  )
}

function renderedRows() {
  return Array.from(document.querySelectorAll('[data-testid="results-row"]'))
}

function renderedGroups() {
  return Array.from(document.querySelectorAll('[data-testid="results-group"]'))
}

describe('ResultsSlide — single-class classification', () => {
  it('renders one group in finishing order (close-battle fixture)', () => {
    render(ResultsSlide, { snapshot: closeBattle })
    // Fixture: single F1 class, 1 Hamilton, 2 Verstappen, 3 Leclerc, 4 Norris.
    expect(renderedGroups()).toHaveLength(1)
    expect(renderedNames()).toEqual(['Hamilton', 'Verstappen', 'Leclerc', 'Norris'])
    // Class positions restart at 1 within the group.
    expect(renderedRows().map((r) => r.getAttribute('data-class-pos'))).toEqual([
      '1',
      '2',
      '3',
      '4',
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
    render(ResultsSlide, { snapshot: shuffled })
    expect(renderedNames()).toEqual(['Hamilton', 'Verstappen', 'Leclerc', 'Norris'])
  })

  it('does not mutate the source vehicles array', () => {
    const before = closeBattle.vehicles.map((v) => v.position)
    render(ResultsSlide, { snapshot: closeBattle })
    expect(closeBattle.vehicles.map((v) => v.position)).toEqual(before)
  })
})

describe('ResultsSlide — per-class grouping + row content', () => {
  it('groups by class (registry order), restarting class positions, with best-lap', () => {
    render(ResultsSlide, { snapshot: classBest })

    // classBest: 1 Verstappen/GTP, 2 Hamilton/GTP, 3 Alonso/GT3, 4 Albon/GT3.
    // Groups appear in class-registry order: GTP (0) then GT3 (2).
    expect(renderedGroups().map((g) => g.getAttribute('data-class'))).toEqual([
      'GTP',
      'GT3',
    ])

    // DOM order = grouped, each group by finishing position.
    expect(renderedNames()).toEqual(['Verstappen', 'Hamilton', 'Alonso', 'Albon'])

    const rows = renderedRows()
    // `data-position` keeps the overall running position…
    expect(rows.map((r) => r.getAttribute('data-position'))).toEqual([
      '1',
      '2',
      '3',
      '4',
    ])
    // …while the visible position restarts at 1 within each class.
    expect(rows.map((r) => r.getAttribute('data-class-pos'))).toEqual([
      '1',
      '2',
      '1',
      '2',
    ])
    expect(rows.map((r) => r.querySelector('.row__pos').textContent.trim())).toEqual([
      '1',
      '2',
      '1',
      '2',
    ])

    // Best-lap column formats seconds as broadcast lap time (M:SS.mmm).
    const laps = Array.from(document.querySelectorAll('[data-testid="best-lap"]')).map(
      (el) => el.textContent.trim(),
    )
    expect(laps).toEqual(['1:31.744', '1:31.872', '1:46.088', '1:46.744'])

    // Each group header carries the class chip label.
    const chips = renderedGroups().map((g) =>
      g.querySelector('.bc-class-chip').textContent.trim(),
    )
    expect(chips).toEqual(['GTP', 'GT3'])
  })
})

describe('ResultsSlide — class filter', () => {
  it('shows only the requested class as a single group (?class=GT3)', () => {
    render(ResultsSlide, { snapshot: classBest, classFilter: 'GT3' })
    expect(renderedGroups().map((g) => g.getAttribute('data-class'))).toEqual([
      'GT3',
    ])
    expect(renderedNames()).toEqual(['Alonso', 'Albon'])
    expect(renderedRows().map((r) => r.getAttribute('data-class-pos'))).toEqual([
      '1',
      '2',
    ])
  })

  it('matches the class case-insensitively (?class=gtp)', () => {
    render(ResultsSlide, { snapshot: classBest, classFilter: 'gtp' })
    expect(renderedNames()).toEqual(['Verstappen', 'Hamilton'])
  })

  it('renders every class when the filter is absent/blank', () => {
    render(ResultsSlide, { snapshot: classBest, classFilter: '   ' })
    expect(renderedGroups()).toHaveLength(2)
    expect(renderedNames()).toEqual(['Verstappen', 'Hamilton', 'Alonso', 'Albon'])
  })
})

describe('ResultsSlide — empty / idle states', () => {
  it('renders the waiting placeholder when there is no snapshot', () => {
    render(ResultsSlide, { snapshot: null })
    const empty = document.querySelector('[data-testid="results-empty"]')
    expect(empty).not.toBeNull()
    expect(empty.getAttribute('data-reason')).toBe('no-state')
    expect(renderedRows()).toHaveLength(0)
  })

  it('renders a distinct placeholder when the class filter matches nothing', () => {
    render(ResultsSlide, { snapshot: classBest, classFilter: 'LMP2' })
    const empty = document.querySelector('[data-testid="results-empty"]')
    expect(empty).not.toBeNull()
    expect(empty.getAttribute('data-reason')).toBe('no-match')
    expect(renderedRows()).toHaveLength(0)
  })
})
