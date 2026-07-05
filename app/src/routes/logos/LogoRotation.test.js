import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import LogoRotation, { buildSequence } from './LogoRotation.svelte'
// Component source, for the CSS-contract assertion on the reveal transition (the
// test env runs no CSS animations, so the skewed bar-wipe is only checkable here).
import source from './LogoRotation.svelte?raw'

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

describe('LogoRotation — switch uses the skewed bar-wipe reveal (#82)', () => {
  it('mounts a keyed reveal wrapper and a shine bar around the image', () => {
    const { getByTestId, container } = render(LogoRotation, {
      props: { rotation: { images: ['/logos/a.png', '/logos/b.png'] } },
    })
    // The image stays testable; it now lives inside the reveal wrapper with a shine.
    expect(getByTestId('logo-image')).not.toBeNull()
    const reveal = container.querySelector('.bc-logos__reveal')
    expect(reveal).not.toBeNull()
    expect(reveal.querySelector('.bc-logos__shine')).not.toBeNull()
  })

  it('binds slide→wrapper, wipe→image, bar→shine on switch (not a plain fade)', () => {
    // No-preference path drives the three reveal keyframes, each on its OWN element
    // (a mis-wire — e.g. slide on the img — must fail). The plain fade is only the
    // reduced-motion fallback. Red on the pre-fix source (which faded the image in).
    const noPref = /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(
      source,
    )?.[1]
    expect(noPref).toBeTruthy()
    expect(noPref).toMatch(/\.bc-logos__reveal\s*\{[^}]*animation:\s*bc-logo-slide/s)
    expect(noPref).toMatch(/\.bc-logos__img\s*\{[^}]*animation:\s*bc-logo-wipe/s)
    expect(noPref).toMatch(/\.bc-logos__shine\s*\{[^}]*animation:\s*bc-logo-bar/s)
    // The old behaviour (fading the image in on every switch) must be gone; the fade
    // survives only inside the reduced-motion block.
    const reduce = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(
      source,
    )?.[1]
    expect(reduce).toMatch(/animation:\s*bc-logo-fade/)
    expect(noPref).not.toMatch(/bc-logo-fade/)
  })

  it('defines the reveal keyframes it references', () => {
    for (const kf of ['bc-logo-slide', 'bc-logo-wipe', 'bc-logo-bar']) {
      expect(new RegExp(String.raw`@keyframes\s+${kf}\b`).test(source)).toBe(true)
    }
  })
})
