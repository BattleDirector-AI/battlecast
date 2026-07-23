<script>
  import ClassChip from '../../design/ClassChip.svelte'
  import { classColor, classMeta } from '../../design/classMeta.js'
  import { fmtName, fmtLapTime } from '../../design/format.js'

  // Full-screen end-/mid-session results board (#23). Presentational: it renders
  // whatever snapshot it is handed as a per-class classification — grouped by class
  // in registry order, each group in finishing order with class positions restarting
  // at 1 — optionally narrowed to a single class. All SSE wiring + URL parsing lives
  // in ResultsPage. Mirrors the grid slide (#24) grouping convention.
  let { snapshot = null, classFilter = null, label = 'RESULTS' } = $props()

  // Normalize the requested class once (case-insensitive, trimmed). Empty/absent
  // => show every class, each in its own group.
  const filterKey = $derived(
    classFilter != null && String(classFilter).trim()
      ? String(classFilter).trim().toLowerCase()
      : null,
  )

  // Build per-class groups. Filter first, then sort strictly by position so each
  // group inherits finishing order, then bucket by class. Groups are ordered by the
  // class registry `order` (the same sequence the grid slide and grouped tower use),
  // with an alphabetical tiebreak for classes the registry doesn't know. Never mutate
  // the source array — copy before sort.
  const groups = $derived.by(() => {
    const rows = [...(snapshot?.vehicles ?? [])]
      .filter(
        (v) =>
          filterKey === null ||
          String(v.vehicle_class ?? '').toLowerCase() === filterKey,
      )
      .sort((a, b) => a.position - b.position)

    const byClass = {}
    for (const v of rows) {
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

  // A snapshot with a class filter that matches nothing is a distinct, explicit
  // state from "no snapshot at all" — surface which one so the board never blanks.
  const emptyReason = $derived(
    snapshot?.vehicles?.length ? 'no-match' : 'no-state',
  )
</script>

<section class="results" data-testid="results-slide">
  <header class="results__header">
    <span class="results__title">{label}</span>
    {#if filterKey !== null}
      <span class="results__filter" data-testid="results-filter">
        <ClassChip carClass={filterKey} />
      </span>
    {/if}
  </header>

  {#if groups.length === 0}
    <div class="results__empty" data-testid="results-empty" data-reason={emptyReason}>
      {#if emptyReason === 'no-match'}
        No cars in this class
      {:else}
        Waiting for results…
      {/if}
    </div>
  {:else}
    <div class="results__groups">
      {#each groups as group (group.key)}
        <section
          class="group"
          data-testid="results-group"
          data-class={group.carClass}
        >
          <header class="group__head">
            <ClassChip carClass={group.carClass} />
            <span class="group__count">{group.cars.length} cars</span>
          </header>
          <ol class="group__rows">
            <li class="group__colhead" aria-hidden="true">
              <span class="col col--pos">POS</span>
              <span class="col col--name">DRIVER</span>
              <span class="col col--lap">BEST LAP</span>
            </li>
            <!-- Class positions restart at 1 within each group; `data-position`
                 keeps the overall running position for identity/debugging. -->
            {#each group.cars as v, i (v.slot_id ?? v.position)}
              <li
                class="row"
                data-testid="results-row"
                data-slot={v.slot_id}
                data-position={v.position}
                data-class-pos={i + 1}
                data-class={v.vehicle_class}
              >
                <span
                  class="row__classbar"
                  style:background={classColor(v.vehicle_class)}
                  aria-hidden="true"
                ></span>
                <span class="col col--pos row__pos">{i + 1}</span>
                <span class="col col--name row__name" data-testid="driver-name"
                  >{fmtName(v.driver_name)}</span
                >
                <span class="col col--lap row__lap" data-testid="best-lap"
                  >{fmtLapTime(v.best_lap)}</span
                >
              </li>
            {/each}
          </ol>
        </section>
      {/each}
    </div>
  {/if}
</section>

<style>
  /* Opaque studio board — this is a full-screen takeover slide, not an overlay
     composited over live video, so it uses the solid board surface. */
  .results {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bc-board);
    color: var(--bc-text);
    padding: var(--bc-inset-safe);
    font-family: var(--bc-font-ui);
  }

  .results__header {
    display: flex;
    align-items: center;
    gap: var(--bc-space-3);
    padding-bottom: var(--bc-space-4);
    border-bottom: 1px solid var(--bc-hairline);
  }

  .results__title {
    font-family: var(--bc-font-display);
    font-size: var(--bc-size-name);
    font-weight: var(--bc-weight-name);
    letter-spacing: var(--bc-track-title);
    text-transform: uppercase;
  }

  .results__filter {
    display: inline-flex;
    align-items: center;
  }

  .results__empty {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--bc-size-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-3);
  }

  .results__groups {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: var(--bc-space-5);
    padding-top: var(--bc-space-4);
    overflow-y: auto;
  }

  .group__head {
    display: flex;
    align-items: center;
    gap: var(--bc-space-3);
    padding-bottom: var(--bc-space-3);
  }

  .group__count {
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-3);
  }

  .group__rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* Shared grid so the group colhead and its data rows align in columns. */
  .group__colhead,
  .row {
    display: grid;
    grid-template-columns: 64px 1fr 160px;
    align-items: center;
    gap: var(--bc-space-3);
  }

  .group__colhead {
    height: var(--bc-widget-header);
    padding: 0 var(--bc-space-3) 0 var(--bc-space-4);
    font-size: var(--bc-size-label);
    font-weight: var(--bc-weight-label);
    letter-spacing: var(--bc-track-label);
    color: var(--bc-text-3);
    text-transform: uppercase;
  }

  .row {
    position: relative;
    height: var(--bc-row-standard);
    padding: 0 var(--bc-space-3) 0 var(--bc-space-4);
    border-bottom: 1px solid var(--bc-divider);
  }
  .row:last-child {
    border-bottom: none;
  }

  /* Class bar: colored strip on the left edge of each row (matches the tower). */
  .row__classbar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: var(--bc-classbar);
  }

  .col--pos {
    text-align: right;
  }
  .col--lap {
    text-align: right;
  }

  .row__pos {
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-pos);
    font-weight: var(--bc-weight-num);
    font-variant-numeric: tabular-nums;
  }

  .row__name {
    min-width: 0;
    font-family: var(--bc-font-display);
    font-size: var(--bc-size-name);
    font-weight: var(--bc-weight-name);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row__lap {
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-gap);
    font-weight: var(--bc-weight-num);
    color: var(--bc-text-2);
    font-variant-numeric: tabular-nums;
  }
</style>
