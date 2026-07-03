// Global Vitest setup.
//
// Default every test to `prefers-reduced-motion: reduce`. The lower-third
// widgets now play a skewed bar-wipe on entrance/exit via LowerThirdShell, and
// the exit is a Svelte `out:` transition that would otherwise hold the node for
// ~620ms after `shown` flips false. Under reduced motion the transition returns
// duration 0 — an instant, synchronous unmount — so the existing behavioral
// tests that assert the card appears/disappears in lockstep with `shown` stay
// deterministic (no lingering node, no fake-timer juggling). Tests that
// specifically exercise the animated path override `window.matchMedia` to report
// `no-preference` themselves.
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
