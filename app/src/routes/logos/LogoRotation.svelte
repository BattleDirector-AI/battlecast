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
    {#key current}
      <img class="bc-logos__img" data-testid="logo-image" src={current} alt="" />
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

  .bc-logos__img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    /* Re-keyed on each image change, so the animation replays as a fade-in — a
       lightweight crossfade without leaving a second element in the DOM. */
    animation: bc-logo-fade var(--bc-dur-reorder) var(--bc-ease);
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

  @keyframes bc-logo-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
