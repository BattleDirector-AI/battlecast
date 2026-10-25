<script>
  import StandingsTower from '../tower/StandingsTower.svelte'
  import BattleBox from '../battle/BattleBox.svelte'
  import LogoRotation from '../logos/LogoRotation.svelte'
  import DriverLowerThird from '../driver/DriverLowerThird.svelte'
  import QualifyingLowerThird from '../qualifying/QualifyingLowerThird.svelte'
  import RaceControlStatus from '../racecontrol/RaceControlStatus.svelte'
  import OnBoardHud, { resolveIdentity } from '../onboard/OnBoardHud.svelte'
  import RaceUpdateBox from '../updates/RaceUpdateBox.svelte'
  import InfoPanel from '../info/InfoPanel.svelte'
  import WeatherBox from '../weather/WeatherBox.svelte'
  import { resolveSubject } from '../driver/DriverLowerThird.svelte'
  import {
    DEFAULT_CONFIG,
    normalizeConfig,
    resolveWidgets,
    rendersText,
    textScaleFactor,
  } from '../../lib/overlayConfig.js'
  import { textScaleVars } from '../../design/typeScale.js'
  import { isWidgetIdle } from '../../lib/widgetIdle.js'
  import { createBattleGrace } from '../../lib/battleGrace.js'
  import { createLowerThirdTrigger } from '../../lib/lowerThirdTrigger.js'
  import { classTagsShown } from '../../lib/classTags.js'

  // `preview` (the /config editor) disables the on-board HUD's lower-third hand-off so
  // the HUD is always visible for positioning/configuring — the hand-off is a runtime
  // timing behavior that a static single-frame preview can't meaningfully show. It also
  // tells the race update box to take no baseline, so the sample events show.
  let { snapshot = null, config = DEFAULT_CONFIG, preview = false } = $props()

  // Class filter is a per-Browser-Source knob, read from the URL like ?src= / ?show=
  // elsewhere: `?class=<VClass>` (case-insensitive; absent = all classes). The tower
  // is the only widget that honors it today; mirrors GridPage / ResultsPage / the
  // standalone TowerPage.
  const classFilter =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('class')
      : null

  // #117 per-widget plate opacity. Widgets read one of three plate tokens with different
  // default alphas (--bc-plate 0.82, --bc-plate-dense 0.84, --bc-header 0.94). Scale each
  // proportionally to the widget's `plateAlpha` so the 0.82 default preserves every widget's
  // current look, while a lower value dims all of them together. Redeclared per slot: a
  // :root token that bakes the alpha resolves once at :root and can't be overridden downward.
  const PLATE_BASE = 0.82
  const clamp01 = (x) => Math.max(0, Math.min(1, x))
  const round3 = (x) => Math.round(x * 1000) / 1000
  function plateVars(alpha) {
    const a = Number.isFinite(alpha) ? alpha : PLATE_BASE
    const f = a / PLATE_BASE // 1 at the 0.82 default, so every plate keeps its current alpha
    return (
      `--bc-plate: rgba(var(--bc-plate-rgb), ${round3(clamp01(a))});` +
      ` --bc-plate-dense: rgba(var(--bc-plate-dense-rgb), ${round3(clamp01(0.84 * f))});` +
      ` --bc-header: rgba(var(--bc-header-rgb), ${round3(clamp01(0.94 * f))})`
    )
  }

  // #188 per-widget text size: a text widget off the `normal` preset gets every type-size
  // token redeclared on its slot at base × factor (overlay-config.md rule 39).
  const textVars = (w) => (rendersText(w.key) ? textScaleVars(textScaleFactor(w.textScale)) : '')

  // Config-driven layout: each widget is absolutely placed on the configured
  // canvas per its {x, y, w, h, z}. Only widgets that are `visible` AND have a
  // component are rendered — a hidden widget is absent from the DOM, not just
  // visually collapsed. A widget that opted into `hideWhenIdle` also drops out
  // while it has nothing to show (e.g. the battle box in clear air).
  const normalized = $derived(normalizeConfig(config))
  const canvas = $derived(normalized.canvas)
  // Broadcaster class-color overrides (rule 32, ADR 0010) — resolved once here and
  // threaded to every widget that renders a class chip or class bar.
  const classColors = $derived(normalized.theme.classColors)
  // Overlay-wide class-tag setting (widgets.md rules 60-63, ADR 0022), threaded like
  // classColors; each widget resolves it against the snapshot's `session.multiclass`.
  const classTags = $derived(normalized.theme.classTags)
  // Battle box exit grace (widgets.md rules 37-39, ADR 0013). Lives here, outside the
  // battle slot, so `hideWhenIdle` unmounting the slot cannot kill a running hold — and
  // both the auto-hide filter and the box read the same post-grace snapshot.
  const graceSeconds = $derived(normalized.widgets.battle?.idleGraceSeconds)
  const battleGrace = createBattleGrace({
    onExpire: () => {
      battleSnapshot = battleGrace.resolve(snapshot, graceSeconds)
    },
  })
  // Re-resolves on every snapshot; writable so a grace that runs out with no new snapshot
  // can re-render from the latest one.
  let battleSnapshot = $derived(battleGrace.resolve(snapshot, graceSeconds))
  $effect(() => () => battleGrace.destroy())

  const idleCtx = (key) => ({ snapshot: key === 'battle' ? battleSnapshot : snapshot, config: normalized })
  const RENDERABLE = new Set(['tower', 'battle', 'logos', 'driver', 'qualifying', 'racecontrol', 'onboard', 'updates', 'info', 'weather'])
  const widgets = $derived(
    resolveWidgets(normalized)
      .filter((w) => w.visible && RENDERABLE.has(w.key))
      .filter((w) => !(w.hideWhenIdle && isWidgetIdle(w.key, idleCtx(w.key)))),
  )

  // On-board HUD (#26) inputs, resolved once here since the HUD needs both the
  // subject and the field (for the additive vehicle identity fields), plus the
  // driver lower-third's config to time the hand-off.
  const onboardCfg = $derived(normalized.widgets.onboard)
  const driverCfg = $derived(normalized.widgets.driver)
  // Hidden class tags (rule 63): applied inside resolveIdentity via its showClass argument.
  const onboardIdentity = $derived(
    resolveIdentity(snapshot, onboardCfg, classTagsShown(classTags, snapshot?.session)),
  )
  // The driver lower-third's one show/hide timer (widgets.md rules 15-17, 24). It lives here,
  // outside the card, and its flag goes to both the card and the HUD, so they cannot drift.
  // It runs only while the card is mounted: a card that is hidden or auto-hidden (rule 29)
  // drops the timer, and coming back is a (re)connect, as it is for the card itself.
  const driverResolved = $derived(resolveSubject(snapshot))
  const driverMounted = $derived(widgets.some((w) => w.key === 'driver'))
  let driverShown = $state(false)
  const newDriverTrigger = () => createLowerThirdTrigger({ onChange: (v) => (driverShown = v) })
  let driverTrigger = newDriverTrigger()
  let driverSynced = false
  $effect(() => () => driverTrigger.stop())
  $effect(() => {
    if (!driverMounted) {
      if (driverSynced) {
        driverTrigger.stop()
        driverTrigger = newDriverTrigger()
        driverSynced = false
      }
      driverShown = false
      return
    }
    driverSynced = true
    driverTrigger.sync({
      subjectSlotId: driverResolved.slotId,
      active: driverResolved.state !== 'invalid',
      trigger: driverCfg?.trigger === 'persistent' ? 'persistent' : 'dwell',
      dwellSeconds: driverCfg?.dwellSeconds,
      showOnConnect: driverCfg?.showOnConnect !== false,
    })
  })
  // The HUD holds only while the driver card is visible (it passes no gate otherwise, or in
  // the /config preview).
  const onboardGate = $derived(!preview && driverCfg?.visible ? driverCfg : null)
</script>

<div
  class="overlay-stage"
  data-testid="overlay-stage"
  style="width: {canvas.w}px; height: {canvas.h}px;"
>
  {#each widgets as w (w.key)}
    <div
      class="widget-slot"
      data-testid="widget-{w.key}"
      data-widget={w.key}
      style="left: {w.x}px; top: {w.y}px; width: {w.w}px; height: {w.h}px; z-index: {w.z}; {plateVars(w.plateAlpha)}; {textVars(w)}"
    >
      {#if w.key === 'tower'}
        <StandingsTower
          {snapshot}
          {classFilter}
          classDisplay={normalized.widgets.tower?.classDisplay}
          metrics={normalized.widgets.tower?.towerMetrics}
          maxRows={normalized.widgets.tower?.maxRows}
          cycle={normalized.widgets.tower?.cycle}
          slotHeight={normalized.widgets.tower?.h}
          nameStyle={normalized.widgets.tower?.nameStyle}
          configuredWidth={normalized.widgets.tower?.w}
          textScale={normalized.widgets.tower?.textScale}
          {classColors}
          {classTags}
        />
      {:else if w.key === 'battle'}
        <BattleBox
          subject={battleSnapshot?.subject ?? {}}
          relationship={battleSnapshot?.relationship ?? {}}
          vehicles={battleSnapshot?.vehicles ?? []}
          mode={battleSnapshot?.mode ?? null}
          session={battleSnapshot?.session ?? null}
          {classColors}
          {classTags}
        />
      {:else if w.key === 'logos'}
        <LogoRotation rotation={normalized.logoRotation} />
      {:else if w.key === 'driver'}
        <DriverLowerThird {snapshot} widget={w} {classColors} {classTags} shownOverride={driverShown} />
      {:else if w.key === 'qualifying'}
        <QualifyingLowerThird {snapshot} widget={w} {classColors} {classTags} />
      {:else if w.key === 'racecontrol'}
        <RaceControlStatus session={snapshot?.session ?? null} mode={snapshot?.mode ?? null} />
      {:else if w.key === 'onboard'}
        <OnBoardHud
          telemetry={snapshot?.subject?.telemetry ?? null}
          mode={snapshot?.mode ?? null}
          speedUnit={onboardCfg?.speedUnit}
          identity={onboardIdentity}
          driverWidget={onboardGate}
          cardShown={driverShown}
          waitForLowerThird={onboardCfg?.waitForLowerThird}
          {classColors}
        />
      {:else if w.key === 'updates'}
        <RaceUpdateBox {snapshot} dwellSeconds={w.dwellSeconds} {preview} />
      {:else if w.key === 'info'}
        <InfoPanel
          {snapshot}
          dwellSeconds={w.dwellSeconds}
          lines={w.lines}
          weatherCard={w.weatherCard}
          tempUnit={w.tempUnit}
        />
      {:else if w.key === 'weather'}
        <WeatherBox {snapshot} tempUnit={w.tempUnit} />
      {/if}
    </div>
  {/each}
</div>

<style>
  .overlay-stage {
    position: relative;
    transform-origin: top left;
    transform: scale(var(--bc-stage-scale, 1));
  }

  .widget-slot {
    position: absolute;
  }

  /* Make each widget fill its slot's configured width so what you size in the
     config editor is what renders — otherwise a widget keeps its intrinsic
     width and the editor's drag box no longer matches it. Height stays
     content-driven (widgets size to their content vertically). */
  .widget-slot > :global(*) {
    width: 100%;
    box-sizing: border-box;
  }

  /* The tower is the one widget whose height is driven by the session — a row per car —
     so a large field grew it past its slot and off the canvas entirely (#116). Bound it
     to the configured `h`; `.tower` already sets `overflow: hidden`, so rows that don't
     fit are clipped rather than escaping the box.

     This is the clamp only. Choosing WHICH cars stay visible (pinned leaders + cycling
     the rest of the field) is a separate feature, and this rule stays underneath it as
     the guarantee that a widget can never exceed its slot.

     Scoped to the tower deliberately: the content-sized widgets (lower-thirds, on-board,
     race control) are centred within a placement box rather than filling it, so clamping
     those would clip them instead of bounding them. */
  .widget-slot[data-widget='tower'] > :global(*) {
    max-height: 100%;
  }

  /* The race control status pill and the on-board HUD are content-sized indicators,
     not plates that stretch to fill their slot. Keep their intrinsic (compact) width,
     and CENTRE them within the slot (rather than anchoring to the left edge) so they
     read as centred in their allotted box. The slot's width is just the placement box. */
  .widget-slot[data-widget='racecontrol'],
  .widget-slot[data-widget='onboard'] {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .widget-slot[data-widget='racecontrol'] > :global(*),
  .widget-slot[data-widget='onboard'] > :global(*) {
    width: auto;
  }
</style>
