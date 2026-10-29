# Decision: self-host the modern fonts — Google's woff2 for Saira and JetBrains Mono, the original TTFs for Saira Condensed

**Issues:** #363 (epic #358) · **Milestone:** 0.16.0
**Status:** Accepted · **Date:** 2026-10-26 · Replaces the last sentence of ADR 0026 decision 10
("Today's modern fonts still come from the Google Fonts `@import`").

The `modern` preset's three typefaces (Saira Condensed for names and titles, Saira for labels,
JetBrains Mono for numerals) are served by battlecast from `app/public/fonts/<family>/`, as the
vintage faces already are (ADR 0026 decision 10). No page battlecast serves loads a font from
another origin.

## Context

`tokens/fonts.css` loaded the modern fonts with an `@import` from fonts.googleapis.com, and its
own header said to self-host them for production. ADR 0026 bundled the vintage faces and left
the modern ones on the CDN as separate work. `modern` is the default look, so an OBS machine
with no internet connection showed every default overlay in its fallback faces (Arial Narrow,
Helvetica Neue, the system monospace), and the packaged binary (ADR 0004) depended on the
network for its own default look.

The three families differ in one way that matters. Saira and JetBrains Mono carry no Reserved
Font Name. Saira Condensed's `OFL.txt` (google/fonts `ofl/sairacondensed`) reads "Copyright 2016
The Saira Project Authors (omnibus.type@gmail.com), with reserved font name "Saira"". Under the
SIL OFL a Modified Version may not use a Reserved Font Name without written permission. Google
Fonts serves Saira Condensed as subset files, and whether a subset is a Modified Version is
exactly the kind of question the OFL FAQ leaves to the copyright holder. Checked 2026-10-26: the
Saira `OFL.txt` (Copyright 2020 The Saira Project Authors) and the JetBrains Mono `OFL.txt`
(Copyright 2020 The JetBrains Mono Project Authors) carry no Reserved Font Name clause.

## Decision

1. **The same convention as the vintage faces.** Each modern family is a folder under
   `app/public/fonts/<family>/` with its `OFL.txt` from `google/fonts`, declared with `@font-face`
   in `tokens/fonts.css` with `font-display: swap` and an absolute same-origin `/fonts/…` URL.
   The `@import` is removed. Weights 400, 500, 600 and 700, upright only, as the `@import`
   requested. The modern look sets no italic on these families, and the editor's ⓘ glyph, the
   one italic, is set in Georgia.
2. **Saira and JetBrains Mono: Google Fonts' own woff2 files, unmodified.** They are the files
   the `@import` loaded, so the modern look renders the same glyphs offline as it did online.
   Both are variable fonts on Google Fonts: one file per subset spans 400–700, declared as
   `font-weight: 400 700`.
3. **Every subset Google served for them, not just latin and latin-ext.** The vintage faces
   bundle latin and latin-ext only. The modern faces are the default look and already rendered
   more: Vietnamese in Saira, Vietnamese, Greek, Cyrillic and Cyrillic Extended in JetBrains Mono.
   Dropping those would put driver names in those scripts into the fallback face on air, a
   regression the vintage faces never had to weigh. Each file keeps Google's `unicode-range`, so a
   browser downloads only the subsets the rendered text needs.
4. **Saira Condensed: the original TTFs from `google/fonts`, unmodified.** The four static files
   `SairaCondensed-{Regular,Medium,SemiBold,Bold}.ttf` (about 96 KB each), declared with
   `format('truetype')` and no `unicode-range`. Shipping the font exactly as its authors
   released it is not a Modified Version, so the Reserved Font Name cannot be in question, and
   the family keeps its name in our CSS. Each file holds the whole character set, so the subsets
   Google split it into (latin, latin-ext, Vietnamese) are all present.
5. **The companion server serves `.ttf` as `font/ttf`.** `server/lib/static.js` already maps
   `woff2`; without a `ttf` entry the files would go out as `application/octet-stream`, which
   browsers accept for fonts but which is the wrong type next to `X-Content-Type-Options: nosniff`.

## Consequences

- An offline OBS renders every preset in its own typeface, the default included, and the packaged
  binary needs no network for any look.
- The bundle grows by the modern files (Saira Condensed about 384 KB; Saira and JetBrains Mono a
  few hundred KB across their subsets). A face downloads only when rendered text uses it, so an
  overlay fetches only what it shows.
- `themeFonts.test.js` holds the delivery: every face each preset names, same-origin sources that
  exist, the right format per family, the licence beside the files, the script coverage of
  decision 3, and no reference to a remote font service anywhere in the app source.
- Two font formats now ship. The TTFs are larger than a woff2 conversion would be, which is the
  price of not modifying them.

## Alternatives considered

- **Google's woff2 subsets for Saira Condensed too.** One format for everything and smaller
  files, but it redistributes a possibly Modified Version under a Reserved Font Name. The owner
  chose not to rely on that.
- **Convert or subset Saira Condensed ourselves under a new family name.** The OFL allows it, but
  it is the most work, and the CSS family would no longer be Saira Condensed.
- **Latin and latin-ext only, like the vintage faces.** Smaller, but a visible regression for
  names in the scripts the CDN served (decision 3).
- **Keep the CDN with local copies as a fallback.** The `@import` would still be fetched first,
  and an offline load would wait on it; it keeps the network dependency this removes.
- **An npm package such as `@fontsource`.** Adds a dependency, and its files are its own builds,
  not the ones the modern look has been rendering.
