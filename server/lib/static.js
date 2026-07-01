/* Static file serving for the built app (`app/dist`) with SPA fallback.
 *
 * battlecast selects widgets by pathname (/tower, /battle, /all, /logos, /config),
 * and none of those have their own HTML file — a naive static host 404s on them.
 * So any request that isn't an existing file and has no extension is served
 * index.html, letting the client router take over. This is the reason a plain
 * static drop needs *something* with SPA fallback in front of it (see #32 ADR). */

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

export function createStaticHandler(distDir) {
  const root = distDir ? path.resolve(distDir) : null
  const indexPath = root ? path.join(root, 'index.html') : null

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

  return async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, 'Method Not Allowed\n')
      return
    }

    // Try the exact file first.
    const target = resolveInRoot(pathname)
    if (target) {
      const file = await readFileOrNull(target)
      if (file) {
        res.writeHead(200, { 'Content-Type': typeFor(target), 'Content-Length': file.length })
        res.end(req.method === 'HEAD' ? undefined : file)
        return
      }
    }

    // SPA fallback: extensionless path -> index.html (client route).
    const hasExtension = path.extname(pathname) !== ''
    if (!hasExtension && indexPath) {
      const index = await readFileOrNull(indexPath)
      if (index) {
        res.writeHead(200, { 'Content-Type': STATIC_TYPES.html, 'Content-Length': index.length })
        res.end(req.method === 'HEAD' ? undefined : index)
        return
      }
      // No build present — give an actionable hint rather than a bare 404.
      sendText(res, 503, 'battlecast app is not built. Run `npm run build` in app/ first.\n')
      return
    }

    sendText(res, 404, 'Not Found\n')
  }
}
