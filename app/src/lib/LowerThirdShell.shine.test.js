import { describe, it, expect } from 'vitest'
// Vite `?raw` import: the component's source text, so the test can assert its CSS
// contract directly (see the block comment below for why source, not render).
import source from './LowerThirdShell.svelte?raw'

// Regression guard for the lower-third EXIT shine bar (bug: the mint sweep played
// on entrance but not on exit).
//
// Root cause: the entrance bar animation finishes pinned at its 100% frame
// (`animation-fill-mode: both`). The exit rule re-timed the SAME keyframe name
// (`lt3-bar`), so the browser saw the same, already-finished animation and never
// restarted it — the shine did not sweep out. The plate/content wipes replay only
// because they use DISTINCT `*-out` keyframe names; the bar must do the same.
//
// Why this is a source-contract test and not a rendered-motion one: the test
// environment (happy-dom) implements no CSS animation engine, so nothing here can
// observe a keyframe actually running. The regression is therefore expressed as a
// CSS *contract* — the exit shine bar must reference a keyframe name distinct from
// the entrance bar's, and that keyframe must be defined. This assertion goes red on
// the pre-fix source and green after. See tmp/lower-third-wipe-bench.html for the
// visual repro that proves the runtime behaviour.

/** Pull the `animation:` shorthand's first token (the animation-name) out of the
 *  first CSS rule whose selector matches `selectorRe`. */
function animationNameFor(selectorRe) {
  const rule = new RegExp(
    selectorRe.source + String.raw`\s*\{[^}]*?animation:\s*([\w-]+)`,
    's',
  ).exec(source)
  return rule ? rule[1] : null
}

/** Body of an `@keyframes <name> { … }` block, normalized (whitespace stripped)
 *  so two blocks can be compared frame-for-frame. Matches one level of nested
 *  braces (the per-offset frame blocks). */
function keyframesBody(name) {
  const m = new RegExp(
    String.raw`@keyframes\s+${name}\s*\{((?:[^{}]|\{[^{}]*\})*)\}`,
  ).exec(source)
  return m ? m[1].replace(/\s+/g, '') : null
}

describe('LowerThirdShell — exit shine bar replays (distinct keyframe)', () => {
  const entranceBar = animationNameFor(/\.lt3__bar/)
  const exitBar = animationNameFor(/\.lt3:global\(\.lt3--exit\)\s*\.lt3__bar/)

  it('resolves both the entrance and exit shine-bar animations', () => {
    expect(entranceBar).toBeTruthy()
    expect(exitBar).toBeTruthy()
  })

  it('uses a DISTINCT keyframe name for the exit sweep (so it actually restarts)', () => {
    // The exact bug: both were `lt3-bar`, so the exit sweep never replayed.
    expect(exitBar).not.toBe(entranceBar)
  })

  it('defines the exit @keyframes it references', () => {
    expect(new RegExp(String.raw`@keyframes\s+${exitBar}\b`).test(source)).toBe(true)
  })

  // The exit sweep must LOOK identical to the entrance sweep — only the keyframe
  // NAME differs (so the browser restarts it). The two blocks are hand-duplicated
  // because CSS cannot alias @keyframes, so guard against silent frame drift.
  it('keeps the entrance and exit shine frames identical (only the name differs)', () => {
    const entranceFrames = keyframesBody(entranceBar)
    const exitFrames = keyframesBody(exitBar)
    expect(entranceFrames).toBeTruthy()
    expect(exitFrames).toBeTruthy()
    expect(exitFrames).toBe(entranceFrames)
  })
})
