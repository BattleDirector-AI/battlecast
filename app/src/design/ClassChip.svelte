<script>
  import { classMeta, classColor } from './classMeta.js'

  let { carClass, leader = false, size = 'standard' } = $props()

  const meta = $derived(classMeta(carClass))
  const color = $derived(classColor(carClass))
  const compact = $derived(size === 'compact')
</script>

<span
  class="bc-class-chip"
  class:bc-class-chip--compact={compact}
  style:color={leader ? 'var(--bc-text-on-accent)' : color}
  style:background={leader ? color : 'transparent'}
  style:border-color={color}
>{meta.short}</span>

<style>
  .bc-class-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--bc-font-ui);
    font-weight: var(--bc-weight-label);
    font-size: var(--bc-size-chip);
    letter-spacing: var(--bc-track-chip);
    line-height: 1;
    text-transform: uppercase;
    padding: 3px 5px;
    border-radius: var(--bc-radius-chip);
    min-width: 32px;
    box-sizing: border-box;
    white-space: nowrap;
    border: 1px solid;
  }
  .bc-class-chip--compact {
    font-size: var(--bc-size-chip-compact);
    padding: 2px 4px;
    min-width: 26px;
  }
</style>
