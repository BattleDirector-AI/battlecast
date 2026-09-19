<script>
  import { onMount } from 'svelte'
  import GridSlide from './GridSlide.svelte'
  import { connect, resolveSrc } from '../../lib/sseClient.js'
  import { loadConfig, DEFAULT_CONFIG, normalizeConfig } from '../../lib/overlayConfig.js'

  let snapshot = $state(null)
  // Class-color overrides (rule 32, ADR 0010) come from the same saved profile /all
  // reads them from — resolved once at mount, like the tower/lower-third standalone
  // routes. The producer feed URL keeps resolving from ?src= alone, unaffected.
  let config = $state(normalizeConfig(DEFAULT_CONFIG))

  // Class filter is a per-Browser-Source knob, read from the URL like ?src= /
  // ?show= elsewhere: `?class=<VClass>` (case-insensitive; absent = all classes).
  // Resolved once at mount — the board is launched per class, not toggled live.
  const classFilter =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('class')
      : null

  onMount(() => {
    let cancelled = false
    loadConfig(window.location.search).then((resolved) => {
      if (!cancelled) config = resolved
    })

    const url = resolveSrc(window.location.search)
    const disconnect = connect(url, (next) => {
      snapshot = next
    })
    return () => {
      cancelled = true
      disconnect()
    }
  })
</script>

<div class="grid-page">
  <GridSlide {snapshot} {classFilter} classColors={config.theme.classColors} />
</div>

<style>
  .grid-page {
    width: 100%;
    min-height: 100vh;
  }
</style>
