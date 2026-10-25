<script>
  import { weatherParts, hasWeather, formatTemp } from '../../lib/weather.js'
  import { DEFAULT_CONFIG } from '../../lib/overlayConfig.js'

  // Weather box (#208; widgets.md rules 83-86, ADR 0025). One row of the producer's weather:
  // the parts that hold, in the order air, track, conditions. A status readout, not a reveal:
  // it updates in place and appears and disappears with no transition, as Race Control does.
  let { snapshot = null, tempUnit = DEFAULT_CONFIG.widgets.weather.tempUnit } = $props()

  const parts = $derived(weatherParts(snapshot?.session?.weather))
</script>

{#if hasWeather(parts)}
  <section class="bc-weather" data-testid="weather-box" aria-label="Weather">
    {#if parts.air !== null}
      <span class="bc-weather__item" data-testid="weather-air">
        <span class="bc-weather__label">AIR</span>
        <span class="bc-weather__value" data-testid="weather-air-value">{formatTemp(parts.air, tempUnit)}</span>
      </span>
    {/if}
    {#if parts.track !== null}
      <span class="bc-weather__item" data-testid="weather-track">
        <span class="bc-weather__label">TRACK</span>
        <span class="bc-weather__value" data-testid="weather-track-value">{formatTemp(parts.track, tempUnit)}</span>
      </span>
    {/if}
    {#if parts.conditions !== null}
      <span class="bc-weather__conditions" data-testid="weather-conditions">{parts.conditions}</span>
    {/if}
  </section>
{/if}

<style>
  /* The Race Control header-bar plate (RaceControlStatus.svelte), one row high. */
  .bc-weather {
    display: inline-flex;
    align-items: center;
    gap: var(--bc-space-3);
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
    white-space: nowrap;
    /* With the 8 px vertical padding and 1 px border this keeps the box inside its 44 px default
       slot (overlay-config rule 55) at every text preset, `larger` included. */
    line-height: 1.15;
  }

  .bc-weather__item {
    display: inline-flex;
    align-items: baseline;
    gap: var(--bc-space-1);
    flex: 0 0 auto;
  }

  .bc-weather__label {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    color: var(--bc-text-3);
  }

  .bc-weather__value {
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-gap);
    font-weight: var(--bc-weight-num);
    font-variant-numeric: tabular-nums;
    color: var(--bc-text);
  }

  /* Conditions take what width is left and are cut with an ellipsis, never wrapped (rule 85). */
  .bc-weather__conditions {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-gap);
    font-weight: var(--bc-weight-name);
    color: var(--bc-text-2);
  }
</style>
