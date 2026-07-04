<script>
  import ClassChip from '../../design/ClassChip.svelte'
  import { classColor, classMeta } from '../../design/classMeta.js'
  import { fmtName } from '../../design/format.js'

  // Full-screen pre-race starting-grid board (#24). Presentational: it renders
  // whatever snapshot it is handed as a per-class starting order, sorted strictly
  // by `position`, optionally narrowed to a single class. All SSE wiring + URL
  // parsing lives in GridPage. Mirrors the results slide (#23) conventions.
  let { snapshot = null, classFilter = null, label = 'STARTING GRID' } = $props()

  // Normalize the requested class once (case-insensitive, trimmed). Empty/absent
  // => show every class, each in its own group.
  const filterKey = $derived(
    classFilter != null && String(classFilter).trim()
      ? String(classFilter).trim().toLowerCase()
      : null,
  )

  // Build per-class groups. Filter first, then sort strictly by position so each
  // group inherits running order, then bucket by class. Groups are ordered by the
  // class registry `order` (the same sequence used for class-mode grouping), with
  // an alphabetical tiebreak for classes the registry doesn't know. Never mutate
  // the source array — copy before sort (a review checkpoint on #23).
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

<section class="grid" data-testid="grid-slide">
  <header class="grid__header">
    <span class="grid__title">{label}</span>
    {#if filterKey !== null}
      <span class="grid__filter" data-testid="grid-filter">
        <ClassChip carClass={filterKey} />
      </span>
    {/if}
  </header>

  {#if groups.length === 0}
    <div class="grid__empty" data-testid="grid-empty" data-reason={emptyReason}>
      {#if emptyReason === 'no-match'}
        No cars in this class
      {:else}
        Waiting for grid…
      {/if}
    </div>
  {:else}
    <div class="grid__groups">
      {#each groups as group (group.key)}
        <section
          class="group"
          data-testid="grid-group"
          data-class={group.carClass}
        >
          <header class="group__head">
            <ClassChip carClass={group.carClass} />
            <span class="group__count">{group.cars.length} cars</span>
          </header>
          <!-- Conventional staggered two-column grid: the front car sits on the
               left, the next is set back on the right, and so on down the field. -->
          <ol class="group__grid">
            {#each group.cars as v (v.slot_id ?? v.position)}
              <li
                class="cell"
                data-testid="grid-cell"
                data-slot={v.slot_id}
                data-position={v.position}
                data-class={v.vehicle_class}
              >
                <span
                  class="cell__classbar"
                  style:background={classColor(v.vehicle_class)}
                  aria-hidden="true"
                ></span>
                <span class="cell__pos">{v.position}</span>
                <span class="cell__name" data-testid="driver-name"
                  >{fmtName(v.driver_name)}</span
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
  .grid {
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

  .grid__header {
    display: flex;
    align-items: center;
    gap: var(--bc-space-3);
    padding-bottom: var(--bc-space-4);
    border-bottom: 1px solid var(--bc-hairline);
  }

  .grid__title {
    font-family: var(--bc-font-display);
    font-size: var(--bc-size-name);
    font-weight: var(--bc-weight-name);
    letter-spacing: var(--bc-track-title);
    text-transform: uppercase;
  }

  .grid__filter {
    display: inline-flex;
    align-items: center;
  }

  .grid__empty {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--bc-size-label);
    letter-spacing: var(--bc-track-label);
    text-transform: uppercase;
    color: var(--bc-text-3);
  }

  .grid__groups {
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

  .group__grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--bc-space-3) var(--bc-space-4);
  }

  /* Stagger the right-hand column back by half a row for the classic grid rake. */
  .cell:nth-child(even) {
    transform: translateY(calc(var(--bc-row-standard) / 2));
  }

  .cell {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--bc-space-3);
    height: var(--bc-row-standard);
    padding: 0 var(--bc-space-3) 0 var(--bc-space-4);
    background: var(--bc-surface, transparent);
    border: 1px solid var(--bc-divider);
    border-radius: var(--bc-radius-chip);
    overflow: hidden;
  }

  /* Class bar: colored strip on the left edge of each cell (matches the tower). */
  .cell__classbar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: var(--bc-classbar);
  }

  .cell__pos {
    flex: 0 0 auto;
    min-width: 2ch;
    text-align: right;
    font-family: var(--bc-font-mono);
    font-size: var(--bc-size-pos);
    font-weight: var(--bc-weight-num);
    font-variant-numeric: tabular-nums;
  }

  .cell__name {
    min-width: 0;
    flex: 1 1 auto;
    font-family: var(--bc-font-display);
    font-size: var(--bc-size-name);
    font-weight: var(--bc-weight-name);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
