<script module>
  // --- Idle-battle heuristic -------------------------------------------------
  // A battle box that renders whatever was last in `relationship` will silently
  // show a stale gap when the camera cuts away from a fight. So we don't trust
  // the last snapshot's numbers blind — we decide from the snapshot itself
  // whether a battle is actually happening.
  //
  // Heuristic: a battle is ACTIVE only when at least one adjacent car exists in
  // running order — i.e. `gap_ahead` OR `gap_behind` is a real number. Per the
  // spec, a null/absent gap means the subject has no one ahead/behind at all, so
  // when BOTH are null there is nobody to fight and the state is idle.
  //
  // `battle_intensity` is deliberately NOT used for this decision: it is a
  // producer-smoothed presentation value and could lag the gaps, re-introducing
  // the exact staleness we're guarding against. It drives emphasis only.
  export function isActiveBattle(relationship) {
    if (!relationship) return false
    const { gap_ahead, gap_behind } = relationship
    const hasAhead = typeof gap_ahead === 'number' && !Number.isNaN(gap_ahead)
    const hasBehind = typeof gap_behind === 'number' && !Number.isNaN(gap_behind)
    return hasAhead || hasBehind
  }

  // --- Racing-mode gate ------------------------------------------------------
  // "Battle for position" is a green-flag RACE concept. In qualifying/practice cars
  // run solo flying laps, and grid/results are frozen boards — there is no on-track
  // fight to show, even though the producer may still emit gap_ahead/gap_behind. So
  // the battle box is gated to racing modes and renders nothing elsewhere. Kept
  // tolerant: a race `replay` counts; other/unknown modes do not.
  export function isRacingMode(mode) {
    return mode === 'race' || mode === 'replay'
  }
</script>

<script>
  import { fmtName, fmtGap } from '../../design/format.js'
  import ClassChip from '../../design/ClassChip.svelte'
  import IntensityMeter from '../../design/IntensityMeter.svelte'

  let { subject = {}, relationship = {}, vehicles = [], mode = null } = $props()

  const racing = $derived(isRacingMode(mode))
  const active = $derived(isActiveBattle(relationship))
  const intensity = $derived(
    typeof relationship?.battle_intensity === 'number' ? relationship.battle_intensity : 0
  )
  const hot = $derived(intensity >= 0.67)
  const headerLabel = $derived(hot ? 'CLOSING' : 'BATTLE FOR POSITION')

  const subjectVehicle = $derived(
    vehicles.find((v) => v.slot_id === subject?.slot_id)
  )
  const carClass = $derived(subjectVehicle?.vehicle_class)
  const subjectPos = $derived(subjectVehicle?.position)
  const aheadDriver = $derived(
    subjectPos != null
      ? vehicles.find((v) => v.position === subjectPos - 1)?.driver_name
      : undefined
  )
  const behindDriver = $derived(
    subjectPos != null
      ? vehicles.find((v) => v.position === subjectPos + 1)?.driver_name
      : undefined
  )
</script>

{#if racing}
<section
  class="bc-battle"
  class:bc-battle--idle={!active}
  class:bc-battle--hot={active && hot}
  aria-label="Battle for position"
>
  <header class="bc-battle__header">
    <span class="bc-battle__title">{active ? headerLabel : 'BATTLE FOR POSITION'}</span>
    {#if active && carClass}
      <ClassChip {carClass} size="compact" />
    {/if}
  </header>

  {#if active}
    <div class="bc-battle__body">
      <div class="bc-battle__slot bc-battle__slot--ahead">
        <span class="bc-battle__slot-label">AHEAD</span>
        <span class="bc-battle__slot-name">{aheadDriver ? fmtName(aheadDriver) : '—'}</span>
        <span class="bc-battle__gap">{fmtGap(relationship?.gap_ahead)}</span>
      </div>

      <div class="bc-battle__slot bc-battle__slot--focus">
        <span class="bc-battle__slot-label">FOCUS</span>
        <span class="bc-battle__focus-name">{fmtName(subject?.driver_name)}</span>
      </div>

      <div class="bc-battle__slot bc-battle__slot--behind">
        <span class="bc-battle__slot-label">BEHIND</span>
        <span class="bc-battle__slot-name">{behindDriver ? fmtName(behindDriver) : '—'}</span>
        <span class="bc-battle__gap">{fmtGap(relationship?.gap_behind)}</span>
      </div>
    </div>

    <div class="bc-battle__meter">
      <IntensityMeter value={intensity} label="INTENSITY" />
    </div>
  {:else}
    <div class="bc-battle__idle">
      <span class="bc-battle__idle-heading">NO ACTIVE BATTLE</span>
      <span class="bc-battle__idle-sub">CLEAR AIR — {fmtName(subject?.driver_name) || 'ON-CAMERA CAR'}</span>
    </div>
  {/if}
</section>
{/if}

<style>
  .bc-battle {
    position: relative;
    width: var(--bc-battle-width);
    box-sizing: border-box;
    background: var(--bc-plate-dense);
    backdrop-filter: var(--bc-blur);
    -webkit-backdrop-filter: var(--bc-blur);
    border: 1px solid var(--bc-hairline);
    border-radius: var(--bc-radius);
    box-shadow: var(--bc-shadow-plate);
    overflow: hidden;
    color: var(--bc-text);
  }

  /* Intensifying border: the pulsing red ring is drawn on an overlay that sits
     ABOVE the header, so it wraps the whole widget. Painting it (as bc-pulse's
     inset shadow) on the section itself let the header's opaque background cover
     the ring along the top edge — the border then appeared to hug only the body.
     inset:0 + the plate's overflow:hidden clip the ring to the rounded frame. */
  .bc-battle--hot::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    z-index: 3;
    animation: bc-pulse var(--bc-dur-pulse) var(--bc-ease) infinite;
  }

  .bc-battle--idle {
    border-style: dashed;
    border-color: var(--bc-text-3);
    box-shadow: var(--bc-shadow-soft);
    opacity: 0.72;
  }

  .bc-battle__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--bc-widget-header);
    padding: 0 var(--bc-space-3);
    background: var(--bc-header);
    border-bottom: 1px solid var(--bc-hairline);
  }

  .bc-battle__title {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-title);
    text-transform: uppercase;
    color: var(--bc-text-2);
  }

  .bc-battle--hot .bc-battle__title {
    color: var(--bc-intensity-hot);
  }

  .bc-battle__body {
    display: grid;
    grid-template-columns: 1fr 1.15fr 1fr;
    gap: var(--bc-space-2);
    padding: var(--bc-space-3);
  }

  .bc-battle__slot {
    display: flex;
    flex-direction: column;
    gap: var(--bc-space-1);
    min-width: 0;
  }

  .bc-battle__slot--focus {
    align-items: center;
    text-align: center;
    padding: 0 var(--bc-space-2);
    border-left: 1px solid var(--bc-divider);
    border-right: 1px solid var(--bc-divider);
  }

  .bc-battle__slot--behind {
    align-items: flex-end;
    text-align: right;
  }

  .bc-battle__slot-label {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-3);
  }

  .bc-battle__slot-name {
    font-family: var(--bc-font-display);
    font-size: var(--bc-size-name-compact);
    font-weight: var(--bc-weight-name);
    color: var(--bc-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .bc-battle__focus-name {
    font-family: var(--bc-font-display);
    font-size: var(--bc-size-battle-name);
    font-weight: var(--bc-weight-leader);
    color: var(--bc-oncam-text);
    text-shadow: 0 0 12px var(--bc-accent-glow);
    white-space: nowrap;
  }

  .bc-battle__gap {
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-gap);
    font-weight: var(--bc-weight-num);
    font-variant-numeric: tabular-nums;
    color: var(--bc-text);
  }

  .bc-battle__meter {
    padding: 0 var(--bc-space-3) var(--bc-space-3);
  }

  .bc-battle__idle {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--bc-space-1);
    padding: var(--bc-space-6) var(--bc-space-3);
    text-align: center;
  }

  .bc-battle__idle-heading {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-name-compact);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-2);
  }

  .bc-battle__idle-sub {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-3);
  }
</style>
