<script>
  import { onMount } from 'svelte'
  import SessionStatus from './SessionStatus.svelte'
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

<!-- SessionStatus renders nothing until there's session content (its own hasContent
     guard), so a single call handles both the pre-snapshot and empty-session cases. -->
<SessionStatus session={snapshot?.session ?? null} mode={snapshot?.mode ?? null} />
