/* Pure editor operations over an overlay config (#34 config UI). Each returns a
 * NEW normalized config, so the Svelte editor can assign the result to `$state`
 * and stay reactive, and so the logic is trivially unit-testable without a DOM.
 * The config shape is the contract from app/src/lib/overlayConfig.js. */

import {
  normalizeConfig,
  normalizeClassColors,
  MIN_CANVAS,
  TEXT_SCALES,
  textScaleFactor,
  rendersText,
} from './overlayConfig.js'

/** Clamp a widget's geometry so it stays a sane box within the given canvas. */
function clampGeometry(w, canvas) {
  const width = Math.max(16, Math.min(w.w, canvas.w))
  const height = Math.max(16, Math.min(w.h, canvas.h))
  return {
    ...w,
    w: width,
    h: height,
    x: Math.max(0, Math.min(w.x, canvas.w - width)),
    y: Math.max(0, Math.min(w.y, canvas.h - height)),
  }
}

/** A widget at a bigger text preset remembers its `normal` x/w (`textScaleOrigin`,
 *  overlay-config.md rule 41a). After an editor geometry edit, move ONLY the part of the origin
 *  the broadcaster asked to change: a new x moves the origin's x, a new w moves the origin's w
 *  (÷ the factor). A vertical-only drag, a zero-pixel jitter, a height resize, or an x the
 *  keep-on-canvas clamp moved on its own leaves the origin alone. */
function trackOrigin(prev, placed, { x = false, w = false }) {
  if (placed.textScale === 'normal' || !placed.textScaleOrigin) return placed
  const origin = { ...placed.textScaleOrigin }
  if (x && placed.x !== prev.x) origin.x = placed.x
  if (w && placed.w !== prev.w) origin.w = Math.round(placed.w / textScaleFactor(placed.textScale))
  return { ...placed, textScaleOrigin: origin }
}

/** Set one geometry/visibility/z field on a widget. */
export function setWidgetField(config, key, field, value) {
  const next = normalizeConfig(config)
  if (!next.widgets[key]) return next
  const prev = next.widgets[key]
  const placed = clampGeometry({ ...prev, [field]: value }, next.canvas)
  next.widgets[key] = trackOrigin(prev, placed, { x: field === 'x', w: field === 'w' })
  return next
}

/** Set a widget's text-size preset (overlay-config.md rule 41). Leaving `normal` records the
 *  widget's normal x/w as `textScaleOrigin`; every bigger preset is computed from that origin
 *  (never chained from the previous preset, so no rounding drift), then kept on canvas; going
 *  back to `normal` restores the origin exactly and drops it. y/h never change. */
export function setWidgetTextScale(config, key, preset) {
  const next = normalizeConfig(config)
  const w = next.widgets[key]
  if (!w || !rendersText(key) || !Object.prototype.hasOwnProperty.call(TEXT_SCALES, preset)) return next
  if (preset === w.textScale) return next
  // A profile can reach a bigger preset without an origin (hand-edited, or saved before
  // origins existed): derive one from the current geometry.
  const origin =
    w.textScale === 'normal'
      ? { x: w.x, w: w.w }
      : w.textScaleOrigin ?? { x: w.x, w: Math.round(w.w / textScaleFactor(w.textScale)) }
  const rest = { ...w }
  delete rest.textScaleOrigin
  next.widgets[key] =
    preset === 'normal'
      ? clampGeometry({ ...rest, textScale: 'normal', x: origin.x, w: origin.w }, next.canvas)
      : clampGeometry(
          {
            ...rest,
            textScale: preset,
            x: origin.x,
            w: Math.round(origin.w * textScaleFactor(preset)),
            textScaleOrigin: origin,
          },
          next.canvas,
        )
  return next
}

/** Move a widget to an absolute (x, y), clamped onto the canvas. */
export function moveWidget(config, key, x, y) {
  const next = normalizeConfig(config)
  if (!next.widgets[key]) return next
  const prev = next.widgets[key]
  next.widgets[key] = trackOrigin(prev, clampGeometry({ ...prev, x, y }, next.canvas), { x: true })
  return next
}

/** Resize a widget to (w, h), clamped. */
export function resizeWidget(config, key, w, h) {
  const next = normalizeConfig(config)
  if (!next.widgets[key]) return next
  const prev = next.widgets[key]
  next.widgets[key] = trackOrigin(prev, clampGeometry({ ...prev, w, h }, next.canvas), { w: true })
  return next
}

/** Resize the canvas (patch `{ w?, h? }`), then re-clamp every widget so nothing
 *  is left hanging off a now-smaller canvas. */
export function setCanvas(config, patch) {
  const next = normalizeConfig(config)
  const toEdge = (v, fallback) => {
    // Treat blank/absent as "keep current" so clearing the field mid-edit doesn't
    // snap the canvas (and every widget) down to the minimum.
    if (v == null || v === '') return Math.max(MIN_CANVAS, Math.round(fallback))
    const n = Number(v)
    return Math.max(MIN_CANVAS, Math.round(Number.isFinite(n) ? n : fallback))
  }
  const canvas = {
    w: toEdge(patch?.w, next.canvas.w),
    h: toEdge(patch?.h, next.canvas.h),
  }
  next.canvas = canvas
  for (const key of Object.keys(next.widgets)) {
    next.widgets[key] = clampGeometry(next.widgets[key], canvas)
  }
  return next
}

export function setWidgetVisible(config, key, visible) {
  return setWidgetField(config, key, 'visible', !!visible)
}

/** Toggle a widget's opt-in auto-hide (only meaningful for widgets that support it). */
export function setWidgetHideWhenIdle(config, key, hide) {
  return setWidgetField(config, key, 'hideWhenIdle', !!hide)
}

/** Patch the logoRotation block (perSlotSeconds, order, images). */
export function setLogoRotation(config, patch) {
  const next = normalizeConfig(config)
  next.logoRotation = { ...next.logoRotation, ...patch }
  return next
}

export function addLogoImage(config, url) {
  const next = normalizeConfig(config)
  const images = [...(next.logoRotation.images || [])]
  if (url && typeof url === 'string' && !images.includes(url)) images.push(url)
  next.logoRotation = { ...next.logoRotation, images }
  return next
}

export function removeLogoImage(config, url) {
  const next = normalizeConfig(config)
  next.logoRotation = {
    ...next.logoRotation,
    images: (next.logoRotation.images || []).filter((u) => u !== url),
  }
  return next
}

/** Reorder the image at `index` by `delta` (+1 down / -1 up); no-op at the edges. */
export function moveLogoImage(config, index, delta) {
  const next = normalizeConfig(config)
  const images = [...(next.logoRotation.images || [])]
  const target = index + delta
  if (index < 0 || index >= images.length || target < 0 || target >= images.length) return next
  ;[images[index], images[target]] = [images[target], images[index]]
  next.logoRotation = { ...next.logoRotation, images }
  return next
}

export function setProducerSrc(config, src) {
  const next = normalizeConfig(config)
  next.producer = { ...next.producer, src: src || '' }
  return next
}

/** Add or edit a freeform class-color override (rules 32-33, ADR 0010). `className` is
 *  normalized by `normalizeConfig` on the way out, so editing an existing class
 *  (any casing/whitespace) overwrites its one entry rather than adding a second. A
 *  malformed `hex` is silently dropped by that same normalization. */
export function setClassColor(config, className, hex) {
  const next = normalizeConfig(config)
  next.theme = {
    ...next.theme,
    classColors: normalizeClassColors({ ...next.theme.classColors, [className]: hex }),
  }
  return next
}

/** Remove one class-color override, leaving the others untouched. */
export function removeClassColor(config, className) {
  const next = normalizeConfig(config)
  const key = String(className ?? '').trim().toLowerCase()
  const classColors = { ...next.theme.classColors }
  delete classColors[key]
  next.theme = { ...next.theme, classColors }
  return next
}

export function setProfileName(config, name) {
  const next = normalizeConfig(config)
  next.name = String(name || '')
  return next
}

/**
 * Build the OBS Browser Source URL for a saved profile:
 * `<origin>/all?profile=<name>&src=<producer>`. Omits params that are empty.
 */
export function buildObsUrl({ origin = '', profileName = '', producerSrc = '' } = {}) {
  const params = new URLSearchParams()
  if (profileName) params.set('profile', profileName)
  if (producerSrc) params.set('src', producerSrc)
  const qs = params.toString()
  return `${origin}/all${qs ? `?${qs}` : ''}`
}
