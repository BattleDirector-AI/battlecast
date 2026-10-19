<script>
  import ClassChip from '../../design/ClassChip.svelte'
  import { classColor, classMeta } from '../../design/classMeta.js'
  import { fmtName, fmtShortName, fmtLapTime } from '../../design/format.js'
  import { sessionProgressText } from '../../design/sessionProgress.js'
  import { onDestroy, untrack } from 'svelte'
  import { computeRowBudget, createTowerCycle, clampPerPageSeconds } from './towerCycle.js'

  // Class-aware standings tower (#28). Presentational: renders whatever snapshot it
  // is handed. Two layouts, selected by `classDisplay`:
  //   inline  — one list in overall `position` order, each row badged with its rank
  //             within its class (e.g. '1/7').
  //   grouped — per-class sections in class-registry order (mirrors the grid/results
  //             slides), with positions restarting within each class.
  // `?class=` narrows to a single class (case-insensitive). All SSE wiring + URL
  // parsing lives in the pages (TowerPage / AllView).
  let {
    snapshot = null,
    label = 'RUNNING ORDER',
    classDisplay = 'inline',
    classFilter = null,
    // Richer-tower metric toggles (slice 3 of #20 → follow-on to #28):
    // `{ interval, pit, tire, fuel, lapFlash }`. Which additive per-vehicle metrics (and
    // the lap-time flash) this tower surfaces, each independent. The bare component defaults to ALL OFF (backward-
    // compatible: an un-configured tower renders exactly as before); /all + the
    // standalone route pass the config's `towerMetrics` (interval + lapFlash on by default).
    metrics = {},
    // Tower overflow — pinned rows + cycling window (ADR 0003 / .ai/spec tower-overflow.md).
    // `maxRows` ('auto' | integer cap) and `cycle` come from config; `slotHeight` is the
    // tower's configured slot height in CANVAS px. Only /all supplies slotHeight — that's
    // where the tower has a bounded box; the standalone route leaves it null, so cycling
    // stays inert unless an integer `maxRows` caps the rows directly.
    maxRows = 'auto',
    cycle = null,
    slotHeight = null,
    // Broadcaster class-color overrides (rule 32, ADR 0010) — the resolved
    // `theme.classColors` map, or `{}` when the caller has none.
    classColors = {},
    // Driver name style (widgets.md rules 46-48, ADR 0018): 'short' (E.JAC, the default —
    // it never changes width) or 'full' (E. Jacobs, the tower growing to fit).
    // `configuredWidth` is the tower's configured width in canvas px (/all passes its `w`;
    // standalone leaves it null and the resolved --bc-tower-width is used). `textScale` is
    // only a reset trigger for the full-style width; the slot's type tokens do the scaling.
    nameStyle = 'short',
    configuredWidth = null,
    textScale = null,
  } = $props()

  // Normalize the metric toggles once — tolerate a partial/garbage object so a caller
  // may pass just `{ interval: true }`. Missing keys are off.
  const m = $derived({
    interval: metrics?.interval === true,
    pit: metrics?.pit === true,
    tire: metrics?.tire === true,
    fuel: metrics?.fuel === true,
    lapFlash: metrics?.lapFlash === true,
  })

  // ---- lap-time flash (#207, widgets.md rules 40-42, ADR 0014) -----------------
  // When a car's OWN `last_lap` changes between snapshots, its gap cell shows the new lap
  // time for LAP_FLASH_MS. Presentation only: one car's field compared with its previous
  // value, never one car against another. The tier comes from the producer's `notable`
  // flags in the snapshot that fired, frozen for the flash.
  const LAP_FLASH_MS = 5000
  let prevLaps = null // slot_id -> last_lap from the previous snapshot; null before the first
  let flashes = $state({}) // slot_id -> { lap, tier }
  const flashTimers = {}
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)
  const flashTier = (notable) =>
    notable?.session_best_lap === true
      ? 'session-best'
      : notable?.class_best_lap === true
        ? 'class-best'
        : notable?.personal_best_lap === true
          ? 'personal-best'
          : 'none'

  function clearFlashes() {
    for (const slot of Object.keys(flashTimers)) {
      clearTimeout(flashTimers[slot])
      delete flashTimers[slot]
    }
    flashes = {}
  }

  function startFlash(slot, lap, tier) {
    clearTimeout(flashTimers[slot])
    flashes = { ...flashes, [slot]: { lap, tier } }
    flashTimers[slot] = setTimeout(() => {
      delete flashTimers[slot]
      const rest = { ...flashes }
      delete rest[slot]
      flashes = rest
    }, LAP_FLASH_MS)
  }

  $effect(() => {
    const vehicles = snapshot?.vehicles ?? []
    const enabled = m.lapFlash
    untrack(() => {
      if (!enabled) clearFlashes()
      const next = {}
      for (const v of vehicles) {
        const lap = v.last_lap
        next[v.slot_id] = lap
        const completed =
          typeof lap === 'number' && Number.isFinite(lap) && lap > 0 &&
          prevLaps !== null && hasOwn(prevLaps, v.slot_id) && prevLaps[v.slot_id] !== lap
        if (enabled && completed) startFlash(v.slot_id, lap, flashTier(v.notable))
      }
      prevLaps = next
    })
  })
  $effect(() => () => clearFlashes())

  const subjectSlot = $derived(snapshot?.subject?.slot_id ?? null)

  // Session-mode header: derive from `snapshot.mode` (RACE / QUALIFYING / PRACTICE),
  // tolerating unknown strings by uppercasing them. Falls back to `label`
  // ('RUNNING ORDER' by default) when the snapshot carries no mode.
  const header = $derived(
    snapshot?.mode != null && String(snapshot.mode).trim()
      ? String(snapshot.mode).trim().toUpperCase()
      : label,
  )

  // Session progress in the header — the session countdown clock or lap counter,
  // the native "Session Info" element (distinct from the flag/FCY/SC status widget
  // and the per-car rows). Null when the producer sends no session progress, so the
  // header then shows just the mode. See app/src/design/sessionProgress.js.
  const sessionProgress = $derived(sessionProgressText(snapshot?.session))

  // Lap-timed sessions (qualifying / practice) are a lap-time board: the leader's
  // cell shows their best lap — the pole/benchmark time every delta is measured
  // against — rather than the word LEADER, while the field still shows deltas. In a
  // race the leader is about track position, so it keeps reading LEADER.
  const lapTimed = $derived(
    ['qualifying', 'practice'].includes(String(snapshot?.mode ?? '').trim().toLowerCase()),
  )

  // Pit stops, tire wear, and fuel are RACE features of the tower — they don't belong on a
  // qualifying / practice lap board, so the widget suppresses them there OUTRIGHT,
  // regardless of the config toggles or what a producer happens to send (this is where the
  // dumb-overlay rule yields to a presentation decision). Tire COMPOUND is the one
  // strategy field that stays — the qualifying tire choice is relevant — as does the
  // interval column. Same session set as `lapTimed`.
  const hideRaceStrategy = $derived(lapTimed)

  // Finish status (rule 45): the producer's per-car code, shown only in a race or results
  // board. Exactly 1 / 2 / 3 map to a chip; anything else (0, null, "1", true, 4…) is none.
  const FINISH_KINDS = { 1: 'finished', 2: 'dnf', 3: 'dq' }
  const finishBoard = $derived(
    ['race', 'results'].includes(String(snapshot?.mode ?? '').trim().toLowerCase()),
  )
  const finishKind = (v) =>
    finishBoard && Number.isInteger(v.finish_status) ? (FINISH_KINDS[v.finish_status] ?? null) : null

  // Normalize the requested class once (case-insensitive, trimmed). Empty/absent
  // => show every class.
  const filterKey = $derived(
    classFilter != null && String(classFilter).trim()
      ? String(classFilter).trim().toLowerCase()
      : null,
  )
  const matchesFilter = (v) =>
    filterKey === null || String(v.vehicle_class ?? '').toLowerCase() === filterKey

  // Full field in overall running order — the basis for both layouts and for each
  // car's rank within its class. Never mutate the source array — copy before sort.
  const allSorted = $derived(
    [...(snapshot?.vehicles ?? [])].sort((a, b) => a.position - b.position),
  )

  // Class rank + class size, computed once from the full field's running order so a
  // car's 'GTP 3/7' is stable regardless of the ?class= filter. Plain objects keyed
  // by slot / lowercased class (no Map — the component lint rule bans it).
  const classInfo = $derived.by(() => {
    const rank = {}
    const total = {}
    for (const v of allSorted) {
      const key = String(v.vehicle_class ?? '').toLowerCase()
      const next = (total[key] ?? 0) + 1
      total[key] = next
      rank[v.slot_id] = next
    }
    return { rank, total }
  })
  const classRankOf = (v) => classInfo.rank[v.slot_id] ?? 0
  const classTotalOf = (v) =>
    classInfo.total[String(v.vehicle_class ?? '').toLowerCase()] ?? 0

  // inline: overall order, filtered.
  const inlineRows = $derived(allSorted.filter(matchesFilter))

  // Layout only: once any rendered row carries a finish chip (rule 45), every row reserves
  // the chip's slot so the gap / interval / metric columns stay aligned between marked and
  // unmarked rows. Grouped rows are the same filtered field, so this covers both layouts.
  const finishSlot = $derived(finishBoard && inlineRows.some((v) => finishKind(v)))

  // grouped: per-class sections. Bucket the filtered field by class, ordered by the
  // class registry `order` (alphabetical tiebreak for unknown classes) — the same
  // sequence the grid/results slides group by. Positions restart within each class.
  const groups = $derived.by(() => {
    const byClass = {}
    for (const v of allSorted.filter(matchesFilter)) {
      const raw = String(v.vehicle_class ?? '')
      const key = raw.toLowerCase()
      if (!byClass[key]) {
        byClass[key] = { key, carClass: raw, order: classMeta(raw).order, cars: [] }
      }
      byClass[key].cars.push(v)
    }
    return Object.values(byClass).sort(
      (a, b) => a.order - b.order || a.key.localeCompare(b.key),
    )
  })

  const grouped = $derived(classDisplay === 'grouped')
  const hasRows = $derived(grouped ? groups.length > 0 : inlineRows.length > 0)
  // A class filter that matches nothing is a distinct, explicit state from "no
  // snapshot at all" — surface which so the tower never blanks silently.
  const emptyReason = $derived(snapshot?.vehicles?.length ? 'no-match' : 'no-state')

  // ---- tower overflow: pinned rows + cycling window (ADR 0003) ---------------
  // Grouped layout stays clamp-only (spec scope); cycling applies to the inline
  // (single running-order) layout. The CSS clamp on the slot is the hard bound
  // underneath — selection just decides which rows are worth showing.

  // Bound to the .tower section so the row/header heights read off the live design
  // tokens (theme-overridable) rather than hardcoding 38/44 (spec rule 3).
  let towerEl = $state(null)
  let tokenPx = $state({ header: 38, row: 44, towerWidth: 400 })
  $effect(() => {
    if (!towerEl || typeof getComputedStyle !== 'function') return
    const cs = getComputedStyle(towerEl)
    const header = parseFloat(cs.getPropertyValue('--bc-widget-header'))
    const row = parseFloat(cs.getPropertyValue('--bc-row-standard'))
    // The standalone configured width (rule 48): the token only when it reads as a px
    // number — a custom property comes back as its authored text — else 400.
    const towerWidth = /^\s*(\d+(?:\.\d+)?)px\s*$/.exec(cs.getPropertyValue('--bc-tower-width'))
    tokenPx = {
      header: Number.isFinite(header) && header > 0 ? header : 38,
      row: Number.isFinite(row) && row > 0 ? row : 44,
      towerWidth: towerWidth ? Number(towerWidth[1]) : 400,
    }
  })

  // Row budget: how many rows fit the configured slot height (measured tokens), capped
  // by an explicit integer `maxRows`. No slot height + 'auto' => unbounded (the
  // standalone /tower case), so cycling stays inert.
  const rowBudget = $derived.by(() => {
    const fromHeight =
      slotHeight != null ? computeRowBudget(slotHeight, tokenPx.header, tokenPx.row) : Infinity
    if (maxRows === 'auto' || maxRows == null) return fromHeight
    const cap = Number(maxRows)
    return Number.isFinite(cap) ? Math.min(fromHeight, Math.floor(cap)) : fromHeight
  })

  // The controller exists whenever cycling is configured for a bounded inline tower —
  // independent of whether the field currently overflows, so a growing field engages
  // cycling without recreating (and resetting) the controller. Depends on the budget,
  // NOT the field size.
  const cycleEnabled = $derived(
    cycle?.enabled === true &&
      classDisplay === 'inline' &&
      Number.isFinite(rowBudget) &&
      rowBudget >= 1,
  )

  // Stateful cycling controller (frozen window membership + page cursor), kept in a
  // plain handle. Feed it the FILTERED inline field (position-sorted); class-rank
  // badges stay computed from the full field (classInfo), unaffected.
  let controller = null
  let displayRows = $state([])
  let pageEpoch = $state(0) // bumped on each turn to re-trigger the reveal animation
  const cycleSnapshot = () => ({
    vehicles: inlineRows,
    subject: snapshot?.subject ?? {},
    mode: snapshot?.mode ?? null,
  })

  // Controller lifecycle + page-turn timer. Depends on budget/cycle only (via
  // `cycleEnabled`) — NOT the snapshot — so it recreates only when the layout budget
  // changes and the timer keeps a constant cadence (cycling never pauses, incl. under
  // caution). The prime is untracked so it doesn't pull the snapshot into the deps.
  $effect(() => {
    if (!cycleEnabled) {
      controller = null
      return
    }
    const c = createTowerCycle({ budget: rowBudget, cycle })
    controller = c
    displayRows = untrack(() => c.sync(cycleSnapshot()))
    const ms = clampPerPageSeconds(cycle.perPageSeconds) * 1000
    const id = setInterval(() => {
      // Only turn when the field actually overflows the budget; a fitting field is inert.
      // Reads here are outside tracking — a plain timer callback.
      if (inlineRows.length > rowBudget) {
        const prevPage = c.page
        displayRows = c.turn(cycleSnapshot())
        // Replay the reveal only when the window page actually advanced — a pins-only
        // overflow (a single window page) must not flash the same rows every tick.
        if (c.page !== prevPage) pageEpoch += 1
      }
    }, ms)
    return () => {
      clearInterval(id)
      if (controller === c) controller = null
    }
  })

  // Re-render the frozen window with live data on every snapshot (position/gap/tire
  // update in place; membership changes only on a turn). Defined after the lifecycle
  // effect, so `controller` is current when this runs.
  $effect(() => {
    if (!cycleEnabled) return
    const snap = cycleSnapshot()
    if (controller) displayRows = controller.sync(snap)
  })

  // Rows the inline layout draws: the cycled selection when active (all rows when the
  // field fits, the pinned+window subset when it overflows), else the whole filtered
  // field. Falls back to the full field before the first sync rather than flashing empty.
  const renderRows = $derived.by(() => {
    if (cycleEnabled && displayRows.length) return displayRows
    // Not cycling (disabled, budget < 1, or before the first sync): still cap a bounded
    // inline tower to whole rows / header-only rather than leaning on the CSS clip to hide
    // a partial row (spec rule 2). Standalone (infinite budget) and grouped fall through
    // to the full field, bounded only by the clamp.
    if (classDisplay === 'inline' && Number.isFinite(rowBudget)) {
      return inlineRows.slice(0, Math.max(0, rowBudget))
    }
    return inlineRows
  })

  // ---- table columns (widgets.md rules 49-53, ADR 0020) ----
  // One CSS grid per tower; each row is a subgrid of it, so a column's width is shared by
  // every row. A strategy column is shown when any car in the class-filtered field carries
  // its field at all (`pit_stops: 0` counts), so the column set is a function of the
  // snapshot alone. See how/renderer.md "Tower columns".
  const carries = (key) => inlineRows.some((v) => v?.[key] != null)
  const columns = $derived.by(() => {
    const cols = ['pos', 'class']
    if (!grouped) cols.push('classpos')
    cols.push('name', 'gap')
    if (m.interval) cols.push('interval')
    if (m.pit && !hideRaceStrategy && (carries('pit_stops') || carries('in_pit'))) cols.push('pit')
    if (m.tire && (carries('tire_compound') || (!hideRaceStrategy && carries('tire_wear')))) cols.push('tire')
    if (m.fuel && !hideRaceStrategy && carries('fuel')) cols.push('fuel')
    if (finishSlot) cols.push('finish')
    return cols
  })
  const gridTemplate = $derived(
    columns.map((c) => (c === 'name' ? 'minmax(max-content, 1fr)' : 'max-content')).join(' '),
  )
  const shown = $derived(Object.fromEntries(columns.map((c) => [c, true])))
  // Inline layout: the class-filtered cars the cycling window or maxRows leaves out. Each
  // gets a zero-height, invisible sizer row so its content still sizes the tracks (rule 50).
  const sizerRows = $derived.by(() => {
    const rendered = Object.fromEntries(renderRows.map((v) => [v.slot_id, true]))
    return inlineRows.filter((v) => !rendered[v.slot_id])
  })

  // ---- driver name style + the full-style width (widgets.md rules 46-48, ADR 0018) ----
  // Short (E.JAC) never changes width. Full (E. Jacobs) is never ellipsized: the tower root
  // carries an inline min-width of max(configured width, ceil(widestName + widestRest +
  // borderX)), the running maxima cleared only by a reset. See how/renderer.md "Driver name style".
  const fullStyle = $derived(nameStyle === 'full')
  const fullNameOf = (v) => (typeof v.driver_name === 'string' ? fmtName(v.driver_name) : '')
  const nameOf = (v) => (fullStyle ? fullNameOf(v) : fmtShortName(v.driver_name))

  const baseWidth = $derived(
    typeof configuredWidth === 'number' && Number.isFinite(configuredWidth)
      ? configuredWidth
      : tokenPx.towerWidth,
  )
  // Every tower setting whose change is a reset, as one comparable value (a fresh but
  // equal config object from /all is not a change).
  const settingsKey = $derived(
    JSON.stringify([filterKey, classDisplay, m, maxRows, cycle, nameStyle, baseWidth, textScale]),
  )
  // The session mode as rule 45 compares it; null when the snapshot carries none.
  const modeKey = (snap) =>
    snap?.mode != null && String(snap.mode).trim() ? String(snap.mode).trim().toLowerCase() : null

  // The measuring font: the on-camera row-name weight, size and family off the tower's
  // computed style, each token falling back to its tokens/typography.css default.
  function nameFontParts() {
    const cs = computedStyle(towerEl)
    const read = (prop, fallback) => cs?.getPropertyValue(prop).trim() || fallback
    return {
      weight: read('--bc-weight-leader', '700'),
      size: read('--bc-size-name', '22px'),
      family: read('--bc-font-display', "'Saira Condensed', 'Arial Narrow', sans-serif"),
    }
  }
  const measuringFont = () => {
    const f = nameFontParts()
    return `${f.weight} ${f.size} ${f.family}`
  }
  const familyKey = (family) =>
    String(family ?? '').trim().replace(/^['"]|['"]$/g, '').trim().toLowerCase()

  let widestName = $state(0)
  let widestRest = $state(0)
  let borderX = $state(0) // the tower root's left + right border, inside its min-width
  let namesMeasured = $state(false) // false until a pass ran with the name font loaded
  // Full name -> px, every name measured since the last reset. Prototype-free, so a driver
  // named '__proto__' caches like any other.
  let measuredNames = Object.create(null)
  // Measuring fonts already asked of document.fonts.load: each is requested once, ever.
  let requestedFonts = Object.create(null)
  // Measuring fonts whose load failed: measured in the fallback face from then on, no retry.
  let failedFonts = Object.create(null)
  let destroyed = false
  let lastSettings = null
  let lastMode = null
  let measureCtx // undefined until first use; null when there is no 2D context

  function textWidth(text, font) {
    if (measureCtx === undefined) {
      try {
        measureCtx = document.createElement('canvas').getContext?.('2d') ?? null
      } catch {
        measureCtx = null
      }
    }
    if (!measureCtx) return 0
    measureCtx.font = font
    return measureCtx.measureText(text).width
  }

  // A computed length in px; non-finite ('normal', '' in happy-dom) counts 0.
  const cssPx = (value) => {
    const n = parseFloat(value)
    return Number.isFinite(n) ? n : 0
  }
  const computedStyle = (el) =>
    el && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
      ? window.getComputedStyle(el)
      : null

  // Canvas measureText ignores CSS letter-spacing, so it is added per code point, read off
  // the first rendered name cell (the tower root when no row is rendered: correct while the
  // name cell inherits its letter-spacing, as it does from :root today).
  function nameLetterSpacing() {
    const cell = towerEl?.querySelector('[data-testid="driver-name"]') ?? towerEl
    return cssPx(computedStyle(cell)?.letterSpacing)
  }
  const nameWidth = (name, font, spacing) => textWidth(name, font) + [...name].length * spacing

  function nameFontLoaded(font) {
    const fonts = typeof document !== 'undefined' ? document.fonts : null
    if (!fonts || typeof fonts.check !== 'function') return true
    if (failedFonts[font]) return true
    try {
      if (fonts.check(font)) return true
    } catch {
      return true
    }
    // The measuring weight may be one no rendered text uses yet (only the on-camera row is
    // bold), and an unused face never loads by itself. Ask for it once; its loadingdone
    // re-measures the names. A refused request measures in the fallback face instead.
    if (!requestedFonts[font]) {
      requestedFonts[font] = true
      let request
      try {
        request = fonts.load?.(font)
      } catch {
        request = Promise.reject()
      }
      Promise.resolve(request).catch(() => nameFontFailed(font))
    }
    return false
  }

  // Reset, grow and re-read after every render of the rows: each snapshot, page turn,
  // layout or setting change. Runs after the DOM update, so the rows read are current.
  $effect(() => {
    const field = inlineRows // the class-filtered field, rendered or not
    const key = settingsKey
    const mode = modeKey(snapshot)
    const full = fullStyle
    const el = towerEl
    void [renderRows, groups, pageEpoch] // re-read the rest when the rows re-render
    untrack(() => {
      let reset = key !== lastSettings
      lastSettings = key
      if (mode !== null) {
        if (lastMode !== null && mode !== lastMode) reset = true
        lastMode = mode
      }
      if (reset) {
        measuredNames = Object.create(null)
        widestName = 0
        widestRest = 0
        namesMeasured = false
      }
      if (!full || !el) return
      const font = measuringFont()
      if (nameFontLoaded(font)) {
        const spacing = nameLetterSpacing()
        let widest = widestName
        for (const v of field) {
          const name = fullNameOf(v)
          if (!name || hasOwn(measuredNames, name)) continue
          measuredNames[name] = nameWidth(name, font, spacing)
          widest = Math.max(widest, measuredNames[name])
        }
        widestName = widest
        namesMeasured = true
      }
      let rest = widestRest
      for (const row of el.querySelectorAll('[data-testid="tower-row"]')) {
        const nameCell = row.querySelector('[data-testid="driver-name"]')
        rest = Math.max(rest, row.scrollWidth - (nameCell?.clientWidth ?? 0))
      }
      widestRest = rest
      const cs = computedStyle(el)
      borderX = cssPx(cs?.borderLeftWidth) + cssPx(cs?.borderRightWidth)
    })
  })

  // A load of the name font's family re-measures the names only — every name since the
  // last reset plus the current field — and may narrow the name part; the rest is kept.
  function onNameFontLoad() {
    if (destroyed || !fullStyle || !towerEl) return
    const font = measuringFont()
    if (!nameFontLoaded(font)) return
    const spacing = nameLetterSpacing()
    const next = Object.create(null)
    let widest = 0
    for (const name of [...Object.keys(measuredNames), ...inlineRows.map(fullNameOf)]) {
      if (!name || hasOwn(next, name)) continue
      next[name] = nameWidth(name, font, spacing)
      widest = Math.max(widest, next[name])
    }
    measuredNames = next
    widestName = widest
    namesMeasured = true
  }

  // The name font failed (its request refused, or a face of the family errored): stop
  // waiting and measure in the fallback face the rows render in. A later loadingdone for the
  // family is an ordinary name-font load.
  function nameFontFailed(font) {
    if (destroyed) return
    failedFonts[font] = true
    onNameFontLoad()
  }

  $effect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : null
    if (!fonts) return
    let cancelled = false
    const isNameFamily = (event) => {
      const family = familyKey(nameFontParts().family.split(',')[0])
      return Array.from(event?.fontfaces ?? []).some((face) => familyKey(face?.family) === family)
    }
    const onLoadingDone = (event) => {
      if (isNameFamily(event)) onNameFontLoad()
    }
    const onLoadingError = (event) => {
      if (isNameFamily(event)) nameFontFailed(measuringFont())
    }
    fonts.addEventListener?.('loadingdone', onLoadingDone)
    fonts.addEventListener?.('loadingerror', onLoadingError)
    Promise.resolve(fonts.ready).then(
      () => !cancelled && onNameFontLoad(),
      () => {},
    )
    return () => {
      cancelled = true
      fonts.removeEventListener?.('loadingdone', onLoadingDone)
      fonts.removeEventListener?.('loadingerror', onLoadingError)
    }
  })
  onDestroy(() => {
    destroyed = true
  })

  const towerMinWidth = $derived(
    fullStyle
      ? `${Math.max(baseWidth, namesMeasured ? Math.ceil(widestName + widestRest + borderX) : 0)}px`
      : null,
  )

  // Gap-to-leader readout (#28). Each row shows its interval to the leader, from the
  // producer's `gap_to_leader` (gap to the OVERALL leader). The grouped layout shows
  // gap to the CLASS leader — exact arithmetic: a car's `gap_to_leader` minus its
  // class leader's — which the spec explicitly permits (see spec/v1/SPEC.md). The
  // leader row reads 'LEADER'; a car without a determined gap reads '—'.
  // `gap_to_leader` is optional/additive, so tolerate its absence.
  const gapCell = (seconds) =>
    seconds == null || Number.isNaN(seconds)
      ? '—'
      : // gaps are 0/positive per the spec; guard the sign so a contract-violating
        // negative never renders as '+-0.400'.
        `${seconds < 0 ? '' : '+'}${seconds.toFixed(3)}`

  // Lapped cars (widgets.md rules 33-35, ADR 0012). The producer sends the lap deficit;
  // anything that is not a finite number >= 1 means "same lap", and a fraction renders its
  // whole part. A deficit wins over whatever time the producer sent alongside it.
  const lapsDown = (val) => {
    const n = finiteOrNull(val)
    return n != null && n >= 1 ? Math.floor(n) : 0
  }
  const lapsText = (laps) => (laps === 1 ? '+1 LAP' : `+${laps} LAPS`)

  /** Inline layout: interval to the overall leader. The leader reads LEADER, or —
   *  in a lap-timed session — its best lap (the pole time) when it has one. */
  function overallGap(v) {
    if (v.position === 1) return { leader: true, lap: lapTimed ? (v.best_lap ?? null) : null }
    return { leader: false, seconds: v.gap_to_leader ?? null, laps: lapsDown(v.laps_behind_leader) }
  }

  /** Grouped layout: interval to the class leader (first row in the group). The
   *  class leader reads LEADER, or its best lap (the class pole) in a lap-timed
   *  session. */
  function classGap(group, v, i) {
    if (i === 0) return { leader: true, lap: lapTimed ? (v.best_lap ?? null) : null }
    const lead = group.cars[0]?.gap_to_leader
    const own = v.gap_to_leader
    const seconds = own != null && lead != null ? Math.max(0, own - lead) : null
    // The class lap deficit is a producer fact — never derived from the overall fields.
    return { leader: false, seconds, laps: lapsDown(v.laps_behind_class_leader) }
  }

  // ---- richer-tower per-vehicle metrics (slice 3 of #20) --------------------
  // The producer owns every value; the tower renders whatever subset it is handed
  // and tolerates absent/garbage types without throwing (dumb overlay, smart producer).
  const finiteOrNull = (val) => (typeof val === 'number' && Number.isFinite(val) ? val : null)
  const intOrNull = (val) => (finiteOrNull(val) == null ? null : Math.trunc(val))
  const clamp01 = (val) => {
    const n = finiteOrNull(val)
    return n == null ? null : Math.max(0, Math.min(1, n))
  }

  /** Resolve one vehicle's richer-tower metrics into a defensive render model. */
  function resolveVehicleMetrics(v) {
    const compound =
      typeof v?.tire_compound === 'string' && v.tire_compound.trim() ? v.tire_compound.trim() : null
    return {
      intervalAhead: finiteOrNull(v?.interval_ahead),
      // The leader has no one ahead, whatever a producer sends.
      lapsAhead: v?.position === 1 ? 0 : lapsDown(v?.laps_behind_ahead),
      pitStops: intOrNull(v?.pit_stops),
      inPit: v?.in_pit === true,
      tireCompound: compound,
      tireWear: clamp01(v?.tire_wear),
      fuel: clamp01(v?.fuel),
    }
  }

  // A pit cell shows only when it carries meaning — the car is in the pits, or it has
  // made at least one stop; a zero-stop count is left blank rather than printing 'STOP 0'
  // on every row. (Tire and fuel cells gate on their own fields at the render site.)
  const hasPit = (vm) => vm.inPit || (vm.pitStops != null && vm.pitStops > 0)

  // A [0,1] fraction -> a whole-percent CSS width (rounded to keep float noise like
  // 0.28*100 = 28.0000004 out of the DOM; sub-percent precision is imperceptible on a
  // ~34px meter). Assumes a pre-clamped fraction (resolveVehicleMetrics clamps).
  const barPct = (frac) => `${Math.round(frac * 100)}%`
</script>

<!-- One row renderer shared by both layouts, so the #68 on-cam flash overlay +
     reduced-motion gating are identical in inline and grouped. `positionText` is the
     overall position (inline) or the within-class rank (grouped); `classBadge` is the
     inline-only 'rank/total' chip. -->
{#snippet towerRow(v, positionText, zebra, classBadge, gap, last = false, sizer = false)}
  <!-- A sizer row (rule 50) has the same cells and content but no hooks: no data-testid on
       the row or any cell, so rendered-row selectors and the overflow rules see only
       rendered rows. -->
  {@const tid = (id) => (sizer ? undefined : id)}
  {@const oncam = !sizer && v.slot_id === subjectSlot}
  <!-- Local-yellow involvement (rule 43): the producer's own per-car flag, exactly true. -->
  {@const yellow = !sizer && v.yellow_involved === true}
  {@const finish = finishKind(v)}
  {@const vm = resolveVehicleMetrics(v)}
  {@const flash = sizer ? null : flashes[v.slot_id]}
  <!-- Per-cell visibility: the config toggle AND the field's presence AND, for the
       race-only metrics, that this is not a qualifying/practice board. Tire compound is
       exempt from the race gate. -->
  {@const inPitActive = !sizer && m.pit && !hideRaceStrategy && vm.inPit}
  {@const showPit = m.pit && !hideRaceStrategy && hasPit(vm)}
  {@const showCompound = m.tire && vm.tireCompound != null}
  {@const showWear = m.tire && !hideRaceStrategy && vm.tireWear != null}
  {@const showFuel = m.fuel && !hideRaceStrategy && vm.fuel != null}
  <li
    class="row"
    class:row--sizer={sizer}
    class:row--last={last}
    class:row--oncam={oncam}
    class:row--zebra={zebra}
    class:row--inpit={inPitActive}
    class:row--finishslot={shown.finish}
    data-testid={sizer ? 'tower-sizer-row' : 'tower-row'}
    data-slot={v.slot_id}
    data-position={sizer ? undefined : v.position}
    data-oncam={sizer ? undefined : oncam ? 'true' : 'false'}
    data-in-pit={inPitActive ? 'true' : undefined}
    data-yellow={yellow ? 'true' : undefined}
    data-finish={sizer ? undefined : (finish ?? undefined)}
    aria-current={oncam ? 'true' : undefined}
    aria-hidden={sizer ? 'true' : undefined}
  >
    {#if oncam}
      <!-- Re-cut reveal (#64/#68): a fresh, subject-keyed flash overlay mounts only
           for the on-camera row, so switching the highlight to a NEW driver always
           mounts a NEW node and its raked shine sweep replays. Gated to
           no-preference (below); under reduced motion it is inert and the static
           `.row--oncam` styling carries the highlight instantly. -->
      {#key subjectSlot}
        <span class="row__oncam-flash" data-testid="row-oncam-flash" aria-hidden="true"></span>
      {/key}
    {/if}
    {#if !sizer}
      <span
        class="row__classbar"
        style:background={classColor(v.vehicle_class, classColors)}
        aria-hidden="true"
      ></span>
    {/if}
    {#if yellow}
      <span class="row__yellowedge" data-testid="row-yellow-edge" aria-hidden="true"></span>
    {/if}
    <!-- One cell per shown column, in column order (rule 49); a column a car has nothing
         for gets a bare empty cell, so the cells after it stay in line. -->
    <span class="row__pos" data-col="pos">{positionText}</span>
    <span class="row__class" data-col="class"
      ><ClassChip carClass={v.vehicle_class} size="compact" {classColors} /></span
    >
    {#if shown.classpos}
      <span class="row__classpos" data-col="classpos" data-testid={tid('class-pos')}>{classBadge}</span>
    {/if}
    <span class="row__name" data-col="name" data-testid={tid('driver-name')}>{nameOf(v)}</span>
    <!-- Interval to the leader — overall leader in the inline layout, class leader in
         the grouped layout — from the producer's `gap_to_leader`. The leader reads
         LEADER; an undetermined gap reads '—'; a lapped car reads `+N LAP(S)`. -->
    {#if flash}
      <!-- Lap-time flash (rule 40): the just-completed lap over the gap, tiered (rule 41). -->
      <span
        class="row__gap row__gap--flash row__gap--flash-{flash.tier}"
        data-col="gap"
        data-testid={tid('row-gap')}
        data-lap-flash={flash.tier}>{fmtLapTime(flash.lap)}</span
      >
    {:else if gap.leader && gap.lap != null}
      <!-- Lap-timed session: the leader's cell is its pole/benchmark lap time. -->
      <span class="row__gap row__gap--leadlap" data-col="gap" data-testid={tid('row-gap')}
        >{fmtLapTime(gap.lap)}</span
      >
    {:else if gap.leader}
      <span class="row__gap row__gap--leader" data-col="gap" data-testid={tid('row-gap')}>LEADER</span>
    {:else}
      <span class="row__gap" data-col="gap" data-testid={tid('row-gap')}
        >{gap.laps ? lapsText(gap.laps) : gapCell(gap.seconds)}</span
      >
    {/if}
    <!-- Richer-tower metrics (slice 3 of #20), each config-gated by `metrics` and
         shown only when the producer supplied that field. The interval sits beside the
         gap as its own timing column; pit / tire / fuel form a compact strategy
         cluster. `gapCell` renders the interval identically to the gap ('—' when
         null — e.g. the leader, who has no one ahead), and `laps_behind_ahead`
         replaces it with `+N LAP(S)`. -->
    {#if shown.interval}
      <span class="row__interval" data-col="interval" data-testid={tid('row-interval')}
        >{vm.lapsAhead ? lapsText(vm.lapsAhead) : gapCell(vm.intervalAhead)}</span
      >
    {/if}
    {#if shown.pit}
      {#if showPit && vm.inPit}
        <span class="row__pit row__pit--in" data-col="pit" data-testid={tid('row-pit')}>PIT</span>
      {:else if showPit}
        <span class="row__pit" data-col="pit" data-testid={tid('row-pit')} title="pit stops">
          <span class="row__pit-label">STOP</span>{vm.pitStops}
        </span>
      {:else}
        <span data-col="pit"></span>
      {/if}
    {/if}
    {#if shown.tire}
      {#if showCompound || showWear}
        <span class="row__tire" data-col="tire" data-testid={tid('row-tire')}>
          {#if showCompound}
            <span class="row__tire-compound" data-testid={tid('row-tire-compound')}>{vm.tireCompound}</span>
          {/if}
          {#if showWear}
            <span class="row__bar row__bar--wear" title="tire wear">
              <span
                class="row__bar-fill"
                data-testid={tid('row-tire-wear-fill')}
                style:width={barPct(vm.tireWear)}
              ></span>
            </span>
          {/if}
        </span>
      {:else}
        <span data-col="tire"></span>
      {/if}
    {/if}
    {#if shown.fuel}
      {#if showFuel}
        <span class="row__fuel" data-col="fuel" data-testid={tid('row-fuel')} title="fuel / energy">
          <span class="row__bar row__bar--fuel">
            <span class="row__bar-fill" data-testid={tid('row-fuel-fill')} style:width={barPct(vm.fuel)}
            ></span>
          </span>
        </span>
      {:else}
        <span data-col="fuel"></span>
      {/if}
    {/if}
    <!-- Finish chip (rule 45): always the row's last cell, in its own column. -->
    {#if shown.finish}
      {#if finish === 'finished'}
        <span
          class="row__finish row__finish--flag"
          data-col="finish"
          data-testid={tid('row-finish')}
          role="img"
          aria-label="Finished"
        ></span>
      {:else if finish}
        <span class="row__finish row__finish--{finish}" data-col="finish" data-testid={tid('row-finish')}
          >{finish === 'dnf' ? 'DNF' : 'DQ'}</span
        >
      {:else}
        <!-- Not bare like the other empty cells: it keeps its class (rule 45's reserved slot,
             which the finish tests pin) and stays hidden from assistive tech. -->
        <span class="row__finish row__finish--empty" data-col="finish" aria-hidden="true"></span>
      {/if}
    {/if}
  </li>
{/snippet}

<section
  class="tower"
  data-testid="standings-tower"
  data-class-display={classDisplay}
  data-name-style={fullStyle ? 'full' : 'short'}
  style:min-width={towerMinWidth}
  bind:this={towerEl}
>
  <header class="tower__header" data-testid="tower-header">
    <span class="tower__mode">{header}</span>
    {#if sessionProgress || filterKey !== null}
      <span class="tower__meta">
        {#if sessionProgress}
          <!-- Session countdown / lap counter ("Session Info") — distinct from the
               per-car rows and the flag/FCY/SC status widget. -->
          <span class="tower__session" data-testid="tower-session">{sessionProgress}</span>
        {/if}
        {#if filterKey !== null}
          <span class="tower__filter" data-testid="tower-filter">
            <ClassChip carClass={filterKey} size="compact" {classColors} />
          </span>
        {/if}
      </span>
    {/if}
  </header>

  {#if !hasRows}
    <div class="tower__empty" data-testid="tower-empty" data-reason={emptyReason}>
      {emptyReason === 'no-match' ? 'No cars in this class' : 'Waiting for state…'}
    </div>
  {:else if grouped}
    <div
      class="tower__groups tower__grid"
      data-testid="tower-grid"
      data-columns={columns.join(' ')}
      style:grid-template-columns={gridTemplate}
    >
      {#each groups as group (group.key)}
        <section class="group" data-testid="tower-group" data-class={group.carClass}>
          <header class="group__head">
            <span
              class="group__bar"
              style:background={classColor(group.carClass, classColors)}
              aria-hidden="true"
            ></span>
            <ClassChip carClass={group.carClass} size="compact" {classColors} />
            <span class="group__count">{group.cars.length} cars</span>
          </header>
          <ol class="tower__rows">
            {#each group.cars as v, i (v.slot_id)}
              {@render towerRow(v, i + 1, i % 2 === 1, null, classGap(group, v, i), i === group.cars.length - 1)}
            {/each}
          </ol>
        </section>
      {/each}
    </div>
  {:else}
    <!-- Inline layout. When cycling is active the {#key pageEpoch} remount replays the
         page-turn reveal on each turn; otherwise the key is stable ('all') so data updates
         re-render in place with no animation. `renderRows` is the cycled subset (or the
         whole filtered field when not cycling / before the first sync). -->
    {#key cycleEnabled ? pageEpoch : 'all'}
      <ol
        class="tower__rows tower__grid"
        class:tower__rows--turn={cycleEnabled}
        data-testid="tower-grid"
        data-columns={columns.join(' ')}
        style:grid-template-columns={gridTemplate}
      >
        {#each renderRows as v, i (v.slot_id)}
          {@render towerRow(
            v,
            v.position,
            i % 2 === 1,
            `${classRankOf(v)}/${classTotalOf(v)}`,
            overallGap(v),
            i === renderRows.length - 1,
          )}
        {/each}
        {#each sizerRows as v (v.slot_id)}
          {@render towerRow(v, v.position, false, `${classRankOf(v)}/${classTotalOf(v)}`, overallGap(v), false, true)}
        {/each}
      </ol>
    {/key}
  {/if}
</section>

<style>
  .tower {
    /* The tower's class bars are wider than the design token so a class colour reads at a
       glance (#234). */
    --tower-classbar: calc(var(--bc-classbar) + 2px);
    width: var(--bc-tower-width);
    box-sizing: border-box;
    background: var(--bc-plate);
    backdrop-filter: var(--bc-blur);
    -webkit-backdrop-filter: var(--bc-blur);
    border: 1px solid var(--bc-hairline);
    border-radius: var(--bc-radius);
    box-shadow: var(--bc-shadow-plate);
    overflow: hidden;
    color: var(--bc-text);
  }

  .tower__header {
    height: var(--bc-widget-header);
    display: flex;
    align-items: center;
    gap: var(--bc-space-2);
    padding: 0 var(--bc-space-3);
    background: var(--bc-header);
    border-bottom: 1px solid var(--bc-hairline);
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-title);
    text-transform: uppercase;
    color: var(--bc-text-2);
  }

  /* Right-aligned header group: session clock + optional class-filter chip. */
  .tower__meta {
    display: inline-flex;
    align-items: center;
    gap: var(--bc-space-2);
    margin-left: auto;
  }

  .tower__session {
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-num);
    font-variant-numeric: tabular-nums;
    letter-spacing: var(--bc-track-label);
    color: var(--bc-text-2);
    white-space: nowrap;
  }

  .tower__filter {
    display: inline-flex;
    align-items: center;
  }

  .tower__empty {
    padding: var(--bc-space-3);
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-3);
  }

  .tower__rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* Table columns (rules 49-53, ADR 0020): one grid per tower, its track list set inline;
     every row (and, grouped, every group and its list) spans all tracks as a subgrid, so a
     column is as wide as its widest cell in any row, sizer rows included. A column gap and
     no row gap, so zero-height sizer rows add no height. */
  .tower__grid {
    display: grid;
    column-gap: var(--bc-space-2);
    row-gap: 0;
  }
  .tower__groups > .group,
  .group > .tower__rows {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
  }
  .group__head {
    grid-column: 1 / -1;
  }

  /* Grouped layout: a class header per section, then that class's rows. */
  .group__head {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--bc-space-2);
    height: var(--bc-widget-header);
    padding: 0 var(--bc-space-3) 0 var(--bc-space-4);
    background: var(--bc-header);
    border-bottom: 1px solid var(--bc-hairline);
  }
  /* Class-colored strip on the group header's left edge (matches the row classbar). */
  .group__bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: var(--tower-classbar);
  }
  .group__count {
    margin-left: auto;
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-3);
  }

  .row {
    position: relative;
    /* Own stacking context so the on-camera flash overlay can sit at z-index -1 —
       above the row's background, below the text/chips. */
    isolation: isolate;
    height: var(--bc-row-standard);
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    padding: 0 var(--bc-space-3) 0 var(--bc-space-4);
    border-bottom: 1px solid var(--bc-divider);
  }
  /* The last rendered row drops its divider. A class, not `:last-child` (sizer rows follow it
     in the inline grid) and not `:has()` (missing in OBS 30's engine). */
  .row--last {
    border-bottom: none;
  }
  /* A sizer row (rule 50): in the grid, so its cells size the tracks, but takes no height
     and is never seen or hit. */
  .row--sizer {
    height: 0;
    padding-block: 0;
    border: 0;
    overflow: hidden;
    visibility: hidden;
    pointer-events: none;
  }
  .row__class {
    display: flex;
    align-items: center;
  }
  .row__gap,
  .row__interval {
    justify-self: end;
  }

  .row--zebra {
    background: var(--bc-zebra);
  }

  /* Class bar: colored strip on the left edge of each row. */
  .row__classbar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: var(--tower-classbar);
  }

  /* Local-yellow edge (rule 43): a yellow strip on the row's right edge, opposite the class bar,
     so it never merges into an amber or orange class colour (#234). */
  .row__yellowedge {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: var(--bc-classbar);
    background: var(--bc-intensity-mid);
  }

  .row__pos {
    min-width: 22px;
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-pos);
    font-weight: var(--bc-weight-num);
    color: var(--bc-text);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* Inline-only class-position badge (e.g. '1/7') — the car's rank within its class,
     shown alongside the class chip so a multi-class field reads at a glance. */
  .row__classpos {
    flex: 0 0 auto;
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-chip-compact);
    font-weight: var(--bc-weight-num);
    color: var(--bc-text-3);
    font-variant-numeric: tabular-nums;
    letter-spacing: var(--bc-track-label);
  }

  /* Flex declarations on rows and cells only take effect in the no-subgrid fallback below;
     in the grid the max-content tracks already keep every cell at its content width.
     No cell gives way (rules 45, 47, 48): the chip and timing cells keep their width and the
     name never truncates to make room. A row wider than the tower is clipped at its right
     edge, trailing cells first; in full style the tower's inline min-width makes the room. */
  .row > :global(*) {
    flex-shrink: 0;
  }

  .row__name {
    /* Takes the spare width, but never shrinks below its text. The name track's
       max-content minimum is its only floor (rule 53). */
    flex: 1 0 auto;
    font-family: var(--bc-font-display);
    font-size: var(--bc-size-name);
    font-weight: var(--bc-weight-name);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row__gap {
    /* Rule 42a: a fixed slot for an 8-character mono readout (1:31.950, +205.000,
       +12 LAPS), sized off the gap token rather than the element's own font, so a lap
       flash, LEADER, or a lap deficit never changes the cell's width or moves the row.
       JetBrains Mono advances 0.6em a glyph (8 × 0.6 = 4.8); 5 leaves room for the
       slightly wider fallback monospace faces. */
    flex: 0 0 auto;
    min-width: calc(var(--bc-size-gap) * 5);
    text-align: right;
    white-space: nowrap;
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-gap);
    font-weight: var(--bc-weight-num);
    color: var(--bc-text-2);
    font-variant-numeric: tabular-nums;
  }
  /* The leader's row reads a 'LEADER' word, not a number — set it as an uppercase
     label so it reads as a status, not a time. Cyan is reserved for the on-camera
     driver, so this stays a neutral text tone. */
  .row__gap--leader {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    color: var(--bc-text-3);
  }
  /* Lap-timed sessions: the leader's cell is the pole/benchmark lap time. It keeps
     the mono/tabular numeric look of .row__gap and is brightened, since it is the
     reference every delta below it is measured against. */
  .row__gap--leadlap {
    color: var(--bc-text);
  }
  /* Lap-time flash (rule 41): the new lap reads bright; session / class best purple,
     personal best green, a plain lap in primary text. */
  .row__gap--flash {
    color: var(--bc-text);
  }
  .row__gap--flash-session-best,
  .row__gap--flash-class-best {
    color: var(--bc-lap-best);
  }
  .row__gap--flash-personal-best {
    color: var(--bc-lap-pb);
  }

  /* ---- richer-tower metrics (slice 3 of #20) ------------------------------
     Each cell is config-gated and appended after the gap column. The interval is a
     dimmer sibling of the gap (its own timing column); pit / tire / fuel form a
     compact strategy cluster on the right and are content-sized. */

  /* Interval to the car immediately ahead — same mono/tabular look as the gap, one
     tone dimmer so the gap-to-leader stays the primary interval. Rule 42b: the gap
     cell's fixed 8-character slot (rule 42a), so a changing interval never moves the
     row. */
  .row__interval {
    flex: 0 0 auto;
    min-width: calc(var(--bc-size-gap) * 5);
    white-space: nowrap;
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-gap);
    font-weight: var(--bc-weight-num);
    color: var(--bc-text-3);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  /* Pit stop count — a compact 'STOP n' — flips to a red IN-PIT badge while the car
     is in the pits. */
  .row__pit {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-chip-compact);
    font-weight: var(--bc-weight-num);
    color: var(--bc-text-2);
    font-variant-numeric: tabular-nums;
  }
  .row__pit-label {
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    color: var(--bc-text-3);
  }
  .row__pit--in {
    padding: 1px 6px;
    border-radius: var(--bc-radius-chip);
    background: var(--bc-live);
    color: var(--bc-text-on-accent);
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
  }

  /* Tire: a compound letter plus a wear bar. */
  .row__tire {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: var(--bc-space-1);
  }
  /* The compound is producer-free-form and rendered verbatim — it may be a single letter
     ("S"/"M"/"H"), a short word ("soft"/"wet"/"inter"), or a code ("C3"). Keep a small
     floor so a lone letter still reads as a column, but let multi-character labels take
     the width they need; a pathologically long string ellipsizes rather than shoving the
     wear/fuel bars off the row. */
  .row__tire-compound {
    flex: 0 1 auto;
    min-width: 14px;
    max-width: 5em;
    text-align: center;
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-chip-compact);
    font-weight: var(--bc-weight-num);
    color: var(--bc-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row__fuel {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
  }

  /* Finish chip (rule 45): a fixed-width trailing slot so chips line up down the tower and
     the columns before it don't shift between marked and unmarked rows. The slot tucks into
     the row's right padding, stopping short of the local-yellow strip on that edge, and while
     it is reserved the finish column takes its room from the name column's spare width. */
  .row__finish {
    flex: 0 0 auto;
    box-sizing: border-box;
    width: 28px;
    height: 16px;
    margin-right: -4px;
    /* Offsets the trailing letter-spacing so DNF / DQ sit centred. */
    padding-left: var(--bc-track-label);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--bc-radius-chip);
    font-family: var(--bc-font-ui);
    font-size: var(--bc-size-chip-compact);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    line-height: 1;
  }
  /* 16px square centred in the same 28px slot (6px each side, less the slot's tuck). */
  .row__finish--flag {
    width: 16px;
    padding-left: 0;
    margin-left: 6px;
    margin-right: -2px;
    border-radius: 2px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35);
    background-color: #fff;
    background-image:
      linear-gradient(45deg, #0b0e13 25%, transparent 25%, transparent 75%, #0b0e13 75%, #0b0e13),
      linear-gradient(45deg, #0b0e13 25%, #fff 25%, #fff 75%, #0b0e13 75%, #0b0e13);
    background-size: 8px 8px;
    background-position:
      0 0,
      4px 4px;
  }
  .row__finish--dnf,
  .row__finish--dq {
    color: var(--bc-text-2);
    border: 1px solid var(--bc-text-3);
  }
  .row__finish--dq {
    color: var(--bc-live);
    border-color: var(--bc-live);
  }

  /* Shared compact meter for tire wear + fuel. */
  .row__bar {
    position: relative;
    display: inline-block;
    width: 34px;
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.09);
    overflow: hidden;
    vertical-align: middle;
  }
  .row__bar-fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 3px;
  }
  /* Wear grows toward the 'hot' end as the tire wears out; fuel is a calm remaining
     level. */
  .row__bar--wear .row__bar-fill {
    background: var(--bc-intensity-mid);
  }
  .row__bar--fuel .row__bar-fill {
    background: var(--bc-intensity-calm);
  }

  /* On-camera driver — cyan accent is reserved exclusively for this. */
  .row--oncam {
    background: var(--bc-oncam-bg);
    box-shadow: var(--bc-oncam-shadow);
  }
  .row--oncam .row__pos {
    color: var(--bc-accent);
  }
  .row--oncam .row__name {
    color: var(--bc-oncam-text);
    font-weight: var(--bc-weight-leader);
  }

  /* Re-cut reveal (#64/#68/#73): a raked mint SHINE sweeps across the on-camera row,
     the same reveal language as the lower-third bar-wipe — replacing the earlier
     box-shadow glow, which read as a static "grow" rather than a wipe. It plays on a
     FRESH, subject-keyed flash overlay (see markup) rendered only for the on-camera
     row, so it reliably replays every time the highlight moves to a new driver. The
     overlay clips the sweep to the row and sits behind the text; the static
     `.row--oncam` cyan highlight is the steady state. Gated to no-preference; under
     reduced motion the ::before is never generated, so the highlight is instant. */
  .row__oncam-flash {
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    overflow: hidden;
  }
  /* The shine itself — a bright, blurred, raked mint bar, screen-blended so it reads as
     light passing over the row. Gated to full motion via the root `data-motion`
     attribute (see lib/motion.js), not the OS `prefers-reduced-motion` media query — so
     the re-cut shine still sweeps in OBS (whose CEF reports `reduce`). The `content`
     lives inside this gate, so under `data-motion="reduced"` there is no sweeping element
     at all and the highlight is instant. */
  :global(:root:not([data-motion='reduced'])) .row__oncam-flash::before {
    content: '';
    position: absolute;
    top: -25%;
    left: -20%;
    width: 26%;
    height: 150%;
    background: linear-gradient(
      90deg,
      transparent 0%,
      var(--bc-up, #7cffb2) 45%,
      var(--bc-oncam-text, #eafffb) 55%,
      transparent 100%
    );
    mix-blend-mode: screen;
    filter: blur(2px);
    box-shadow: 0 0 20px var(--bc-accent-glow, rgba(31, 224, 196, 0.35));
    animation: row-oncam-shine 0.6s linear both;
  }

  @keyframes row-oncam-shine {
    0% {
      transform: translateX(-180%) skewX(-13deg);
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    82% {
      opacity: 1;
    }
    100% {
      transform: translateX(520%) skewX(-13deg);
      opacity: 0;
    }
  }

  /* Page-turn reveal for the cycling window (#116). The inline rows list remounts on each
     turn ({#key pageEpoch}), replaying this reveal. Gated to full motion via the root
     `data-motion` attribute — NOT the OS `prefers-reduced-motion` media query — so a turn
     still animates in OBS (whose CEF reports `reduce`); under an explicit
     `data-motion="reduced"` the animation is absent and the turn is instant. */
  :global(:root:not([data-motion='reduced'])) .tower__rows--turn {
    animation: tower-page-turn 0.24s ease both;
  }

  @keyframes tower-page-turn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Engines without subgrid (OBS before 31): each row is its own flex row. Every cell still
     renders; columns line up only as far as their contents match. The name keeps the floor
     the grid track gives it, or overflow: hidden would let flex squeeze and ellipsize it. */
  @supports not (grid-template-columns: subgrid) {
    .tower__grid,
    .tower__groups > .group,
    .group > .tower__rows {
      display: block;
    }
    .row {
      display: flex;
      gap: var(--bc-space-2);
    }
    .row__name {
      min-width: max-content;
    }
    /* Without shared tracks an empty cell aligns nothing and would only cost a gap; the
       reserved finish slot (rule 45) stays. Sizer rows size nothing here either. */
    .row > [data-col]:empty:not(.row__finish--empty),
    .row--sizer {
      display: none;
    }
  }
</style>
