<script>
  import { onMount } from 'svelte'
  import OnBoardHud, { resolveIdentity } from './OnBoardHud.svelte'
  import { connect, resolveSrc, resolveSpeedUnit } from './sseClient.js'
  import { DEFAULT_CONFIG } from '../../lib/overlayConfig.js'

  let snapshot = $state(null)
  // Speed display unit is a per-Browser-Source knob on the standalone route (`?unit=`);
  // on `/all` it comes from the saved config. Resolved once at mount like `?src=`.
  const speedUnit = resolveSpeedUnit()
  // The standalone route has no saved profile, so identity uses the default onboard
  // driverInfo toggles (name + number). There is no driver lower-third on this route,
  // so no hand-off gate — the HUD shows as soon as there is telemetry.
  const onboardCfg = { ...DEFAULT_CONFIG.widgets.onboard, speedUnit }
  const identity = $derived(resolveIdentity(snapshot, onboardCfg))

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
  {identity}
/>
