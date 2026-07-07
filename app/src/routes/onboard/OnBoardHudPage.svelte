<script>
  import { onMount } from 'svelte'
  import OnBoardHud from './OnBoardHud.svelte'
  import { connect, resolveSrc, resolveSpeedUnit } from './sseClient.js'

  let snapshot = $state(null)
  // Speed display unit is a per-Browser-Source knob on the standalone route (`?unit=`);
  // on `/all` it comes from the saved config. Resolved once at mount like `?src=`.
  const speedUnit = resolveSpeedUnit()

  onMount(() => {
    const url = resolveSrc()
    const disconnect = connect(url, (next) => {
      snapshot = next
    })
    return disconnect
  })
</script>

<!-- OnBoardHud renders nothing until there's telemetry content (its own resolveTelemetry
     guard), so a single call handles both the pre-snapshot and no-telemetry cases. -->
<OnBoardHud
  telemetry={snapshot?.subject?.telemetry ?? null}
  mode={snapshot?.mode ?? null}
  {speedUnit}
/>
