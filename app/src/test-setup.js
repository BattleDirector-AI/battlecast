// Global Vitest setup.
//
// Default every test to REDUCED motion. The lower-third widgets play a skewed
// bar-wipe on entrance/exit via LowerThirdShell, and the exit is a Svelte `out:`
// transition that would otherwise hold the node for ~620ms after `shown` flips
// false. Under reduced motion the transition returns duration 0 — an instant,
// synchronous unmount — so the existing behavioral tests that assert the card
// appears/disappears in lockstep with `shown` stay deterministic (no lingering
// node, no fake-timer juggling).
//
// Motion is resolved from the root `data-motion` attribute (see lib/motion.js), NOT
// the OS `prefers-reduced-motion` media query — the overlay animates by default so an
// OBS/CEF host (which reports `reduce`) still plays the reveals. Tests that exercise
// the animated path set `document.documentElement.dataset.motion = 'full'` (or remove
// the attribute) themselves; `beforeEach` resets the default so that never leaks.
import { beforeEach } from 'vitest'

const MOTION_DEFAULT = 'reduced'

function resetMotion() {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.motion = MOTION_DEFAULT
  }
}

resetMotion()
beforeEach(resetMotion)

// Legacy `matchMedia` stub — the app no longer reads it (motion goes through
// lib/motion.js / `data-motion`), but keep a benign stub so any incidental caller in
// the jsdom/happy-dom environment does not throw.
if (typeof window !== 'undefined') {
  window.matchMedia = (query) => ({
    matches: /prefers-reduced-motion:\s*reduce/.test(String(query)),
    media: String(query),
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false
    },
  })
}
