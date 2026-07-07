<script module>
  // On-board HUD — the on-camera subject's LIVE inputs (throttle / brake / speed /
  // gear) from `subject.telemetry`, plus an optional, configurable driver/vehicle
  // identity strip (name / number / class / make / model). See spec/v1/SPEC.md and
  // docs/plans/0.6.0-onboard-hud.md.
  //
  // The telemetry re-renders every snapshot. The identity fields come from the
  // additive `vehicle` spec fields (car_number / make / model) plus driver_name /
  // vehicle_class, resolved against the on-camera subject. To avoid showing the
  // driver name twice, the HUD can hold off while the driver lower-third (#21) plays
  // its "now on camera" dwell and reveal once it wipes out (the hand-off) — see the
  // instance script.
  //
  // Dumb overlay, smart producer (docs/decisions/0002-lower-third-widgets.md): every
  // value is producer-owned. Inputs may be null/undefined/partial/garbage — these
  // helpers normalize defensively and never throw.
  import { fmtName } from '../../design/format.js'

  /** Coerce to a finite number, else null. */
  function finiteOrNull(v) {
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }

  /** Clamp a [0,1] input (throttle/brake) into range, or null if not a number. */
  function clamp01(v) {
    const n = finiteOrNull(v)
    if (n == null) return null
    return Math.max(0, Math.min(1, n))
  }

  /**
   * Normalize a raw `subject.telemetry` object into the HUD's render model, or null
   * when there is nothing to show (absent object, or every field missing/garbage) so
   * the component can render nothing rather than an empty plate.
   */
  export function resolveTelemetry(telemetry) {
    if (telemetry == null || typeof telemetry !== 'object') return null
    const throttle = clamp01(telemetry.throttle)
    const brake = clamp01(telemetry.brake)
    const speed = finiteOrNull(telemetry.speed)
    const gearNum = finiteOrNull(telemetry.gear)
    const gear = gearNum == null ? null : Math.trunc(gearNum)
    const hasContent = throttle != null || brake != null || speed != null || gear != null
    if (!hasContent) return null
    return { throttle, brake, speed, gear }
  }

  /** Gear numeral -> broadcast label: 0 -> N (neutral), <0 -> R (reverse), else verbatim. */
  export function gearLabel(gear) {
    if (gear == null) return null
    if (gear === 0) return 'N'
    if (gear < 0) return 'R'
    return String(gear)
  }

  // The producer emits `speed` in canonical km/h (see spec/v1/SPEC.md
  // `subject.telemetry`); the HUD converts to the broadcaster-selected display unit.
  const KMH_TO_MPH = 0.621371

  /** Convert a canonical km/h speed to the display `unit` ('kmh' | 'mph'), or null. */
  export function convertSpeed(speedKmh, unit = 'kmh') {
    if (speedKmh == null) return null
    return unit === 'mph' ? speedKmh * KMH_TO_MPH : speedKmh
  }

  /** Speed (canonical km/h) -> rounded numeral string in the display `unit`, or null. */
  export function speedLabel(speedKmh, unit = 'kmh') {
    const v = convertSpeed(speedKmh, unit)
    if (v == null) return null
    return String(Math.round(v))
  }

  /** Display `unit` -> its readout label. */
  export function unitLabel(unit) {
    return unit === 'mph' ? 'MPH' : 'KM/H'
  }

  /**
   * Resolve the on-camera subject's driver/vehicle identity for the HUD, honoring the
   * per-widget `driverInfo` toggles ({ name, number, class, make, model } booleans).
   * `name` is from `subject.driver_name`; `number`/`class`/`make`/`model` are read off
   * the matching `vehicles[]` entry (the additive spec fields). Returns only the
   * ENABLED and PRESENT fields, or null when there is nothing to show — so the caller
   * can omit the identity strip entirely. Never throws on partial/garbage data.
   */
  export function resolveIdentity(snapshot, widget = {}) {
    const info = widget && typeof widget.driverInfo === 'object' && widget.driverInfo ? widget.driverInfo : {}
    const subject = snapshot?.subject ?? null
    if (!subject || typeof subject !== 'object') return null
    const slotId = subject.slot_id ?? null
    const vehicles = Array.isArray(snapshot?.vehicles) ? snapshot.vehicles : []
    const vehicle = slotId != null ? vehicles.find((v) => v && v.slot_id === slotId) : undefined

    const rawName = subject.driver_name ?? vehicle?.driver_name ?? null
    const out = {}
    if (info.name && rawName) out.name = fmtName(rawName)
    const number = vehicle?.car_number
    if (info.number && number != null && String(number).trim()) out.number = String(number).trim()
    if (info.class && vehicle?.vehicle_class) out.class = String(vehicle.vehicle_class)
    if (info.make && vehicle?.make) out.make = String(vehicle.make)
    if (info.model && vehicle?.model) out.model = String(vehicle.model)

    const has = out.name || out.number || out.class || out.make || out.model
    return has ? out : null
  }
</script>

<script>
  import { onDestroy } from 'svelte'
  import ClassChip from '../../design/ClassChip.svelte'
  import { createLowerThirdTrigger } from '../../lib/lowerThirdTrigger.js'

  let {
    telemetry = null,
    mode = null,
    speedUnit = 'kmh',
    // Pre-resolved identity ({ name?, number?, class?, make?, model? } or null) — the
    // caller resolves it via resolveIdentity() from the snapshot + the widget config.
    identity = null,
    // Hand-off inputs. When `driverWidget` is supplied (only on `/all`, and only when
    // the onboard `waitForLowerThird` knob is on and the driver lower-third is
    // visible), the HUD mirrors that lower-third's fire/dwell timing off the subject
    // stream and suppresses itself while the card is up. `null` => no gate (standalone
    // `/onboard`, or the knob is off).
    subjectSlotId = null,
    subjectActive = false,
    driverWidget = null,
  } = $props()

  const t = $derived(resolveTelemetry(telemetry))
  const gear = $derived(t ? gearLabel(t.gear) : null)
  const speed = $derived(t ? speedLabel(t.speed, speedUnit) : null)
  const unit = $derived(unitLabel(speedUnit))
  const carLine = $derived(identity ? [identity.make, identity.model].filter(Boolean).join(' ') : '')

  // Hand-off (#26 + #21): reuse the shared lower-third trigger engine to compute,
  // independently, the exact same shown/hidden timeline as the driver lower-third —
  // no cross-widget state. While that card is shown, the HUD is suppressed.
  let lowerThirdShown = $state(false)
  const gate = createLowerThirdTrigger({ onChange: (v) => (lowerThirdShown = v) })
  onDestroy(() => gate.stop())

  $effect(() => {
    if (!driverWidget) {
      // No gate: standalone route, or waitForLowerThird off / driver card hidden.
      gate.stop()
      lowerThirdShown = false
      return
    }
    gate.sync({
      subjectSlotId,
      active: subjectActive,
      trigger: driverWidget.trigger,
      dwellSeconds: driverWidget.dwellSeconds,
      showOnConnect: driverWidget.showOnConnect,
    })
  })

  const suppressed = $derived(!!driverWidget && lowerThirdShown)
  // The HUD is a live-telemetry widget: it shows only when there are inputs to show
  // (identity rides along with telemetry, it doesn't summon the HUD on its own), and
  // never while the driver lower-third is holding the "now on camera" card.
  const visible = $derived(!!t && !suppressed)
</script>

{#if visible}
<section
  class="bc-onboard"
  data-testid="onboard-hud"
  data-mode={mode ?? ''}
  aria-label="On-board telemetry"
>
  {#if identity}
    <div class="bc-onboard__identity" data-testid="onboard-identity">
      {#if identity.number}
        <span class="bc-onboard__number" data-testid="onboard-driver-number">{identity.number}</span>
      {/if}
      {#if identity.name}
        <span class="bc-onboard__driver" data-testid="onboard-driver-name">{identity.name}</span>
      {/if}
      {#if identity.class}
        <span class="bc-onboard__class" data-testid="onboard-driver-class">
          <ClassChip carClass={identity.class} size="compact" />
        </span>
      {/if}
      {#if carLine}
        <span class="bc-onboard__car" data-testid="onboard-driver-car">{carLine}</span>
      {/if}
    </div>
  {/if}

  <div class="bc-onboard__telemetry">
    <div class="bc-onboard__bars">
      {#if t.throttle != null}
        <div class="bc-onboard__bar" data-testid="onboard-throttle">
          <span class="bc-onboard__bar-label">THROTTLE</span>
          <div class="bc-onboard__track">
            <div
              class="bc-onboard__fill bc-onboard__fill--throttle"
              data-testid="onboard-throttle-fill"
              style:width={`${t.throttle * 100}%`}
            ></div>
          </div>
        </div>
      {/if}
      {#if t.brake != null}
        <div class="bc-onboard__bar" data-testid="onboard-brake">
          <span class="bc-onboard__bar-label">BRAKE</span>
          <div class="bc-onboard__track">
            <div
              class="bc-onboard__fill bc-onboard__fill--brake"
              data-testid="onboard-brake-fill"
              style:width={`${t.brake * 100}%`}
            ></div>
          </div>
        </div>
      {/if}
    </div>

    <div class="bc-onboard__readouts">
      {#if speed != null}
        <div class="bc-onboard__readout" data-testid="onboard-speed">
          <span class="bc-onboard__value bc-onboard__value--speed">{speed}</span>
          <span class="bc-onboard__readout-label" data-testid="onboard-speed-unit">{unit}</span>
        </div>
      {/if}
      {#if gear != null}
        <div class="bc-onboard__readout" data-testid="onboard-gear">
          <span class="bc-onboard__value bc-onboard__value--gear">{gear}</span>
          <span class="bc-onboard__readout-label">GEAR</span>
        </div>
      {/if}
    </div>
  </div>
</section>
{/if}

<style>
  /* A compact over-camera HUD: an optional driver/vehicle identity strip on top, and
     the throttle/brake bars + SPEED/GEAR readouts below. Smoked-glass plate like the
     other widgets. */
  .bc-onboard {
    display: inline-flex;
    flex-direction: column;
    align-items: stretch;
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
    color: var(--bc-text);
  }

  /* Identity strip: [number] NAME [class] make model — sits above the telemetry row,
     divided from it by a hairline. */
  .bc-onboard__identity {
    display: flex;
    align-items: center;
    gap: var(--bc-space-2);
    min-width: 0;
    padding-bottom: var(--bc-space-1);
    border-bottom: 1px solid var(--bc-divider);
  }

  .bc-onboard__number {
    flex: 0 0 auto;
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-num);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    color: var(--bc-text-on-accent);
    background: var(--bc-accent);
    border-radius: var(--bc-radius-chip);
    padding: 2px 6px;
  }

  .bc-onboard__driver {
    font-family: var(--bc-font-display);
    font-size: var(--bc-size-name);
    font-weight: var(--bc-weight-name);
    color: var(--bc-oncam-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .bc-onboard__class {
    flex: 0 0 auto;
    display: inline-flex;
  }

  .bc-onboard__car {
    flex: 0 1 auto;
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Telemetry row: bars on the left, SPEED / GEAR readouts on the right. */
  .bc-onboard__telemetry {
    display: flex;
    align-items: stretch;
    gap: var(--bc-space-4);
  }

  .bc-onboard__bars {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--bc-space-2);
    min-width: 180px;
  }

  .bc-onboard__bar {
    display: grid;
    grid-template-columns: 64px 1fr;
    align-items: center;
    gap: var(--bc-space-2);
  }

  .bc-onboard__bar-label {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-2);
    line-height: 1;
  }

  .bc-onboard__track {
    position: relative;
    height: 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.07);
    overflow: hidden;
  }

  .bc-onboard__fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 4px;
  }

  /* The HUD re-renders every tick; smooth the bar between frames under real motion,
     and snap instantly under reduced motion (no easing). */
  @media (prefers-reduced-motion: no-preference) {
    .bc-onboard__fill {
      transition: width var(--bc-dur-reorder) var(--bc-ease);
    }
  }

  .bc-onboard__fill--throttle {
    background: var(--bc-intensity-calm);
  }

  .bc-onboard__fill--brake {
    background: var(--bc-live);
  }

  .bc-onboard__readouts {
    display: flex;
    align-items: center;
    gap: var(--bc-space-4);
    padding-left: var(--bc-space-3);
    border-left: 1px solid var(--bc-divider);
  }

  .bc-onboard__readout {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 48px;
  }

  .bc-onboard__value {
    font-family: var(--bc-font-mono);
    font-weight: var(--bc-weight-num);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    color: var(--bc-text);
  }

  .bc-onboard__value--speed {
    font-size: var(--bc-size-battle-pos);
  }

  .bc-onboard__value--gear {
    font-size: var(--bc-size-battle-pos);
    color: var(--bc-accent);
  }

  .bc-onboard__readout-label {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-2);
    line-height: 1;
  }
</style>
