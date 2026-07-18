<script>
  import { onMount } from 'svelte'
  import StandingsTower from './StandingsTower.svelte'
  import { connect, resolveSrc } from './sseClient.js'
  import { TOWER_METRICS_DEFAULTS, parseTowerMetricsParam } from '../../lib/overlayConfig.js'

  let snapshot = $state(null)

  const params =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()

  // Class filter is a per-Browser-Source knob, read from the URL like ?src= / ?show=
  // elsewhere: `?class=<VClass>` (case-insensitive; absent = all classes). Resolved
  // once at mount — the tower is launched per class, not toggled live. Mirrors
  // GridPage / ResultsPage.
  const classFilter = params.get('class')

  // Richer-tower metrics knob for the standalone route: `?metrics=interval,pit,tire,fuel`
  // (listed = on, rest off). Absent falls back to the same default as /all — interval on,
  // strategy cluster off. Mirrors the 0.6.0 `?unit=mph` standalone knob.
  const metrics = parseTowerMetricsParam(params.get('metrics')) ?? TOWER_METRICS_DEFAULTS

  onMount(() => {
    const url = resolveSrc(window.location.search)
    return connect(url, (next) => {
      snapshot = next
    })
  })
</script>

<div class="tower-page">
  <StandingsTower {snapshot} {classFilter} {metrics} />
</div>

<style>
  .tower-page {
    padding: var(--bc-inset-safe);
  }
</style>
