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

describe('ResultsSlide — running order', () => {
  it('renders every driver in position order (close-battle fixture)', () => {
    render(ResultsSlide, { snapshot: closeBattle })
    // Fixture positions: 1 Hamilton, 2 Verstappen, 3 Leclerc, 4 Norris
    expect(renderedNames()).toEqual(['Hamilton', 'Verstappen', 'Leclerc', 'Norris'])
    expect(renderedRows().map((r) => r.getAttribute('data-position'))).toEqual([
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
})

describe('ResultsSlide — row content', () => {
  it('shows position, class, driver, and best-lap for each row (multi-class fixture)', () => {
    render(ResultsSlide, { snapshot: classBest })

    // classBest positions: 1 Verstappen/GTP, 2 Hamilton/GTP, 3 Alonso/GT3, 4 Albon/GT3
    expect(renderedNames()).toEqual(['Verstappen', 'Hamilton', 'Alonso', 'Albon'])

    const rows = renderedRows()
    expect(rows.map((r) => r.getAttribute('data-position'))).toEqual([
      '1',
      '2',
      '3',
      '4',
    ])
    expect(rows.map((r) => r.getAttribute('data-class'))).toEqual([
      'GTP',
      'GTP',
      'GT3',
      'GT3',
    ])

    // Best-lap column formats seconds as broadcast lap time (M:SS.mmm).
    const laps = Array.from(document.querySelectorAll('[data-testid="best-lap"]')).map(
      (el) => el.textContent.trim(),
    )
    expect(laps).toEqual(['1:31.744', '1:31.872', '1:46.088', '1:46.744'])

    // Class chips render the short class label for each row.
    const chips = rows.map((r) =>
      r.querySelector('.bc-class-chip').textContent.trim(),
    )
    expect(chips).toEqual(['GTP', 'GTP', 'GT3', 'GT3'])
  })
})

describe('ResultsSlide — class filter', () => {
  it('shows only the requested class, still in position order (?class=GT3)', () => {
    render(ResultsSlide, { snapshot: classBest, classFilter: 'GT3' })
    expect(renderedNames()).toEqual(['Alonso', 'Albon'])
    expect(renderedRows().map((r) => r.getAttribute('data-position'))).toEqual([
      '3',
      '4',
    ])
  })

  it('matches the class case-insensitively (?class=gtp)', () => {
    render(ResultsSlide, { snapshot: classBest, classFilter: 'gtp' })
    expect(renderedNames()).toEqual(['Verstappen', 'Hamilton'])
  })

  it('renders every class when the filter is absent/blank', () => {
    render(ResultsSlide, { snapshot: classBest, classFilter: '   ' })
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
