# Overlay Configuration

The layout/visibility/rotation/motion/theme contract that render pages read and the `/config` UI writes.
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
   as that number (`'1500'` becomes `1500`). A sign and a `0x` prefix do not combine: `'-0x10'`
   and `'+0x10'` are not valid numbers. Everything else is not a valid number and MUST NOT be
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
   resolution; configurable per profile via `config.canvas`, min edge 320). `canvas.w` and
   `canvas.h` are each read as a valid number (rule 6); one that is not takes its default edge
   (`w` 1920, `h` 1080), so a blank, `true` or `[1280]` is not an edge of 0, 1 or 1280. A valid
   number is rounded to the nearest integer and then raised to the 320 minimum (`'1280'` becomes
   1280, `-5` becomes 320). A `canvas` that is not an object takes 1920×1080. The render page scales
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
    | `dwellSeconds` | updates | how long each race update card stays up (rule 50) |
    | `dwellSeconds`, `lines` | info | how long each info line stays up, and the broadcaster's own lines (rule 52; `lines` is carried by the `info` widget only) |
    | `weatherCard` | info | whether the weather card joins the info panel's rotation (rule 57; carried by the `info` widget only) |
    | `tempUnit` | weather, info | `c` (default) / `f` temperature display unit (rule 54) |
    | `modes`, `fireOnClassBest` | qualifying | mode-gating + class-best flash |
    | `classDisplay` | tower | inline vs grouped multi-class layout |
    | `towerMetrics` | tower | `{interval,pit,tire,fuel,lapFlash}` toggles (interval and lapFlash on, rest off by default; rule 38) |
    | `maxRows`, `cycle` | tower | overflow row cap + pinned-rows/cycling-window config (see `tower-overflow.md`) |
    | `nameStyle` | tower | `short` (default) / `full` driver names (rules 42–43) |
    | `speedUnit`, `driverInfo`, `waitForLowerThird` | onboard | unit, identity fields, hand-off |

46. **`dwellSeconds`** (lower-thirds; default `6`) is how long a `dwell`-trigger lower-third shows
    once it fires (widgets rule 16). It is read as a valid number (rule 6). A valid number greater
    than 0 is stored as that number (`'7.5'` becomes 7.5); anything else — not a valid number, 0,
    or negative — takes the default. So a blank, `null`, `true` or `[5]` is not a dwell of 0, 1 or
    5 seconds. The race update box's and the info panel's `dwellSeconds` have their own default
    and range (rules 50, 52).

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
    Export/Import. The **plate-rendering widgets** are the nine that paint one of the plate tokens:
    `tower` and `battle` (panel + header bar), `driver`, `qualifying`, `updates` and `info` (the
    shared lower-third card), `racecontrol`, `onboard` and `weather` (header-bar plate). `logos` composites its images straight
    over the video with no panel behind them, so it gets **no** control — gated the same way
    `hideWhenIdle` is offered only to widgets that can be idle, rather than shown on all ten. The
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

### Race update box

50. **Race update box defaults.** The `updates` widget (`widgets.md` rules 69–75) defaults to
    `visible: true` at `x: 1376`, `y: 24`, `w: 520`, `h: 120`, `z: 8`, clear of every other default
    widget (Race Control ends at `x` 1260). Its `dwellSeconds` is how long each update card stays
    up, default `8`. It is read as a valid number (rule 6): a valid number from `2` to `60`
    inclusive is stored as that number (`'7.5'` becomes 7.5), and anything else — not a valid
    number, or a number below 2 or above 60 — takes `8`. So a blank, `null`, `true`, `0`, `1` or
    `90` gives 8. The `info` widget's `dwellSeconds` follows the same default and range
    (rule 52); rule 46's default and range apply to every other widget's `dwellSeconds`. Both
    `/all` and the standalone `/updates` route read it from the loaded profile. A profile saved
    before the widget existed has no `updates` entry and gets these defaults, and
    `configVersion` stays `"1"` (rule 2).
51. **The editor's `updates` row** is part of rule 14's control surface. The row shows the
    widget's title and summary (rule 17) and offers geometry, visibility, plate opacity
    (rule 23), text size (rule 40), and a **dwell secs** number input
    (`data-testid="dwell-updates"`, min `2`, max `60`, step `0.5`, so the spinner reaches
    half-second values such as 7.5 that rule 50 keeps) showing the stored value. The
    dwell input carries its own help copy behind an ⓘ (`data-testid="help-dwell-updates"`) that
    describes update cards, not camera cuts (rules 16, 19). It is a typed number field
    (rule 44): a committed value outside `[2, 60]` is refused and the stored value is kept
    (rule 44b). The row offers no trigger, show-on-connect, or hide-when-idle control. The
    editor's preview sample snapshot carries race events and the preview box takes no baseline
    (`widgets.md` rule 71), so the preview shows update cards while the broadcaster places the
    widget. The sample cards play through once, each for the dwell, and then the box stays
    empty for the rest of the editing session, as the lower-thirds already do in the preview;
    the widget's slot and drag box stay in place.

### Info panel

52. **Info panel defaults and lines.** The `info` widget (`widgets.md` rules 76–82) defaults to
    `visible: true` at `x: 1200`, `y: 816`, `w: 696`, `h: 72`, `z: 9`: bottom right, above the
    logo slot (which starts at `y` 900) and right of the on-board HUD (which ends at `x` 1160),
    so it overlaps no other default widget, hidden ones included. Its `dwellSeconds` is how long
    each line stays up, with rule 50's default and range: a valid number from `2` to `60`
    inclusive is stored as that number, and anything else takes `8`. Its **`lines`** is the
    broadcaster's own list of lines (default `[]`), normalized in this order:
    - a `lines` that is not an array gives `[]`;
    - each entry, in array order, that is not a string is dropped; a string is trimmed, then cut
      to its first 120 characters (JavaScript string length) and trimmed again;
    - an entry that is then blank is dropped, and so is one equal to a line already kept;
    - once 10 lines are kept, the remaining entries are dropped.

    So `[' Follow us @battlecast ', '', 42, 'Follow us @battlecast']` gives
    `['Follow us @battlecast']`. Unlike every other knob, `lines` (like `weatherCard`, rule 57)
    is carried by the `info` widget only: no other widget, including an unknown widget key
    (rule 6), has a `lines` key after normalization. Both `/all` and the standalone `/info` route read `dwellSeconds` and `lines`
    from the loaded profile. A profile saved before the widget existed has no `info` entry and
    gets these defaults, and `configVersion` stays `"1"` (rule 2).
53. **The editor's `info` row** is part of rule 14's control surface. The row shows the
    widget's title and summary (rule 17); the summary says that the panel hides itself when it
    has nothing to show (rule 21: an empty panel would otherwise look broken). The row offers
    geometry, visibility, plate opacity (rule 23), text size (rule 40), a **dwell secs** number
    input (`data-testid="dwell-info"`, min `2`, max `60`, step `0.5`) showing the stored value,
    with its own help copy behind an ⓘ (`data-testid="help-dwell-info"`) that describes info
    lines, not camera cuts or update cards, and an **info lines** list with its own help copy
    behind an ⓘ (`data-testid="help-info-lines"`; rules 16, 19). The dwell input is a typed
    number field (rule 44): a committed value outside `[2, 60]` is refused and the stored value
    is kept (rule 44b). The info lines list holds:
    - one text input per stored line, in stored order (`data-testid="info-line-<i>"`, `<i>`
      counting from 0, `maxlength` 120), showing the line, each with a remove button
      (`data-testid="info-line-remove-<i>"`);
    - a new-line text input (`data-testid="info-line-new"`, `maxlength` 120) and an **Add**
      button (`data-testid="info-line-add"`).

    **Add** appends the new-line input's text, trimmed, to the end of `lines` and clears the
    input. When the trimmed text is blank or equal to a stored line, Add writes nothing and the
    input keeps its text. While 10 lines are stored, the Add button is disabled. **Editing a
    stored line** commits as rule 44's typed fields do, on Enter or when focus leaves the input,
    and keystrokes before the commit change nothing. The committed text is trimmed and replaces
    that line in place. A committed text that is blank, or equal to another stored line, is
    refused: the stored line is kept and the input shows it again. **Remove** deletes that line,
    and the lines after it move up one place. Every change to `lines` reaches the live preview
    at once and is what Save writes. The row offers no trigger, show-on-connect, or
    hide-when-idle control. The editor's preview sample snapshot carries an `event`, so the
    preview shows the header while the broadcaster places the widget. It carries sample
    `info_lines` only while the `info` widget's `lines` is empty: as soon as the broadcaster has
    a line of their own, the sample lines leave the preview snapshot, so the preview rotates the
    broadcaster's lines alone and a first added line shows in the preview at once (as a changed
    line list, `widgets.md` rule 80), unless the weather card (`widgets.md` rule 88, rule 57) is
    the entry on screen: the preview's sample `session.weather` (rule 56) stays in the snapshot
    whatever the `lines`, so the card is still in the new list, keeps the rest of its dwell, and
    the new line follows it (`widgets.md` rules 80, 88). Removing the last line brings the sample
    lines back.

### Weather

54. **`tempUnit`** (default `c`) is the temperature display unit: `c` for °C, `f` for °F
    (`widgets.md` rule 84). Normalization keeps exactly the string `c` or `f` and replaces
    anything else with `c`: absent, null, another case such as `F`, a padded string, `celsius`,
    or a value of another type. It is normalized onto every widget for a uniform shape, as
    `speedUnit` is, and the `weather` and `info` widgets read it, each its own. `/all`, the
    standalone `/weather` route and the standalone `/info` route read it from the loaded
    profile; with no profile, or a profile without the key, it is `c`. There is no URL knob for
    it, and `configVersion` stays `"1"` (rule 2).
55. **Weather box defaults.** The `weather` widget (`widgets.md` rules 83–87) defaults to
    `visible: true` at `x: 900`, `y: 80`, `w: 360`, `h: 44`, `z: 10`: top centre, directly under
    Race Control (which ends at `y` 68) and right of the battle box (which ends at `x` 888), so
    it overlaps no other default widget, hidden ones included. A profile saved before the widget
    existed has no `weather` entry and gets these defaults, and `configVersion` stays `"1"`.
56. **The editor's `weather` row** is part of rule 14's control surface. The row shows the
    widget's title and summary (rule 17); the summary says that the box shows only what the
    producer sends and draws nothing without weather (rule 21). The row offers geometry,
    visibility, plate opacity (rule 23), text size (rule 40), and a **Temperature in °F**
    checkbox (`data-testid="temp-f-weather"`), checked exactly when the stored `tempUnit` is
    `f`, which writes `f` when checked and `c` when cleared, with its own help copy behind an ⓘ
    (`data-testid="help-temp-f-weather"`; rules 16, 19). The row offers no trigger,
    show-on-connect, or hide-when-idle control. The editor's preview sample snapshot always
    carries a `session.weather`, whatever the `info` widget's `lines` (rule 53), so the preview
    shows the box while the broadcaster places it.
57. **The info panel's weather card setting.** The `info` widget's **`weatherCard`** (default
    `false`) turns the weather card (`widgets.md` rule 88) on or off. Off by default because the
    weather box (rule 55) is visible by default: with both on, `/all` would show the weather
    twice, and an info panel with no event and no lines would become a weather-only strip.
    Normalization keeps a boolean and replaces anything else with `false`. Like `lines`, it is carried by the `info`
    widget only: no other widget, including an unknown widget key, has a `weatherCard` key after
    normalization. Both `/all` and the standalone `/info` route read it from the loaded profile.
    The editor's `info` row (rule 53) adds a **Weather card** checkbox
    (`data-testid="weather-card-info"`, checked exactly when `weatherCard` is true, so
    unchecked by default) and a
    **Temperature in °F** checkbox (`data-testid="temp-f-info"`, as in rule 56), each with its
    own help copy behind an ⓘ (`data-testid="help-weather-card-info"`,
    `data-testid="help-temp-f-info"`). The card help says that the card shows only while the
    producer sends weather. Every change reaches the live preview at once and is what Save
    writes.

### Tower lap-time flash toggle

38. **`towerMetrics.lapFlash`** (default `true`) turns the tower's lap-time flash
    (`widgets.md` rules 40–42) on or off. Normalization keeps a boolean and replaces anything else
    with the default, like the other `towerMetrics` toggles. The editor offers it in the tower's
    "tower metrics shown" group beside the other toggles, labelled **lap flash** (not the raw key),
    with its own help copy (rules 16, 19). On
    the standalone `/tower` route `?metrics=` matches toggle names case-insensitively, so
    `?metrics=interval,lapflash` turns it on and a `?metrics=` list that names a known toggle but
    omits it turns it off (an invalid list is ignored; rule 49);
    with no `?metrics=` the loaded profile's `lapFlash` applies (default on; rule 49).
49. **The standalone `/tower` route takes its metrics from the loaded profile, and `?metrics=`
    overrides them as a whole.** With no `?metrics=` the route turns on exactly the toggles the
    profile's tower `towerMetrics` turns on (`interval`, `pit`, `tire`, `fuel`, `lapFlash`); `/all`
    does the same for the same profile (the tower route reads the profile once, when it loads).
    With no profile that is the default (`interval` and `lapFlash` on, `pit`, `tire`, `fuel`
    off); a `?profile=` that fails to load counts as no profile. A `?metrics=` that names at
    least one known toggle is the complete list: each of the five toggles is on if and only if
    the list names it, and the profile's `towerMetrics` contributes nothing, so a profile toggle
    the list omits is off and one the list names is on whatever the profile says. A `?metrics=`
    that is empty, blank, or names no known toggle (`?metrics=bogus`, `?metrics=,`) is ignored
    and the route behaves as if it were absent. Unknown names in a list that also names a known
    toggle are ignored. `/all` has no `?metrics=` knob.

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
    `racecontrol`, `onboard`, `updates`, `info`, `weather`. `logos` renders no text and gets no control. Per rule 16 it carries
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
41d. **A drag ends on release, on cancel, when no button is held, when the window loses focus, on a preset change, and when the config is replaced.**
    A preview drag or resize is live from the pointer going down on a handle until the first of:
    - the pointer is released (`pointerup`);
    - the browser cancels the pointer (`pointercancel` — a touch or pen gesture the browser takes
      over, for example), which ends the drag exactly as a release does: the widget keeps the
      geometry and origin of the last pointer step;
    - the drag's own pointer moves with no button held (its release or cancel never arrived, for
      example because it happened outside the window), which ends the drag exactly as a cancel
      does: the widget keeps the geometry and origin of the last pointer step, and that unpressed
      move places nothing;
    - the window loses focus (`blur`), which ends the drag exactly as a cancel does. This includes
      a drag whose pointer is still held when focus is taken mid-drag, by alt-tab or an OS
      notification, for example: the held pointer then drives nothing until a fresh press;
    - the broadcaster changes the text-size preset (rule 41) of any widget, the dragged one or
      another;
    - the editor's whole config is replaced, as a profile load does when the loaded profile
      arrives, whether the drag began before the load was requested or while it was in flight. A
      load that fails or finds no profile replaces nothing and leaves a live drag live.

    Once a drag has ended, pointer movement changes nothing until the pointer goes down on a handle
    again, which starts a new drag (rule 41c) from the widget as it is then. So a preset change or a
    profile load keeps exactly the geometry and `textScaleOrigin` it produced: no later pointer step
    writes the drag-start geometry or origin over them. Any other edit leaves a live drag live, and
    because the drag is one rule 41c edit from where it began, the next pointer step places the
    dragged parts — `x` and `y` for a move, `w` and `h` for a resize — from the drag's start: a
    value typed into one of them while the pointer is held is replaced.
41e. **A drag follows the one pointer that started it.** A preview drag or resize belongs to the
    pointer (by `pointerId`) whose press on a handle started it. Only that pointer's movement
    places the widget, and a release or cancel ends the drag (rule 41d) only when it is that
    pointer's: another pointer's `pointermove` changes nothing, and another pointer's `pointerup`
    or `pointercancel` leaves the drag live. While a drag is live, a press on any handle — the same
    widget's or another's, move or resize, by any pointer — is ignored: it starts no drag and
    changes nothing about the live one, which keeps placing its widget from where it began (rule
    41c). Once the drag has ended, a pointer that was already down when it ended drives nothing;
    only a fresh press on a handle starts the next drag.

    Preview dragging is built for a mouse. A touch on a handle — or a pen, on a browser that
    scrolls or zooms with one — starts a drag like any other pointer, and its steps place the
    widget until the browser takes the gesture for scrolling or zooming and cancels the pointer.
    That ends the drag as rule 41d says: the widget keeps the geometry of the last pointer step
    before the cancel, and later movement changes nothing. So dragging or resizing the preview by
    touch does not work; by touch, a widget's geometry is edited through its typed `x`, `y`, `w`
    and `h` fields (rule 44).

### Typed number fields in the editor

44. **A typed number applies when it is committed, not on each keystroke.** The editor's typed
    number fields are: each widget's `x`, `y`, `w`, `h` and `z`; the battle row's exit grace secs
    (`idleGraceSeconds`); a lower-third row's, the `updates` row's and the `info` row's dwell secs (`dwellSeconds`); the tower row's seconds
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
    own blank handling (rule 12); the profile name, the producer URL, the class-color fields and
    the info lines inputs are not number fields, and rule 44 does not cover them (an info line
    commits as rule 53 says).
44b. **A commit is clamped or refused, never reset to a default, and the field then shows what is
    stored.** A committed number that the knob's normalization would **clamp** is stored clamped:
    the keep-on-canvas clamp for `x`/`y`/`w`/`h` (at least 16 px, inside the canvas), `[0, 30]` for
    exit grace (rule 36), the 320 px minimum for a canvas edge (rule 9), and a non-whole `pinTop`
    rounded down to a whole number (rule 12). A committed number that normalization would
    **replace with the default** — a lower-third dwell or a seconds per page not above `0`, an
    `updates` or `info` dwell outside `[2, 60]` (rules 50, 52), a `pinTop` below `0` — is refused like a blank: the stored value is kept. `z` and per-slot seconds keep the
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

### Class tags

47. **`theme.classTags`** (default `auto`) is one overlay-wide setting, not a per-widget knob,
    that decides with the producer's `session.multiclass` whether class tags show
    (`widgets.md` rules 60–64): `auto` follows the producer, `show` always shows them, `hide`
    always hides them, with any producer, including one that never sends `multiclass`.
    Normalization keeps exactly the string `auto`, `show`, or `hide` and replaces anything else
    with `auto`: absent, null, another case such as `Hide`, a padded string such as `' hide '`,
    any other string, or a value of another type (`false` is not `hide`). A profile with no
    `theme`, or a `theme` without the key, renders `auto`, and normalizing never changes
    `theme.classColors` (rule 32). It is not normalized onto widgets. `/all` reads it, and so
    does every standalone route that loads a profile: `/tower`, `/battle`, `/driver`,
    `/qualifying`, `/grid`, and `/results`. The standalone `/onboard` route loads no profile
    and renders `auto`. There is no URL knob for it, and `configVersion` stays `"1"` (rule 2).
    Decision record: `docs/decisions/0022-single-class-tags.md`.
48. **The editor exposes it once for the whole overlay**, as part of rule 14's control surface:
    a select labelled **class tags** (`data-testid="class-tags"`), in no widget row, with exactly
    three options, `auto`, `show`, and `hide`, in that order, showing the current value.
    Choosing an option writes that value to `theme.classTags`, the live preview re-renders with
    it, and Save writes it into the profile. It changes no geometry and no other setting,
    `theme.classColors` included. Per rule 16 it carries help copy behind an ⓘ
    (`data-testid="help-class-tags"`), which says plainly that `auto` follows the producer: it
    hides the tags when the producer reports a single-class session and shows them when the
    producer does not say. It says that `show` and `hide` override the producer, and that the
    editor preview's sample feed does not say, so at `auto` the preview shows the tags (rule
    21: a preview that keeps its tags at `auto` would otherwise look like a broken setting).

### Theme preset

58. **`theme.preset`** (default `modern`) is one overlay-wide setting, not a per-widget knob,
    that picks the overlay's look: `modern` (the look described by the design tokens),
    `vintage70` (1970s US network television) or `vintage80` (1980s F1 timing page).
    Normalization keeps exactly the string `modern`, `vintage70` or `vintage80` and replaces
    anything else with `modern`: absent, null, another case such as `Vintage70`, a padded string
    such as `' vintage80 '`, any other string such as `vintage` or `retro`, or a value of another
    type. A profile with no `theme`, a `theme` that is not an object, or a `theme` without the key
    renders `modern`. Normalizing `theme.preset` never changes `theme.classColors` (rule 32) or
    `theme.classTags` (rule 47), and it is not normalized onto widgets. `configVersion` stays
    `"1"` (rule 2). Decision record: `docs/decisions/0026-theme-presets.md`.
59. **Resolution and the root attribute.** A render page resolves the theme with the precedence
    `?theme=` URL param → the profile's `theme.preset` → `modern`. A `?theme=` value is read
    trimmed and case-insensitively (`?theme=Vintage80` is `vintage80`); a value that is not one of
    the three names after that is ignored, and the profile (or the default) decides. The resolved
    preset is written to `<html data-theme="modern"|"vintage70"|"vintage80">`, always present on a
    render page, `modern` included. Every render page writes it: `/all`, and the standalone
    `/tower`, `/battle`, `/driver`, `/qualifying`, `/grid`, `/results`, `/logos`, `/updates`,
    `/info`, `/weather` and `/racecontrol`, each from the URL and its profile on the initial load and again on every live reload
    (rule 22), where a changed preset applies at once, with no transition. A preset chosen in the
    profile applies once the profile has loaded: until then a page without `?theme=` shows the
    `modern` look, exactly as `data-motion` waits for the profile (rule 10). `/onboard` loads
    no profile, so it renders the `?theme=` value or `modern`. The `/config`
    editor is not a render page: its document root never carries `vintage70` or `vintage80`,
    whatever the profile or a `?theme=` param says (rule 62 covers its preview).
60. **A preset changes the look only.** Under every preset each widget shows the same content
    (rows, fields, text, values, order) at the same times (triggers, dwell, cycling, hide-when-idle,
    exit grace) at the same geometry (position, size, row heights, widget dimensions) as under
    `modern`; switching preset on a live page changes none of these, with two exceptions, both
    because a preset changes the typeface. First, a `full`-name-style tower's fit width
    (`widgets.md` rule 48) is measured in the row-name font, which is the preset's typeface, so a
    full-name tower may be a different width under each preset, and switching preset is a reset
    of the fit width under rule 48 (the tower measures again in the new preset). Second, a box
    sized to its own text (for example the on-board HUD plate, the Race Control strip, the
    weather box, or a chip or tag that hugs its label) paints at the size its text takes in the
    preset's typeface and font style, up to its slot's width, past which its text is cut as it
    is under `modern`. The text's font size, weight, letter spacing and case are the same as
    under `modern`, and so are the box's widget slot, its alignment in the slot (centred or
    anchored to an edge) and every set length (row heights, fixed widths, paddings, gaps, bar
    and rule thicknesses), so the box grows or shrinks only by its typeface and font style. Inside
    a box of set width (a tower row), the box keeps its set width while each text-sized cell
    takes the size its text needs; how much of the row shows is the widget's own overflow rule. A preset changes paint only:
    colours, typefaces, font style, text shadow or outline, and plate colour and treatment. Class
    colours (rule 32, `widgets.md` rule 32) and the colours that carry meaning (battle intensity,
    lap-time flash, position change, live) are the same in every preset. Transitions are the same
    in every preset unless a widget's own `widgets.md` rule gives a preset a different transition,
    and `data-motion` (rule 10) applies under every preset: reduced motion is reduced in each. Under
    `vintage70` and `vintage80` every widget renders at least the preset's base look, carried by the
    shared design tokens: the preset's palette and typefaces, its text shadow or outline on all
    text that does not set its own shadow, and square, unblurred plates. Text that sets its own
    glow (the on-camera name in the battle box and both lower-thirds) keeps that glow until its
    widget's own rule gives it the preset's treatment. The base-look values are listed in the decision record.
61. **Every typeface a preset uses is bundled.** The faces `modern` (Saira Condensed, Saira,
    JetBrains Mono), `vintage70` (Barlow, Barlow Condensed) and `vintage80` (VT323, Oswald) name
    are served by battlecast itself, from the same origin as the overlay, so an OBS machine with
    no internet connection renders each preset's own typeface, not a fallback. No page battlecast
    serves, the `/config` editor included, loads a typeface or a font stylesheet from another
    origin. Each bundled family ships with its licence file beside its font files, in the source
    tree and in the built app. The `modern` faces render Latin, Latin Extended and Vietnamese
    text in all three families, and Greek and Cyrillic (Cyrillic Extended included) in JetBrains
    Mono. A `modern` overlay does not download the vintage faces. Decision record:
    `docs/decisions/0028-self-hosted-modern-fonts.md`.
62. **The editor exposes it once for the whole overlay**, as part of rule 14's control surface: a
    select labelled **theme** (`data-testid="theme-preset"`), in no widget row, with exactly three
    options in this order, shown to the broadcaster as **Modern**, **Vintage 70s** and **Vintage
    80s** (values `modern`, `vintage70`, `vintage80`), showing the current value. Choosing an
    option writes that value to `theme.preset`, the live preview re-renders in that preset (the
    preview stage, `data-testid="preview-stage"`, carries `data-theme` set to the chosen value), and
    Save writes it into the profile. It changes no geometry and no other setting, `theme.classColors`
    and `theme.classTags` included. The editor's own panel stays in the `modern` look whatever is
    chosen; only the preview changes. Per rule 16 it carries help copy behind an ⓘ
    (`data-testid="help-theme-preset"`) saying what each look is, that it changes how the overlay
    looks and not what it shows, and that a `?theme=` parameter overrides it per Browser Source; per
    rule 21 it says that the editor panel itself stays in the modern look and that class colours
    are the same in every look (either would otherwise read as a setting that did not take).
63. **The preview renders every widget in the chosen preset.** Under every preset, each widget
    the `/config` preview draws (every key in `widgets`, while it is visible) takes the look its
    render page takes under that preset: the base look (rule 60) and the widget's own `widgets.md`
    preset rules, with the same content, timing and geometry. A widget takes the preset from the
    nearest ancestor carrying `data-theme`; in the preview that ancestor is the preview stage,
    no element between the stage and a widget carries `data-theme`, and no widget's preset
    styling or preset-dependent behaviour reads the document root's attribute alone (which in the
    editor never names a vintage preset, rule 59). Choosing a preset re-renders the preview in it
    at once, with no transition, and does in the preview whatever switching preset on a live
    render page does (rule 60: a `full`-name tower measures its fit width again). The preview adds
    no preset styling of its own: how a widget's text reads under a preset is that widget's rule.
64. **The drag handles are editor chrome and keep the editor's look.** The preview's handles sit
    inside the themed stage but take nothing from the preset: under every preset each handle's
    dashed outline and tint, its resize corner, and its key label (the widget key, `tower`,
    `battle` and so on, shown in capitals) render exactly as under `modern`. The key label keeps
    the editor's typeface, upright, with no text shadow or outline, in its own dark-on-teal
    colours, so it reads the same over every look and is never taken for overlay graphics.

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
    the Browser Source (rule 43, `widgets.md` rule 48), and that the info panel draws nothing
    while it has no event and no lines to show (rule 53, `widgets.md` rule 78), and that the
    weather box draws nothing while the producer sends no weather (rule 56, `widgets.md` rule 85) — each otherwise looks like a broken
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
`widgets.<key>{…}`, `logoRotation{images,perSlotSeconds,order}`, `theme{classColors,classTags,preset}`,
`reducedMotion`.
Widget keys: `tower`, `battle`, `logos`, `driver`,
`qualifying`, `racecontrol`, `onboard`, `updates`, `info`, `weather`. Each widget carries the full normalized knob set (geometry +
`plateAlpha` + `hideWhenIdle` + `trigger`/`dwellSeconds`/`showOnConnect` + `modes`/`fireOnClassBest` +
`classDisplay` + `towerMetrics` + `maxRows`/`cycle` + `nameStyle` + `speedUnit`/`driverInfo`/`waitForLowerThird` +
`tempUnit`), but only the widget noted in the rule-11 table actually reads each. The `info`
widget also carries `lines` and `weatherCard`, which no other widget has (rules 52, 57).

URL-only knobs (per Browser Source, not stored in a profile): `?src=`, `?profile=`, `?show=`,
`?hide=`, `?motion=`, `?theme=`, `?class=` (cross-route field filter), `?unit=mph` (standalone `/onboard`),
`?metrics=` (standalone `/tower`).

## Constraints

- Config/assets are a battlecast-app concern, **orthogonal to `spec/v1`** — changing config must not
  touch the producer contract or the compliance harness.
- Additive-only: never make an existing knob required or change its default in a way that alters a
  saved profile's rendered layout without a `configVersion` bump.
