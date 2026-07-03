<script>
  import { onMount } from 'svelte'
  import ResultsSlide from './ResultsSlide.svelte'
  import { connect, resolveSrc } from '../tower/sseClient.js'

  let snapshot = $state(null)

  // Class filter is a per-Browser-Source knob, read from the URL like ?src= /
  // ?show= elsewhere: `?class=<VClass>` (case-insensitive; absent = all classes).
  // Resolved once at mount — the board is launched per class, not toggled live.
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

<div class="results-page">
  <ResultsSlide {snapshot} {classFilter} />
</div>

<style>
  .results-page {
    width: 100%;
    min-height: 100vh;
  }
</style>
