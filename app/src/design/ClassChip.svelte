<script>
  import { classMeta, classColor } from './classMeta.js'

  let { carClass, leader = false, size = 'standard' } = $props()

  // The producer's own class string is the label, always — never the registry's
  // curated abbreviation. `classMeta`'s five entries exist only to pick a curated
  // COLOR for a class this build recognizes; a class it doesn't (e.g. GTE, or any
  // series-specific name) still reads as what the producer actually called it,
  // rather than degrading to the generic 'CLS' placeholder. The registry's short
  // labels are themselves already each class's own canonical spelling (GTP, GT3,
  // ...), so a recognized class renders identically either way. Trimmed so a
  // whitespace-only class (matching GridSlide.svelte's trim-then-check convention)
  // falls back to the placeholder rather than rendering a blank bordered chip.
  // Uppercased in JS, not left to the CSS text-transform below: `textContent` (and
  // anything else reading the DOM directly) must see the same canonical form a
  // viewer does, matching how RaceControlStatus.svelte and the tower's mode header
  // already normalize an arbitrary producer string for display.
  const trimmedClass = $derived(carClass != null ? String(carClass).trim() : '')
  const label = $derived(trimmedClass ? trimmedClass.toUpperCase() : classMeta(carClass).short)
  const color = $derived(classColor(carClass))
  const compact = $derived(size === 'compact')
</script>

<span
  class="bc-class-chip"
  class:bc-class-chip--compact={compact}
  style:color={leader ? 'var(--bc-text-on-accent)' : color}
  style:background={leader ? color : 'transparent'}
  style:border-color={color}
><span class="bc-class-chip__label">{label}</span></span>

<style>
  .bc-class-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--bc-font-ui);
    font-weight: var(--bc-weight-label);
    font-size: var(--bc-size-chip);
    letter-spacing: var(--bc-track-chip);
    line-height: 1;
    text-transform: uppercase;
    padding: 3px 5px;
    border-radius: var(--bc-radius-chip);
    min-width: 32px;
    /* The registry's curated labels are always <=4 chars, but a producer's own
       class string (rendered verbatim now) has no such guarantee — clip rather
       than let one long class name push adjacent row content around. */
    max-width: 96px;
    /* This chip sits beside flex-shrinking siblings (e.g. the tower row's
       flexible name column) — without this, a flex layout's automatic min-content
       floor no longer protects it once it can clip (below), and even a known
       3-char label like GTP can get squeezed under its own min-width. */
    flex-shrink: 0;
    box-sizing: border-box;
    white-space: nowrap;
    border: 1px solid;
  }
  .bc-class-chip--compact {
    font-size: var(--bc-size-chip-compact);
    padding: 2px 4px;
    min-width: 26px;
    max-width: 72px;
  }

  /* Ellipsis lives on this inner element, not `.bc-class-chip` itself: `overflow`/
     `text-overflow` on an `inline-flex` container is a no-op (it only applies to
     block containers), and combined with `justify-content: center` it would clip
     from BOTH ends — showing the middle of the string — rather than truncating
     from the end. `min-width: 0` is what lets a flex item shrink past its content
     size at all, which ellipsis needs to ever take effect. */
  .bc-class-chip__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
