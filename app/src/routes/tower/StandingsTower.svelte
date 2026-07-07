<script>
  import ClassChip from '../../design/ClassChip.svelte'
  import { classColor, classMeta } from '../../design/classMeta.js'
  import { fmtName, fmtLapTime } from '../../design/format.js'
  import { sessionProgressText } from '../../design/sessionProgress.js'

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
  } = $props()

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

  /** Inline layout: interval to the overall leader. The leader reads LEADER, or —
   *  in a lap-timed session — its best lap (the pole time) when it has one. */
  function overallGap(v) {
    if (v.position === 1) return { leader: true, lap: lapTimed ? (v.best_lap ?? null) : null }
    return { leader: false, seconds: v.gap_to_leader ?? null }
  }

  /** Grouped layout: interval to the class leader (first row in the group). The
   *  class leader reads LEADER, or its best lap (the class pole) in a lap-timed
   *  session. */
  function classGap(group, v, i) {
    if (i === 0) return { leader: true, lap: lapTimed ? (v.best_lap ?? null) : null }
    const lead = group.cars[0]?.gap_to_leader
    const own = v.gap_to_leader
    const seconds = own != null && lead != null ? Math.max(0, own - lead) : null
    return { leader: false, seconds }
  }
</script>

<!-- One row renderer shared by both layouts, so the #68 on-cam flash overlay +
     reduced-motion gating are identical in inline and grouped. `positionText` is the
     overall position (inline) or the within-class rank (grouped); `classBadge` is the
     inline-only 'rank/total' chip. -->
{#snippet towerRow(v, positionText, zebra, classBadge, gap)}
  {@const oncam = v.slot_id === subjectSlot}
  <li
    class="row"
    class:row--oncam={oncam}
    class:row--zebra={zebra}
    data-testid="tower-row"
    data-slot={v.slot_id}
    data-position={v.position}
    data-oncam={oncam ? 'true' : 'false'}
    aria-current={oncam ? 'true' : undefined}
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
    <span
      class="row__classbar"
      style:background={classColor(v.vehicle_class)}
      aria-hidden="true"
    ></span>
    <span class="row__pos">{positionText}</span>
    <ClassChip carClass={v.vehicle_class} size="compact" />
    {#if classBadge}
      <span class="row__classpos" data-testid="class-pos">{classBadge}</span>
    {/if}
    <span class="row__name" data-testid="driver-name">{fmtName(v.driver_name)}</span>
    <!-- Interval to the leader — overall leader in the inline layout, class leader in
         the grouped layout — from the producer's `gap_to_leader`. The leader reads
         LEADER; an undetermined gap reads '—'. -->
    {#if gap.leader && gap.lap != null}
      <!-- Lap-timed session: the leader's cell is its pole/benchmark lap time. -->
      <span class="row__gap row__gap--leadlap" data-testid="row-gap">{fmtLapTime(gap.lap)}</span>
    {:else if gap.leader}
      <span class="row__gap row__gap--leader" data-testid="row-gap">LEADER</span>
    {:else}
      <span class="row__gap" data-testid="row-gap">{gapCell(gap.seconds)}</span>
    {/if}
  </li>
{/snippet}

<section
  class="tower"
  data-testid="standings-tower"
  data-class-display={classDisplay}
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
            <ClassChip carClass={filterKey} size="compact" />
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
    <div class="tower__groups">
      {#each groups as group (group.key)}
        <section class="group" data-testid="tower-group" data-class={group.carClass}>
          <header class="group__head">
            <span
              class="group__bar"
              style:background={classColor(group.carClass)}
              aria-hidden="true"
            ></span>
            <ClassChip carClass={group.carClass} size="compact" />
            <span class="group__count">{group.cars.length} cars</span>
          </header>
          <ol class="tower__rows">
            {#each group.cars as v, i (v.slot_id)}
              {@render towerRow(v, i + 1, i % 2 === 1, null, classGap(group, v, i))}
            {/each}
          </ol>
        </section>
      {/each}
    </div>
  {:else}
    <ol class="tower__rows">
      {#each inlineRows as v, i (v.slot_id)}
        {@render towerRow(v, v.position, i % 2 === 1, `${classRankOf(v)}/${classTotalOf(v)}`, overallGap(v))}
      {/each}
    </ol>
  {/if}
</section>

<style>
  .tower {
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
    width: var(--bc-classbar);
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
    display: flex;
    align-items: center;
    gap: var(--bc-space-2);
    padding: 0 var(--bc-space-3) 0 var(--bc-space-4);
    border-bottom: 1px solid var(--bc-divider);
  }
  .row:last-child {
    border-bottom: none;
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
    width: var(--bc-classbar);
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

  .row__name {
    flex: 1 1 auto;
    min-width: 0;
    font-family: var(--bc-font-display);
    font-size: var(--bc-size-name);
    font-weight: var(--bc-weight-name);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row__gap {
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
</style>
