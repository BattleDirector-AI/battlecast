// Standalone `/onboard` route (#61, widgets.md rules 56 + 58): with no saved profile the
// route uses the default `driverInfo` (name, number, position), and the identity strip
// renders on the subject alone when the feed carries no `subject.telemetry`.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import OnBoardHudPage from './OnBoardHudPage.svelte'
import { FakeEventSource } from '../../lib/testing/fakeEventSource.js'
import driverSubjectB from '../../../../spec/v1/fixtures/driver-subject-b.json'
import raceOnboard from '../../../../spec/v1/fixtures/race-onboard-telemetry.json'

beforeEach(() => {
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function renderWith(snapshot) {
  const view = render(OnBoardHudPage)
  FakeEventSource.last.emit('state', { data: JSON.stringify(snapshot) })
  await tick()
  return view
}

const text = (container, testid) =>
  container.querySelector(`[data-testid="${testid}"]`)?.textContent.trim() ?? null

describe('/onboard standalone route — identity strip (#61)', () => {
  it('renders ON BOARD, P3 and the name for driver-subject-b.json, which has no telemetry', async () => {
    const { container } = await renderWith(driverSubjectB)
    expect(
      container.querySelector('[data-testid="onboard-hud"]'),
      'identity strip must render with no subject.telemetry',
    ).not.toBeNull()
    expect(text(container, 'onboard-label')).toBe('ON BOARD')
    expect(text(container, 'onboard-driver-position')).toBe('P3')
    expect(text(container, 'onboard-driver-name')).toBe('C. Leclerc')
    expect(container.querySelector('[data-testid="onboard-speed"]')).toBeNull()
  })

  it('shows position by default next to the live telemetry (race-onboard-telemetry.json)', async () => {
    const { container } = await renderWith(raceOnboard)
    // The feed arrived (telemetry + the existing default fields render)...
    expect(container.querySelector('[data-testid="onboard-speed"]').textContent).toContain('247')
    expect(text(container, 'onboard-driver-number')).toBe('1')
    // ...and position is on by default.
    expect(text(container, 'onboard-driver-position')).toBe('P2')
  })
})
