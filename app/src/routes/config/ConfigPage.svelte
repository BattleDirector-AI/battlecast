<script>
  /* Config UI (#34, part 2) — the WYSIWYG overlay editor at `/config`. The single
   * writer of the overlay-config contract: arrange/size/toggle widgets on a live
   * preview, manage the logo carousel, pick the producer, and save/load named
   * profiles via the companion server — no code or CSS editing. Degrades to
   * client-only authoring (export a config.json) when no server is running. */
  import { onMount } from 'svelte'
  import AllView from '../all/AllView.svelte'
  import {
    DEFAULT_CONFIG,
    WIDGET_KEYS,
    DRIVER_INFO_FIELDS,
    TOWER_METRIC_FIELDS,
    normalizeConfig,
    isLowerThird,
  } from '../../lib/overlayConfig.js'
  import { widgetSupportsAutoHide } from '../../lib/widgetIdle.js'
  import * as editor from '../../lib/configEditor.js'
  import * as api from '../../lib/configApi.js'
  import baseSnapshot from '../../../../spec/v1/fixtures/race-close-battle.json'

  // Preview snapshot. `race-close-battle.json` is the canonical NO-telemetry fixture (so
  // it must NOT gain a `subject.telemetry` block — the compliance harness and an AllLayout
  // idle test rely on that), but the editor preview needs the on-board HUD to actually
  // render so a broadcaster can see its speed readout — and the km/h vs mph toggle — take
  // effect. So augment a COPY here with representative live inputs; the shared fixture is
  // untouched.
  const sampleSnapshot = {
    ...baseSnapshot,
    // Augment a COPY with the additive fields so the preview exercises the widgets that
    // read them: the on-camera vehicle gets identity fields (for the HUD's driver-info
    // toggles) and every vehicle gets the richer-tower metrics (interval / pit / tire /
    // fuel) so toggling those tower controls shows representative data.
    vehicles: baseSnapshot.vehicles.map((v, i) => {
      const prev = baseSnapshot.vehicles[i - 1]
      const withMetrics = {
        ...v,
        interval_ahead:
          i === 0 ? null : Math.round((v.gap_to_leader - prev.gap_to_leader) * 1000) / 1000,
        pit_stops: [1, 1, 2, 1][i] ?? 1,
        in_pit: i === 3,
        tire_compound: ['M', 'M', 'S', 'H'][i] ?? 'M',
        tire_wear: [0.34, 0.28, 0.62, 0.12][i] ?? 0.3,
        fuel: [0.61, 0.58, 0.44, 0.73][i] ?? 0.5,
      }
      return v.slot_id === baseSnapshot.subject.slot_id
        ? { ...withMetrics, car_number: '1', make: 'Red Bull', model: 'RB20' }
        : withMetrics
    }),
    subject: {
      ...baseSnapshot.subject,
      telemetry: { throttle: 0.82, brake: 0, speed: 247, gear: 6 },
    },
  }

  let config = $state(normalizeConfig(DEFAULT_CONFIG))
  let profileName = $state('default')
  let profiles = $state([])
  let serverLogos = $state([])
  let serverUp = $state(false)
  let status = $state('Not connected to a server — changes can be exported as config.json.')
  let previewScale = $state(0.4)
  let previewWrap = $state(null)
  let copied = $state(false)

  const canvas = $derived(config.canvas)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const obsUrl = $derived(
    editor.buildObsUrl({ origin, profileName, producerSrc: config.producer?.src || '' }),
  )

  onMount(() => {
    refreshFromServer()
    fitPreview()
    if (typeof window !== 'undefined') window.addEventListener('resize', fitPreview)
    return () => {
      if (typeof window === 'undefined') return
      window.removeEventListener('resize', fitPreview)
      // Also drop any in-flight drag listeners so unmounting mid-drag can't leak them.
      window.removeEventListener('pointermove', onDrag)
      window.removeEventListener('pointerup', endDrag)
      clearTimeout(copyResetTimer)
    }
  })

  async function refreshFromServer() {
    serverUp = await api.serverAvailable()
    if (!serverUp) return
    status = 'Connected.'
    try {
      profiles = await api.listProfiles()
      serverLogos = await api.listLogos()
    } catch (err) {
      status = `Server error: ${err.message}`
    }
  }

  function fitPreview() {
    const avail = previewWrap?.clientWidth || 800
    previewScale = Math.max(0.1, Math.min(avail / canvas.w, 0.6))
  }
  // Re-fit whenever the canvas width changes (e.g. the user edits canvas size).
  $effect(() => {
    void canvas.w
    fitPreview()
  })

  // ---- drag / resize on the live preview -----------------------------------
  let drag = null
  function startDrag(event, key, mode) {
    event.preventDefault()
    const w = config.widgets[key]
    drag = { key, mode, startX: event.clientX, startY: event.clientY, orig: { ...w } }
    window.addEventListener('pointermove', onDrag)
    window.addEventListener('pointerup', endDrag)
  }
  function onDrag(event) {
    if (!drag) return
    const dx = Math.round((event.clientX - drag.startX) / previewScale)
    const dy = Math.round((event.clientY - drag.startY) / previewScale)
    if (drag.mode === 'move') {
      config = editor.moveWidget(config, drag.key, drag.orig.x + dx, drag.orig.y + dy)
    } else {
      config = editor.resizeWidget(config, drag.key, drag.orig.w + dx, drag.orig.h + dy)
    }
  }
  function endDrag() {
    drag = null
    window.removeEventListener('pointermove', onDrag)
    window.removeEventListener('pointerup', endDrag)
  }

  // ---- canvas ---------------------------------------------------------------
  const setCanvas = (patch) => (config = editor.setCanvas(config, patch))

  // ---- widget field editing -------------------------------------------------
  const setField = (key, field, value) => (config = editor.setWidgetField(config, key, field, value))
  const setVisible = (key, visible) => (config = editor.setWidgetVisible(config, key, visible))
  const setHideWhenIdle = (key, hide) => (config = editor.setWidgetHideWhenIdle(config, key, hide))
  // Lower-third trigger knobs (only surfaced for lower-third widgets).
  const setTrigger = (key, value) => (config = editor.setWidgetField(config, key, 'trigger', value))
  const setDwellSeconds = (key, value) =>
    (config = editor.setWidgetField(config, key, 'dwellSeconds', Number(value)))
  // #22 qualifying-only knobs. `modes` are the session modes the timing bar dwells
  // on every camera cut; `fireOnClassBest` toggles the producer-flag class-best flash.
  const MODE_OPTIONS = ['practice', 'qualifying', 'race']
  const setMode = (key, mode, checked) => {
    const current = (config.widgets[key]?.modes || []).filter((m) => m !== mode)
    if (checked) current.push(mode)
    config = editor.setWidgetField(config, key, 'modes', current)
  }
  const setFireOnClassBest = (key, checked) =>
    (config = editor.setWidgetField(config, key, 'fireOnClassBest', !!checked))
  // #28 tower-only: how the standings tower lays out a multi-class field — a single
  // overall-order list with class-position badges (`inline`) or per-class sections
  // with positions restarting per class (`grouped`).
  const setClassDisplay = (key, value) =>
    (config = editor.setWidgetField(config, key, 'classDisplay', value))
  // Richer-tower (slice 3 of #20): which additive per-vehicle metrics the standings
  // tower surfaces — interval column + pit / tire / fuel indicators, each toggled
  // independently. Only the tower reads `towerMetrics`; the producer must supply the
  // underlying fields.
  const setTowerMetric = (key, field, checked) => {
    const current = { ...(config.widgets[key]?.towerMetrics || {}), [field]: !!checked }
    config = editor.setWidgetField(config, key, 'towerMetrics', current)
  }
  // #26 on-board HUD-only: the display unit for the speed readout. The producer emits
  // canonical km/h; checking the box displays mph (the widget converts). Unchecked = km/h.
  const setSpeedUnit = (key, useMph) =>
    (config = editor.setWidgetField(config, key, 'speedUnit', useMph ? 'mph' : 'kmh'))
  // #26 on-board HUD-only: which driver/vehicle identity fields the HUD shows, and
  // whether it holds off while the driver lower-third plays its "now on camera" card.
  const setDriverInfo = (key, field, checked) => {
    const current = { ...(config.widgets[key]?.driverInfo || {}), [field]: !!checked }
    config = editor.setWidgetField(config, key, 'driverInfo', current)
  }
  const setWaitForLowerThird = (key, checked) =>
    (config = editor.setWidgetField(config, key, 'waitForLowerThird', !!checked))

  // ---- logo management ------------------------------------------------------
  async function onUpload(event) {
    // Capture the input up front: `event.currentTarget` is null after the first
    // `await` (it only lives for the synchronous dispatch).
    const input = event.currentTarget
    const files = Array.from(input.files || [])
    if (!files.length) return
    if (!serverUp) {
      status = 'Upload needs the companion server. Start `battlecast serve`.'
      return
    }
    for (const file of files) {
      try {
        const { url } = await api.uploadLogo(file)
        config = editor.addLogoImage(config, url)
      } catch (err) {
        status = `Upload failed: ${err.message}`
      }
    }
    serverLogos = await api.listLogos()
    input.value = ''
  }
  const addLogoToRotation = (url) => (config = editor.addLogoImage(config, url))
  const removeFromRotation = (url) => (config = editor.removeLogoImage(config, url))
  const moveRotation = (i, delta) => (config = editor.moveLogoImage(config, i, delta))
  const setRotation = (patch) => (config = editor.setLogoRotation(config, patch))

  // Delete a logo from the server entirely (not just this rotation), then drop it
  // from the rotation too so we don't point at a now-missing asset.
  async function deleteServerLogo(logo) {
    if (!serverUp) return
    if (typeof window !== 'undefined' && !window.confirm(`Delete "${logo.name}" from the server?`)) return
    try {
      await api.deleteLogo(logo.name)
      config = editor.removeLogoImage(config, logo.url)
      serverLogos = await api.listLogos()
      status = `Deleted "${logo.name}".`
    } catch (err) {
      status = `Delete failed: ${err.message}`
    }
  }

  // ---- profiles -------------------------------------------------------------
  async function saveProfile() {
    if (!serverUp) {
      status = 'No server — use Export to download config.json instead.'
      return
    }
    try {
      await api.saveProfile(profileName, { ...config, name: profileName })
      profiles = await api.listProfiles()
      status = `Saved profile "${profileName}".`
    } catch (err) {
      status = `Save failed: ${err.message}`
    }
  }
  async function loadProfile(name) {
    if (!name) return
    try {
      const loaded = await api.getProfile(name)
      if (!loaded) {
        status = `Profile "${name}" not found.`
        return
      }
      config = normalizeConfig(loaded)
      profileName = name
      status = `Loaded profile "${name}".`
    } catch (err) {
      status = `Load failed: ${err.message}`
    }
  }
  async function deleteProfile() {
    const name = profileName
    if (!serverUp || !name) return
    if (typeof window !== 'undefined' && !window.confirm(`Delete profile "${name}"?`)) return
    try {
      const deleted = await api.deleteProfile(name)
      profiles = await api.listProfiles()
      status = deleted ? `Deleted profile "${name}".` : `Profile "${name}" was not on the server.`
    } catch (err) {
      status = `Delete failed: ${err.message}`
    }
  }

  function exportJson() {
    if (typeof document === 'undefined') return
    const blob = new Blob([JSON.stringify({ ...config, name: profileName }, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${profileName || 'config'}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // ---- OBS URL copy ---------------------------------------------------------
  let copyResetTimer = null
  async function copyObsUrl() {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(obsUrl)
      } else if (typeof document !== 'undefined') {
        // Fallback for non-secure contexts where the async Clipboard API is absent.
        const ta = document.createElement('textarea')
        ta.value = obsUrl
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        ta.remove()
      }
      copied = true
      clearTimeout(copyResetTimer)
      copyResetTimer = setTimeout(() => (copied = false), 1500)
    } catch (err) {
      status = `Copy failed: ${err.message}`
    }
  }
</script>

<div class="config">
  <header class="config__bar">
    <h1>battlecast overlay config</h1>
    <span class="config__status" data-testid="status" class:config__status--up={serverUp}>{status}</span>
  </header>

  <div class="config__body">
    <!-- Live preview with drag/resize handles -->
    <section class="preview" bind:this={previewWrap}>
      <div
        class="preview__stage"
        data-testid="preview-stage"
        style="width: {canvas.w * previewScale}px; height: {canvas.h * previewScale}px;"
      >
        <div
          class="preview__canvas"
          style="width: {canvas.w}px; height: {canvas.h}px; transform: scale({previewScale});"
        >
          <AllView snapshot={sampleSnapshot} {config} preview />

          {#each WIDGET_KEYS as key (key)}
            {#if config.widgets[key]?.visible}
              {@const w = config.widgets[key]}
              <div
                class="handle"
                data-testid="handle-{key}"
                style="left: {w.x}px; top: {w.y}px; width: {w.w}px; height: {w.h}px; z-index: {100 + w.z};"
                onpointerdown={(e) => startDrag(e, key, 'move')}
                role="button"
                tabindex="-1"
              >
                <span class="handle__label">{key}</span>
                <span
                  class="handle__resize"
                  data-testid="resize-{key}"
                  role="button"
                  tabindex="-1"
                  aria-label="resize {key}"
                  onpointerdown={(e) => {
                    e.stopPropagation()
                    startDrag(e, key, 'resize')
                  }}
                ></span>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    </section>

    <!-- Controls -->
    <aside class="panel">
      <section class="panel__group">
        <h2>Profile</h2>
        <label>
          Name
          <input data-testid="profile-name" bind:value={profileName} />
        </label>
        <div class="row">
          <!-- Title on a wrapper, not the button: browsers suppress tooltips on
               disabled controls, and this hint matters most while disabled. -->
          <span title={serverUp ? undefined : 'Start the companion server (make dev) to save profiles — or use Export JSON'}>
            <button data-testid="save" onclick={saveProfile} disabled={!serverUp}>Save</button>
          </span>
          <button data-testid="export" onclick={exportJson}>Export JSON</button>
        </div>
        <label>
          Load
          <select
            data-testid="load"
            disabled={!profiles.length}
            onchange={(e) => loadProfile(e.currentTarget.value)}
          >
            <option value="">
              {profiles.length ? '— pick a profile —' : serverUp ? '— no saved profiles —' : '— server not connected —'}
            </option>
            {#each profiles as p (p)}
              <option value={p}>{p}</option>
            {/each}
          </select>
        </label>
        <div class="row">
          <span title={serverUp ? undefined : 'Start the companion server (make dev) to delete profiles'}>
            <button
              class="danger"
              data-testid="delete-profile"
              onclick={deleteProfile}
              disabled={!serverUp || !profiles.includes(profileName)}
            >Delete "{profileName}"</button>
          </span>
        </div>
      </section>

      <section class="panel__group">
        <h2>Canvas size</h2>
        <p class="hint">Output resolution the layout is designed against (default 1920×1080).</p>
        <div class="row">
          <!-- Commit on change (blur/Enter), not every keystroke: setCanvas
               re-clamps every widget to the canvas and clamping only shrinks, so
               committing intermediate keystrokes (1 -> 12 -> 128) would collapse
               widgets before the full value is typed. -->
          <label class="num">
            width
            <input
              type="number"
              min="320"
              data-testid="canvas-w"
              value={canvas.w}
              onchange={(e) => setCanvas({ w: e.currentTarget.value })}
            />
          </label>
          <label class="num">
            height
            <input
              type="number"
              min="320"
              data-testid="canvas-h"
              value={canvas.h}
              onchange={(e) => setCanvas({ h: e.currentTarget.value })}
            />
          </label>
        </div>
        <div class="row">
          <button data-testid="canvas-1080" onclick={() => setCanvas({ w: 1920, h: 1080 })}>1920×1080</button>
          <button data-testid="canvas-720" onclick={() => setCanvas({ w: 1280, h: 720 })}>1280×720</button>
        </div>
      </section>

      <section class="panel__group">
        <h2>Motion</h2>
        <!-- The overlay animates by default. OBS's Browser Source (CEF) reports
             reduced-motion, so we do NOT read the render host's setting — check this to
             deliberately turn transitions down. `?motion=reduced` overrides per source. -->
        <label class="checkline" title="Turn the overlay's transition animations down. Off = full motion (the default; recommended for OBS). A ?motion= URL param overrides this per Browser Source.">
          <input
            type="checkbox"
            data-testid="reduced-motion"
            checked={config.reducedMotion === true}
            onchange={(e) => (config = { ...config, reducedMotion: e.currentTarget.checked })}
          />
          Reduced motion (turn transitions down)
        </label>
      </section>

      <section class="panel__group">
        <h2>Widgets</h2>
        {#each WIDGET_KEYS as key (key)}
          {@const w = config.widgets[key]}
          <fieldset class="widget-row">
            <legend>
              <label>
                <input
                  type="checkbox"
                  data-testid="visible-{key}"
                  checked={w.visible}
                  onchange={(e) => setVisible(key, e.currentTarget.checked)}
                />
                {key}
              </label>
            </legend>
            <div class="grid4">
              {#each ['x', 'y', 'w', 'h'] as field (field)}
                <label class="num">
                  {field}
                  <input
                    type="number"
                    data-testid="{field}-{key}"
                    value={w[field]}
                    oninput={(e) => setField(key, field, Number(e.currentTarget.value))}
                  />
                </label>
              {/each}
              <label class="num">
                z
                <input
                  type="number"
                  data-testid="z-{key}"
                  value={w.z}
                  oninput={(e) => setField(key, 'z', Number(e.currentTarget.value))}
                />
              </label>
            </div>
            {#if widgetSupportsAutoHide(key)}
              <label class="checkline" title="Remove this widget from the overlay while it has nothing to show">
                <input
                  type="checkbox"
                  data-testid="hide-idle-{key}"
                  checked={w.hideWhenIdle}
                  onchange={(e) => setHideWhenIdle(key, e.currentTarget.checked)}
                />
                Hide when idle
              </label>
            {/if}
            {#if isLowerThird(key)}
              <!-- Lower-third fire behavior: `dwell` shows on each camera cut then
                   auto-hides after N seconds; `persistent` stays while the subject
                   is on camera. Dwell seconds only applies in dwell mode. -->
              <div class="row trigger-row">
                <label class="num">
                  trigger
                  <select
                    data-testid="trigger-{key}"
                    value={w.trigger}
                    onchange={(e) => setTrigger(key, e.currentTarget.value)}
                  >
                    <option value="dwell">dwell</option>
                    <option value="persistent">persistent</option>
                  </select>
                </label>
                <label class="num">
                  dwell secs
                  <input
                    type="number"
                    min="1"
                    step="1"
                    data-testid="dwell-{key}"
                    value={w.dwellSeconds}
                    disabled={w.trigger !== 'dwell'}
                    oninput={(e) => setDwellSeconds(key, e.currentTarget.value)}
                  />
                </label>
              </div>
            {/if}
            {#if key === 'qualifying'}
              <!-- #22-only: which session modes the timing bar dwells on every
                   camera cut, and whether the producer-flagged class-best lap fires
                   the "fastest lap" flash independent of those modes. -->
              <fieldset class="modes-row">
                <legend>fires on cut in</legend>
                {#each MODE_OPTIONS as mode (mode)}
                  <label class="checkline">
                    <input
                      type="checkbox"
                      data-testid="mode-{key}-{mode}"
                      checked={w.modes?.includes(mode)}
                      onchange={(e) => setMode(key, mode, e.currentTarget.checked)}
                    />
                    {mode}
                  </label>
                {/each}
              </fieldset>
              <label class="checkline" title="Flash the timing bar when the producer flags the on-camera driver's lap a class best (any mode)">
                <input
                  type="checkbox"
                  data-testid="fire-class-best-{key}"
                  checked={w.fireOnClassBest}
                  onchange={(e) => setFireOnClassBest(key, e.currentTarget.checked)}
                />
                Fire on class-best lap
              </label>
            {/if}
            {#if key === 'tower'}
              <!-- #28-only: how the standings tower lays out a multi-class field.
                   `inline` keeps one overall-order list, each row badged with its
                   class position; `grouped` splits into per-class sections (registry
                   order) with positions restarting per class. -->
              <label class="num class-display-row">
                class display
                <select
                  data-testid="class-display-{key}"
                  value={w.classDisplay}
                  onchange={(e) => setClassDisplay(key, e.currentTarget.value)}
                >
                  <option value="inline">inline</option>
                  <option value="grouped">grouped</option>
                </select>
              </label>
              <!-- #28 follow-on: which additive per-vehicle metrics the tower surfaces —
                   the interval-to-ahead column plus pit / tire / fuel indicators. The
                   producer must supply the underlying fields (interval_ahead / pit_stops /
                   in_pit / tire_compound / tire_wear / fuel). -->
              <fieldset class="modes-row">
                <legend>tower metrics shown</legend>
                {#each TOWER_METRIC_FIELDS as field (field)}
                  <label class="checkline">
                    <input
                      type="checkbox"
                      data-testid="tower-metric-{key}-{field}"
                      checked={w.towerMetrics?.[field] === true}
                      onchange={(e) => setTowerMetric(key, field, e.currentTarget.checked)}
                    />
                    {field}
                  </label>
                {/each}
              </fieldset>
            {/if}
            {#if key === 'onboard'}
              <!-- #26-only: the display unit for the HUD's speed readout. The producer
                   emits canonical km/h; check to display mph (the widget converts). -->
              <label class="checkline" title="Display the on-board HUD speed in mph instead of km/h (the producer emits km/h; the widget converts)">
                <input
                  type="checkbox"
                  data-testid="speed-mph-{key}"
                  checked={w.speedUnit === 'mph'}
                  onchange={(e) => setSpeedUnit(key, e.currentTarget.checked)}
                />
                Speed in mph
              </label>
              <!-- #26-only: which on-camera driver/vehicle identity fields the HUD
                   shows (each toggled independently). number/make/model come from the
                   additive vehicle spec fields; the producer must supply them. -->
              <fieldset class="modes-row">
                <legend>driver info shown</legend>
                {#each DRIVER_INFO_FIELDS as field (field)}
                  <label class="checkline">
                    <input
                      type="checkbox"
                      data-testid="driver-info-{key}-{field}"
                      checked={w.driverInfo?.[field] === true}
                      onchange={(e) => setDriverInfo(key, field, e.currentTarget.checked)}
                    />
                    {field}
                  </label>
                {/each}
              </fieldset>
              <!-- #26 + #21 hand-off: hold the HUD off while the driver lower-third
                   plays its "now on camera" card, so the driver name never shows in
                   both at once; the HUD reveals when the card wipes out. -->
              <label class="checkline" title="Hold the on-board HUD off while the driver lower-third is showing its 'now on camera' card, then reveal it (avoids showing the driver name in both at once)">
                <input
                  type="checkbox"
                  data-testid="wait-lower-third-{key}"
                  checked={w.waitForLowerThird === true}
                  onchange={(e) => setWaitForLowerThird(key, e.currentTarget.checked)}
                />
                Wait for driver lower-third
              </label>
            {/if}
          </fieldset>
        {/each}
      </section>

      <section class="panel__group">
        <h2>Logo rotation</h2>
        <label title={serverUp ? undefined : 'Start the companion server (make dev) to upload logos'}>
          Upload image
          <input type="file" accept="image/*" data-testid="upload" multiple onchange={onUpload} disabled={!serverUp} />
        </label>

        {#if serverLogos.length}
          <p class="hint">Available on server (click to add):</p>
          <ul class="logo-list">
            {#each serverLogos as logo (logo.name)}
              <li>
                <button class="link" onclick={() => addLogoToRotation(logo.url)}>+ {logo.name}</button>
                <button
                  class="danger"
                  aria-label="delete {logo.name} from server"
                  data-testid="delete-server-logo"
                  title="Delete from server"
                  onclick={() => deleteServerLogo(logo)}
                >✕</button>
              </li>
            {/each}
          </ul>
        {/if}

        <p class="hint">In rotation:</p>
        <ol class="logo-list" data-testid="rotation-list">
          {#each config.logoRotation.images as url, i (url)}
            <li>
              <span class="logo-url">{url}</span>
              <button aria-label="up" onclick={() => moveRotation(i, -1)}>↑</button>
              <button aria-label="down" onclick={() => moveRotation(i, 1)}>↓</button>
              <button aria-label="remove" data-testid="remove-logo" onclick={() => removeFromRotation(url)}>✕</button>
            </li>
          {/each}
          {#if config.logoRotation.images.length === 0}
            <li class="hint" data-testid="rotation-empty">No images in rotation yet.</li>
          {/if}
        </ol>

        <div class="row">
          <label class="num">
            per-slot seconds
            <input
              type="number"
              min="1"
              data-testid="per-slot"
              value={config.logoRotation.perSlotSeconds}
              oninput={(e) => setRotation({ perSlotSeconds: Number(e.currentTarget.value) })}
            />
          </label>
          <label class="num">
            order
            <select
              data-testid="order"
              value={config.logoRotation.order}
              onchange={(e) => setRotation({ order: e.currentTarget.value })}
            >
              <option value="sequential">sequential</option>
              <option value="shuffle">shuffle</option>
            </select>
          </label>
        </div>
      </section>

      <section class="panel__group">
        <h2>Producer</h2>
        <label>
          SSE URL
          <input
            data-testid="producer-src"
            value={config.producer?.src || ''}
            oninput={(e) => (config = editor.setProducerSrc(config, e.currentTarget.value))}
            placeholder="http://localhost:8080/events"
          />
        </label>
      </section>

      <section class="panel__group">
        <h2>OBS Browser Source URL</h2>
        <button
          type="button"
          class="obs-url"
          data-testid="obs-url"
          title="Click to copy"
          onclick={copyObsUrl}
        >{obsUrl}</button>
        <span class="copy-hint" data-testid="copy-hint">{copied ? 'Copied to clipboard ✓' : 'Click the URL to copy'}</span>
      </section>
    </aside>
  </div>
</div>

<style>
  .config {
    min-height: 100vh;
    background: #12151c;
    color: #e7ecf3;
    font-family: var(--bc-font-ui, system-ui, sans-serif);
  }
  /* Border-box everywhere so full-width inputs (padding + border) never spill past
     their container's right edge. */
  .config :global(*) {
    box-sizing: border-box;
  }
  .config__bar {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid #2a3140;
  }
  .config__bar h1 {
    font-size: 1rem;
    margin: 0;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .config__status {
    font-size: 0.8rem;
    color: #9aa7ba;
  }
  .config__status--up {
    color: #2ed9a6;
  }
  .config__body {
    display: grid;
    grid-template-columns: 1fr 380px;
    gap: 1rem;
    padding: 1rem 1.25rem;
    align-items: start;
  }
  .preview {
    position: sticky;
    top: 1rem;
  }
  .preview__stage {
    position: relative;
    background: repeating-conic-gradient(#1b2029 0% 25%, #171b23 0% 50%) 50% / 32px 32px;
    border: 1px solid #2a3140;
    overflow: hidden;
  }
  .preview__canvas {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: top left;
  }
  .handle {
    position: absolute;
    border: 1.5px dashed rgba(46, 217, 166, 0.9);
    background: rgba(46, 217, 166, 0.06);
    cursor: move;
  }
  .handle__label {
    position: absolute;
    top: 0;
    left: 0;
    font-size: 22px;
    padding: 2px 8px;
    background: rgba(46, 217, 166, 0.9);
    color: #06231b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .handle__resize {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 28px;
    height: 28px;
    background: rgba(46, 217, 166, 0.9);
    cursor: nwse-resize;
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .panel__group {
    background: #171b23;
    border: 1px solid #2a3140;
    border-radius: 8px;
    padding: 0.75rem 0.9rem;
  }
  .panel__group h2 {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 0 0 0.6rem;
    color: #9aa7ba;
  }
  label {
    display: block;
    font-size: 0.8rem;
    margin-bottom: 0.4rem;
  }
  input,
  select {
    width: 100%;
    background: #0e1118;
    border: 1px solid #2a3140;
    color: #e7ecf3;
    border-radius: 5px;
    padding: 0.3rem 0.4rem;
    font: inherit;
  }
  .row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .grid4 {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.4rem;
  }
  /* min-width:0 lets these flex/grid children shrink instead of forcing the
     container wider than the panel (grid/flex items default to min-width:auto). */
  .num,
  .row > * {
    min-width: 0;
  }
  .num {
    font-size: 0.7rem;
    text-transform: uppercase;
  }
  button {
    background: #232b39;
    border: 1px solid #354057;
    color: #e7ecf3;
    border-radius: 5px;
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font: inherit;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  button.link {
    flex: 1;
    background: none;
    border: none;
    color: #2ed9a6;
    padding: 0.1rem 0;
    text-align: left;
  }
  button.danger {
    padding: 0.1rem 0.4rem;
    color: #ff8a8a;
    border-color: #5a2a2a;
    background: #241a1a;
  }
  .widget-row {
    min-width: 0;
    border: 1px solid #2a3140;
    border-radius: 6px;
    padding: 0.4rem 0.6rem 0.6rem;
    margin-bottom: 0.6rem;
  }
  .widget-row legend {
    text-transform: uppercase;
    font-size: 0.8rem;
  }
  .checkline {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin: 0.5rem 0 0;
    font-size: 0.72rem;
    color: #9aa7ba;
  }
  .checkline input {
    width: auto;
  }
  .trigger-row {
    margin-top: 0.5rem;
  }
  .class-display-row {
    margin-top: 0.5rem;
  }
  .modes-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.15rem 0.7rem;
    margin: 0.5rem 0 0;
    padding: 0.3rem 0.5rem 0.4rem;
    border: 1px solid #2a3140;
    border-radius: 6px;
  }
  .modes-row legend {
    text-transform: uppercase;
    font-size: 0.68rem;
    color: #9aa7ba;
    letter-spacing: 0.05em;
  }
  .modes-row .checkline {
    margin: 0;
    text-transform: capitalize;
  }
  .logo-list {
    list-style: none;
    margin: 0 0 0.6rem;
    padding: 0;
    font-size: 0.78rem;
  }
  .logo-list li {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.15rem 0;
  }
  .logo-url {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hint {
    color: #6f7c90;
    font-size: 0.75rem;
    margin: 0.3rem 0;
  }
  button.obs-url {
    display: block;
    width: 100%;
    text-align: left;
    word-break: break-all;
    font-family: var(--bc-font-mono, ui-monospace, monospace);
    font-size: 0.75rem;
    color: #2ed9a6;
    background: #0e1118;
    border: 1px solid #2a3140;
    padding: 0.4rem 0.5rem;
    border-radius: 5px;
    cursor: pointer;
  }
  button.obs-url:hover {
    border-color: #2ed9a6;
  }
  .copy-hint {
    display: block;
    margin-top: 0.35rem;
    font-size: 0.72rem;
    color: #6f7c90;
  }
</style>
