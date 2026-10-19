/* widgets.md rule 18: the #21 lower-third shows a position only for a positive integer. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import DriverLowerThird from './DriverLowerThird.svelte'
import subjectA from '../../../../spec/v1/fixtures/driver-subject-a.json'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const card = (c) => c.querySelector('[data-testid="driver-lower-third"]')
const nameOf = (c) => c.querySelector('[data-testid="driver-lt-name"]')?.textContent.trim()
const posOf = (c) => c.querySelector('[data-testid="driver-lt-pos"]')?.textContent.trim() ?? null

function withSubjectPosition(position) {
  const snap = JSON.parse(JSON.stringify(subjectA))
  const v = snap.vehicles.find((x) => x.slot_id === snap.subject.slot_id)
  if (position === undefined) delete v.position
  else v.position = position
  return snap
}

describe('driver lower-third position (rule 18)', () => {
  it('the fixture subject resolves, so the cases below are not vacuous', async () => {
    const { container } = render(DriverLowerThird, { snapshot: withSubjectPosition(4), widget: {} })
    await tick()
    expect(card(container)?.getAttribute('data-state')).toBe('valid')
    expect(posOf(container)).toBe('P4')
  })

  it.each([
    ['0', 0],
    ['a negative number', -2],
    ['a fraction', 2.5],
    ['a numeric string', '3'],
    ['NaN', Number.NaN],
    ['a boolean', true],
  ])('shows no position for %s, and the rest of the card as normal', async (_label, position) => {
    const { container } = render(DriverLowerThird, { snapshot: withSubjectPosition(position), widget: {} })
    await tick()
    expect(card(container), 'the card still renders').not.toBeNull()
    expect(posOf(container)).toBeNull()
    expect(nameOf(container)).toBe('Hamilton')
    expect(container.textContent).toContain('GT3')
  })

  it.each([
    ['null', null],
    ['absent', undefined],
  ])('shows no position when it is %s', async (_label, position) => {
    const { container } = render(DriverLowerThird, { snapshot: withSubjectPosition(position), widget: {} })
    await tick()
    expect(card(container)).not.toBeNull()
    expect(posOf(container)).toBeNull()
    expect(nameOf(container)).toBe('Hamilton')
  })
})
