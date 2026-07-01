/* Input validation for the companion server's write surface. The server binds to
 * localhost by default, but these guards still matter: they keep a malicious or
 * buggy client from escaping the data dir (path traversal) or filling it with
 * non-image junk. */

/** Max accepted logo upload size. Sponsor PNGs are small; 5 MiB is generous. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/** Allowed logo image types: extension -> served Content-Type. */
export const IMAGE_TYPES = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
})

/** Content-Type for a stored file's extension, or null if not an allowed image. */
export function contentTypeForFile(filename) {
  const ext = extname(filename)
  return IMAGE_TYPES[ext] || null
}

/** Lowercased extension without the dot, or '' if none. */
export function extname(filename) {
  const i = String(filename).lastIndexOf('.')
  return i >= 0 ? String(filename).slice(i + 1).toLowerCase() : ''
}

/**
 * Sanitize an uploaded filename to a safe stored name, or throw. Strips any path
 * components (so `../../etc/passwd` and `C:\x\y.png` reduce to their basename),
 * lowercases the extension, and restricts the stem to `[a-z0-9._-]`. Rejects names
 * that aren't an allowed image type.
 */
export function sanitizeLogoFilename(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ValidationError('filename is required')
  }
  // Basename only — drop everything up to the last / or \.
  const base = raw.split(/[/\\]/).pop().trim()
  const ext = extname(base)
  if (!IMAGE_TYPES[ext]) {
    throw new ValidationError(`unsupported image type ".${ext}" (allowed: ${Object.keys(IMAGE_TYPES).join(', ')})`)
  }
  const stem = base.slice(0, base.length - ext.length - 1)
  const safeStem = stem.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/^[.]+/, '')
  if (!safeStem) throw new ValidationError('filename has no usable name')
  return `${safeStem}.${ext}`
}

/**
 * Validate a profile name for use as `data/profiles/<name>.json`. Allows
 * `[A-Za-z0-9_-]`, 1-64 chars — no dots or separators, so it can never traverse
 * out of the profiles dir. Returns the name or throws.
 */
export function assertProfileName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(name)) {
    throw new ValidationError('profile name must be 1-64 chars of A-Z, a-z, 0-9, hyphen or underscore')
  }
  return name
}

/** Validate that a parsed profile body is a plausible overlay config. Kept
 *  deliberately loose (the app's normalizeConfig is the real reader) — we only
 *  reject clearly-wrong shapes so a typo can't persist as a profile. */
export function assertProfileBody(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new ValidationError('profile body must be a JSON object')
  }
  if (obj.widgets != null && (typeof obj.widgets !== 'object' || Array.isArray(obj.widgets))) {
    throw new ValidationError('profile.widgets must be an object when present')
  }
  return obj
}

/** Error type the router maps to a 4xx JSON response. */
export class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ValidationError'
  }
}
