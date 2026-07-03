<script>
  // Test-only harness: wraps LowerThirdShell in an `{#if}` so a test can toggle
  // `show` and exercise the mount structure and the `out:` exit transition.
  import LowerThirdShell from './LowerThirdShell.svelte'
  let { show = true } = $props()
</script>

{#if show}
  <LowerThirdShell>
    <div data-testid="slotted-content">payload</div>
  </LowerThirdShell>
{/if}
