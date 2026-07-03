/* Pure editor operations over an overlay config (#34 config UI). Each returns a
 * NEW normalized config, so the Svelte editor can assign the result to `$state`
 * and stay reactive, and so the logic is trivially unit-testable without a DOM.
 * The config shape is the contract from app/src/lib/overlayConfig.js. */

import { normalizeConfig, MIN_CANVAS } from './overlayConfig.js'

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

/** Set one geometry/visibility/z field on a widget. */
export function setWidgetField(config, key, field, value) {
  const next = normalizeConfig(config)
  if (!next.widgets[key]) return next
  next.widgets[key] = clampGeometry({ ...next.widgets[key], [field]: value }, next.canvas)
  return next
}

/** Move a widget to an absolute (x, y), clamped onto the canvas. */
export function moveWidget(config, key, x, y) {
  const next = normalizeConfig(config)
  if (!next.widgets[key]) return next
  next.widgets[key] = clampGeometry({ ...next.widgets[key], x, y }, next.canvas)
  return next
}

/** Resize a widget to (w, h), clamped. */
export function resizeWidget(config, key, w, h) {
  const next = normalizeConfig(config)
  if (!next.widgets[key]) return next
  next.widgets[key] = clampGeometry({ ...next.widgets[key], w, h }, next.canvas)
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
