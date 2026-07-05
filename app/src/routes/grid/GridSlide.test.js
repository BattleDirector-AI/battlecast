import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import GridSlide from './GridSlide.svelte'
import multiClass from '../../../../spec/v1/fixtures/grid-multiclass.json'
import classBest from '../../../../spec/v1/fixtures/race-class-best.json'

afterEach(() => cleanup())

function renderedNames() {
  return Array.from(document.querySelectorAll('[data-testid="driver-name"]')).map(
    (el) => el.textContent.trim(),
  )
}

function renderedCells() {
  return Array.from(document.querySelectorAll('[data-testid="grid-cell"]'))
}

function renderedGroups() {
  return Array.from(document.querySelectorAll('[data-testid="grid-group"]'))
}

describe('GridSlide — per-class grouping + starting order', () => {
  // grid-multiclass positions interleave classes on track:
  //   1 Verstappen/GTP, 2 Alonso/GT3, 3 Hamilton/GTP,
  //   4 Rossi/LMP2, 5 Albon/GT3, 6 Bourdais/LMP2
  it('groups by class (registry order) and orders each group by position', () => {
    render(GridSlide, { snapshot: multiClass })

    // Groups appear in class-registry order: GTP (0), LMP2 (1), GT3 (2).
    expect(renderedGroups().map((g) => g.getAttribute('data-class'))).toEqual([
      'GTP',
      'LMP2',
      'GT3',
    ])

    // DOM order = grouped, and each group is sorted by position:
    //   GTP[1,3], LMP2[4,6], GT3[2,5].
    expect(renderedNames()).toEqual([
      'Verstappen',
      'Hamilton',
      'Rossi',
      'Bourdais',
      'Alonso',
      'Albon',
    ])
    expect(renderedCells().map((c) => c.getAttribute('data-position'))).toEqual([
      '1',
      '3',
      '4',
      '6',
      '2',
      '5',
    ])
  })

  it('sorts by position even when the vehicles array is out of order', () => {
    const shuffled = {
      ...multiClass,
      vehicles: [
        multiClass.vehicles[5], // Bourdais P6 / LMP2
        multiClass.vehicles[0], // Verstappen P1 / GTP
        multiClass.vehicles[4], // Albon P5 / GT3
        multiClass.vehicles[2], // Hamilton P3 / GTP
        multiClass.vehicles[3], // Rossi P4 / LMP2
        multiClass.vehicles[1], // Alonso P2 / GT3
      ],
    }
    render(GridSlide, { snapshot: shuffled })
    expect(renderedNames()).toEqual([
      'Verstappen',
      'Hamilton',
      'Rossi',
      'Bourdais',
      'Alonso',
      'Albon',
    ])
  })

  it('does not mutate the source vehicles array', () => {
    const before = multiClass.vehicles.map((v) => v.position)
    render(GridSlide, { snapshot: multiClass })
    expect(multiClass.vehicles.map((v) => v.position)).toEqual(before)
  })
})

describe('GridSlide — cell content', () => {
  it('shows position, class, and driver for each grid cell', () => {
    render(GridSlide, { snapshot: classBest })

    // classBest: 1 Verstappen/GTP, 2 Hamilton/GTP, 3 Alonso/GT3, 4 Albon/GT3.
    // Grouped GTP then GT3, each by position.
    expect(renderedNames()).toEqual(['Verstappen', 'Hamilton', 'Alonso', 'Albon'])

    const cells = renderedCells()
    expect(cells.map((c) => c.getAttribute('data-position'))).toEqual([
      '1',
      '2',
      '3',
      '4',
    ])
    expect(cells.map((c) => c.getAttribute('data-class'))).toEqual([
      'GTP',
      'GTP',
      'GT3',
      'GT3',
    ])

    // Each group header carries the class chip label.
    const chips = renderedGroups().map((g) =>
      g.querySelector('.bc-class-chip').textContent.trim(),
    )
    expect(chips).toEqual(['GTP', 'GT3'])
  })
})

describe('GridSlide — class filter', () => {
  it('shows only the requested class, still in position order (?class=GT3)', () => {
    render(GridSlide, { snapshot: multiClass, classFilter: 'GT3' })
    expect(renderedGroups().map((g) => g.getAttribute('data-class'))).toEqual([
      'GT3',
    ])
    expect(renderedNames()).toEqual(['Alonso', 'Albon'])
    expect(renderedCells().map((c) => c.getAttribute('data-position'))).toEqual([
      '2',
      '5',
    ])
  })

  it('matches the class case-insensitively (?class=lmp2)', () => {
    render(GridSlide, { snapshot: multiClass, classFilter: 'lmp2' })
    expect(renderedNames()).toEqual(['Rossi', 'Bourdais'])
  })

  it('renders every class when the filter is absent/blank', () => {
    render(GridSlide, { snapshot: multiClass, classFilter: '   ' })
    expect(renderedGroups()).toHaveLength(3)
    expect(renderedNames()).toEqual([
      'Verstappen',
      'Hamilton',
      'Rossi',
      'Bourdais',
      'Alonso',
      'Albon',
    ])
  })
})

describe('GridSlide — empty / idle states', () => {
  it('renders the waiting placeholder when there is no snapshot', () => {
    render(GridSlide, { snapshot: null })
    const empty = document.querySelector('[data-testid="grid-empty"]')
    expect(empty).not.toBeNull()
    expect(empty.getAttribute('data-reason')).toBe('no-state')
    expect(renderedCells()).toHaveLength(0)
  })

  it('renders a distinct placeholder when the class filter matches nothing', () => {
    render(GridSlide, { snapshot: multiClass, classFilter: 'TCR' })
    const empty = document.querySelector('[data-testid="grid-empty"]')
    expect(empty).not.toBeNull()
    expect(empty.getAttribute('data-reason')).toBe('no-match')
    expect(renderedCells()).toHaveLength(0)
  })
})
