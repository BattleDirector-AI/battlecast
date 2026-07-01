# Changelog

All notable changes to battlecast will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Configurable `/all` layout (#16)** — the `/all` overlay now honors a per-profile
  layout config instead of a hardcoded side-by-side arrangement. A new
  `loadConfig()` loader (`app/src/lib/overlayConfig.js`) resolves the layout with
  precedence **explicit URL params → fetched profile JSON (`?profile=<name>` →
  `/api/profiles/<name>`, falling back to `/config/<name>.json`) → built-in
  default**, so existing `/all` users are unbroken. This is the read side of the
  overlay-config contract pinned by the #32 decision — the source of truth for the
  `configVersion: "1"` shape (per-widget `{visible, x, y, w, h, z}` geometry on a
  fixed 1920×1080 canvas, `logoRotation`, `producer`, `theme`) that #33 and #34
  build against. Widgets can be positioned, sized, hidden, and z-ordered; `?show=`/
  `?hide=` URL params toggle a widget without editing the profile.
