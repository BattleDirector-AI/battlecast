<script module>
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
</script>

<script>
  /* Logo / sponsor rotation widget (#33). Cycles a set of branding images on a
   * per-slot timer with a fade, driven entirely by the overlay config's
   * `logoRotation` block (see spec/#32 decision) — nothing is hardcoded. Own route
   * (`/logos`) and composable into `/all` as the `logos` widget. */

  const DEFAULT_PER_SLOT_SECONDS = 8

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
</script>

{#if current}
  <div class="bc-logos" data-testid="logos-widget">
    <!-- Re-keyed on each image change so the reveal replays on switch. The wrapper
         slides in while the image wipes in behind the raked mint bar — the same
         bar-wipe reveal the lower-thirds use (mirrors LowerThirdShell), so every
         widget switches with one motion vocabulary. The rake lives in the wipe's
         angled clip edge and the skewed shine bar; the wrapper itself does NOT skew,
         so a sponsor's logo is never sheared/distorted mid-reveal. -->
    {#key current}
      <div class="bc-logos__reveal">
        <img class="bc-logos__img" data-testid="logo-image" src={current} alt="" />
        <span class="bc-logos__shine" aria-hidden="true"></span>
      </div>
    {/key}
  </div>
{:else}
  <div class="bc-logos bc-logos--idle" data-testid="logos-empty">
    <span class="bc-logos__idle-label">NO SPONSORS</span>
  </div>
{/if}

<style>
  .bc-logos {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  /* The reveal wrapper is the bar-wipe "plate": it clips the raked shine bar and the
     content wipe to its own box, and slides in on each switch. It translates only —
     no skew — so the sponsor logo it wraps is never sheared (the rake reads from the
     wipe's angled edge and the raked shine, not from distorting the mark). */
  .bc-logos__reveal {
    --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .bc-logos__img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  /* Bright mint shine bar, raked ~13°, sweeping across on the way in — identical
     visual language to the lower-third reveal (LowerThirdShell) and the tower
     re-cut, so it reads as light passing over the graphic. */
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

  /* Entrance: wrapper slides in, the logo wipes in behind the raked bar. Gated to
     no-preference so reduced-motion viewers skip the sweep for a plain fade. */
  @media (prefers-reduced-motion: no-preference) {
    .bc-logos__reveal {
      animation: bc-logo-slide 0.42s var(--ease-out) both;
    }
    .bc-logos__img {
      animation: bc-logo-wipe 0.36s var(--ease-out) 0.12s both;
    }
    .bc-logos__shine {
      animation: bc-logo-bar 0.4s linear 0.12s both;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bc-logos__img {
      animation: bc-logo-fade 0.16s linear both;
    }
    .bc-logos__shine {
      display: none;
    }
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

  /* Reveal keyframes track LowerThirdShell's lt3-wipe-in / lt3-bar (keep in sync).
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
  @keyframes bc-logo-bar {
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

  @keyframes bc-logo-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
