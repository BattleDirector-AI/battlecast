<script>
  import { onMount } from 'svelte'
  import AllView from './AllView.svelte'
  import { connect, resolveSrc } from '../tower/sseClient.js'

  let snapshot = $state(null)

  onMount(() => {
    const url = resolveSrc(window.location.search)
    return connect(url, (next) => {
      snapshot = next
    })
  })
</script>

<div class="all-page">
  <AllView {snapshot} />
</div>

<style>
  .all-page {
    padding: var(--bc-inset-safe);
  }
</style>
