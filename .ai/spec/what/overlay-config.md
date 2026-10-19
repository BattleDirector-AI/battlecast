# Overlay Configuration

The layout/visibility/rotation/motion contract that render pages read and the `/config` UI writes.
Decision record: `docs/decisions/0001-overlay-config-and-asset-persistence.md`; implementation in
`how/renderer.md`.

## Behavioral Rules

### Contract & versioning

1. Config carries its own **`configVersion`** (`"1"`), numbered independently of the spec
   `schemaVersion` and the app release version.
2. Config additions are **additive + defaulted** — new per-widget knobs are normalized onto every
   widget and do not bump `configVersion`. Every existing profile keeps loading and keeps its
   saved geometry and saved values. A new knob's default may change how an existing profile
   looks (rule 42's short names do), but never its saved geometry or the meaning of a value it
   already holds. The same goes for a changed default value of an existing field, such as the
   tower's default `w` (rule 45): it reaches only profiles that do not store that field. A
   profile that stores `w: 380` keeps rendering its tower 380 wide. A stored geometry value that
   rule 6 does not read as a number (`x: ''`, `w: true`) is not saved geometry: that field takes
   the widget's default, like a field the profile does not store.
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
   boolean `visible`, finite geometry, and all defaulted knobs. A widget's `x`, `y`, `w`, `h` and
   `z` are each read as a **valid number**: a finite number, or a non-blank string that JavaScript
   `Number()` turns into a finite number (so surrounding whitespace, a sign, a decimal point, an
   exponent, and a `0x` hex prefix are accepted: `' 1500 '`, `'-12'`, `'1e3'`, `'0x10'`), stored
   as that number (`'1500'` becomes `1500`). Everything else is not a valid number and MUST NOT be
   read as one: a blank or whitespace-only string (it is not 0), a string that is not wholly a
   number (`'abc'`, `' 12abc'`, `'380px'`), `'Infinity'`, `null`, a boolean (`true` is not 1), an
   array (`[5]` is not 5), an object, a missing value. Such a field takes the widget's default
   instead; an unknown widget key's default for each of the five is 0.
   **Unknown widget keys from a newer profile are preserved** (forward-compat), defaulting hidden.
7. `?show=` / `?hide=` comma lists are the **highest-precedence** visibility override, applied after
   normalization so they win over both profile and default.
8. Producer SSE URL for `/all` is picked as `?src=` → profile `producer.src` → default
   (`http://localhost:8080/events`).

### Geometry

9. Geometry is **absolute px against a fixed canvas** (default 1920×1080, LMU's supported
   resolution; configurable per profile via `config.canvas`, min edge 320). The render page scales
   the canvas uniformly to the viewport, so a broadcaster gets the same layout at any Browser Source
   size. Widgets paint in ascending `z` order.
45. **Default tower and battle-box geometry.** The built-in default tower is 400 wide
    (`w: 400` at `x: 24`), and the standalone `/tower` route's `--bc-tower-width` token is
    `400px`, so the tower is the same width on both entry points out of the box. The default
    battle box sits at `x: 448` (its `w` stays 440), keeping the same 24px gap to the right of
    the default tower, so no two default widgets in the top band overlap: tower 24–424,
    battle box 448–888, Race Control 900–1260. The editor's keep-on-canvas clamp applies to the
    new default as to any geometry: on a canvas narrower than 424 it moves or narrows the
    tower to fit. Decision record: `docs/decisions/0020-tower-table-columns.md`.

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
    | `textScale` | text-rendering widgets (all but logos) | `normal` / `large` / `larger` text size preset (rules 39–41) |
    | `hideWhenIdle` | supporting widgets (battle, logos, driver, qualifying) | auto-hide when idle |
    | `idleGraceSeconds` | battle | exit grace before an ended battle goes idle (rule 36) |
    | `trigger`, `dwellSeconds`, `showOnConnect` | lower-thirds (driver, qualifying) | fire/dwell timing |
    | `modes`, `fireOnClassBest` | qualifying | mode-gating + class-best flash |
    | `classDisplay` | tower | inline vs grouped multi-class layout |
    | `towerMetrics` | tower | `{interval,pit,tire,fuel,lapFlash}` toggles (interval and lapFlash on, rest off by default; rule 38) |
    | `maxRows`, `cycle` | tower | overflow row cap + pinned-rows/cycling-window config (see `tower-overflow.md`) |
    | `nameStyle` | tower | `short` (default) / `full` driver names (rules 42–43) |
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

### Battle box exit grace

36. **`idleGraceSeconds`** (battle; default `5`) is how long the battle box holds an ended battle
    before it goes idle (`widgets.md` rules 37–39). Normalization keeps a finite number clamped to
    `[0, 30]` and replaces anything else (absent, null, a string, `NaN`) with the default `5`; `0`
    turns the hold off. It is read from the loaded profile by both `/all` and the standalone
    `/battle` route.
37. **The editor exposes it in the battle row** — rule 14's control surface — as a number input
    (`0`–`30`, step `1`) showing the current value, offered for `battle` only. Per rule 16 it carries
    its own help copy, and per rule 19 the coverage tests then require it. Like `plateAlpha`
    (rule 24), withholding the control from the other widgets never rewrites a stored value.

### Tower lap-time flash toggle

38. **`towerMetrics.lapFlash`** (default `true`) turns the tower's lap-time flash
    (`widgets.md` rules 40–42) on or off. Normalization keeps a boolean and replaces anything else
    with the default, like the other `towerMetrics` toggles. The editor offers it in the tower's
    "tower metrics shown" group beside the other toggles, labelled **lap flash** (not the raw key),
    with its own help copy (rules 16, 19). On
    the standalone `/tower` route `?metrics=` matches toggle names case-insensitively, so
    `?metrics=interval,lapflash` turns it on and a `?metrics=` list that omits it turns it off;
    with no `?metrics=` the default (on) applies.

### Per-widget text size

39. **`textScale`** is a per-widget text-size preset: `normal` (×1.00, the default), `large`
    (×1.15), or `larger` (×1.30). Normalization keeps one of those three strings and replaces
    anything else with `normal`. In `/all`, a widget whose preset is not `normal` has every
    type-size token (`--bc-size-*`, `app/src/design/tokens/typography.css`) redeclared on its slot
    at the token's base value times the factor, so all of that widget's text grows together and no
    other widget's text changes. The preset changes text size only: spacing, row heights, the
    plate, and the widget's configured geometry are untouched, and `normal` renders exactly as a
    profile without the knob. Like `plateAlpha`, it is applied by `/all` only; standalone routes
    render at `normal` size.
40. **The editor exposes it in the widget row** — rule 14's control surface — as a select of the
    three presets, for each text-rendering widget: `tower`, `battle`, `driver`, `qualifying`,
    `racecontrol`, `onboard`. `logos` renders no text and gets no control. Per rule 16 it carries
    help copy, per rule 19 the coverage tests require it, and like `plateAlpha` (rule 24)
    withholding the control never rewrites a stored value.
41. **Changing the preset in the editor widens the widget from its `normal` geometry.** When a
    widget leaves `normal`, the editor records its `normal` `x` and `w` on the widget as
    `textScaleOrigin: { x, w }`. At a bigger preset the widget's `x` is the origin's `x` and its
    `w` is the origin's `w` × the factor, rounded to a whole pixel — the default tower goes 400 →
    460 at `large` → 520 at `larger` — always computed from the origin, never from the previous
    preset's width, so no rounding drift builds up. The editor's usual keep-on-canvas clamp then
    applies (it may move `x` left or cap `w` at the canvas width). Returning to `normal` restores
    the origin's `x` and `w` exactly, whatever the clamp did at the bigger preset, and removes
    `textScaleOrigin`; only if the canvas itself has since shrunk does the keep-on-canvas clamp
    adjust the restored geometry. `y` and `h` are never changed by a preset.
41a. **Editing geometry at a bigger preset moves the origin with it.** While a widget is off
    `normal`, an editor change the broadcaster makes to its `x` (dragging or typing) sets the
    origin's `x` to the new `x`, and a change to its `w` (resizing or typing) sets the origin's `w`
    to the new `w` ÷ the factor, rounded, so going back to `normal` lands where the broadcaster put
    it. Each part moves only when that part is the one being changed: a vertical-only drag, a
    zero-pixel drag, a height-only resize, or an `x` the keep-on-canvas clamp moved in answer to a
    new `w` leaves the origin's other part untouched.
41b. **The origin is editor bookkeeping.** `textScaleOrigin` is saved with the profile so a
    reload keeps the round trip exact. Normalization keeps it only on a text-rendering widget
    (rule 40's list; never on `logos` or a widget key it does not know) whose preset is not
    `normal`, as `{ x, w }` and nothing else, and only when both `x` and `w` are valid; otherwise
    it drops the whole origin. A part is valid when it is a valid number as rule 6 defines it (the
    same conversion a widget's own geometry gets), and a string part is stored as that number:
    `{ x: '1500', w: ' 380 ' }` becomes `{ x: 1500, w: 380 }`. Rendering never reads
    it: a widget renders at its stored `x` and `w`, so a hand-set `w` renders at exactly that `w`
    whatever its preset. Decision record: `docs/decisions/0015-per-widget-text-size.md`.
41c. **A preview drag or resize is one edit, from where it began to where it is now.** Rule 41a
    compares the widget's geometry at each pointer step with its geometry when the pointer went
    down, never with the previous step, and starts from the origin the widget had at that moment.
    So a drag that leaves and comes back to where it started — horizontally, or a resize back to
    its starting `w` — ends with the origin it began with, and returning to `normal` lands exactly
    where it would have without the drag; a drag that ends somewhere else moves the origin as one
    rule 41a edit from the drag's start to its end, whatever path the pointer took in between.
    Releasing the pointer ends the edit: the next drag compares with where that one finished.

### Typed number fields in the editor

44. **A typed number applies when it is committed, not on each keystroke.** The editor's typed
    number fields are: each widget's `x`, `y`, `w`, `h` and `z`; the battle row's exit grace secs
    (`idleGraceSeconds`); a lower-third row's dwell secs (`dwellSeconds`); the tower row's seconds
    per page and pin top N (`cycle.perPageSeconds`, `cycle.pinTop`); the canvas width and height;
    and the logo rotation's per-slot seconds (`logoRotation.perSlotSeconds`). A value typed into one
    of them is committed in two ways, and is applied then, once. **Enter** commits on its own
    keydown, whatever the browser does with `change` for it; Shift+Enter (or Enter with any other
    modifier) commits the same way, and an Enter that ends an IME composition belongs to the
    composition and commits nothing. **Focus leaving the field** (the field's `change` event)
    commits whatever the field holds. A field commits a value once: a `change` or blur that follows
    an Enter, with no keystroke in between, finds the value already committed and writes nothing
    further, so Enter then leaving the field is one edit (rule 44c). Before the commit the keystrokes change nothing: the config, the live
    preview, and what Save or Export writes all keep the last committed value, and the field shows
    exactly the text being typed — the editor never rewrites it mid-entry. Clicking Save or Export
    moves focus off the field, so a value still being typed is committed before it is saved. Typing
    `1900` into `w` and backspacing to `190` before committing applies `w = 190`, and the
    keep-on-canvas clamp never sees `1900`, so `x` does not move.
44a. **Steps and sliders apply at once.** A step taken with a number field's spinner buttons or its
    Up/Down arrow keys is a commit, and each step applies as it is taken, in every browser the
    editor runs in — whether or not that browser fires `change` for a keyboard step. Typing after a
    step is ordinary typing again. The plate-opacity slider (rule 23) is not a typed field: it
    applies continuously while it moves. `maxRows` is a text field that applies on commit with its
    own blank handling (rule 12); the profile name, the producer URL and the class-color fields are
    not number fields, and rule 44 does not cover them.
44b. **A commit is clamped or refused, never reset to a default, and the field then shows what is
    stored.** A committed number that the knob's normalization would **clamp** is stored clamped:
    the keep-on-canvas clamp for `x`/`y`/`w`/`h` (at least 16 px, inside the canvas), `[0, 30]` for
    exit grace (rule 36), the 320 px minimum for a canvas edge (rule 9), and a non-whole `pinTop`
    rounded down to a whole number (rule 12). A committed number that normalization would
    **replace with the default** — a dwell or a seconds per page not above `0`, a `pinTop` below
    `0` — is refused like a blank: the stored value is kept. `z` and per-slot seconds keep the
    number as entered. After every commit the field shows the value now stored, so an out-of-range
    entry visibly becomes its clamped value or reverts to the kept one. Committing a **blank**
    field — cleared, or holding text the browser cannot read as a number, which a number input
    reports as blank — writes nothing: the stored value is kept (never `0`, never reset to a
    default) and the field shows it again. **Escape** discards the
    uncommitted text: the field shows the stored value again, nothing is written, and leaving the
    field afterwards commits nothing.
44c. **A commit is one rule 41a edit.** At a bigger text preset, a typed `x` or `w` moves
    `textScaleOrigin` only when it is committed, comparing the committed value with the value
    stored before the commit. Uncommitted keystrokes never move the origin, the stored `x` or the
    stored `w`, and a blank or Escaped field moves nothing. An Enter followed by a `change` or blur
    is one commit and so one rule 41a edit, never two. Rule 44b applies to every commit alike: an
    Enter on a blank or refused value keeps the stored value, exactly as leaving the field does.

### Tower driver name style

42. **`nameStyle`** (tower; default `short`) selects how the standings tower renders driver
    names: `short` (`E.JAC`) or `full` (`E. Jacobs`, with the tower growing wider to fit;
    `widgets.md` rules 46–48). Normalization keeps exactly the string `short` or `full` and
    replaces anything else with `short`: absent, null, another case such as `Full`, any other
    string, or a value of another type. It is normalized onto every widget for a uniform
    shape, and only the tower reads it. Both `/all` and the standalone `/tower` route read it
    from the loaded profile. A route with no profile, or a profile without the key, renders
    `short`. There is no URL knob for it. A profile without the key renders short names at its
    saved geometry, and `configVersion` stays `"1"` (rule 2). Decision record:
    `docs/decisions/0018-tower-driver-name-style.md`.
43. **The editor exposes it in the tower row**, as part of rule 14's control surface. It is a
    select labelled **driver names** with exactly two options, `short` and `full` in that
    order, showing the current value, offered for `tower` only. Choosing an option writes that
    value to the tower's `nameStyle` and the live preview re-renders with it. It changes no
    geometry: unlike a text-size preset (rule 41), the editor never alters `x`, `w` or any
    other field when the style changes. Per rule 16 it carries help copy, which says that
    `full` lets the tower grow wider than its set width and can run past the edge of the
    Browser Source (rule 21: growth past the box would otherwise look like a bug). Per rule 19
    the coverage tests require it. Like `plateAlpha` (rule 24), withholding the control from
    the other widgets never rewrites a stored value. In `full` the preview's drag-and-resize
    box shows the stored `x` and `w`, the tower's left edge and minimum width; a tower
    grown wider than `w` (`widgets.md` rule 48) draws past the box's right side, and dragging
    or resizing edits `x` and `w` only.

### Class color overrides

32. **`theme.classColors`** (default `{}`) maps a class-name key — normalized the same way
    `classMeta.js` normalizes `vehicle_class` (trim, lowercase) — to a 6-digit hex color
    (`#rrggbb`; case-insensitive on input, no shorthand 3-digit form, no alpha channel).
    Normalization drops any entry whose key is blank after trimming or whose value is not a
    well-formed 6-digit hex string; a dropped entry is not replaced or coerced — the class it named
    simply has no override, exactly as if the entry had never been added. Also drops any
    prototype-polluting key (`__proto__`, `constructor`, `prototype`), the same defense already
    applied to `widgets` keys (rule 6's normalization). The map is unbounded and freeform — nothing
    constrains its keys to a fixed or curated set of class names. `widgets.md` rule 32 specifies how
    a resolved entry applies to rendering.

33. **The `/config` editor exposes a Class Colors section** — rule 14's control surface, keyed by
    class name rather than by widget. A broadcaster adds a row (a class-name field plus a color
    picker) for any class string, edits or removes an existing row, and sees the change reflected in
    the live preview as soon as the picker reports a color — it is not a typed number field, so
    rule 44's commit-on-Enter-or-blur does not apply to it. There is no pre-seeded or
    fixed list of rows: every row is one the broadcaster has explicitly added, and an empty map
    renders no rows. Removing a row's override returns that class to rule 31's default. Per rule 16
    the section carries its own summary and the color-picker control carries a `configHelp.js` entry
    and an ⓘ (rules 17-19).

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
    lower-thirds hide themselves between camera cuts (rules 13-19), and that a tower in `full`
    name style grows wider than its set width and can be cut off at the edge of the canvas or
    the Browser Source (rule 43, `widgets.md` rule 48) — each otherwise looks like a broken
    overlay rather than a deliberate rule.

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

Decision records: `docs/decisions/0006-config-producer-feed-status.md` (the readout),
`docs/decisions/0007-config-feed-reconnect.md` (the two failure states and the Reconnect control).

25. **The editor reports live producer feed status.** `/config` opens its own SSE connection
    against the producer URL currently in the editor, holds it open for the life of the page, and
    renders a **feed-status readout** in the Producer section beside the SSE URL field. The readout
    is in exactly one of four states, and the state is driven **only** by the connection's own
    lifecycle:

    | State | Entered when |
    |---|---|
    | *connecting* | a connection is opened — on mount, on every reopen (rule 27), on every reconnect (rule 30) |
    | *connected* | that connection is established |
    | *retrying* | that connection fails and the transport will re-attempt it unaided |
    | *stopped* | that connection fails and the transport will not re-attempt it |

    Each state's rendered text names its subject (rule 29); the literal strings are pinned in
    `how/config-editor.md`. *Retrying* and *stopped* are both "not connected" on air and their
    rendered text says so; what separates them is that only *retrying* resolves itself, which the
    text also says. *Connecting* is the state on mount.

    Which of the two a failure produces is read from the transport's own state at the moment that
    failure is reported. It is never inferred from elapsed time: rule 26's ban on timers holds
    unchanged, and the readout MUST NOT decay from *retrying* to *stopped* on its own. A transport
    that keeps re-attempting reports each attempt's failure separately, and every one of those
    leaves the readout *retrying* — the state is recomputed from each failure and never latched
    from the first. A success from any state returns the readout to *connected*, so a feed that
    drops while `/config` is open and then heals itself is visible without a reload.

    A URL the connection cannot be opened against at all — a half-typed one that settles past
    rule 27's debounce — is *stopped*, because there is no connection to re-attempt anything; and
    the failure never escapes the editor, which keeps rendering and keeps accepting edits. The
    editor's connection is closed when the page unmounts — an unmounted editor never reconnects and
    never renders.

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

30. **A Reconnect control re-arms the readout.** The Producer section renders a **Reconnect**
    control whenever the feed readout is *retrying* or *stopped*, and does not render it while the
    readout is *connecting* or *connected* — in those two states the control is **absent**, not
    merely inert. Its presence is governed by "not connected" and nothing finer: it does not appear
    or vanish as the transport cycles between *retrying* and *stopped*.

    Activating the control closes the current connection and opens a new one against the producer
    URL the editor's config holds at that moment, **immediately**. Rule 27's debounce governs a
    *changed* URL settling and MUST NOT delay an explicit reconnect; a reopen rule 27 already has
    pending is cancelled by the reconnect, so an operator who edits the URL and reconnects without
    waiting gets one connection against the edited value rather than two. The readout resets to
    *connecting* and the control disappears with it. What follows is an ordinary connection: it
    reaches *connected*, *retrying* or *stopped* by rule 25 like any other, the control returns if
    it fails, and a later edit to the URL field still reopens the connection under rule 27.

    Reconnect is a **control**, so — unlike rule 29's readouts — it MUST carry a `configHelp.js`
    entry and an ⓘ (rules 16–19). It writes nothing: `producer.src`, the rest of the profile, the
    OBS Browser Source URL and `configVersion` are all unchanged by pressing it.

### Feed-status accessibility

Decision record: `docs/decisions/0011-feed-status-accessibility.md`.

34. **The feed-status readout is an accessible live region.** `[data-testid="feed-status"]` carries
    `role="status"` at all times, so every transition among rule 25's four states — an explicit
    Reconnect press, or an unprompted drop/recovery with nothing pressed at all — is announced to
    assistive technology as it happens, not only visible to a sighted operator watching the text
    change.

35. **Activating Reconnect moves keyboard focus to the feed-status readout, not to `<body>`.** The
    control (rule 30) unmounts in the same tick its own press resolves the readout out of "not
    connected," and with no explicit target the browser drops focus to `<body>` — losing a
    keyboard operator's position in a long, dense panel. Pressing Reconnect moves focus to
    `[data-testid="feed-status"]` (rule 34) instead, landing the operator back in the section they
    were already working in. This applies **only** to the control's own activation: the same
    unmount happening because the feed recovered on its own, with nothing pressed, MUST NOT move
    focus — an operator working elsewhere on the page must not have focus pulled out from under
    them by a state change they didn't initiate.

### Naming the demo fallback

31. **The Producer section names it when the resolved URL is the bundled demo producer's.** Rule
    27's default and the value `normalizeConfig` bakes into an untouched profile
    (`DEFAULT_CONFIG.producer.src`) are the same literal address, `http://localhost:8080/events` —
    so a freshly created or never-edited profile reads no differently in the URL field than one a
    broadcaster deliberately pointed at their own producer running on that address. Whenever the
    URL the feed connects to (rule 27's resolution — the trimmed field value, or the default when
    the field is empty or whitespace) equals that literal default, the Producer section renders an
    always-visible note identifying it as the bundled demo producer's address, not a configured
    one, and telling the broadcaster to replace it with their own producer's. The note is derived
    purely from the resolved URL — never from whether the field has been edited, has focus, or
    matches its placeholder — so it reappears the instant the field is cleared back to empty and
    disappears the instant it holds anything else. It is not the feed-status readout (rule 25): it
    states which URL is in effect, never whether that URL answers, and per rule 29 it MUST NOT be
    phrased so it could be mistaken for that readout on a panel that already carries one status
    line. Decision record: `docs/decisions/0008-producer-src-default-visibility.md`.

## Configuration Surface

Profile shape: `configVersion`, `name`, `producer.src`, `canvas{w,h}`,
`widgets.<key>{…}`, `logoRotation{images,perSlotSeconds,order}`, `theme{classColors}`,
`reducedMotion`.
Widget keys: `tower`, `battle`, `logos`, `driver`,
`qualifying`, `racecontrol`, `onboard`. Each widget carries the full normalized knob set (geometry +
`plateAlpha` + `hideWhenIdle` + `trigger`/`dwellSeconds`/`showOnConnect` + `modes`/`fireOnClassBest` +
`classDisplay` + `towerMetrics` + `maxRows`/`cycle` + `nameStyle` + `speedUnit`/`driverInfo`/`waitForLowerThird`),
but only the widget noted in the rule-11 table actually reads each.

URL-only knobs (per Browser Source, not stored in a profile): `?src=`, `?profile=`, `?show=`,
`?hide=`, `?motion=`, `?class=` (cross-route field filter), `?unit=mph` (standalone `/onboard`),
`?metrics=` (standalone `/tower`).

## Constraints

- Config/assets are a battlecast-app concern, **orthogonal to `spec/v1`** — changing config must not
  touch the producer contract or the compliance harness.
- Additive-only: never make an existing knob required or change its default in a way that alters a
  saved profile's rendered layout without a `configVersion` bump.
