/* Static file serving for the built app (`app/dist`) with SPA fallback.
 *
 * battlecast selects widgets by pathname (/tower, /battle, /all, /logos, /config),
 * and none of those have their own HTML file — a naive static host 404s on them.
 * So any request that isn't an existing file and has no extension is served
 * index.html, letting the client router take over. This is the reason a plain
 * static drop needs *something* with SPA fallback in front of it (see #32 ADR).
 *
 * Two asset sources, resolved in this order:
 *   1. `distDir` on disk — the normal checkout/`battlecast serve` path.
 *   2. `embedded` — an optional { "<url path>": "<base64>" } map, how the packaged
 *      single-file binary carries the built app with no dist folder to point at.
 * Disk wins so a dev rebuild is never shadowed by a stale generated map. */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { sendText } from './respond.js'

const STATIC_TYPES = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  txt: 'text/plain; charset=utf-8',
}

function typeFor(file) {
  const ext = path.extname(file).slice(1).toLowerCase()
  return STATIC_TYPES[ext] || 'application/octet-stream'
}

/** Wrap the base64 asset map in a lazy, memoized byte lookup. Decoding all of
 *  `app/dist` up front would cost startup time and RSS for files most broadcasts
 *  never request, so each entry is decoded on its first hit and then cached. */
function createEmbeddedSource(embedded) {
  if (!embedded) return null
  const entries = embedded instanceof Map ? embedded : new Map(Object.entries(embedded))
  if (entries.size === 0) return null
  const decoded = new Map()

  return function readEmbedded(key) {
    if (decoded.has(key)) return decoded.get(key)
    const raw = entries.get(key)
    if (raw === undefined) return null
    // Already bytes (a build could embed Buffers directly); otherwise base64 text.
    const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'base64')
    decoded.set(key, bytes)
    return bytes
  }
}

export function createStaticHandler(distDir, embedded) {
  const root = distDir ? path.resolve(distDir) : null
  const indexPath = root ? path.join(root, 'index.html') : null
  const readEmbedded = createEmbeddedSource(embedded)

  /** Resolve a request pathname to an absolute path inside `root`, or null if it
   *  would escape (path traversal) or `root` is unset. */
  function resolveInRoot(pathname) {
    if (!root) return null
    let decoded
    try {
      decoded = decodeURIComponent(pathname)
    } catch {
      return null
    }
    const full = path.resolve(root, `.${decoded}`)
    if (full !== root && !full.startsWith(root + path.sep)) return null
    return full
  }

  async function readFileOrNull(file) {
    try {
      const stat = await fs.stat(file)
      if (!stat.isFile()) return null
      return await fs.readFile(file)
    } catch {
      return null
    }
  }

  /** Normalize a request pathname to an embedded map key. Keys are literal URL
   *  paths ("/assets/app.js"), so traversal has no meaning — a "../" segment
   *  simply fails to match any key. Decoding failures are non-fatal: fall back to
   *  the raw pathname rather than throwing. */
  function embeddedKey(pathname) {
    let key = pathname
    try {
      key = decodeURIComponent(pathname)
    } catch {
      /* keep the raw pathname; it just won't match a key */
    }
    return key.startsWith('/') ? key : `/${key}`
  }

  /** Exact-file lookup across both sources, disk first. */
  async function readAsset(pathname) {
    const target = resolveInRoot(pathname)
    if (target) {
      const file = await readFileOrNull(target)
      if (file) return { bytes: file, type: typeFor(target) }
    }
    if (readEmbedded) {
      const key = embeddedKey(pathname)
      const bytes = readEmbedded(key)
      if (bytes) return { bytes, type: typeFor(key) }
    }
    return null
  }

  /** The SPA fallback document, from disk first then the embedded map. */
  async function readIndex() {
    if (indexPath) {
      const file = await readFileOrNull(indexPath)
      if (file) return file
    }
    if (readEmbedded) return readEmbedded('/index.html')
    return null
  }

  function sendAsset(req, res, bytes, type) {
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': bytes.length,
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(req.method === 'HEAD' ? undefined : bytes)
  }

  return async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, 'Method Not Allowed\n')
      return
    }

    // Try the exact file first.
    const asset = await readAsset(pathname)
    if (asset) {
      sendAsset(req, res, asset.bytes, asset.type)
      return
    }

    // SPA fallback: extensionless path -> index.html (client route).
    const hasExtension = path.extname(pathname) !== ''
    if (!hasExtension) {
      const index = await readIndex()
      if (index) {
        sendAsset(req, res, index, STATIC_TYPES.html)
        return
      }
      // Only a configured-but-unbuilt dist earns the actionable hint; with no
      // asset source at all a plain 404 is the honest answer.
      if (indexPath) {
        sendText(res, 503, 'battlecast app is not built. Run `npm run build` in app/ first.\n')
        return
      }
    }

    sendText(res, 404, 'Not Found\n')
  }
}
