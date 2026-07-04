<script>
  import ClassChip from '../../design/ClassChip.svelte'
  import { classColor } from '../../design/classMeta.js'
  import { fmtName } from '../../design/format.js'

  let { snapshot = null, label = 'RUNNING ORDER' } = $props()

  const subjectSlot = $derived(snapshot?.subject?.slot_id ?? null)
  const rows = $derived(
    [...(snapshot?.vehicles ?? [])].sort((a, b) => a.position - b.position),
  )

  /** Lap seconds -> broadcast readout (m:ss.mmm, or ss.mmm under a minute). */
  function fmtLapTime(seconds) {
    if (seconds == null || Number.isNaN(seconds)) return '—'
    const m = Math.floor(seconds / 60)
    const s = seconds - m * 60
    return m > 0 ? `${m}:${s.toFixed(3).padStart(6, '0')}` : s.toFixed(3)
  }
</script>

<section class="tower" data-testid="standings-tower">
  <header class="tower__header">{label}</header>

  {#if rows.length === 0}
    <div class="tower__empty" data-testid="tower-empty">Waiting for state…</div>
  {:else}
    <ol class="tower__rows">
      {#each rows as v, i (v.slot_id)}
        {@const oncam = v.slot_id === subjectSlot}
        <li
          class="row"
          class:row--oncam={oncam}
          class:row--zebra={i % 2 === 1}
          data-testid="tower-row"
          data-slot={v.slot_id}
          data-position={v.position}
          data-oncam={oncam ? 'true' : 'false'}
          aria-current={oncam ? 'true' : undefined}
        >
          {#if oncam}
            <!-- Re-cut reveal (#64/#68): a fresh, subject-keyed flash overlay mounts
                 only for the on-camera row, so switching the highlight to a NEW driver
                 always mounts a NEW node and its mint glow-in animation replays. The
                 old approach put `animation: row-oncam-in` on the persistent, slot-keyed
                 `.row--oncam` node and relied on a class ADD to restart the keyframe —
                 unreliable, and it never re-fired when the highlight moved. Gated to
                 no-preference (below); under reduced motion it is inert and the static
                 `.row--oncam` styling carries the highlight instantly. -->
            {#key subjectSlot}
              <span class="row__oncam-flash" data-testid="row-oncam-flash" aria-hidden="true"></span>
            {/key}
          {/if}
          <span
            class="row__classbar"
            style:background={classColor(v.vehicle_class)}
            aria-hidden="true"
          ></span>
          <span class="row__pos">{v.position}</span>
          <ClassChip carClass={v.vehicle_class} size="compact" />
          <span class="row__name" data-testid="driver-name">{fmtName(v.driver_name)}</span>
          <span class="row__lap">{fmtLapTime(v.last_lap)}</span>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .tower {
    width: var(--bc-tower-width);
    box-sizing: border-box;
    background: var(--bc-plate);
    backdrop-filter: var(--bc-blur);
    -webkit-backdrop-filter: var(--bc-blur);
    border: 1px solid var(--bc-hairline);
    border-radius: var(--bc-radius);
    box-shadow: var(--bc-shadow-plate);
    overflow: hidden;
    color: var(--bc-text);
  }

  .tower__header {
    height: var(--bc-widget-header);
    display: flex;
    align-items: center;
    padding: 0 var(--bc-space-3);
    background: var(--bc-header);
    border-bottom: 1px solid var(--bc-hairline);
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-title);
    text-transform: uppercase;
    color: var(--bc-text-2);
  }

  .tower__empty {
    padding: var(--bc-space-3);
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-3);
  }

  .tower__rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .row {
    position: relative;
    /* Own stacking context so the on-camera flash overlay can sit at z-index -1 —
       above the row's background, below the text/chips. */
    isolation: isolate;
    height: var(--bc-row-standard);
    display: flex;
    align-items: center;
    gap: var(--bc-space-2);
    padding: 0 var(--bc-space-3) 0 var(--bc-space-4);
    border-bottom: 1px solid var(--bc-divider);
  }
  .row:last-child {
    border-bottom: none;
  }

  .row--zebra {
    background: var(--bc-zebra);
  }

  /* Class bar: colored strip on the left edge of each row. */
  .row__classbar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: var(--bc-classbar);
  }

  .row__pos {
    min-width: 22px;
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-pos);
    font-weight: var(--bc-weight-num);
    color: var(--bc-text);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .row__name {
    flex: 1 1 auto;
    min-width: 0;
    font-family: var(--bc-font-display);
    font-size: var(--bc-size-name);
    font-weight: var(--bc-weight-name);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row__lap {
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-gap);
    font-weight: var(--bc-weight-num);
    color: var(--bc-text-2);
    font-variant-numeric: tabular-nums;
  }

  /* On-camera driver — cyan accent is reserved exclusively for this. */
  .row--oncam {
    background: var(--bc-oncam-bg);
    box-shadow: var(--bc-oncam-shadow);
  }
  .row--oncam .row__pos {
    color: var(--bc-accent);
  }
  .row--oncam .row__name {
    color: var(--bc-oncam-text);
    font-weight: var(--bc-weight-leader);
  }

  /* Re-cut reveal (#64/#68): the mint glow-in plays on a FRESH, subject-keyed flash
     overlay (see markup) rendered only for the on-camera row, so it reliably replays
     every time the highlight moves to a new driver — a class ADD on the persistent,
     slot-keyed row never restarted the keyframe when the highlight switched. The
     overlay sits behind the text and animates a left-edge accent bar + accent glow
     that fades back out, leaving the static `.row--oncam` shadow as the steady state.
     Gated to no-preference; under reduced motion it is inert (no box-shadow), so the
     highlight is instant. */
  .row__oncam-flash {
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: no-preference) {
    .row__oncam-flash {
      animation: row-oncam-flash 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
  }

  @keyframes row-oncam-flash {
    0% {
      box-shadow: none;
    }
    /* The mint accent lands: a bright left-edge bar + accent glow sweeps in… */
    35% {
      box-shadow:
        inset 3px 0 0 0 var(--bc-up, #7cffb2),
        0 0 28px var(--bc-accent-glow, rgba(31, 224, 196, 0.35));
    }
    /* …then fades out, leaving the static on-camera shadow as the steady state. */
    100% {
      box-shadow: none;
    }
  }
</style>
