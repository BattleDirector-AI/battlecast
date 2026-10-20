// The battle box on a `vehicles[]` array holding non-object entries — widgets.md rule 59 (and
// rule 14a, which it follows). Driven from race-close-battle.json: subject car-1 Verstappen (P2,
// F1) with Hamilton ahead (P1) and Leclerc behind (P3).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import BattleBox from './BattleBox.svelte'
import closeBattle from '../../../../spec/v1/fixtures/race-close-battle.json'

afterEach(() => cleanup())

describe('rule 59 — non-object vehicles[] entries are skipped', () => {
  it.each([
    ['null', null],
    ['a number', 7],
    ['a string', 'car-1'],
  ])('renders the subject\'s class and the ahead/behind names when vehicles[] holds %s', (_label, junk) => {
    const { container } = render(BattleBox, {
      props: {
        subject: closeBattle.subject,
        relationship: closeBattle.relationship,
        vehicles: [junk, ...closeBattle.vehicles, junk],
        mode: closeBattle.mode,
      },
    })
    const text = container.textContent

    expect(text).toContain('Verstappen')
    expect(text).toContain('Hamilton')
    expect(text).toContain('Leclerc')
    expect(text).toContain('+0.4')
    expect(text).toContain('F1')
  })
})
