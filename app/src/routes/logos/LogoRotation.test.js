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
  vi.unstubAllGlobals()
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
    // Full-motion path drives the three reveal keyframes, each on its OWN element (a
    // mis-wire — e.g. slide on the img — must fail). Motion is gated on the root
    // `data-motion` attribute (see lib/motion.js), NOT the OS `prefers-reduced-motion`
    // media query — so the reveal still plays in OBS (whose CEF reports `reduce`). The
    // plain fade is only the `:root[data-motion='reduced']` fallback.
    expect(source).toMatch(/:not\(\[data-motion='reduced'\]\)[^{]*\.bc-logos__reveal\s*\{[^}]*animation:\s*bc-logo-slide/s)
    expect(source).toMatch(/:not\(\[data-motion='reduced'\]\)[^{]*\.bc-logos__img\s*\{[^}]*animation:\s*bc-logo-wipe/s)
    expect(source).toMatch(/:not\(\[data-motion='reduced'\]\)[^{]*\.bc-logos__shine\s*\{[^}]*animation:\s*bc-logo-bar/s)
    // The old behaviour (fading the image in on every switch) must be gone; the fade
    // survives only inside the reduced-motion rule, and the OS media query is not used.
    expect(source).toMatch(/:root\[data-motion='reduced'\][^{]*\.bc-logos__img\s*\{[^}]*animation:\s*bc-logo-fade/s)
    expect(source).not.toMatch(/@media\s*\(prefers-reduced-motion/)
  })

  it('defines the reveal keyframes it references', () => {
    for (const kf of ['bc-logo-slide', 'bc-logo-wipe', 'bc-logo-bar']) {
      expect(new RegExp(String.raw`@keyframes\s+${kf}\b`).test(source)).toBe(true)
    }
  })
})

describe('LogoRotation — reveal confined to the logo, sweeps full width, and exits (#85)', () => {
  // The test env (happy-dom) runs no CSS animations, so the geometry fixes are only
  // checkable against the source; the exit hand-off is observable in the DOM.

  it('sizes the reveal to the image (fit-content), not the full slot', () => {
    // Confining the reveal to the logo box is what keeps the shine/wipe off the
    // empty slot space beside a small logo. Pre-fix this rule was `width: 100%`.
    const reveal = /\.bc-logos__reveal\s*\{([^}]*)\}/.exec(source)?.[1] || ''
    expect(reveal).toMatch(/\bwidth:\s*fit-content/)
    expect(reveal).not.toMatch(/(?<![a-z-])width:\s*100%/)
  })

  it('sweeps the shine bar fully across and off the right edge', () => {
    // The 34%-wide bar (left:-20%) must translate far enough to clear the right
    // edge, not stall mid-box at the old 165%. At 360%: -20% + 0.34·360% = 102.4% > 100%.
    const bar = /@keyframes\s+bc-logo-bar\s*\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(source)?.[1] || ''
    const end = /100%\s*\{[^}]*translateX\(\s*(\d+)%/.exec(bar)
    expect(end).toBeTruthy()
    expect(Number(end[1])).toBeGreaterThanOrEqual(300)
  })

  it('defines and wires the exit (wipe-out + bar-out) keyframes under full motion', () => {
    for (const kf of ['bc-logo-wipe-out', 'bc-logo-bar-out']) {
      expect(new RegExp(String.raw`@keyframes\s+${kf}\b`).test(source)).toBe(true)
    }
    // Gated to full motion via the root `data-motion` attribute, not the OS media query.
    expect(source).toMatch(
      /:not\(\[data-motion='reduced'\]\)[^{]*\.bc-logos__reveal--leaving\s+\.bc-logos__img\s*\{[^}]*animation:\s*bc-logo-wipe-out/s,
    )
    expect(source).toMatch(
      /:not\(\[data-motion='reduced'\]\)[^{]*\.bc-logos__reveal--leaving\s+\.bc-logos__shine--out\s*\{[^}]*animation:\s*bc-logo-bar-out/s,
    )
  })

  it('plays an exit: on switch the previous logo wipes out on its own layer while the new one enters', async () => {
    // Tests default to reduced motion (the instant-swap path); force full motion via the
    // root `data-motion` attribute so the exit choreography (the thing under test) runs.
    document.documentElement.dataset.motion = 'full'
    const { getByTestId, queryByTestId, container } = render(LogoRotation, {
      rotation: { images: ['/logos/a.png', '/logos/b.png'], perSlotSeconds: 5 },
    })
    await tick()
    // First paint: no exit layer, and the entrance is not held back.
    expect(shownSrc(getByTestId)).toBe('/logos/a.png')
    expect(queryByTestId('logo-leaving')).toBeNull()
    expect(
      container.querySelector('.bc-logos__reveal:not(.bc-logos__reveal--leaving)').getAttribute('style'),
    ).toMatch(/--enter-delay:\s*0ms/)

    await vi.advanceTimersByTimeAsync(5000)
    await tick()
    // The incoming logo is shown at once (so it reflects the carousel), while the
    // OUTGOING one lingers on the leaving layer playing its wipe-out...
    expect(shownSrc(getByTestId)).toBe('/logos/b.png')
    expect(getByTestId('logo-leaving').getAttribute('src')).toBe('/logos/a.png')
    // ...and the entrance is held back until that exit finishes.
    expect(
      container.querySelector('.bc-logos__reveal:not(.bc-logos__reveal--leaving)').getAttribute('style'),
    ).toMatch(/--enter-delay:\s*[1-9]\d*ms/)

    // Once the exit window elapses, the leaving layer is torn down.
    await vi.advanceTimersByTimeAsync(400)
    await tick()
    expect(queryByTestId('logo-leaving')).toBeNull()
    expect(shownSrc(getByTestId)).toBe('/logos/b.png')
  })

  it('a second switch within the exit window re-targets the leaving layer (no stale teardown)', async () => {
    document.documentElement.dataset.motion = 'full'
    // perSlotSeconds 0.2s (200ms) < EXIT_MS (340ms), so switches arrive faster than a
    // leaving layer's teardown — the controller must cancel the prior teardown timer
    // and re-target `leaving`, or the departing logo vanishes early / a stale timer
    // nulls the wrong image.
    const { getByTestId } = render(LogoRotation, {
      rotation: { images: ['/logos/a.png', '/logos/b.png'], perSlotSeconds: 0.2 },
    })
    await tick()
    expect(shownSrc(getByTestId)).toBe('/logos/a.png')

    await vi.advanceTimersByTimeAsync(200) // A -> B; A leaves (teardown armed @540ms)
    await tick()
    expect(getByTestId('logo-leaving').getAttribute('src')).toBe('/logos/a.png')

    await vi.advanceTimersByTimeAsync(200) // B -> A @400ms; must cancel A's teardown, B now leaves
    await tick()
    expect(shownSrc(getByTestId)).toBe('/logos/a.png')
    expect(getByTestId('logo-leaving').getAttribute('src')).toBe('/logos/b.png')

    // At 550ms the FIRST switch's teardown (540ms) would have fired if it were not
    // cancelled, nulling the current (B) leaving layer early. It must still be present.
    await vi.advanceTimersByTimeAsync(150)
    await tick()
    expect(getByTestId('logo-leaving').getAttribute('src')).toBe('/logos/b.png')
  })

  it('reduced motion swaps instantly — no exit layer', async () => {
    document.documentElement.dataset.motion = 'reduced'
    const { getByTestId, queryByTestId } = render(LogoRotation, {
      rotation: { images: ['/logos/a.png', '/logos/b.png'], perSlotSeconds: 4 },
    })
    await tick()
    await vi.advanceTimersByTimeAsync(4000)
    await tick()
    // The new logo is shown, but nothing wipes out — the swap is a plain fallback.
    expect(shownSrc(getByTestId)).toBe('/logos/b.png')
    expect(queryByTestId('logo-leaving')).toBeNull()
  })
})
