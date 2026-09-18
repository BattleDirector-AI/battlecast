<script>
  // Test-only harness: wraps LowerThirdShell in an `{#if}` so a test can toggle
  // `show` and exercise the mount structure and the `out:` exit transition. The
  // `.lt3-anchor` wrapper mirrors DriverLowerThird/QualifyingLowerThird (#185):
  // LowerThirdShell's `.lt3` is `position: absolute` against it, so a bare harness
  // would size to nothing and misrepresent every real consumer's structure.
  import LowerThirdShell from './LowerThirdShell.svelte'
  let { show = true } = $props()
</script>

<div class="lt3-anchor">
  {#if show}
    <LowerThirdShell>
      <div data-testid="slotted-content">payload</div>
    </LowerThirdShell>
  {/if}
</div>

<style>
  .lt3-anchor {
    position: relative;
  }
</style>
