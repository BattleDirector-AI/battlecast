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
  import LowerThirdShell from '../../lib/LowerThirdShell.svelte'

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

  /** Freeze a resolved subject + vehicle into a flat, self-contained card so a
   *  class-best flash can keep showing the driver who EARNED the lap even after the
   *  camera cuts away (sectors are copied, not referenced). */
  function cardFrom(res, veh) {
    return {
      state: res.state,
      name: fmtName(res.name),
      position: veh?.position,
      carClass: veh?.vehicle_class,
      best: veh?.best_lap,
      last: veh?.last_lap,
      sectors: Array.isArray(veh?.sector_times) ? [...veh.sector_times] : [],
      target: veh?.target_lap,
      delta: veh?.delta_to_target,
    }
  }

  // The two fire paths are INDEPENDENT signals, so each gets its OWN trigger engine
  // (both plain instances of the shared, unmodified lowerThirdTrigger):
  //
  //  1. mode-dwell — the qualifying/practice "fire on a camera cut" timing bar. Keyed
  //     purely on the subject slot and gated by `active && eligible`, so entering a
  //     gated-out mode cleanly HIDES (no spurious edge) and a plain race cut never
  //     fires. Renders the LIVE current subject — correct for a live timing bar.
  //  2. class-best flash — keyed ONLY on a class-best edge token, in ANY mode. A
  //     subject cut alone never changes the token; only a producer false→true
  //     `notable.class_best_lap` edge bumps it. Renders a FROZEN snapshot of the
  //     earning driver so a later cut can't re-badge someone else.
  //
  // The overlay only ever tracks whether that producer flag changed vs. the previous
  // snapshot — it never scans lap times to derive a class best (dumb overlay, smart
  // producer — docs/decisions/0002-lower-third-widgets.md).
  let modeShown = $state(false)
  let flashShown = $state(false)
  const modeDwell = createLowerThirdTrigger({ onChange: (v) => (modeShown = v) })
  const flash = createLowerThirdTrigger({ onChange: (v) => (flashShown = v) })
  onDestroy(() => {
    modeDwell.stop()
    flash.stop()
  })

  // Class-best edge state (instance-local, not $state, so mutating inside the effect
  // can't loop). `NO_SLOT` distinguishes "never synced" from a real `null` slot.
  const NO_SLOT = Symbol('unset')
  let cbToken = 0
  let prevCbSlot = NO_SLOT
  let prevCbFlag = false
  // The frozen earning-driver card for the current flash (reactive so the render
  // updates when a fresh edge re-captures it).
  let flashCard = $state(null)

  $effect(() => {
    const slotId = resolved.slotId
    const curFlag = vehicle?.notable?.class_best_lap === true

    // Edge-detect the class-best flag. On the first snapshot AND whenever the subject
    // changes, (re)establish the baseline WITHOUT firing — so a pre-existing flag (or
    // cutting to a car that already holds a class best) never flashes.
    if (prevCbSlot !== slotId) {
      prevCbSlot = slotId
      prevCbFlag = curFlag
    } else if (fireOnClassBest && curFlag && !prevCbFlag) {
      cbToken += 1
      flashCard = cardFrom(resolved, vehicle) // freeze the driver who earned it
      prevCbFlag = curFlag
    } else {
      prevCbFlag = curFlag
    }

    // Mode-dwell: fire on a camera cut only in an eligible session mode; hide cleanly
    // when gated out (active === false). Uses the widget's own trigger/showOnConnect.
    modeDwell.sync({
      subjectSlotId: eligible ? slotId : null,
      active: active && eligible,
      trigger,
      dwellSeconds,
      showOnConnect,
    })

    // Class-best flash: keyed on the edge token only, always a dwell, never fires on
    // connect (showOnConnect: false) so a baseline / pre-existing flag can't flash.
    // `active: true` keeps the dwell running for its full duration independent of any
    // subsequent camera cut (the frozen card stays on the earning driver).
    flash.sync({
      subjectSlotId: `cb#${cbToken}`,
      active: true,
      trigger: 'dwell',
      dwellSeconds,
      showOnConnect: false,
    })
  })

  // The flash takes visual precedence (it's the fastest-lap moment). When it's up we
  // render the FROZEN earning-driver card; otherwise the LIVE current subject.
  const liveCard = $derived(cardFrom(resolved, vehicle))
  const isFlash = $derived(flashShown && flashCard != null)
  const shown = $derived(modeShown || isFlash)
  const card = $derived(isFlash ? flashCard : liveCard)
  const hasTarget = $derived(card && (card.target != null || card.delta != null))

  // Re-cut reveal (#64): the key that remounts the shell so a card change replays
  // the entrance/exit reveal instead of swapping content in place. Two fire paths
  // mean we key on the DISPLAYED card identity, not just the slot:
  //  - live (mode-dwell): the on-camera subject's slot_id — a camera cut to a new
  //    driver re-reveals the timing bar.
  //  - flash (class-best): the FROZEN earning-driver card object — a fresh class-best
  //    edge captures a new `flashCard`, so its identity changes and re-reveals even if
  //    the same driver, and a mid-flash camera cut (same frozen card) does NOT.
  // Under reduced motion the exit is duration 0, so this stays an instant swap.
  const recutKey = $derived(isFlash ? flashCard : resolved.slotId)
</script>

{#if shown && card}
  {#key recutKey}
    <LowerThirdShell>
      <section
        class="bc-qt"
        class:bc-qt--flash={isFlash}
        data-testid="qualifying-lower-third"
        data-state={card.state}
        data-recut-key={isFlash ? `flash-${cbToken}` : (resolved.slotId ?? 'none')}
        aria-label="On-camera driver timing"
      >
        <span class="bc-qt__accent" aria-hidden="true"></span>
        <div class="bc-qt__body">
          <div class="bc-qt__head">
            <span class="bc-qt__label" data-testid="qt-label">{isFlash ? 'CLASS BEST' : 'TIMING'}</span>
            {#if card.position != null}
              <span class="bc-qt__pos" data-testid="qt-pos">P{card.position}</span>
            {/if}
            <span class="bc-qt__name" data-testid="qt-name">{card.name}</span>
            {#if card.carClass}
              <ClassChip carClass={card.carClass} size="compact" />
            {/if}
          </div>

          <div class="bc-qt__times">
            <div class="bc-qt__cell bc-qt__cell--best">
              <span class="bc-qt__cell-label">BEST</span>
              <span class="bc-qt__cell-value" data-testid="qt-best">{fmtLapTime(card.best)}</span>
            </div>
            <div class="bc-qt__cell">
              <span class="bc-qt__cell-label">LAST</span>
              <span class="bc-qt__cell-value" data-testid="qt-last">{fmtLapTime(card.last)}</span>
            </div>
            <div class="bc-qt__sectors" data-testid="qt-sectors">
              {#each ['S1', 'S2', 'S3'] as name, i (name)}
                <div class="bc-qt__cell bc-qt__cell--sector">
                  <span class="bc-qt__cell-label">{name}</span>
                  <span class="bc-qt__cell-value" data-testid="qt-{name.toLowerCase()}"
                    >{fmtSector(card.sectors[i])}</span
                  >
                </div>
              {/each}
            </div>
            {#if hasTarget}
              <div class="bc-qt__cell bc-qt__cell--target" data-testid="qt-target-cell">
                <span class="bc-qt__cell-label">TARGET</span>
                <span class="bc-qt__cell-value" data-testid="qt-target"
                  >{fmtLapTime(card.target)}</span
                >
              </div>
              <div
                class="bc-qt__cell bc-qt__cell--delta"
                class:bc-qt__cell--ahead={card.delta != null && card.delta <= 0}
                data-testid="qt-delta-cell"
              >
                <span class="bc-qt__cell-label">Δ</span>
                <span class="bc-qt__cell-value" data-testid="qt-delta">{fmtDelta(card.delta)}</span>
              </div>
            {/if}
          </div>
        </div>
      </section>
    </LowerThirdShell>
  {/key}
{/if}

<style>
  /* The plate chrome and the entrance/exit motion now live in LowerThirdShell;
     this owns only the timing bar's inner layout. */
  .bc-qt {
    box-sizing: border-box;
    display: flex;
    align-items: stretch;
    gap: var(--bc-space-3);
    padding: var(--bc-space-3) var(--bc-space-4);
    color: var(--bc-text);
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
    background: var(--bc-intensity-hot, var(--bc-up, #7cffb2));
    box-shadow: 0 0 12px var(--bc-intensity-hot, var(--bc-up, #7cffb2));
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
    color: var(--bc-intensity-hot, var(--bc-up, #7cffb2));
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
</style>
