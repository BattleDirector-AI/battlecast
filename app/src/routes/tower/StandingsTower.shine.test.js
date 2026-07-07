import { describe, it, expect } from 'vitest'
// Vite `?raw`: the component source, so the test can assert its CSS contract. The
// test env (happy-dom) runs no CSS animations, so the *shape* of the reveal (a
// directional sweep vs. a box-shadow glow) is only observable in the source.
import source from './StandingsTower.svelte?raw'

// #73 (tower half): the on-camera re-cut reveal used to animate only `box-shadow`
// (a mint glow that faded in and out) — it read as a static "glow / grow", not the
// skewed bar-wipe the lower-third uses. The fix sweeps a raked mint SHINE across the
// row, matching that reveal language. This guard asserts the reveal is a directional
// sweep, so a regression back to a glow-only keyframe trips it. The node-remount
// behaviour (fresh flash element per subject) is covered in StandingsTower.motion.test.js.

/** Balanced-brace body of `@keyframes <name> { … }`, whitespace-stripped. Handles
 *  one level of nesting (the per-offset frame blocks). */
function keyframesBody(name) {
  const m = new RegExp(
    String.raw`@keyframes\s+${name}\s*\{((?:[^{}]|\{[^{}]*\})*)\}`,
  ).exec(source)
  return m ? m[1].replace(/\s+/g, '') : null
}

// The keyframe name the on-camera flash overlay animates (on the element or its
// ::before pseudo). Tolerates whitespace/pseudo between selector and `animation:`.
const flashKeyframe = (
  /\.row__oncam-flash(?:::before)?\s*\{[^}]*?animation:\s*([\w-]+)/s.exec(source) || []
)[1]

describe('StandingsTower — on-camera re-cut is a shine sweep, not a glow (#73)', () => {
  it('animates the flash overlay with a named keyframe', () => {
    expect(flashKeyframe).toBeTruthy()
  })

  it('sweeps directionally (translateX) rather than only pulsing a box-shadow', () => {
    const body = keyframesBody(flashKeyframe)
    expect(body).toBeTruthy()
    // A wipe moves; a glow does not. This is the crux of the fix.
    expect(body).toMatch(/translateX/)
    // Guard against the reveal being a box-shadow-only glow again.
    expect(body).not.toMatch(/box-shadow/)
  })

  it('drops the retired box-shadow glow keyframe', () => {
    expect(/@keyframes\s+row-oncam-flash\b/.test(source)).toBe(false)
  })

  it('gates the sweep to full motion (data-motion) so reduced motion stays instant', () => {
    // The ::before that carries the shine (incl. its `content`) must be gated to FULL
    // motion via the root `data-motion` attribute (see lib/motion.js), NOT the OS
    // `prefers-reduced-motion` media query — so it still sweeps in OBS (whose CEF reports
    // `reduce`), while `data-motion="reduced"` generates no sweeping element at all.
    // Capture the gated ::before rule body so moving it out of the gate trips this.
    const body = (
      /:not\(\[data-motion='reduced'\]\)[^{]*\.row__oncam-flash::before\s*\{([^}]*)\}/s.exec(
        source,
      ) || []
    )[1]
    expect(body).toBeTruthy()
    // The generated element itself must be gated, not just its animation.
    expect(body).toMatch(/content:/)
    expect(body).toMatch(/animation:\s*row-oncam-shine/)
    // Not gated on the OS media query anymore (OBS would suppress it).
    expect(source).not.toMatch(/@media\s*\(prefers-reduced-motion/)
  })
})
