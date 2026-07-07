<script module>
  // Session STATUS indicators — flag, Full Course Yellow, Safety Car. Native
  // rF2/LMU expose these as their own "Status indicators" element, distinct from
  // the per-car timing tower and from the session-clock "Session Info" (see
  // docs/research/native-overlays.md). battlecast follows that split: this widget
  // is the flag/FCY/SC strip; the session clock / lap counter lives in the
  // standings tower header (see app/src/design/sessionProgress.js). Driving these
  // from producer state is the reliability win of #25 — in LMU they are manual-only.
  //
  // `flag` is free-form per the spec ("commonly green/yellow/red/checkered/white/
  // none, but free-form — the producer owns the flag state and consumers tolerate
  // unknown values"). `none`/absent/blank means "no flag shown"; anything else we
  // don't recognize still renders (best-effort), just with a neutral swatch.
  const FLAG_META = {
    green: { label: 'GREEN FLAG', color: 'var(--bc-intensity-calm)' },
    yellow: { label: 'YELLOW FLAG', color: 'var(--bc-intensity-mid)' },
    red: { label: 'RED FLAG', color: 'var(--bc-live)' },
    white: { label: 'WHITE FLAG', color: '#F2F5F7' },
    checkered: { label: 'CHECKERED FLAG', color: null },
  }

  export function resolveFlag(flag) {
    if (flag == null) return null
    const key = String(flag).trim().toLowerCase()
    if (!key || key === 'none') return null
    const known = FLAG_META[key]
    if (known) return { key, ...known }
    // Unknown flag string: tolerate it, render a neutral chip with the raw label.
    return { key, label: `${key.toUpperCase()} FLAG`, color: 'var(--bc-text-3)' }
  }
</script>

<script>
  // Dumb overlay, smart producer (docs/decisions/0002-lower-third-widgets.md): every
  // field here is producer-computed. `session` may be null/undefined/partial — this
  // component MUST tolerate that and never throw; when there is no flag/FCY/SC worth
  // showing it renders nothing rather than an empty plate.
  let { session = null, mode = null } = $props()

  const flag = $derived(resolveFlag(session?.flag))
  const fcy = $derived(!!session?.full_course_yellow)
  const sc = $derived(!!session?.safety_car)
  const caution = $derived(fcy || sc)
  const hasContent = $derived(!!flag || fcy || sc)
</script>

{#if hasContent}
<section
  class="bc-racecontrol"
  class:bc-racecontrol--caution={caution}
  data-testid="racecontrol-status"
  data-mode={mode ?? ''}
  aria-label="Race control status"
>
  {#if flag}
    <div class="bc-racecontrol__flag" data-testid="racecontrol-flag" data-flag={flag.key}>
      <span
        class="bc-racecontrol__swatch"
        data-flag={flag.key}
        style:background={flag.color ?? undefined}
      ></span>
      <span class="bc-racecontrol__flag-label">{flag.label}</span>
    </div>
  {/if}

  {#if fcy || sc}
    <div class="bc-racecontrol__badges">
      {#if fcy}
        <span class="bc-racecontrol__badge bc-racecontrol__badge--fcy" data-testid="racecontrol-fcy">
          FULL COURSE YELLOW
        </span>
      {/if}
      {#if sc}
        <span class="bc-racecontrol__badge bc-racecontrol__badge--sc" data-testid="racecontrol-sc">
          SAFETY CAR
        </span>
      {/if}
    </div>
  {/if}
</section>
{/if}

<style>
  /* A compact, content-sized status pill: [ ■ FLAG ] plus FCY / SC chips only when
     those fire. Sized to its content (not stretched to a bar) so green-flag — the
     common case — is a small box; it grows only when there's a caution to show. */
  .bc-racecontrol {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: var(--bc-space-2);
    width: fit-content;
    max-width: 100%;
    box-sizing: border-box;
    padding: var(--bc-space-2) var(--bc-space-3);
    background: var(--bc-header);
    border: 1px solid var(--bc-hairline);
    border-radius: var(--bc-radius);
    box-shadow: var(--bc-shadow-plate);
    backdrop-filter: var(--bc-blur);
    -webkit-backdrop-filter: var(--bc-blur);
    overflow: hidden;
    color: var(--bc-text);
  }

  /* Cautionary ring, same construction as BattleBox's intensifying border: drawn on
     an ::after overlay ABOVE the content (z-index 3) so it wraps the whole strip
     rather than being clipped by the plate fill. */
  .bc-racecontrol--caution::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    z-index: 3;
  }

  @media (prefers-reduced-motion: no-preference) {
    .bc-racecontrol--caution {
      animation: bc-racecontrol-pulse-glow var(--bc-dur-pulse) var(--bc-ease) infinite;
    }
    .bc-racecontrol--caution::after {
      animation: bc-racecontrol-pulse-ring var(--bc-dur-pulse) var(--bc-ease) infinite;
    }
  }

  /* Reduced motion: a steady amber ring (no pulse, no bloom) still marks the
     caution state without animation. */
  @media (prefers-reduced-motion: reduce) {
    .bc-racecontrol--caution::after {
      box-shadow: inset 0 0 0 2px rgba(255, 194, 71, 0.9);
    }
  }

  @keyframes bc-racecontrol-pulse-ring {
    0%,
    100% {
      box-shadow: inset 0 0 0 1.5px rgba(255, 194, 71, 0.3);
    }
    50% {
      box-shadow: inset 0 0 0 2px rgba(255, 194, 71, 0.95);
    }
  }

  @keyframes bc-racecontrol-pulse-glow {
    0%,
    100% {
      box-shadow: var(--bc-shadow-plate), 0 0 0 rgba(255, 194, 71, 0);
    }
    50% {
      box-shadow: var(--bc-shadow-plate), 0 0 24px rgba(255, 194, 71, 0.45);
    }
  }

  .bc-racecontrol__flag {
    display: flex;
    align-items: center;
    gap: var(--bc-space-1);
    min-width: 0;
  }

  .bc-racecontrol__swatch {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35);
  }

  /* Checkered flag: no single fill color, so paint an actual checkerboard. */
  .bc-racecontrol__swatch[data-flag='checkered'] {
    background-color: #fff;
    background-image:
      linear-gradient(45deg, #0b0e13 25%, transparent 25%, transparent 75%, #0b0e13 75%, #0b0e13),
      linear-gradient(45deg, #0b0e13 25%, #fff 25%, #fff 75%, #0b0e13 75%, #0b0e13);
    background-size: 6px 6px;
    background-position:
      0 0,
      3px 3px;
  }

  .bc-racecontrol__flag-label {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-2);
    white-space: nowrap;
    /* line-height 1 collapses the label's tall inherited line box to the cap
       height, so the caps sit dead-centre against the 20px swatch (a tall line box
       makes uppercase text read as floating slightly high). The negative right
       margin trims the trailing letter-spacing after the last glyph so the pill
       hugs the text symmetrically. */
    line-height: 1;
    margin-right: calc(-1 * var(--bc-track-label));
  }

  /* FCY / SC chips sit inline after the flag, extending the pill only when active. */
  .bc-racecontrol__badges {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--bc-space-2);
    min-width: 0;
  }

  .bc-racecontrol__badge {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    white-space: nowrap;
    padding: 3px 8px;
    border-radius: var(--bc-radius-chip);
    border: 1px solid;
  }

  .bc-racecontrol__badge--fcy {
    color: var(--bc-text-on-accent);
    background: var(--bc-intensity-mid);
    border-color: var(--bc-intensity-mid);
  }

  .bc-racecontrol__badge--sc {
    color: var(--bc-intensity-mid);
    background: transparent;
    border-color: var(--bc-intensity-mid);
  }
</style>
