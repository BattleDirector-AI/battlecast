<script>
  import { onMount } from 'svelte'
  import OnBoardHud, { resolveIdentity } from './OnBoardHud.svelte'
  import { connect, resolveSrc } from '../../lib/sseClient.js'
  import { classTagsShown } from '../../lib/classTags.js'
  import { DEFAULT_CONFIG, resolveSpeedUnit } from '../../lib/overlayConfig.js'

  let snapshot = $state(null)
  // Speed display unit is a per-Browser-Source knob on the standalone route (`?unit=`);
  // on `/all` it comes from the saved config. Resolved once at mount like `?src=`.
  const speedUnit = resolveSpeedUnit()
  // The standalone route has no saved profile, so identity uses the default onboard
  // driverInfo toggles (name + number + position). There is no driver lower-third on
  // this route, so no hand-off gate — the HUD shows as soon as there is identity or
  // telemetry content.
  const onboardCfg = { ...DEFAULT_CONFIG.widgets.onboard, speedUnit }
  // No profile either, so `theme.classTags` is its default `auto` (rule 63) and
  // `theme.nameStyle` its default `short` (overlay-config rule 42).
  const nameStyle = DEFAULT_CONFIG.theme.nameStyle
  const identity = $derived(
    resolveIdentity(snapshot, onboardCfg, classTagsShown('auto', snapshot?.session), nameStyle),
  )

  onMount(() => {
    const url = resolveSrc()
    const disconnect = connect(url, (next) => {
      snapshot = next
    })
    return disconnect
  })
</script>

<!-- OnBoardHud renders nothing until there's identity or telemetry content (its own
     guard), so a single call handles the pre-snapshot and idle cases. -->
<OnBoardHud
  telemetry={snapshot?.subject?.telemetry ?? null}
  mode={snapshot?.mode ?? null}
  {speedUnit}
  {identity}
  {nameStyle}
/>
