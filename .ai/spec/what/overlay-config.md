# Overlay Configuration

The layout/visibility/rotation/motion contract that render pages read and the `/config` UI writes.
Decision record: `docs/decisions/0001-overlay-config-and-asset-persistence.md`; implementation in
`how/renderer.md`.

## Behavioral Rules

### Contract & versioning

1. Config carries its own **`configVersion`** (`"1"`), numbered independently of the spec
   `schemaVersion` and the app release version.
2. Config additions are **additive + defaulted** — new per-widget knobs are normalized onto every
   widget and do not bump `configVersion`. Existing profiles keep working unchanged.
3. **Split read from write:** render pages only *read* config over HTTP; the `/config` UI is the
   only writer. The render path is identical whether config/assets come from the companion server or
   a static host.

### Loading & precedence

4. Config resolution follows precedence **explicit URL params → fetched profile JSON → built-in
   default**. Nothing provided ⇒ default layout, so existing `/all` users are never broken.
5. `?profile=<name>` fetches server mode (`/api/profiles/<name>`) first, then static mode
   (`/config/<name>.json`). A missing/malformed profile **logs a warning and falls back to default**
   — best-effort, never blank, never thrown (mirrors the spec's tolerance ethos).
6. Normalization coerces any partial/malformed config into the full shape: every widget gets a
   boolean `visible`, finite geometry, and all defaulted knobs. **Unknown widget keys from a newer
   profile are preserved** (forward-compat), defaulting hidden.
7. `?show=` / `?hide=` comma lists are the **highest-precedence** visibility override, applied after
   normalization so they win over both profile and default.
8. Producer SSE URL for `/all` is picked as `?src=` → profile `producer.src` → default
   (`http://localhost:8080/events`).

### Geometry

9. Geometry is **absolute px against a fixed canvas** (default 1920×1080, LMU's supported
   resolution; configurable per profile via `config.canvas`, min edge 320). The render page scales
   the canvas uniformly to the viewport, so a broadcaster gets the same layout at any Browser Source
   size. Widgets paint in ascending `z` order.

### Motion

10. The overlay animates by default; `reducedMotion` (profile, default false) turns transitions
    down. Resolution precedence: `?motion=` URL param → `reducedMotion` config → default full. The
    resolved mode is written once to `<html data-motion="full"|"reduced">`, the single source both
    CSS (`:root[data-motion=…]`) and JS read. The OS `prefers-reduced-motion` media query is NOT
    consulted (OBS/CEF reports `reduce` and would otherwise hard-cut every transition).

### Per-widget knob applicability

11. Knobs are normalized onto every widget for a uniform shape, but only certain widgets **read**
    each one:

    | Knob | Read by | Meaning |
    |---|---|---|
    | `visible`, `x/y/w/h/z` | all | geometry + visibility |
    | `plateAlpha` | plated widgets | background-plate opacity (0.82 default; the plate only, not text/borders) |
    | `hideWhenIdle` | supporting widgets (battle, logos, driver, qualifying) | auto-hide when idle |
    | `trigger`, `dwellSeconds`, `showOnConnect` | lower-thirds (driver, qualifying) | fire/dwell timing |
    | `modes`, `fireOnClassBest` | qualifying | mode-gating + class-best flash |
    | `classDisplay` | tower | inline vs grouped multi-class layout |
    | `towerMetrics` | tower | `{interval,pit,tire,fuel}` indicator toggles (interval on, rest off by default) |
    | `maxRows`, `cycle` | tower | overflow row cap + pinned-rows/cycling-window config (see `tower-overflow.md`) |
    | `speedUnit`, `driverInfo`, `waitForLowerThird` | onboard | unit, identity fields, hand-off |

12. **Tower overflow config** (`maxRows`, `cycle`; only the tower reads them). `maxRows`: `"auto"`
    (fit the configured height) or an integer cap. `cycle`: `enabled` (default true), `perPageSeconds`
    (default 8, floored at 4), `pinTop` (default 3), `pinScope` (`"overall"` default | `"class"`),
    `pinSubject` (default true). Additive + defaulted, so existing profiles render identically until a
    field exceeds what the tower can show. Behavior is specified in `what/tower-overflow.md`.
    These two knobs configure the tower on **both** entry points — the widget inside
    `/all` and the standalone `/tower` Browser Source, which derives its slot height from its own
    viewport (`tower-overflow.md` rules 18–20).

13. **URL-only knobs** (not stored in a profile) layer on top of the loaded config per Browser
    Source: `?class=<vehicle_class>` is a **cross-route field filter** read by `/tower`, `/all`,
    `/grid`, and `/results` (narrows the rendered field to one class); `?metrics=` on the standalone
    `/tower` route selects which `towerMetrics` are on (comma list; the analogue of `?unit=mph` on
    `/onboard`); `?show=`/`?hide=` (rule 7) and `?motion=` (rule 10) as above.

14. **Editor control surface.** The `/config` editor exposes controls for the per-widget knobs a
    broadcaster tunes — geometry, visibility, and each widget's own settings (as it already does for
    the tower's `classDisplay`/`towerMetrics`, the lower-third triggers, and the on-board HUD unit).
    This **includes the tower's overflow settings** — `maxRows` and the `cycle` pinned-rows/window
    knobs — so cycling is configured through the UI, not only by hand-editing the profile JSON.

15. **Per-widget plate opacity.** `plateAlpha` (`[0,1]`, default `0.82`) sets the opacity of a
    widget's background **plate** — the translucent panel behind its content — **not** the whole
    widget: text, borders, and bars stay full-strength (deliberately not element `opacity`, which
    would dim everything and hurt legibility). Default `0.82` so existing profiles render
    identically; a broadcaster lowers it for a more see-through plate over busy footage. Read by the
    widgets that render a background plate.

23. **Plate opacity is tunable from the editor.** The `/config` editor exposes a
    plate-opacity control in the widget row — rule 14's control surface — for each widget that
    renders a background plate, so rule 15's broadcaster judgement call ("a more see-through plate
    over busy footage") never requires hand-editing a profile JSON or a round-trip through
    Export/Import. The **plate-rendering widgets** are the six that paint one of the plate tokens:
    `tower` and `battle` (panel + header bar), `driver` and `qualifying` (the shared lower-third
    card), `racecontrol` and `onboard` (header-bar plate). `logos` composites its images straight
    over the video with no panel behind them, so it gets **no** control — gated the same way
    `hideWhenIdle` is offered only to widgets that can be idle, rather than shown on all seven. The
    control spans the full `[0,1]` range in steps of `0.01`, starts at the `0.82` default, and
    renders its current value as text beside it — two decimals, matching the step — so the setting is
    readable at a glance instead of inferred from a slider position. Per rule 16 it carries its own
    help copy, and per rule 19 the coverage tests then require it.

24. **Withholding the control does not change the config.** `plateAlpha` stays
    normalized onto every widget (rule 11) whether or not the editor offers a control for it. A
    profile carrying a hand-authored `plateAlpha` for a non-plate widget keeps that value through a
    load → edit → save cycle: the editor never rewrites a knob it declines to show, and rule 6's
    forward-compat guarantee is unaffected.

### Editor help content

16. **Every control the editor renders MUST be explained in the UI itself.** A broadcaster reaches
    `/config` from a downloaded binary with no repo, no README and no prior context; a knob whose
    only documentation is a spec file or a commit message is undocumented. Help copy is written for
    that reader — no protocol or codebase identifiers (`slot_id`, `interval_ahead`, `notable`), no
    issue numbers, no spec rule references.

17. **Two levels, chosen by what the reader is asking.**
    - *What is this widget?* — each widget carries a human **title** and a one-paragraph **summary**
      of what it puts on screen, rendered **always visible** in its editor row. This is the question
      a new broadcaster has before any individual knob, so it must not be hidden behind an
      interaction.
    - *What does this control change?* — each control carries help behind an **ⓘ** affordance,
      revealed on demand. Hidden by default because the panel is dense; discoverable because the ⓘ
      is visible even when the text is not (a native `title=` tooltip is not sufficient — it signals
      nothing until hover).

18. **Help content is data, not markup.** All copy lives in one module (`app/src/lib/configHelp.js`)
    keyed by widget and by logical field name, and the editor renders from it. This keeps the copy
    reviewable in one place and makes coverage testable.

19. **Coverage cannot drift.** Tests assert that the help maps exactly match the config surface the
    editor iterates (`WIDGET_KEYS`, `TOWER_METRIC_FIELDS`, `DRIVER_INFO_FIELDS`) with no missing and
    no orphan entries, and that every rendered widget control resolves to an ⓘ. Adding a knob without
    help is therefore a **failing test**, not a silent omission.

20. **Asking for help never changes a setting.** Help affordances sit inside `<label>` elements, so
    the ⓘ MUST cancel its click rather than let the label activate the control beside it — asking
    what "Reduced motion" does must not switch reduced motion on. The popover dismisses on `Escape`
    and on a click outside, and anchors itself inside the viewport rather than overflowing the panel.

21. **Behaviors that read as bugs MUST be called out** where the broadcaster meets them: the
    qualifying/practice suppression of pit / tire-wear / fuel (`widgets.md` rule 8), and that the
    lower-thirds hide themselves between camera cuts (rules 13-19) — both otherwise look like a
    broken overlay rather than a deliberate rule.

### Live reload

22. **Live config reload.** A render page re-reads its profile at runtime and applies a change
    without a manual Browser Source refresh: it re-resolves the config (same precedence as rule 4) on
    a modest interval and, when the result differs, swaps to the new layout **immediately and without
    transition** — a config edit is an operator action, not a broadcast reveal, so animating a
    geometry change mid-show would read as a glitch. A missed or failed poll just delays the change
    (best-effort, like the initial load); the producer feed and widget state are unaffected. Relies on
    the API's `no-cache` headers (`companion-server.md` rule 15) so a poll sees fresh state rather
    than a stale cached copy.

### Producer feed status in the editor

Decision record: `docs/decisions/0006-config-producer-feed-status.md`.

25. **The editor reports live producer feed status.** `/config` opens its own SSE connection
    against the producer URL currently in the editor, holds it open for the life of the page, and
    renders a **feed-status readout** in the Producer section beside the SSE URL field. The readout
    is in exactly one of three states, and the state is driven **only** by the connection's own
    lifecycle:

    | State | Entered when |
    |---|---|
    | *connecting* | a connection is opened — on mount, and on every reopen (rule 27) |
    | *connected* | that connection is established |
    | *disconnected* | that connection fails or drops |

    Each state's rendered text names its subject (rule 29); the literal strings are pinned in
    `how/config-editor.md`. *Connecting* is the state on mount. A failure returns the readout to
    *disconnected* from any state, and a later success returns it to *connected*, so a feed that
    drops while `/config` is open is visible without a reload. A URL the connection cannot be opened
    against at all — a half-typed one that settles past rule 27's debounce — is a failed connection
    like any other: the readout reads *disconnected*, and the failure never escapes the editor,
    which keeps rendering and keeps accepting edits. The editor's connection is closed when the page
    unmounts — an unmounted editor never reconnects and never renders.

26. **Feed status is connection state, not data flow.** An open connection that is delivering no
    `state` events MUST still read *connected*. The editor MUST NOT implement stall, timeout, or
    last-snapshot-age detection: `protocol-contract.md` rule 3 forbids assuming a cadence, so a
    paused sim, a replay, and a between-sessions producer are indistinguishable from a hung one.
    Arrival of a `state` event is not a state transition either — the editor discards the snapshot
    (rule 28) — and neither is a snapshot it cannot parse: a malformed payload on a healthy
    connection leaves the readout reading *connected*, because the transport is fine. If a producer
    can detect its own stall it reports it as a payload field, per *dumb overlay, smart producer*.

27. **The connection follows the configured producer URL.** The connection tracks `producer.src` in
    the editor's config wherever that value comes from — a typed edit to the Producer SSE URL field,
    a profile load that replaces the whole config, any other write. When it changes, the current
    connection is closed and one is opened against the new value, debounced identically in every
    case so that a settled change costs one connection, not one per keystroke; the interval is
    pinned in `how/config-editor.md`. Each reopen resets the readout to *connecting*. An **empty or
    whitespace-only** value connects to the default producer URL (`http://localhost:8080/events`),
    matching rule 8's precedence tail, so the readout always describes the URL a Browser Source
    built from this profile would actually use.

28. **The preview never renders live data.** The editor's connection is diagnostic. Snapshots it
    receives are discarded: the live preview keeps rendering the bundled sample fixture in every
    feed state, so every widget stays populated and positionable and the drag/resize target does not
    reflow at feed cadence. There is no live-preview mode and no sample/live toggle.

29. **Each status readout names its own subject.** The editor renders two independent status
    readouts and neither may be phrased so that it could be read as the other. The
    **companion-server** line reports profile and logo persistence, and MUST name that subject in
    both of its resting messages — the one shown when the server answers and the one shown when no
    server does; a bare `Connected.` is specifically prohibited, because on a page whose main job is
    pointing the overlay at a producer it reads as a claim about the race feed. Its other messages
    (save, load, upload, delete, copy outcomes) are unaffected. The **feed** readout is rule 25's:
    it names the producer feed, and it sits in the Producer section beside the URL field rather than
    beside the server line, so neither readout can be mistaken for the other by adjacency. Literal
    wording for both: `how/config-editor.md`.

    Neither readout is a control, so rules 16–19 require no `configHelp.js` entry for them and they
    add no `ⓘ`; the Producer section's existing `producerSrc` help already explains the field they
    sit beside. Feed status is transient UI state — it is **not** written to the config, so the
    profile shape and `configVersion` are unchanged.

## Configuration Surface

Profile shape: `configVersion`, `name`, `producer.src`, `canvas{w,h}`,
`widgets.<key>{…}`, `logoRotation{images,perSlotSeconds,order}`, `theme{}`, `reducedMotion`.
Widget keys: `tower`, `battle`, `logos`, `driver`,
`qualifying`, `racecontrol`, `onboard`. Each widget carries the full normalized knob set (geometry +
`plateAlpha` + `hideWhenIdle` + `trigger`/`dwellSeconds`/`showOnConnect` + `modes`/`fireOnClassBest` +
`classDisplay` + `towerMetrics` + `maxRows`/`cycle` + `speedUnit`/`driverInfo`/`waitForLowerThird`),
but only the widget noted in the rule-11 table actually reads each.

URL-only knobs (per Browser Source, not stored in a profile): `?src=`, `?profile=`, `?show=`,
`?hide=`, `?motion=`, `?class=` (cross-route field filter), `?unit=mph` (standalone `/onboard`),
`?metrics=` (standalone `/tower`).

## Constraints

- Config/assets are a battlecast-app concern, **orthogonal to `spec/v1`** — changing config must not
  touch the producer contract or the compliance harness.
- Additive-only: never make an existing knob required or change its default in a way that alters a
  saved profile's rendered layout without a `configVersion` bump.
