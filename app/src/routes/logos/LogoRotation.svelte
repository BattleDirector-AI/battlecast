<script module>
  import { prefersReducedMotion } from '../../lib/motion.js'

  /**
   * Build the visiting order over `count` images. `sequential` walks 0..count-1;
   * `shuffle` returns a Fisher-Yates permutation (matches rF2's shuffled sponsor
   * carousel). Exported so tests can assert the ordering directly.
   */
  export function buildSequence(count, order) {
    const seq = Array.from({ length: count }, (_, i) => i)
    if (order === 'shuffle') {
      for (let i = seq.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[seq[i], seq[j]] = [seq[j], seq[i]]
      }
    }
    return seq
  }

  /**
   * True when the viewer asked the OS to minimize motion. Under reduced motion we
   * skip the exit choreography entirely (the old logo is swapped out instantly)
   * and the entrance falls back to a plain fade. Mirrors LowerThirdShell's guard;
   * the `typeof` check keeps it safe under the build's SSR/prerender pass. Exported
   * so the swap controller is unit-testable.
   */
  export function reduceMotion() {
    return prefersReducedMotion()
  }
</script>

<script>
  /* Logo / sponsor rotation widget (#33). Cycles a set of branding images on a
   * per-slot timer, driven entirely by the overlay config's `logoRotation` block
   * (see spec/#32 decision) — nothing is hardcoded. Own route (`/logos`) and
   * composable into `/all` as the `logos` widget. */

  import { untrack } from 'svelte'

  const DEFAULT_PER_SLOT_SECONDS = 8
  /* Length of the exit choreography (wipe-out + shine sweep). The incoming logo's
     entrance is delayed by this so the outgoing one finishes wiping OUT before the
     next one wipes IN — a sequential hand-off, not a cross-fade (#85). */
  const EXIT_MS = 340

  let { rotation = {} } = $props()

  // Only real, non-empty image URLs are eligible; a malformed entry is dropped
  // rather than rendered as a broken <img>.
  const images = $derived(
    Array.isArray(rotation?.images)
      ? rotation.images.filter((s) => typeof s === 'string' && s.trim())
      : [],
  )
  const perSlotSeconds = $derived(
    Number(rotation?.perSlotSeconds) > 0 ? Number(rotation.perSlotSeconds) : DEFAULT_PER_SLOT_SECONDS,
  )
  const order = $derived(rotation?.order === 'shuffle' ? 'shuffle' : 'sequential')

  // Recomputed only when the image set or order changes (idempotent for a fixed
  // input, so the render is stable between timer ticks).
  const sequence = $derived(buildSequence(images.length, order))

  let pos = $state(0)

  // Arm the per-slot timer whenever the sequence or cadence changes; reset the
  // position so a config change starts the carousel cleanly. A single image (or
  // none) needs no timer.
  $effect(() => {
    pos = 0
    const len = sequence.length
    if (len <= 1) return
    const id = setInterval(() => {
      pos = (pos + 1) % len
    }, perSlotSeconds * 1000)
    return () => clearInterval(id)
  })

  const current = $derived(images.length ? images[sequence[pos] ?? 0] : null)

  // --- Sequential swap controller -----------------------------------------------
  // `shown` is the logo currently entering / held; it always carries the
  // `logo-image` testid so it reflects the carousel immediately. `leaving` is the
  // previous logo, rendered on its own layer playing the wipe-OUT on top. On a
  // switch we promote the new image into `shown` at once but delay its entrance
  // (`enterDelay`) by EXIT_MS, so visually the old one wipes out first. First paint
  // and reduced motion take no exit path.
  let shown = $state(null)
  let leaving = $state(null)
  let enterDelay = $state(0)

  $effect(() => {
    const next = current
    // Only `current` is a tracked dependency; the writes below must not re-trigger
    // this effect (that would fire its cleanup early and cancel the exit timer).
    return untrack(() => {
      if (next === shown) return
      if (shown == null || reduceMotion()) {
        enterDelay = 0
        leaving = null
        shown = next
        return
      }
      enterDelay = EXIT_MS
      leaving = shown
      shown = next
      const t = setTimeout(() => {
        leaving = null
      }, EXIT_MS)
      return () => clearTimeout(t)
    })
  })

  // What the entrance layer paints. `shown` is only assigned inside the effect above
  // (post-mount), so falling back to `current` keeps the FIRST paint correct — without
  // it the widget would briefly render the idle "NO SPONSORS" state before the effect
  // seeds `shown`. Once seeded they are equal.
  const displayed = $derived(shown ?? current)
</script>

{#if current}
  <div class="bc-logos" data-testid="logos-widget">
    <!-- Exit layer: the outgoing logo wipes OUT under the raked mint bar before the
         incoming one appears. Translate/clip only — never skewed, so the mark is not
         sheared. Rendered only during the ~EXIT_MS hand-off (and never under reduced
         motion, where `leaving` stays null). -->
    {#if leaving}
      <div class="bc-logos__layer bc-logos__layer--leaving" aria-hidden="true">
        <div class="bc-logos__reveal bc-logos__reveal--leaving">
          <img class="bc-logos__img" data-testid="logo-leaving" src={leaving} alt="" />
          <span class="bc-logos__shine bc-logos__shine--out"></span>
        </div>
      </div>
    {/if}

    <!-- Entrance layer. Re-keyed on each image so the reveal replays on switch. The
         reveal wrapper is sized to the image (`fit-content`), so the shine bar and the
         clip-path wipe are confined to the LOGO PIXELS, not the whole slot — the mint
         bar never sweeps empty space beside a small logo. `--enter-delay` holds the
         wipe-in back until the exit above has finished. Same bar-wipe vocabulary the
         lower-thirds use (mirrors LowerThirdShell). -->
    <div class="bc-logos__layer">
      {#key displayed}
        <div class="bc-logos__reveal" style="--enter-delay: {enterDelay}ms">
          <img class="bc-logos__img" data-testid="logo-image" src={displayed} alt="" />
          <span class="bc-logos__shine" aria-hidden="true"></span>
        </div>
      {/key}
    </div>
  </div>
{:else}
  <div class="bc-logos bc-logos--idle" data-testid="logos-empty">
    <span class="bc-logos__idle-label">NO SPONSORS</span>
  </div>
{/if}

<style>
  .bc-logos {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  /* Full-slot flex layer that centres a reveal. Both the entrance and the exit
     logo live on their own layer so they overlap perfectly during the hand-off. */
  .bc-logos__layer {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* The reveal "plate": it clips the raked shine bar and the content wipe to its
     own box and slides in on each switch. Crucially it is sized to the image
     (`fit-content`, capped to the slot) — NOT the full slot — so the shine and wipe
     are confined to the logo pixels. It translates only (no skew) so the sponsor
     mark it wraps is never sheared. */
  .bc-logos__reveal {
    --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
    position: relative;
    width: fit-content;
    height: fit-content;
    max-width: 100%;
    max-height: 100%;
    overflow: hidden;
  }

  .bc-logos__img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  /* Bright mint shine bar, raked ~13°, sweeping across on the way in and out —
     identical visual language to the lower-third reveal (LowerThirdShell) and the
     tower re-cut, so it reads as light passing over the graphic. Confined (with the
     reveal) to the logo box. */
  .bc-logos__shine {
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

  /* Entrance: wrapper slides in, the logo wipes in behind the raked bar. `--enter-delay`
     (0 on first paint, EXIT_MS on a switch) holds it back until the exit finishes. Gated
     to full motion via the root `data-motion` attribute (see lib/motion.js) rather than
     the OS `prefers-reduced-motion` media query, so an OBS/CEF host still plays the sweep;
     only an explicit `data-motion="reduced"` opts out. */
  :global(:root:not([data-motion='reduced'])) .bc-logos__reveal {
    animation: bc-logo-slide 0.42s var(--ease-out) var(--enter-delay, 0ms) both;
  }
  :global(:root:not([data-motion='reduced'])) .bc-logos__img {
    animation: bc-logo-wipe 0.36s var(--ease-out) calc(var(--enter-delay, 0ms) + 0.12s) both;
  }
  :global(:root:not([data-motion='reduced'])) .bc-logos__shine {
    animation: bc-logo-bar 0.4s linear calc(var(--enter-delay, 0ms) + 0.12s) both;
  }

  /* Exit (the leaving layer): the logo wipes OUT under the bar while the bar sweeps
     across again. Distinct `*-out` keyframe names so the browser restarts them instead
     of leaving the entrance ones parked at their end frame.
     The leaving wrapper matches `.bc-logos__reveal` above, so without this it would
     REPLAY the entrance `bc-logo-slide` (fade/slide IN from the left) while its image
     wipes out — contradictory motion. Hold it static so only the wipe + shine play. */
  :global(:root:not([data-motion='reduced'])) .bc-logos__reveal--leaving {
    animation: none;
  }
  :global(:root:not([data-motion='reduced'])) .bc-logos__reveal--leaving .bc-logos__img {
    animation: bc-logo-wipe-out 0.3s var(--ease-in) both;
  }
  :global(:root:not([data-motion='reduced'])) .bc-logos__reveal--leaving .bc-logos__shine--out {
    animation: bc-logo-bar-out 0.34s linear both;
  }

  /* Reduced motion (opt-in `data-motion="reduced"`): plain fade, no sweep. */
  :global(:root[data-motion='reduced']) .bc-logos__img {
    animation: bc-logo-fade 0.16s linear both;
  }
  :global(:root[data-motion='reduced']) .bc-logos__shine {
    display: none;
  }

  .bc-logos--idle {
    border: 1px dashed var(--bc-text-3);
    border-radius: var(--bc-radius);
    box-shadow: var(--bc-shadow-soft);
    opacity: 0.72;
  }

  .bc-logos__idle-label {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-3);
  }

  /* Reveal keyframes track LowerThirdShell's lt3-* (keep the vocabulary in sync).
     bc-logo-slide intentionally DROPS the shell plate-in's skewX: the shell skews an
     opaque plate, but here the wrapper directly holds the sponsor image, so skewing
     it would shear the brand mark. A plain translate keeps the slide-in while the
     rake still reads from the wipe edge and the (skewed) shine bar. */
  @keyframes bc-logo-slide {
    from {
      opacity: 0;
      transform: translateX(-46%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  @keyframes bc-logo-wipe {
    from {
      clip-path: polygon(0 0, 0% 0, -18% 100%, 0 100%);
    }
    to {
      clip-path: polygon(0 0, 118% 0, 100% 100%, 0 100%);
    }
  }
  /* Exit wipe: collapse the revealed image to its right edge, so it reads as the bar
     wiping the logo away (mirror of the left-to-right reveal). */
  @keyframes bc-logo-wipe-out {
    from {
      clip-path: polygon(0 0, 118% 0, 100% 100%, 0 100%);
    }
    to {
      clip-path: polygon(118% 0, 118% 0, 100% 100%, 100% 100%);
    }
  }
  /* The bar is 34% wide (left:-20%); this translate range carries it from fully off
     the left edge to fully off the RIGHT edge (~ -20% + 0.34·360% > 100%), so it
     sweeps the entire logo instead of stalling at the middle (the earlier -160%→165%
     range only reached mid-box). Widened vs LowerThirdShell's lt3-bar for that reason. */
  @keyframes bc-logo-bar {
    0% {
      transform: translateX(-120%) skewX(-13deg);
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    80% {
      opacity: 1;
    }
    100% {
      transform: translateX(360%) skewX(-13deg);
      opacity: 0;
    }
  }
  /* Exit sweep — frames identical to bc-logo-bar; the DISTINCT NAME is the point, so
     the browser starts a fresh animation on exit instead of leaving the entrance one
     parked at its end frame. Keep in sync with bc-logo-bar above. */
  @keyframes bc-logo-bar-out {
    0% {
      transform: translateX(-120%) skewX(-13deg);
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    80% {
      opacity: 1;
    }
    100% {
      transform: translateX(360%) skewX(-13deg);
      opacity: 0;
    }
  }

  @keyframes bc-logo-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
