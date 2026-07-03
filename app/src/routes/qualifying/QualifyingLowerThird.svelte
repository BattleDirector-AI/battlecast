<script module>
  import { resolveSubject } from '../driver/DriverLowerThird.svelte'

  /** True when the resolved vehicle carries no timing at all — no `best_lap`,
   *  no `last_lap`, and no `sector_times`. Per spec #22 this is one of the idle
   *  conditions (nothing to render as a timing bar). */
  export function hasTiming(vehicle) {
    if (!vehicle) return false
    const sectors = Array.isArray(vehicle.sector_times) ? vehicle.sector_times : []
    return vehicle.best_lap != null || vehicle.last_lap != null || sectors.length > 0
  }

  /** Stateless idle predicate for the qualifying/sector lower-third (used by
   *  widgetIdle.js for persistent-mode / hideWhenIdle consistency). Idle when the
   *  subject is invalid/degraded OR the resolved vehicle has no timing.
   *
   *  Mode-gating, the class-best flash, and the dwell timeout are NOT decided here:
   *  they are edge/timer concerns handled inside the component (a stateless
   *  predicate can't see the previous snapshot or a running dwell), exactly like the
   *  driver lower-third. Keeping them out of this predicate also means an opted-in
   *  `hideWhenIdle` never suppresses the component before a class-best flash can
   *  fire. */
  export function isQualifyingIdle(snapshot) {
    const resolved = resolveSubject(snapshot)
    if (resolved.state !== 'valid') return true
    return !hasTiming(resolved.vehicle)
  }
</script>

<script>
  import { onDestroy } from 'svelte'
  import ClassChip from '../../design/ClassChip.svelte'
  import { fmtName, fmtLapTime, fmtSector, fmtDelta } from '../../design/format.js'
  import { createLowerThirdTrigger, DEFAULT_DWELL_SECONDS } from '../../lib/lowerThirdTrigger.js'
  import { QUALIFYING_DEFAULTS } from '../../lib/overlayConfig.js'

  // `widget` carries the per-widget lower-third config (trigger / dwellSeconds /
  // showOnConnect) plus the #22 knobs (`modes`, `fireOnClassBest`).
  let { snapshot = null, widget = {} } = $props()

  const resolved = $derived(resolveSubject(snapshot))
  const vehicle = $derived(resolved.vehicle)
  const timed = $derived(hasTiming(vehicle))
  // Renderable base = a fully valid subject that actually has timing to show.
  const active = $derived(resolved.state === 'valid' && timed)

  const mode = $derived(snapshot?.mode ?? null)
  const modes = $derived(
    Array.isArray(widget?.modes) && widget.modes.length ? widget.modes : QUALIFYING_DEFAULTS.modes,
  )
  const eligible = $derived(mode != null && modes.includes(mode))
  const fireOnClassBest = $derived(widget?.fireOnClassBest !== false)

  const trigger = $derived(widget?.trigger === 'persistent' ? 'persistent' : 'dwell')
  const dwellSeconds = $derived(
    Number(widget?.dwellSeconds) > 0 ? Number(widget.dwellSeconds) : DEFAULT_DWELL_SECONDS,
  )
  const showOnConnect = $derived(widget?.showOnConnect !== false)

  // --- class-best flash edge detection (presentation only, never derivation) ---
  // The overlay ONLY tracks whether the producer's `notable.class_best_lap` flag
  // for the CURRENT subject changed vs. the previous snapshot. It fires on the
  // false→true transition; it never scans lap times to decide what a class best is
  // (dumb overlay, smart producer — docs/decisions/0002-lower-third-widgets.md).
  //
  // A fresh edge bumps `cbToken`, which feeds the composite trigger key below so the
  // shared engine fires a dwell. Instance-local (not $state) so mutating it inside
  // the effect can't loop. A `NO_SLOT` sentinel distinguishes "never synced".
  const NO_SLOT = Symbol('unset')
  let cbToken = 0
  let prevCbSlot = NO_SLOT
  let prevCbFlag = false

  let shown = $state(false)
  const engine = createLowerThirdTrigger({ onChange: (v) => (shown = v) })
  onDestroy(() => engine.stop())

  $effect(() => {
    const slotId = resolved.slotId
    const curFlag = vehicle?.notable?.class_best_lap === true

    // Edge-detect the class-best flag. On the first snapshot AND whenever the
    // subject changes, (re)establish the baseline WITHOUT firing — so a pre-existing
    // flag (or cutting to a car that already holds a class best) never flashes.
    if (prevCbSlot !== slotId) {
      prevCbSlot = slotId
      prevCbFlag = curFlag
    } else {
      if (fireOnClassBest && curFlag && !prevCbFlag) cbToken += 1
      prevCbFlag = curFlag
    }

    // Composite trigger key: in an eligible session mode it changes on a subject
    // cut (normal dwell-on-cut); in any mode it changes on a fresh class-best edge
    // (the independent flash). In a gated-out mode the cut part is constant, so a
    // plain race cut alone does NOT fire — only a class-best does.
    const cutPart = eligible ? (slotId ?? 'none') : 'gated'
    const key = `${cutPart}#${cbToken}`

    engine.sync({
      subjectSlotId: key,
      active,
      trigger,
      dwellSeconds,
      // Connect / persistent display is mode-gated; the class-best flash bypasses it
      // via the key above (a non-first key change fires regardless of showOnConnect).
      showOnConnect: showOnConnect && eligible,
    })
  })

  const displayName = $derived(fmtName(resolved.name))
  const carClass = $derived(vehicle?.vehicle_class)
  const position = $derived(vehicle?.position)
  const bestLap = $derived(vehicle?.best_lap)
  const lastLap = $derived(vehicle?.last_lap)
  const sectors = $derived(Array.isArray(vehicle?.sector_times) ? vehicle.sector_times : [])
  const targetLap = $derived(vehicle?.target_lap)
  const deltaToTarget = $derived(vehicle?.delta_to_target)
  const hasTarget = $derived(targetLap != null || deltaToTarget != null)
  // A class-best flash is on screen when we're firing in a mode that wouldn't
  // otherwise show the bar (used only to badge the card).
  const classBestFlash = $derived(shown && !eligible)
</script>

{#if shown}
  <section
    class="bc-qt"
    class:bc-qt--flash={classBestFlash}
    data-testid="qualifying-lower-third"
    data-state={resolved.state}
    aria-label="On-camera driver timing"
  >
    <span class="bc-qt__accent" aria-hidden="true"></span>
    <div class="bc-qt__body">
      <div class="bc-qt__head">
        <span class="bc-qt__label" data-testid="qt-label"
          >{classBestFlash ? 'CLASS BEST' : 'TIMING'}</span
        >
        {#if position != null}
          <span class="bc-qt__pos" data-testid="qt-pos">P{position}</span>
        {/if}
        <span class="bc-qt__name" data-testid="qt-name">{displayName}</span>
        {#if carClass}
          <ClassChip {carClass} size="compact" />
        {/if}
      </div>

      <div class="bc-qt__times">
        <div class="bc-qt__cell bc-qt__cell--best">
          <span class="bc-qt__cell-label">BEST</span>
          <span class="bc-qt__cell-value" data-testid="qt-best">{fmtLapTime(bestLap)}</span>
        </div>
        <div class="bc-qt__cell">
          <span class="bc-qt__cell-label">LAST</span>
          <span class="bc-qt__cell-value" data-testid="qt-last">{fmtLapTime(lastLap)}</span>
        </div>
        <div class="bc-qt__sectors" data-testid="qt-sectors">
          {#each ['S1', 'S2', 'S3'] as name, i (name)}
            <div class="bc-qt__cell bc-qt__cell--sector">
              <span class="bc-qt__cell-label">{name}</span>
              <span class="bc-qt__cell-value" data-testid="qt-{name.toLowerCase()}"
                >{fmtSector(sectors[i])}</span
              >
            </div>
          {/each}
        </div>
        {#if hasTarget}
          <div class="bc-qt__cell bc-qt__cell--target" data-testid="qt-target-cell">
            <span class="bc-qt__cell-label">TARGET</span>
            <span class="bc-qt__cell-value" data-testid="qt-target">{fmtLapTime(targetLap)}</span>
          </div>
          <div
            class="bc-qt__cell bc-qt__cell--delta"
            class:bc-qt__cell--ahead={deltaToTarget != null && deltaToTarget <= 0}
            data-testid="qt-delta-cell"
          >
            <span class="bc-qt__cell-label">Δ</span>
            <span class="bc-qt__cell-value" data-testid="qt-delta">{fmtDelta(deltaToTarget)}</span>
          </div>
        {/if}
      </div>
    </div>
  </section>
{/if}

<style>
  .bc-qt {
    position: relative;
    box-sizing: border-box;
    display: flex;
    align-items: stretch;
    gap: var(--bc-space-3);
    padding: var(--bc-space-3) var(--bc-space-4);
    background: var(--bc-plate-dense);
    backdrop-filter: var(--bc-blur);
    -webkit-backdrop-filter: var(--bc-blur);
    border: 1px solid var(--bc-hairline);
    border-radius: var(--bc-radius);
    box-shadow: var(--bc-shadow-plate);
    color: var(--bc-text);
    overflow: hidden;
    /* The card only mounts while firing, so this replays on every fire. */
    animation: bc-qt-in var(--bc-dur-reorder) var(--bc-ease);
  }

  .bc-qt__accent {
    flex: 0 0 auto;
    width: 4px;
    align-self: stretch;
    border-radius: 2px;
    background: var(--bc-accent);
    box-shadow: 0 0 12px var(--bc-accent-glow);
  }

  /* Class-best flash: warm accent to read as a "fastest lap" moment. */
  .bc-qt--flash .bc-qt__accent {
    background: var(--bc-intensity-hot, var(--bc-up, #7CFFB2));
    box-shadow: 0 0 12px var(--bc-intensity-hot, var(--bc-up, #7CFFB2));
  }

  .bc-qt__body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--bc-space-2);
    min-width: 0;
    width: 100%;
  }

  .bc-qt__head {
    display: flex;
    align-items: center;
    gap: var(--bc-space-2);
    min-width: 0;
  }

  .bc-qt__label {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-3);
  }

  .bc-qt--flash .bc-qt__label {
    color: var(--bc-intensity-hot, var(--bc-up, #7CFFB2));
  }

  .bc-qt__pos {
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-pos);
    font-weight: var(--bc-weight-num);
    font-variant-numeric: tabular-nums;
    color: var(--bc-accent);
  }

  .bc-qt__name {
    font-family: var(--bc-font-display);
    font-size: var(--bc-size-name-compact);
    font-weight: var(--bc-weight-name);
    color: var(--bc-oncam-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .bc-qt__times {
    display: flex;
    align-items: stretch;
    gap: var(--bc-space-3);
    flex-wrap: wrap;
  }

  .bc-qt__sectors {
    display: flex;
    gap: var(--bc-space-3);
  }

  .bc-qt__cell {
    display: flex;
    flex-direction: column;
    gap: var(--bc-space-1);
    min-width: 0;
  }

  .bc-qt__cell-label {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-3);
  }

  .bc-qt__cell-value {
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-gap);
    font-weight: var(--bc-weight-num);
    font-variant-numeric: tabular-nums;
    color: var(--bc-text);
  }

  .bc-qt__cell--best .bc-qt__cell-value {
    color: var(--bc-oncam-text);
    text-shadow: 0 0 12px var(--bc-accent-glow);
  }

  .bc-qt__cell--delta.bc-qt__cell--ahead .bc-qt__cell-value {
    color: var(--bc-up, #7cffb2);
  }

  @keyframes bc-qt-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
