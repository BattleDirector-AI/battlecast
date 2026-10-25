# Decision: one overlay-wide theme lever — `modern` / `vintage70` / `vintage80` token sets on `data-theme`

**Issues:** #356 (epic #358; custom themes #359) · **Milestone:** 0.16.0
**Status:** Accepted · **Date:** 2026-10-24

battlecast gets a master look switch, `theme.preset`, with three curated values: `modern` (the
default, today's look), `vintage70` (1970s US network: ABC Indy 500 / CBS Daytona 500, 1979) and
`vintage80` (1980s F1 Olivetti timing page with Channel 7 Bathurst accents). The resolved value is
written once to an attribute, `data-theme`, and each preset is a set of design-token overrides
keyed off that attribute. This record covers the **foundation**: the lever, the mechanism, the
fonts, the `/config` control and preview, and the base look every widget picks up through the
shared tokens. Each widget's own vintage styling is a later pass (epic #358 lists them); all of it
ships in one release.

Design references: `docs/design/vintage/vintage-70s-us.html` and
`docs/design/vintage/vintage-80s-f1.html` (the mocks the owner approved; driver and car names in
them are fictional). The research behind them, with timestamped broadcast examples, is in the
#356 thread.

## Context

The look is one token set in `app/src/design/tokens/`, and `theme` in the profile carries only
`classColors` and `classTags`. A broadcaster asked for a 70s/80s look as an option. The owner
chose to ship both decades, keep widget behaviour identical, and prefer readable over faithful
where the two conflict, while staying as faithful as readability allows.

Motion already has a working pattern for an overlay-wide mode: `lib/motion.js` resolves
`?motion=` → profile `reducedMotion` → default, writes `<html data-motion>`, and every render
page re-applies it on load and on each live reload (#349, #351). The theme copies that pattern.

## Decision

1. **One lever, three curated values.** `theme.preset` is `modern`, `vintage70` or `vintage80`,
   stored per profile next to `theme.classColors` and `theme.classTags`. Normalization keeps only
   those exact strings; anything else is `modern`, so every existing profile keeps today's look.
   No user CSS, no free-form values: the same stance as #59 and #359.
2. **Resolution mirrors motion: `?theme=` → profile → `modern`.** A Browser Source can pin a
   theme with `?theme=`, like `?motion=`. This is not just symmetry: `/racecontrol` and
   `/onboard` load no profile (overlay-config rule 47 already accepts that for class tags), so
   without a URL knob those two standalone widgets could never wear a vintage look. The URL value
   is trimmed and case-insensitive (`?theme=Vintage80` works, as `?motion=` lowercases); an
   unrecognised value is ignored and the profile decides, so a typo cannot blank the look.
3. **One attribute, written once per change.** The resolved preset goes to
   `<html data-theme="modern|vintage70|vintage80">`. `App.svelte` writes the URL/default baseline
   at boot on every render route; each profile-loading page refines it from the profile on load
   and on every live reload, immediately and without a transition (overlay-config rule 22). The
   attribute is always present on a render page, `modern` included, so CSS and tests read one
   explicit value.
4. **Token sets keyed off a bare attribute selector, not `:root` only.** A preset's overrides are
   written as `[data-theme="vintage70"] { … }` (optionally also listing `:root[data-theme=…]`).
   The bare selector matches the document root on render pages *and* the `/config` preview
   container, so one stylesheet serves both. A `:root`-only block would leave the preview modern.
5. **Derived tokens are re-declared with their inputs.** A custom property resolves its `var()`
   references on the element where it is declared and then inherits as a finished value. So
   `--bc-plate: rgba(var(--bc-plate-rgb), 0.82)` declared on `:root` stays modern inside the
   preview even when the preview scope overrides `--bc-plate-rgb`. A preset block that changes a
   token's input therefore re-declares the derived token too. A test enforces this.
6. **The `/config` editor stays modern; its preview follows the edit.** The editor's own panel
   is a tool, not broadcast output, and must stay legible and familiar whatever look is being
   built. Its document root never takes a vintage theme (neither from the profile nor from
   `?theme=`). The preview stage carries `data-theme` set to the preset being edited, so the
   preview shows the chosen look before Save.
7. **Look only.** A preset changes paint: colours, fonts, font style, text shadow/outline,
   plate colour and treatment (blur, radius, plate shadow), and in later passes each widget's
   structural styling. It never changes what a widget shows, when, for how long, or where:
   the same rows, fields, triggers, dwell, cycling, hide-when-idle, geometry, row heights and
   widget dimensions. Concretely, presets never override the spacing tokens (`--bc-space-*`,
   `--bc-row-*`, `--bc-group-header`, `--bc-widget-header`, `--bc-tower-width`,
   `--bc-battle-width`, `--bc-classbar*`, `--bc-inset-safe`): row heights feed the tower's row
   budget, so changing them would change how many rows show, which is behaviour. Radii are the
   exception: `--bc-radius*` live in `spacing.css` but are paint.
   **One geometry carve-out: the full-name tower's fit width.** In `full` name style the tower
   grows to fit its widest name, measured in the row-name font (`widgets.md` rule 48). A preset
   swaps that font (`--bc-font-display`), so a full-name tower can be a different width under
   each preset. That is inherent to changing the typeface, not a behaviour change, and a preset
   switch counts as a name-font load under rule 48: the tower re-measures its names. No test
   pins this in the foundation: happy-dom resolves no custom properties, so a theme switch
   changes no measuring font there unless the test stubs `getComputedStyle` per theme, which
   would test the stub. The tower's own pass, which owns the measurement harness, covers it.
8. **Class colours are the same in every theme.** A class colour identifies a class and can be
   overridden by the broadcaster (`theme.classColors`); a theme that re-coloured classes would
   make an override mean different things per theme, and the colours are resolved in JS from
   `classMeta.js`, not from the CSS tokens. The mocks' period "number tile" primaries are not
   adopted. The intensity, lap-flash, up/down and live colours also stay, as they carry meaning.
9. **Motion is out of this foundation.** Transitions are identical in every theme until a
   widget's own pass gives a vintage preset its own transition (the period look is hard cuts and
   plain wipes), and that widget's `widgets.md` rule then says so. Doing it per widget keeps each
   transition change reviewable next to the widget whose timing it touches (the lower-thirds'
   bar-wipe and the battle-box grace both have timing rules). `data-motion` stays independent of
   the theme: reduced motion hard-cuts in every theme, as today.
10. **Fonts are bundled, not fetched.** OBS may have no network. Every face a vintage preset
    names is a self-hosted `woff2` under `app/public/fonts/<family>/`, declared with `@font-face`
    in `tokens/fonts.css` with `font-display: swap`, with that family's `OFL.txt` in the same
    folder. `public/` is copied verbatim into `app/dist`, so the licence travels beside the font
    into every distribution, including the packaged binary (ADR 0004), and the companion server
    already serves `font/woff2`. `@font-face` costs nothing until used: a browser downloads a face
    only when rendered text needs it, so a `modern` overlay never fetches the vintage files. The
    files are Google Fonts' own pre-built `woff2` files (the latin and latin-ext subset files it
    serves; driver names carry diacritics), shipped **unmodified**: no re-subsetting, conversion
    or renaming of our own. Each family's `OFL.txt` comes from the `google/fonts` repository.
    None of the four declares a Reserved Font Name. Checked 2026-10-24 against the copyright line
    of each `OFL.txt` (The Barlow Project Authors 2017 for Barlow and Barlow Condensed, The Oswald
    Project Authors 2016, The VT323 Project Authors 2011); none carries a "with Reserved Font
    Name" clause. Today's modern fonts still
    come from the Google Fonts `@import`; self-hosting those is separate work.

### The base look (what every widget gets before its own pass)

With a vintage preset selected, every widget picks up these through the tokens it already reads,
plus two inherited properties the theme scope sets for all text inside it (`text-shadow:
var(--bc-shadow-text)` and `font-style: var(--bc-font-style)`; both are `none`/`normal` in
modern, so modern renders exactly as before). Values are taken from the mocks, softened where the
mock relied on structure a widget does not have yet (e.g. the 80s reverse-video on-camera row
keeps light text until the tower pass builds the reverse-video fill).

| Token | `vintage70` | `vintage80` |
|---|---|---|
| `--bc-font-display` | `'Barlow Condensed'`, Arial Narrow fallback | `'Oswald'`, Arial Narrow fallback |
| `--bc-font-ui` | `'Barlow'`, Helvetica/Arial fallback | `'VT323'`, Lucida Console/monospace fallback |
| `--bc-font-mono` | `'Barlow Condensed'` (tabular figures) | `'VT323'` |
| `--bc-font-style` (new; modern `normal`) | `italic` (the whole package leans) | `normal` |
| `--bc-text` / `-2` / `-3` / `-4` | gold `#FFB61C` / warm white `#FFF1C9` / `#E9D49A` / faint warm white | yellow-green `#DCEB3F` / CG white `#F4F3E6` / tan `#CDB98A` / faint CG white |
| `--bc-text-on-accent` | `#FFFFFF` (on the red bar) | `#0B0B06` (on the lime fill) |
| `--bc-accent` (+ `-soft`, `-glow`, `-line`) | ABC red `#E3241B` | Olivetti lime `#DCEB3F` |
| `--bc-oncam-text`, `--bc-oncam-bg`, `--bc-oncam-shadow` | white name over a flat red bar, no glow | light name over a flat lime-tinted bar, no glow |
| `--bc-plate-rgb`, `--bc-plate-dense-rgb`, `--bc-plate-solid` | black | black |
| `--bc-header-rgb` | black | Scoreboard red `216, 20, 28` |
| `--bc-plate`, `--bc-plate-dense`, `--bc-header` | re-declared from the inputs above (decision 5) | same |
| `--bc-blur` | `none` | `none` |
| `--bc-shadow-plate`, `--bc-shadow-soft` | `none` | hard `3px 3px 0 #000` / `none` |
| `--bc-radius`, `--bc-radius-chip` | `0` | `0` |
| `--bc-shadow-text` (new; modern `none`) | hard 4-step black extrusion plus a soft dark halo | 2px black outline plus a 1px drop and a soft halo |

Plates stay (black, square, unblurred) in the foundation. The period look is text keyed
straight over the picture; whether a given widget drops its plate for a feathered backing is that
widget's pass, because it depends on what sits behind its text.

### Fonts bundled

| Family | Faces | Used by |
|---|---|---|
| Barlow Condensed | italic 600, 700, 800, 900; normal 600, 700 | `vintage70` display + numerals |
| Barlow | italic 800, 900 | `vintage70` titles/labels |
| Oswald | normal 500, 600, 700 (static faces or one variable face spanning them) | `vintage80` display |
| VT323 | normal 400 | `vintage80` timing page, labels, numerals |

All four are SIL Open Font License 1.1.

### Convention for the per-widget passes (`how/renderer.md`)

A widget's vintage styling lives in that widget's own `<style>`, scoped by the theme attribute on
an ancestor: `:global([data-theme='vintage80']) .row.oncam { … }`. Keying off an ancestor
attribute (never `:root` alone) keeps it working in the `/config` preview. Prefer changing tokens
inside the widget's scope over hard-coding values, so a later custom theme (#359) can supply them.
A widget's type size may be re-tuned per preset by overriding its `--bc-size-*` tokens in that
scope (the tower measures names from those tokens), never its row height or box geometry. No
markup is forked per theme: structure stays one template, so behaviour cannot drift between
looks.

## Alternatives rejected

- **`:root[data-theme=…]` selectors only.** Simplest, but the `/config` preview is not the
  document root; the preview would need an iframe or its own document to show a preset.
- **Applying the theme to the `/config` page itself.** The editor would turn gold-on-black or
  VT323 while the broadcaster is filling in forms. A tool's chrome should not change with the
  output it edits.
- **A separate stylesheet per theme, swapped with a `<link>`.** Async load means a flash of the
  wrong look on every live-reload switch, and the preview could not show one theme while the page
  shows another.
- **Profile-only, no `?theme=`.** Leaves `/racecontrol` and `/onboard` permanently modern.
- **Loading vintage fonts from Google Fonts like today's modern fonts.** OBS may be offline; the
  look would silently fall back to Arial Narrow on air.
- **An `@fontsource` npm dependency.** Works, but the licence would not travel into `app/dist`
  and the packaged binary; vendoring the `woff2` files beside their `OFL.txt` in `public/` does.
- **Hard cuts for vintage in this pass.** Touches every widget's transition at once, before any
  widget's look is designed; per widget is reviewable.
- **A single `vintage` value.** The owner reviewed both mocks and asked for both decades.

## Consequences

- Additive config change: `configVersion` stays `"1"`; a profile without `theme.preset` renders
  `modern`. Orthogonal to `spec/v1`.
- Until each widget's pass lands, a vintage preset shows the base look above on modern widget
  structure. The release that ships the lever ships every widget's pass with it (epic #358).
- **Custom themes (#359) fit as another token set.** A custom theme is a validated map of the same
  token names (the test that every override names an existing modern token keeps the vocabulary
  closed), starting from one of the presets: `data-theme` keeps the base preset, and the custom
  values are applied as custom properties on the same theme scope element. No new mechanism.
- The tower's name-width measurement reads `--bc-font-display`; switching preset changes the
  measuring font and counts as a name-font load (decision 7's carve-out). The tower pass builds
  and tests the re-measure on a live theme switch.
- Three widgets set their own text glow on the on-camera name (`BattleBox.svelte`,
  `DriverLowerThird.svelte`, `QualifyingLowerThird.svelte`: `text-shadow: 0 0 12px
  var(--bc-accent-glow)`), which overrides the inherited preset shadow. Until their own passes,
  those names keep the glow (in the preset's accent colour).
- Behaviour: `overlay-config.md` rules 58–62; mechanism in `how/renderer.md` and
  `how/config-editor.md`.
