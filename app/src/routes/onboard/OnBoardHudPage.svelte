<script>
  import { onMount } from 'svelte'
  import OnBoardHud from './OnBoardHud.svelte'
  import { connect, resolveSrc } from './sseClient.js'

  let snapshot = $state(null)

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
<OnBoardHud telemetry={snapshot?.subject?.telemetry ?? null} mode={snapshot?.mode ?? null} />
