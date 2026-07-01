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
</style>
