<script>
  let { value = 0, label = 'INTENSITY', tone = undefined } = $props()

  const v = $derived(Math.max(0, Math.min(1, value)))
  const band = $derived(tone || (v >= 0.67 ? 'hot' : v >= 0.34 ? 'mid' : 'calm'))
  const stepColor = $derived(
    band === 'hot'
      ? 'var(--bc-intensity-hot)'
      : band === 'mid'
        ? 'var(--bc-intensity-mid)'
        : 'var(--bc-intensity-calm)'
  )
</script>

<div class="bc-intensity">
  <div class="bc-intensity__row">
    <span class="bc-intensity__label">{label}</span>
    <span class="bc-intensity__value" style:color={stepColor}>{Math.round(v * 100)}</span>
  </div>
  <div class="bc-intensity__track">
    <div class="bc-intensity__fill" style:width={`${v * 100}%`}></div>
  </div>
</div>

<style>
  .bc-intensity {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }
  .bc-intensity__row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    font-family: var(--bc-font-ui);
  }
  .bc-intensity__label {
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-2);
  }
  .bc-intensity__value {
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-gap);
    font-weight: var(--bc-weight-num);
    font-variant-numeric: tabular-nums;
  }
  .bc-intensity__track {
    position: relative;
    height: 5px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.07);
    overflow: hidden;
  }
  .bc-intensity__fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--bc-intensity-ramp);
    border-radius: 3px;
    transition: width var(--bc-dur-reorder) var(--bc-ease);
  }
</style>
