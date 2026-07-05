<script module>
  /**
   * True when the viewer asked the OS to minimize motion. Used to skip the
   * skewed bar-wipe entirely — the exit transition returns duration 0 (instant
   * unmount, nothing lingers) and the entrance falls back to a plain fade.
   *
   * The `typeof` guard keeps this safe under SSR / the build's prerender pass,
   * where `matchMedia` is undefined.
   */
  export function reduceMotion() {
    return (
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    )
  }

  /**
   * Svelte out-transition for the lower-third plate: on unmount, tag the node
   * with `.lt3--exit` (which drives the wipe-out + plate-out keyframes) and hold
   * it for the exit choreography's full duration (~0.6s). Under reduced motion,
   * return duration 0 — an instant, synchronous unmount — so no node lingers and
   * the overlay stays usable. Exported so it is directly unit-testable.
   *
   * Applied as `out:lowerThirdOut|global` (#68): the shell is torn down by the
   * PARENT widget's `{#if shown}` / `{#key slot}` block, and a *local* out only
   * plays when its own block is destroyed — not on ancestor teardown — so a plain
   * hide skipped the wipe-out entirely. `|global` makes it fire whenever the node
   * is removed, however far up the removal originates.
   */
  export function lowerThirdOut(node) {
    if (reduceMotion()) return { duration: 0 }
    node.classList.add('lt3--exit')
    return { duration: 620 }
  }

  /**
   * Svelte in-transition, paired with `lowerThirdOut`. Its only job is to strip a
   * stale `.lt3--exit` off the plate whenever the block toggles back on. When a
   * camera re-cut re-shows the widget DURING the ~620ms exit, Svelte cancels the
   * outro and REUSES the same DOM node — so the exit class (whose `lt3-plate-out`
   * `both`-fill keyframe pins the plate to opacity:0 / off-screen) would otherwise
   * linger and leave the re-shown graphic stuck invisible. Removing the class here
   * also lets the CSS-on-mount entrance re-fire on the reused node. Duration 0 so
   * there is no JS-driven intro (the entrance is pure CSS); on the very first mount
   * Svelte skips intros entirely, so the CSS entrance is unaffected.
   */
  export function lowerThirdIn(node) {
    node.classList.remove('lt3--exit')
    return { duration: 0 }
  }
</script>

<script>
  // Shared presentational shell for the lower-third widgets (#21 driver, #22
  // qualifying/sector). It owns the smoked-glass plate frame, the angled mint
  // shine bar, and the clipped content wrapper, and plays the approved
  // "skewed bar-wipe reveal" on entrance (mount, via CSS animation) and exit
  // (unmount, via the `out:` transition above). Each widget renders its own inner
  // layout through `children`, so all the trigger / dwell / flash logic stays in
  // the widgets — this component is motion + chrome only.
  let { children } = $props()
</script>

<div class="lt3" in:lowerThirdIn out:lowerThirdOut|global>
  <div class="lt3__inner">
    {@render children?.()}
  </div>
  <span class="lt3__bar" aria-hidden="true"></span>
</div>

<style>
  .lt3 {
    /* Choreography easings (local to the transition). */
    --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-in: cubic-bezier(0.7, 0, 0.84, 0);

    position: relative;
    box-sizing: border-box;
    /* The bar sweeps beyond the plate edges; clip it (and the content wipe) to
       the plate's rounded frame. */
    overflow: hidden;
    /* Plate chrome — the shared smoked-glass visual language of both widgets. */
    background: var(--bc-plate-dense);
    backdrop-filter: var(--bc-blur);
    -webkit-backdrop-filter: var(--bc-blur);
    border: 1px solid var(--bc-hairline);
    border-radius: var(--bc-radius);
    box-shadow: var(--bc-shadow-plate);
    color: var(--bc-text);
  }

  .lt3__inner {
    position: relative;
    /* Stays above the bar so the content reads clearly once revealed. */
    z-index: 1;
  }

  /* Bright mint shine bar, raked ~13°, that sweeps across on the way in and out.
     `screen` blend + glow makes it read as light passing over the plate. */
  .lt3__bar {
    position: absolute;
    top: -25%;
    left: -20%;
    width: 34%;
    height: 150%;
    z-index: 2;
    pointer-events: none;
    opacity: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      var(--bc-up, #7cffb2) 45%,
      var(--bc-oncam-text, #eafffb) 55%,
      transparent 100%
    );
    mix-blend-mode: screen;
    filter: blur(3px);
    box-shadow: 0 0 24px var(--bc-accent-glow, rgba(31, 224, 196, 0.28));
  }

  /* --- Entrance: plate skew-slides in, then the content wipes in behind the
     raked bar (~0.5s). Gated to no-preference so reduced-motion viewers skip it. --- */
  @media (prefers-reduced-motion: no-preference) {
    .lt3 {
      animation: lt3-plate-in 0.42s var(--ease-out) both;
    }
    .lt3__inner {
      animation: lt3-wipe-in 0.36s var(--ease-out) 0.12s both;
    }
    .lt3__bar {
      animation: lt3-bar 0.4s linear 0.12s both;
    }

    /* Exit (added at unmount by `lowerThirdOut`): content wipes out under the
       bar, THEN the emptied plate skews off (~0.6s). `.lt3--exit` is applied at
       runtime, so keep the scoped `.lt3` anchor and mark the runtime class
       `:global` — otherwise the compiler prunes these as "unused". */
    .lt3:global(.lt3--exit) {
      animation: lt3-plate-out 0.32s var(--ease-in) 0.28s both;
    }
    .lt3:global(.lt3--exit) .lt3__inner {
      animation: lt3-wipe-out 0.3s var(--ease-in) both;
    }
    /* The exit sweep MUST use a keyframe name distinct from the entrance's
       `lt3-bar` (below). The entrance bar animation finishes pinned at its 100%
       frame (`both` fill); if the exit merely re-timed the SAME animation-name,
       the browser treats it as the same, already-finished animation and never
       restarts it — so the shine would not sweep on the way out (the plate/wipe
       replay fine because they already use distinct `*-out` names). See
       tmp/lower-third-wipe-bench.html for the isolated repro. */
    .lt3:global(.lt3--exit) .lt3__bar {
      animation: lt3-bar-out 0.34s linear both;
    }
  }

  /* --- Reduced motion: no sweep, no skew — a plain quick fade in; instant out
     (the transition returns duration 0, so `.lt3--exit` is never applied). --- */
  @media (prefers-reduced-motion: reduce) {
    .lt3 {
      animation: lt3-fade-in 0.16s linear both;
    }
    .lt3__bar {
      display: none;
    }
  }

  @keyframes lt3-plate-in {
    from {
      opacity: 0;
      transform: translateX(-46%) skewX(-15deg);
    }
    to {
      opacity: 1;
      transform: translateX(0) skewX(0deg);
    }
  }
  @keyframes lt3-wipe-in {
    from {
      clip-path: polygon(0 0, 0% 0, -18% 100%, 0 100%);
    }
    to {
      clip-path: polygon(0 0, 118% 0, 100% 100%, 0 100%);
    }
  }
  @keyframes lt3-bar {
    0% {
      transform: translateX(-160%) skewX(-13deg);
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    85% {
      opacity: 1;
    }
    100% {
      transform: translateX(165%) skewX(-13deg);
      opacity: 0;
    }
  }
  /* Exit sweep — frames identical to `lt3-bar`; the DISTINCT NAME is the point,
     so the browser starts a fresh animation on exit instead of leaving the
     entrance one parked at its end. Keep in sync with `lt3-bar` above. */
  @keyframes lt3-bar-out {
    0% {
      transform: translateX(-160%) skewX(-13deg);
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    85% {
      opacity: 1;
    }
    100% {
      transform: translateX(165%) skewX(-13deg);
      opacity: 0;
    }
  }
  @keyframes lt3-wipe-out {
    from {
      clip-path: polygon(0 0, 118% 0, 100% 100%, 0 100%);
    }
    to {
      clip-path: polygon(118% 0, 118% 0, 100% 100%, 100% 100%);
    }
  }
  @keyframes lt3-plate-out {
    from {
      opacity: 1;
      transform: translateX(0) skewX(0deg);
    }
    to {
      opacity: 0;
      transform: translateX(34%) skewX(12deg);
    }
  }
  @keyframes lt3-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
