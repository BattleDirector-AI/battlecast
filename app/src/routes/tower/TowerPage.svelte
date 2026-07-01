<script>
  import { onMount } from 'svelte'
  import StandingsTower from './StandingsTower.svelte'
  import { connect, resolveSrc } from './sseClient.js'

  let snapshot = $state(null)

  onMount(() => {
    const url = resolveSrc(window.location.search)
    return connect(url, (next) => {
      snapshot = next
    })
  })
</script>

<div class="tower-page">
  <StandingsTower {snapshot} />
</div>

<style>
  .tower-page {
    padding: var(--bc-inset-safe);
  }
</style>
