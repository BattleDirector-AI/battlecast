import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import RaceControlStatus from './RaceControlStatus.svelte'
import localYellow from '../../../../spec/v1/fixtures/race-local-yellow.json'

afterEach(() => cleanup())

// Sector yellows (widgets.md rule 44, ADR 0016). `session.sector_flags` is the producer's
// per-sector local flag, index 0 = sector 1. Race Control names the yellow sectors in one
// chip and never works out a sector's flag itself.
//
// race-local-yellow.json session: flag "yellow", no FCY/SC, sector_flags [green, yellow, green].

const chip = (container) =>
  container.querySelector('[data-testid="racecontrol-sector-yellow"]')
const chipText = (container) => chip(container)?.textContent.replace(/\s+/g, ' ').trim() ?? null
const root = (container) => container.querySelector('[data-testid="racecontrol-status"]')

function renderSession(session) {
  return render(RaceControlStatus, { props: { session, mode: 'race' } })
}

describe('RaceControlStatus sector yellows (rule 44)', () => {
  it('names the yellow sector from the fixture', () => {
    const { container } = renderSession(localYellow.session)
    expect(chipText(container)).toBe('YELLOW S2')
  })

  it('lists several yellow sectors in ascending order in one chip', () => {
    const { container } = renderSession({ sector_flags: ['yellow', 'green', 'yellow'] })
    expect(chipText(container)).toBe('YELLOW S1 S3')
    expect(container.querySelectorAll('[data-testid="racecontrol-sector-yellow"]')).toHaveLength(1)
  })

  it('reads "yellow" trimmed and case-insensitively', () => {
    const { container } = renderSession({ sector_flags: ['green', ' Yellow ', 'YELLOW'] })
    expect(chipText(container)).toBe('YELLOW S2 S3')
  })

  it('treats any other entry as not yellow, and keeps sector numbers by index', () => {
    const { container } = renderSession({
      sector_flags: ['none', 5, 'double_yellow', null, 'yellow'],
    })
    expect(chipText(container)).toBe('YELLOW S5')
  })

  it('the chip alone is content: renders with no flag, FCY or SC', () => {
    const { container } = renderSession({ sector_flags: ['green', 'yellow'] })
    expect(root(container)).not.toBeNull()
    expect(chipText(container)).toBe('YELLOW S2')
    expect(container.querySelector('[data-testid="racecontrol-flag"]')).toBeNull()
  })

  it('shows beside a yellow flag, independently of it', () => {
    const { container } = renderSession(localYellow.session)
    const flag = container.querySelector('[data-testid="racecontrol-flag"]')
    expect(flag?.textContent).toContain('YELLOW FLAG')
    expect(chipText(container)).toBe('YELLOW S2')
  })

  it('does not start the caution pulse', () => {
    const { container } = renderSession(localYellow.session)
    expect(chipText(container)).toBe('YELLOW S2')
    expect(root(container).classList.contains('bc-racecontrol--caution')).toBe(false)
  })

  it.each([
    ['full-course yellow', { full_course_yellow: true }, 'racecontrol-fcy'],
    ['safety car', { safety_car: true }, 'racecontrol-sc'],
  ])('steps aside under a %s', async (_label, caution, badge) => {
    const view = renderSession(localYellow.session)
    expect(chipText(view.container)).toBe('YELLOW S2')
    await view.rerender({ session: { ...localYellow.session, ...caution }, mode: 'race' })
    expect(chip(view.container)).toBeNull()
    expect(view.container.querySelector(`[data-testid="${badge}"]`)).not.toBeNull()
    await view.rerender({ session: localYellow.session, mode: 'race' })
    expect(chipText(view.container)).toBe('YELLOW S2')
  })

  it('renders nothing for all-green sectors with no flag, FCY or SC', async () => {
    // Positive control first: the same props with one yellow sector do render.
    const view = renderSession({ sector_flags: ['green', 'yellow', 'green'] })
    expect(root(view.container)).not.toBeNull()
    await view.rerender({ session: { sector_flags: ['green', 'green', 'green'] }, mode: 'race' })
    expect(root(view.container)).toBeNull()
  })

  it.each([
    ['all green', ['green', 'green', 'green']],
    ['an empty array', []],
    ['null', null],
    ['a string, not an array', 'yellow'],
  ])('shows no chip for %s', (_label, sectorFlags) => {
    const { container } = renderSession({ flag: 'green', sector_flags: sectorFlags })
    expect(chip(container)).toBeNull()
    // The rest of the strip is unaffected.
    expect(container.querySelector('[data-testid="racecontrol-flag"]')?.textContent).toContain(
      'GREEN FLAG',
    )
  })
})
