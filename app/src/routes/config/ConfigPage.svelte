<script>
  /* Config UI (#34, part 2) — the WYSIWYG overlay editor at `/config`. The single
   * writer of the overlay-config contract: arrange/size/toggle widgets on a live
   * preview, manage the logo carousel, pick the producer, and save/load named
   * profiles via the companion server — no code or CSS editing. Degrades to
   * client-only authoring (export a config.json) when no server is running. */
  import { onMount } from 'svelte'
  import AllView from '../all/AllView.svelte'
  import { DEFAULT_CONFIG, OVERLAY_CANVAS, WIDGET_KEYS, normalizeConfig } from '../../lib/overlayConfig.js'
  import * as editor from '../../lib/configEditor.js'
  import * as api from '../../lib/configApi.js'
  import sampleSnapshot from '../../../../spec/v1/fixtures/race-close-battle.json'

  let config = $state(normalizeConfig(DEFAULT_CONFIG))
  let profileName = $state('default')
  let profiles = $state([])
  let serverLogos = $state([])
  let serverUp = $state(false)
  let status = $state('Not connected to a server — changes can be exported as config.json.')
  let previewScale = $state(0.4)
  let previewWrap = $state(null)

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
    previewScale = Math.max(0.15, Math.min(avail / OVERLAY_CANVAS.w, 0.6))
  }

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

  // ---- widget field editing -------------------------------------------------
  const setField = (key, field, value) => (config = editor.setWidgetField(config, key, field, value))
  const setVisible = (key, visible) => (config = editor.setWidgetVisible(config, key, visible))

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
        style="width: {OVERLAY_CANVAS.w * previewScale}px; height: {OVERLAY_CANVAS.h * previewScale}px;"
      >
        <div
          class="preview__canvas"
          style="width: {OVERLAY_CANVAS.w}px; height: {OVERLAY_CANVAS.h}px; transform: scale({previewScale});"
        >
          <AllView snapshot={sampleSnapshot} {config} />

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
          <button data-testid="save" onclick={saveProfile} disabled={!serverUp}>Save</button>
          <button data-testid="export" onclick={exportJson}>Export JSON</button>
        </div>
        {#if profiles.length}
          <label>
            Load
            <select data-testid="load" onchange={(e) => loadProfile(e.currentTarget.value)}>
              <option value="">— pick a profile —</option>
              {#each profiles as p (p)}
                <option value={p}>{p}</option>
              {/each}
            </select>
          </label>
        {/if}
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
          </fieldset>
        {/each}
      </section>

      <section class="panel__group">
        <h2>Logo rotation</h2>
        <label>
          Upload image
          <input type="file" accept="image/*" data-testid="upload" multiple onchange={onUpload} disabled={!serverUp} />
        </label>

        {#if serverLogos.length}
          <p class="hint">Available on server (click to add):</p>
          <ul class="logo-list">
            {#each serverLogos as logo (logo.name)}
              <li>
                <button class="link" onclick={() => addLogoToRotation(logo.url)}>+ {logo.name}</button>
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
        <code class="obs-url" data-testid="obs-url">{obsUrl}</code>
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
  }
  .grid4 {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.4rem;
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
    background: none;
    border: none;
    color: #2ed9a6;
    padding: 0.1rem 0;
    text-align: left;
  }
  .widget-row {
    border: 1px solid #2a3140;
    border-radius: 6px;
    padding: 0.4rem 0.6rem 0.6rem;
    margin-bottom: 0.6rem;
  }
  .widget-row legend {
    text-transform: uppercase;
    font-size: 0.8rem;
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
  .obs-url {
    display: block;
    word-break: break-all;
    font-size: 0.75rem;
    color: #2ed9a6;
    background: #0e1118;
    padding: 0.4rem 0.5rem;
    border-radius: 5px;
  }
</style>
