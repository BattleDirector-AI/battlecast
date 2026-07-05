<script module>
  /**
   * Resolve the on-camera `subject` against the field into a render decision.
   *
   * - `valid`    — `subject.slot_id` resolves to a `vehicles[]` entry → full card
   *                (name + position + class).
   * - `degraded` — `subject.driver_name` present but the slot_id is unresolved
   *                (absent, or no matching vehicle) → name-only card.
   * - `invalid`  — no driver_name and no resolvable slot_id → idle (nothing to show).
   *
   * Identity is keyed off `slot_id`, never `driver_name` (slot_id is the stable
   * per-session key; two drivers can share a name).
   */
  export function resolveSubject(snapshot) {
    const subject = snapshot?.subject ?? null
    const slotId = subject?.slot_id ?? null
    const name = subject?.driver_name ?? null
    const vehicles = Array.isArray(snapshot?.vehicles) ? snapshot.vehicles : []
    const vehicle = slotId != null ? vehicles.find((v) => v.slot_id === slotId) : undefined

    let state
    if (vehicle) state = 'valid'
    else if (name) state = 'degraded'
    else state = 'invalid'

    return { slotId, name, vehicle, state }
  }

  /** True when there is no subject worth showing (idle). Used by widgetIdle.js so
   *  persistent-mode auto-hide agrees with what the component would draw. */
  export function isDriverSubjectIdle(snapshot) {
    return resolveSubject(snapshot).state === 'invalid'
  }
</script>

<script>
  import { onDestroy } from 'svelte'
  import ClassChip from '../../design/ClassChip.svelte'
  import { fmtName } from '../../design/format.js'
  import { createLowerThirdTrigger, DEFAULT_DWELL_SECONDS } from '../../lib/lowerThirdTrigger.js'
  import LowerThirdShell from '../../lib/LowerThirdShell.svelte'

  // `widget` carries the per-widget lower-third config (trigger, dwellSeconds,
  // showOnConnect) alongside geometry; only lower-thirds read those knobs.
  let { snapshot = null, widget = {} } = $props()

  const resolved = $derived(resolveSubject(snapshot))
  const active = $derived(resolved.state !== 'invalid')
  const trigger = $derived(widget?.trigger === 'persistent' ? 'persistent' : 'dwell')
  const dwellSeconds = $derived(
    Number(widget?.dwellSeconds) > 0 ? Number(widget.dwellSeconds) : DEFAULT_DWELL_SECONDS,
  )
  const showOnConnect = $derived(widget?.showOnConnect !== false)

  // The engine owns fire/dwell/hide timing; we mirror its output into reactive
  // state via onChange. The card renders only while `shown` — when not firing the
  // component renders nothing, so AllView can always mount the slot and let the
  // component self-manage visibility (dwell can't be driven by a stateless filter).
  let shown = $state(false)
  const engine = createLowerThirdTrigger({ onChange: (v) => (shown = v) })
  onDestroy(() => engine.stop())

  // Forward every subject/config change to the engine. Reading the derived values
  // here is what makes this effect re-run on a camera cut; the engine's own
  // edge-detection ignores unchanged repeats, so a steady subject won't re-fire.
  $effect(() => {
    engine.sync({
      subjectSlotId: resolved.slotId,
      active,
      trigger,
      dwellSeconds,
      showOnConnect,
    })
  })

  const position = $derived(resolved.vehicle?.position)
  const carClass = $derived(resolved.vehicle?.vehicle_class)
  const displayName = $derived(fmtName(resolved.name))
</script>

{#if shown}
  <!-- Re-cut reveal (#64): key the shell on the on-camera identity so a camera cut
       to a NEW driver while the card is already up REMOUNTS the plate — the old
       driver plays its `out:lowerThirdOut` exit and the new plays its entrance
       reveal. Without this the trigger's in-place re-fire (which correctly keeps
       `shown` true across the cut) never toggles `{#if}`, so the reveal never
       replays and the name would silently swap. Under reduced motion the exit is
       duration 0, so this stays an instant swap. -->
  {#key resolved.slotId}
    <LowerThirdShell>
      <section
        class="bc-lt"
        class:bc-lt--degraded={resolved.state === 'degraded'}
        data-testid="driver-lower-third"
        data-state={resolved.state}
        data-recut-key={resolved.slotId ?? 'none'}
        aria-label="On-camera driver"
      >
        <span class="bc-lt__accent" aria-hidden="true"></span>
        <div class="bc-lt__body">
          <div class="bc-lt__meta">
            <span class="bc-lt__label">ON CAMERA</span>
            {#if position != null}
              <span class="bc-lt__pos" data-testid="driver-lt-pos">P{position}</span>
            {/if}
            {#if carClass}
              <ClassChip {carClass} size="compact" />
            {/if}
          </div>
          <span class="bc-lt__name" data-testid="driver-lt-name">{displayName}</span>
        </div>
      </section>
    </LowerThirdShell>
  {/key}
{/if}

<style>
  /* The plate chrome (background, blur, border, radius, shadow) and the
     entrance/exit motion now live in LowerThirdShell; this owns only the card's
     inner layout. */
  .bc-lt {
    box-sizing: border-box;
    display: flex;
    align-items: stretch;
    gap: var(--bc-space-3);
    padding: var(--bc-space-3) var(--bc-space-4);
    color: var(--bc-text);
  }

  /* Cyan accent bar — reserved for the on-camera driver, matching the tower. */
  .bc-lt__accent {
    flex: 0 0 auto;
    width: 4px;
    align-self: stretch;
    border-radius: 2px;
    background: var(--bc-accent);
    box-shadow: 0 0 12px var(--bc-accent-glow);
  }

  .bc-lt__body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--bc-space-1);
    min-width: 0;
  }

  .bc-lt__meta {
    display: flex;
    align-items: center;
    gap: var(--bc-space-2);
  }

  .bc-lt__label {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-3);
  }

  .bc-lt__pos {
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-pos);
    font-weight: var(--bc-weight-num);
    font-variant-numeric: tabular-nums;
    color: var(--bc-accent);
  }

  .bc-lt__name {
    font-family: var(--bc-font-display);
    font-size: var(--bc-size-battle-name);
    font-weight: var(--bc-weight-leader);
    color: var(--bc-oncam-text);
    text-shadow: 0 0 12px var(--bc-accent-glow);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
</style>
