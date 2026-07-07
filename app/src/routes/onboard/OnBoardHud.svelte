<script module>
  // On-board HUD — the on-camera subject's LIVE inputs (throttle / brake / speed /
  // gear), read from `subject.telemetry` on every snapshot. Unlike the cut-driven
  // lower-thirds (driver #21, qualifying #22), this widget carries no dwell/trigger
  // machinery: it just re-renders the current inputs each tick. See spec/v1/SPEC.md
  // `subject.telemetry` and docs/plans/0.6.0-onboard-hud.md.
  //
  // Dumb overlay, smart producer (docs/decisions/0002-lower-third-widgets.md): every
  // value is producer-owned. `telemetry` may be null/undefined/partial/garbage — this
  // module normalizes defensively and never throws.

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
</script>

<script>
  let { telemetry = null, mode = null, speedUnit = 'kmh' } = $props()

  const t = $derived(resolveTelemetry(telemetry))
  const gear = $derived(t ? gearLabel(t.gear) : null)
  const speed = $derived(t ? speedLabel(t.speed, speedUnit) : null)
  const unit = $derived(unitLabel(speedUnit))
</script>

{#if t}
<section
  class="bc-onboard"
  data-testid="onboard-hud"
  data-mode={mode ?? ''}
  aria-label="On-board telemetry"
>
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
</section>
{/if}

<style>
  /* A compact over-camera HUD strip: throttle/brake fill bars on the left, the SPEED
     and GEAR readouts on the right. Smoked-glass plate like the other widgets. */
  .bc-onboard {
    display: inline-flex;
    align-items: stretch;
    gap: var(--bc-space-4);
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
