import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import OnBoardHud, {
  resolveTelemetry,
  gearLabel,
  speedLabel,
  convertSpeed,
  unitLabel,
  resolveIdentity,
} from './OnBoardHud.svelte'
// Component source, for the CSS-contract assertion on the reduced-motion transition
// gate (happy-dom runs no CSS, so it can only be checked in source — mirrors
// RaceControlStatus.test.js's technique for the same class of assertion).
import source from './OnBoardHud.svelte?raw'

import fullTelemetry from '../../../../spec/v1/fixtures/race-onboard-telemetry.json'
import partialTelemetry from '../../../../spec/v1/fixtures/race-onboard-partial.json'

afterEach(() => cleanup())

function hudRoot(container) {
  return container.querySelector('[data-testid="onboard-hud"]')
}

describe('OnBoardHud — throttle / brake / speed / gear from live telemetry', () => {
  it('renders all four inputs from the full fixture (race-onboard-telemetry.json)', () => {
    const { container } = render(OnBoardHud, {
      props: { telemetry: fullTelemetry.subject.telemetry, mode: fullTelemetry.mode },
    })
    expect(hudRoot(container)).not.toBeNull()

    // Bars fill to their [0,1] value as a percentage width.
    const throttleFill = container.querySelector('[data-testid="onboard-throttle-fill"]')
    const brakeFill = container.querySelector('[data-testid="onboard-brake-fill"]')
    expect(throttleFill.style.width).toBe('82%')
    expect(brakeFill.style.width).toBe('0%')

    // Speed rounded numeral + gear verbatim.
    expect(container.querySelector('[data-testid="onboard-speed"]').textContent).toContain('247')
    expect(container.querySelector('[data-testid="onboard-gear"]').textContent).toContain('6')
  })

  it('renders only the fields present in a partial fixture (throttle + speed, no brake/gear)', () => {
    const { container } = render(OnBoardHud, {
      props: { telemetry: partialTelemetry.subject.telemetry, mode: partialTelemetry.mode },
    })
    expect(hudRoot(container)).not.toBeNull()

    const throttleFill = container.querySelector('[data-testid="onboard-throttle-fill"]')
    expect(throttleFill.style.width).toBe('35%')
    // Brake and gear were omitted from the fixture -> their elements are absent, not zeroed.
    expect(container.querySelector('[data-testid="onboard-brake"]')).toBeNull()
    expect(container.querySelector('[data-testid="onboard-gear"]')).toBeNull()
    expect(container.querySelector('[data-testid="onboard-speed"]').textContent).toContain('96')
  })

  it('renders N for neutral gear (0) and R for reverse (-1)', () => {
    const neutral = render(OnBoardHud, { props: { telemetry: { gear: 0 } } })
    expect(neutral.container.querySelector('[data-testid="onboard-gear"]').textContent).toContain('N')
    cleanup()

    const reverse = render(OnBoardHud, { props: { telemetry: { gear: -1 } } })
    expect(reverse.container.querySelector('[data-testid="onboard-gear"]').textContent).toContain('R')
  })

  it('clamps out-of-range bar values into [0, 1]', () => {
    const { container } = render(OnBoardHud, {
      props: { telemetry: { throttle: 1.4, brake: -0.3 } },
    })
    expect(container.querySelector('[data-testid="onboard-throttle-fill"]').style.width).toBe('100%')
    expect(container.querySelector('[data-testid="onboard-brake-fill"]').style.width).toBe('0%')
  })

  it('rounds a fractional speed to a whole numeral', () => {
    const { container } = render(OnBoardHud, { props: { telemetry: { speed: 246.7 } } })
    expect(container.querySelector('[data-testid="onboard-speed"]').textContent).toContain('247')
  })
})

describe('OnBoardHud — speed unit (km/h default, mph on request)', () => {
  it('defaults to km/h: renders the canonical value with a KM/H label', () => {
    const { container } = render(OnBoardHud, { props: { telemetry: { speed: 247 } } })
    expect(container.querySelector('[data-testid="onboard-speed"]').textContent).toContain('247')
    expect(container.querySelector('[data-testid="onboard-speed-unit"]').textContent).toBe('KM/H')
  })

  it('converts to mph when speedUnit is "mph" (247 km/h -> 153 mph)', () => {
    const { container } = render(OnBoardHud, {
      props: { telemetry: { speed: 247 }, speedUnit: 'mph' },
    })
    // 247 * 0.621371 = 153.48... -> 153
    expect(container.querySelector('[data-testid="onboard-speed"]').textContent).toContain('153')
    expect(container.querySelector('[data-testid="onboard-speed-unit"]').textContent).toBe('MPH')
  })

  it('leaves the canonical km/h value unchanged under the default unit', () => {
    const { container } = render(OnBoardHud, {
      props: { telemetry: { speed: 247 }, speedUnit: 'kmh' },
    })
    expect(container.querySelector('[data-testid="onboard-speed"]').textContent).toContain('247')
    expect(container.querySelector('[data-testid="onboard-speed-unit"]').textContent).toBe('KM/H')
  })
})

describe('OnBoardHud — empty / absent telemetry (dumb overlay, never crashes)', () => {
  it('renders nothing for null telemetry (no snapshot / no telemetry yet)', () => {
    const { container } = render(OnBoardHud, { props: { telemetry: null, mode: null } })
    expect(hudRoot(container)).toBeNull()
    expect(container.textContent.trim()).toBe('')
  })

  it('renders nothing when no props are passed at all', () => {
    const { container } = render(OnBoardHud)
    expect(hudRoot(container)).toBeNull()
  })

  it('renders nothing for a telemetry object with no usable fields', () => {
    const { container } = render(OnBoardHud, { props: { telemetry: {} } })
    expect(hudRoot(container)).toBeNull()
  })

  it('never throws on malformed / garbage field types', () => {
    expect(() =>
      render(OnBoardHud, {
        props: {
          telemetry: { throttle: 'abc', brake: {}, speed: 'fast', gear: [] },
        },
      }),
    ).not.toThrow()
    // All four are garbage -> nothing usable -> renders nothing.
    cleanup()
    const { container } = render(OnBoardHud, {
      props: { telemetry: { throttle: 'abc', brake: {}, speed: 'fast', gear: [] } },
    })
    expect(hudRoot(container)).toBeNull()
  })
})

describe('resolveTelemetry / gearLabel / speedLabel helpers', () => {
  it('normalizes and clamps a full telemetry block', () => {
    expect(resolveTelemetry({ throttle: 0.82, brake: 0, speed: 247, gear: 6 })).toEqual({
      throttle: 0.82,
      brake: 0,
      speed: 247,
      gear: 6,
    })
  })

  it('clamps bar values and truncates a fractional gear', () => {
    expect(resolveTelemetry({ throttle: 2, brake: -1, gear: 4.9 })).toMatchObject({
      throttle: 1,
      brake: 0,
      gear: 4,
    })
  })

  it('drops garbage fields to null but keeps a usable partial', () => {
    const t = resolveTelemetry({ throttle: 0.5, brake: 'x', speed: null, gear: undefined })
    expect(t).toMatchObject({ throttle: 0.5, brake: null, speed: null, gear: null })
  })

  it('returns null when there is nothing usable to show', () => {
    expect(resolveTelemetry(null)).toBeNull()
    expect(resolveTelemetry(undefined)).toBeNull()
    expect(resolveTelemetry('nope')).toBeNull()
    expect(resolveTelemetry({})).toBeNull()
    expect(resolveTelemetry({ throttle: 'x', gear: {} })).toBeNull()
  })

  it('labels gear per broadcast convention (N / R / verbatim)', () => {
    expect(gearLabel(0)).toBe('N')
    expect(gearLabel(-1)).toBe('R')
    expect(gearLabel(7)).toBe('7')
    expect(gearLabel(null)).toBeNull()
  })

  it('rounds speed to a whole numeral (km/h by default)', () => {
    expect(speedLabel(246.7)).toBe('247')
    expect(speedLabel(0)).toBe('0')
    expect(speedLabel(null)).toBeNull()
  })

  it('converts canonical km/h to the requested display unit', () => {
    expect(convertSpeed(247, 'kmh')).toBe(247)
    expect(convertSpeed(247, 'mph')).toBeCloseTo(153.48, 1)
    expect(convertSpeed(100, 'mph')).toBeCloseTo(62.14, 1)
    expect(convertSpeed(null, 'mph')).toBeNull()
    // Absent/unknown unit is treated as km/h (the canonical default).
    expect(convertSpeed(247)).toBe(247)
    expect(convertSpeed(247, 'bogus')).toBe(247)
  })

  it('rounds the converted value in speedLabel', () => {
    expect(speedLabel(247, 'mph')).toBe('153')
    expect(speedLabel(247, 'kmh')).toBe('247')
  })

  it('labels the display unit', () => {
    expect(unitLabel('kmh')).toBe('KM/H')
    expect(unitLabel('mph')).toBe('MPH')
    expect(unitLabel(undefined)).toBe('KM/H')
    expect(unitLabel('bogus')).toBe('KM/H')
  })
})

describe('OnBoardHud — motion discipline (mirrors the codebase gating)', () => {
  const noPref = /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(
    source,
  )?.[1]

  it('gates the bar transition to no-preference (snaps under reduced motion)', () => {
    expect(noPref).toBeTruthy()
    expect(noPref).toMatch(/\.bc-onboard__fill\s*\{[^}]*transition:\s*width/s)
    // The bare (ungated) fill rule must NOT carry a transition.
    expect(
      /\.bc-onboard__fill\s*\{[^}]*transition:/s.test(
        source.replace(noPref, ''),
      ),
    ).toBe(false)
  })
})

describe('resolveIdentity — driver/vehicle identity from the subject + field', () => {
  const snap = {
    subject: { slot_id: 'car-1', driver_name: 'Max Verstappen' },
    vehicles: [
      {
        slot_id: 'car-1',
        driver_name: 'Max Verstappen',
        vehicle_class: 'GTP',
        car_number: '1',
        make: 'Red Bull',
        model: 'RB20',
      },
    ],
  }

  it('returns only the ENABLED and PRESENT fields, with the name formatted', () => {
    // fmtName abbreviates to 'Initial. Surname'; the uppercase look is CSS, not text.
    expect(resolveIdentity(snap, { driverInfo: { name: true, number: true } })).toEqual({
      name: 'M. Verstappen',
      number: '1',
    })
  })

  it('includes class / make / model when toggled on', () => {
    expect(resolveIdentity(snap, { driverInfo: { class: true, make: true, model: true } })).toEqual({
      class: 'GTP',
      make: 'Red Bull',
      model: 'RB20',
    })
  })

  it('returns null when no fields are enabled', () => {
    expect(resolveIdentity(snap, { driverInfo: {} })).toBeNull()
  })

  it('returns null when enabled fields are absent from the data', () => {
    const bare = { subject: { slot_id: 'x' }, vehicles: [] }
    expect(resolveIdentity(bare, { driverInfo: { name: true, number: true } })).toBeNull()
  })

  it('tolerates missing subject / vehicles / garbage without throwing', () => {
    expect(resolveIdentity(null, { driverInfo: { name: true } })).toBeNull()
    expect(resolveIdentity({ subject: null }, { driverInfo: { name: true } })).toBeNull()
    expect(() =>
      resolveIdentity({ subject: { slot_id: 'a', driver_name: 'x' }, vehicles: 'nope' }, {}),
    ).not.toThrow()
  })
})

describe('OnBoardHud — driver/vehicle identity strip', () => {
  it('renders the identity fields it is handed', () => {
    const { container } = render(OnBoardHud, {
      props: {
        telemetry: { speed: 200, gear: 5 },
        identity: { number: '1', name: 'M. VERSTAPPEN', class: 'GTP', make: 'Red Bull', model: 'RB20' },
      },
    })
    expect(container.querySelector('[data-testid="onboard-identity"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="onboard-driver-number"]').textContent).toBe('1')
    expect(container.querySelector('[data-testid="onboard-driver-name"]').textContent).toContain('VERSTAPPEN')
    expect(container.querySelector('[data-testid="onboard-driver-class"]').textContent).toContain('GTP')
    expect(container.querySelector('[data-testid="onboard-driver-car"]').textContent).toContain('Red Bull RB20')
  })

  it('renders no identity strip when identity is null, but telemetry still shows', () => {
    const { container } = render(OnBoardHud, {
      props: { telemetry: { speed: 200 }, identity: null },
    })
    expect(container.querySelector('[data-testid="onboard-identity"]')).toBeNull()
    expect(container.querySelector('[data-testid="onboard-hud"]')).not.toBeNull()
  })

  it('does not summon the HUD for identity alone (telemetry is required)', () => {
    const { container } = render(OnBoardHud, {
      props: { telemetry: null, identity: { name: 'M. VERSTAPPEN' } },
    })
    expect(container.querySelector('[data-testid="onboard-hud"]')).toBeNull()
  })
})

describe('OnBoardHud — lower-third hand-off (whole HUD waits)', () => {
  const driverWidget = { trigger: 'dwell', dwellSeconds: 6, showOnConnect: true }

  it('is suppressed on connect while the card is up, then reveals after the dwell', async () => {
    vi.useFakeTimers()
    try {
      const { container } = render(OnBoardHud, {
        props: {
          telemetry: { speed: 200, gear: 5 },
          subjectSlotId: 'car-1',
          subjectActive: true,
          driverWidget,
        },
      })
      await tick()
      // The lower-third fires on connect, so the HUD holds off.
      expect(container.querySelector('[data-testid="onboard-hud"]')).toBeNull()

      // Advance past the dwell -> the card hides -> the HUD reveals.
      vi.advanceTimersByTime(6000)
      await tick()
      expect(container.querySelector('[data-testid="onboard-hud"]')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('re-suppresses on a camera cut to a new subject, then reveals again', async () => {
    vi.useFakeTimers()
    try {
      const { container, rerender } = render(OnBoardHud, {
        props: {
          telemetry: { speed: 200, gear: 5 },
          subjectSlotId: 'car-1',
          subjectActive: true,
          driverWidget,
        },
      })
      await tick()
      vi.advanceTimersByTime(6000)
      await tick()
      expect(container.querySelector('[data-testid="onboard-hud"]')).not.toBeNull()

      // Cut to a new driver -> the card re-fires -> the HUD hides again.
      await rerender({
        telemetry: { speed: 200, gear: 5 },
        subjectSlotId: 'car-2',
        subjectActive: true,
        driverWidget,
      })
      await tick()
      expect(container.querySelector('[data-testid="onboard-hud"]')).toBeNull()

      vi.advanceTimersByTime(6000)
      await tick()
      expect(container.querySelector('[data-testid="onboard-hud"]')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not wait when no driverWidget is supplied (no gate)', async () => {
    const { container } = render(OnBoardHud, {
      props: {
        telemetry: { speed: 200, gear: 5 },
        subjectSlotId: 'car-1',
        subjectActive: true,
        driverWidget: null,
      },
    })
    await tick()
    expect(container.querySelector('[data-testid="onboard-hud"]')).not.toBeNull()
  })
})
