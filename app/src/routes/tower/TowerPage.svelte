<script>
  import { onMount } from 'svelte'
  import StandingsTower from './StandingsTower.svelte'
  import { connect, resolveSrc } from './sseClient.js'

  let snapshot = $state(null)

  // Class filter is a per-Browser-Source knob, read from the URL like ?src= / ?show=
  // elsewhere: `?class=<VClass>` (case-insensitive; absent = all classes). Resolved
  // once at mount — the tower is launched per class, not toggled live. Mirrors
  // GridPage / ResultsPage.
  const classFilter =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('class')
      : null

  onMount(() => {
    const url = resolveSrc(window.location.search)
    return connect(url, (next) => {
      snapshot = next
    })
  })
</script>

<div class="tower-page">
  <StandingsTower {snapshot} {classFilter} />
</div>

<style>
  .tower-page {
    padding: var(--bc-inset-safe);
  }
</style>
