import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import LogoRotation, { buildSequence } from './LogoRotation.svelte'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  cleanup()
})

const shownSrc = (getByTestId) => getByTestId('logo-image').getAttribute('src')

describe('LogoRotation — timed sponsor carousel (#33)', () => {
  it('shows the first image immediately and advances on the configured timer', async () => {
    const { getByTestId } = render(LogoRotation, {
      rotation: {
        images: ['/logos/a.png', '/logos/b.png', '/logos/c.png'],
        perSlotSeconds: 5,
        order: 'sequential',
      },
    })
    await tick()
    expect(shownSrc(getByTestId)).toBe('/logos/a.png')

    await vi.advanceTimersByTimeAsync(5000)
    await tick()
    expect(shownSrc(getByTestId)).toBe('/logos/b.png')

    await vi.advanceTimersByTimeAsync(5000)
    await tick()
    expect(shownSrc(getByTestId)).toBe('/logos/c.png')

    // Wraps back to the start after the last slot.
    await vi.advanceTimersByTimeAsync(5000)
    await tick()
    expect(shownSrc(getByTestId)).toBe('/logos/a.png')
  })

  it('does not advance before a full slot has elapsed', async () => {
    const { getByTestId } = render(LogoRotation, {
      rotation: { images: ['/logos/a.png', '/logos/b.png'], perSlotSeconds: 8 },
    })
    await tick()
    expect(shownSrc(getByTestId)).toBe('/logos/a.png')

    await vi.advanceTimersByTimeAsync(7999)
    await tick()
    expect(shownSrc(getByTestId)).toBe('/logos/a.png')
  })

  it('holds a single image without cycling', async () => {
    const { getByTestId } = render(LogoRotation, {
      rotation: { images: ['/logos/solo.png'], perSlotSeconds: 2 },
    })
    await tick()
    expect(shownSrc(getByTestId)).toBe('/logos/solo.png')

    await vi.advanceTimersByTimeAsync(10000)
    await tick()
    expect(shownSrc(getByTestId)).toBe('/logos/solo.png')
  })

  it('renders an explicit idle state when no images are configured', async () => {
    const { getByTestId, queryByTestId } = render(LogoRotation, { rotation: { images: [] } })
    await tick()
    expect(getByTestId('logos-empty')).toBeTruthy()
    expect(queryByTestId('logo-image')).toBeNull()
  })

  it('drops malformed (non-string / blank) image entries', async () => {
    const { getByTestId } = render(LogoRotation, {
      rotation: { images: ['', null, '/logos/real.png', '   '], perSlotSeconds: 3 },
    })
    await tick()
    // Only the one real URL survives, so it is shown and never cycles off.
    expect(shownSrc(getByTestId)).toBe('/logos/real.png')
    await vi.advanceTimersByTimeAsync(6000)
    await tick()
    expect(shownSrc(getByTestId)).toBe('/logos/real.png')
  })

  it('shows every image over a full shuffle cycle', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // deterministic permutation
    const images = ['/logos/a.png', '/logos/b.png', '/logos/c.png']
    const { getByTestId } = render(LogoRotation, {
      rotation: { images, perSlotSeconds: 1, order: 'shuffle' },
    })
    await tick()

    const seen = new Set([shownSrc(getByTestId)])
    for (let i = 0; i < images.length - 1; i++) {
      await vi.advanceTimersByTimeAsync(1000)
      await tick()
      seen.add(shownSrc(getByTestId))
    }
    expect(seen).toEqual(new Set(images))
  })
})

describe('buildSequence', () => {
  it('walks 0..n-1 for sequential order', () => {
    expect(buildSequence(4, 'sequential')).toEqual([0, 1, 2, 3])
  })

  it('returns a permutation containing every index for shuffle', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect([...buildSequence(5, 'shuffle')].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
  })

  it('handles the empty set', () => {
    expect(buildSequence(0, 'sequential')).toEqual([])
  })
})
