<script>
  import { onDestroy, untrack } from 'svelte'
  import { fade } from 'svelte/transition'
  import LowerThirdShell from '../../lib/LowerThirdShell.svelte'
  import { prefersReducedMotion } from '../../lib/motion.js'
  import { eventHeader, infoLines, createInfoRotation, WEATHER_CARD, infoPanelSpan } from '../../lib/infoPanel.js'
  import { weatherCardText } from '../../lib/weather.js'
  import { DEFAULT_CONFIG } from '../../lib/overlayConfig.js'

  // Info panel (#62; widgets.md rules 76-82, ADR 0024). The rotation (lib/infoPanel.js)
  // decides which line is up when the list changes; this component only times the line on
  // screen. The broadcaster's `lines` come from the profile and need no snapshot. The
  // weather card (#208, rule 88) is one fixed entry at the end of the list, so a weather
  // change redraws its text in place and never moves the rotation.
  const DEFAULT_DWELL = DEFAULT_CONFIG.widgets.info.dwellSeconds
  let {
    snapshot = null,
    dwellSeconds = DEFAULT_DWELL,
    lines = [],
    weatherCard = DEFAULT_CONFIG.widgets.info.weatherCard,
    tempUnit = DEFAULT_CONFIG.widgets.info.tempUnit,
    slotLeft = null,
    slotWidth = null,
    canvasWidth = null,
  } = $props()

  const header = $derived(eventHeader(snapshot?.event))
  const cardText = $derived(weatherCard ? weatherCardText(snapshot?.session?.weather, tempUnit) : null)
  const list = $derived([...infoLines(snapshot?.info_lines, lines), ...(cardText !== null ? [WEATHER_CARD] : [])])

  const rotation = createInfoRotation()
  let current = $state(null)
  let timer = null

  function stopTimer() {
    if (timer != null) clearTimeout(timer)
    timer = null
  }

  // A line keeps the dwell it started with (rule 79), so the dwell is read here, once.
  function startTimer() {
    stopTimer()
    const d = untrack(() => dwellSeconds)
    const secs = typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : DEFAULT_DWELL
    timer = setTimeout(() => {
      timer = null
      apply(rotation.advance())
    }, secs * 1000)
  }

  function apply(action) {
    current = rotation.current()
    if (action === 'start') startTimer()
    else if (action === 'stop') stopTimer()
  }

  // Every new line list goes to the rotation; an unchanged list does nothing (rule 79).
  $effect(() => {
    const next = list
    untrack(() => apply(rotation.update(next)))
  })

  onDestroy(stopTimer)

  // A long header widens the panel (rule 78a; how/renderer.md "A long header widens the
  // panel"). The header is `max-content`, so its `offsetWidth` is its text's width whatever the
  // panel's width, in layout px the /config preview's scale does not change. Its need adds the
  // panel's side padding and the plate's side borders. Measured after every header change, and
  // when the header's box resizes on its own (a font load, a preset switch, a textScale change).
  let headerEl = $state(null)
  let sectionEl = $state(null)
  let need = $state(null)
  const px = (v) => {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  function measure() {
    if (!headerEl || !sectionEl) {
      need = null
      return
    }
    const pad = getComputedStyle(sectionEl)
    const plate = sectionEl.closest('.lt3')
    const border = plate ? getComputedStyle(plate) : null
    need =
      headerEl.offsetWidth +
      px(pad.paddingLeft) +
      px(pad.paddingRight) +
      (border ? px(border.borderLeftWidth) + px(border.borderRightWidth) : 0)
  }
  $effect(() => {
    void header
    void sectionEl
    const el = headerEl
    untrack(measure)
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure())
    observer.observe(el)
    return () => observer.disconnect()
  })
  // Without a slot (no host passing one) the panel fills its parent as it always has.
  const span = $derived(
    slotWidth == null || canvasWidth == null
      ? null
      : infoPanelSpan({ slotLeft: slotLeft ?? 0, slotWidth, headerNeed: need, canvasWidth }),
  )

  // The line crossfade (rule 81). Local, so a line that comes or goes with an empty list (its
  // `{#if}` block) does not fade; duration 0 under reduced motion.
  const lineFade = (node) => (prefersReducedMotion() ? { duration: 0 } : fade(node, { duration: 300 }))
</script>

{#if header !== null || current !== null}
  <div class="lt3-anchor" style={span ? `width: ${span.width}px; left: ${span.left - (slotLeft ?? 0)}px` : undefined}>
    <LowerThirdShell>
      <section bind:this={sectionEl} class="bc-info" data-testid="info-panel" aria-label="Event information">
        {#if header !== null}
          <span bind:this={headerEl} class="bc-info__header" data-testid="info-header">{header}</span>
        {/if}
        {#if current !== null}
          <div class="bc-info__row">
            <!-- Keyed on the entry's identity, not its text: the weather card's text changing
                 re-renders this element in place, with no crossfade (rule 81). -->
            {#key current}
              <span class="bc-info__line" data-testid="info-line" in:lineFade out:lineFade
                >{current === WEATHER_CARD ? (cardText ?? '') : current}</span
              >
            {/key}
          </div>
        {/if}
      </section>
    </LowerThirdShell>
  </div>
{/if}

<style>
  .lt3-anchor {
    position: relative;
  }

  .bc-info {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    padding: var(--bc-space-2) var(--bc-space-4);
    color: var(--bc-text);
    /* The 72 px default slot (overlay-config rule 52) holds the header and a line at the
       `larger` text preset only with this line-height plus the 8 px vertical padding above
       and the shell's 1 px border: measured 71 px at `larger`, about 1 px spare. Raising any
       of the three overflows the slot. */
    line-height: 1.15;
  }

  .bc-info__header {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    color: var(--bc-text-3);
    /* Sized to its text in every preset, never cut: the panel widens to hold it (rule 78a), and
       this box is what it measures, so the measure never depends on the panel's width. */
    width: max-content;
    white-space: nowrap;
  }

  /* One grid cell for every line, so the outgoing and incoming lines of a crossfade sit in
     the same place instead of stacking (rule 81). */
  .bc-info__row {
    display: grid;
    min-width: 0;
  }

  .bc-info__line {
    grid-area: 1 / 1;
    min-width: 0;
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-name);
    font-weight: var(--bc-weight-name);
    color: var(--bc-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* The panel's own vintage look (widgets rules 101–102, ADR 0034). Keyed on an ancestor's
     data-theme, so the /config preview stage gets it too. Paint only: no rule here sizes or
     positions a box (overlay-config rule 60). */

  /* 70s: the teal subhead over the gold line, and a red rule along the bottom edge, drawn
     inside the panel over its bottom padding so it wipes with the content. */
  :global([data-theme='vintage70']) .bc-info {
    box-shadow: inset 0 -4px 0 var(--bc-accent);
  }
  :global([data-theme='vintage70']) .bc-info__header {
    color: #35D4C8;
  }

  /* 80s: the header as a red Scoreboard tag in Oswald, hugging its text. The base unitless
     line-height keeps the header's line box the same height in either face. */
  :global([data-theme='vintage80']) .bc-info__header {
    align-self: flex-start;
    font-family: var(--bc-font-display);
    color: var(--bc-text-2);
    background: var(--bc-header);
    box-shadow:
      0 0 0 2px var(--bc-header),
      3px 3px 0 2px #000;
    text-shadow: none;
  }
</style>
