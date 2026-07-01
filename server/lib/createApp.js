/* battlecast companion server — request router.
 *
 * The WRITE/SERVE side of the overlay-config contract (#34), counterpart to the
 * app's read side (#16). Serves the built app with SPA fallback, persists config
 * profiles, and stores/serves uploaded logo images. Same-origin as the render page
 * (no CORS). Pure Node built-ins, no dependencies (matches producers/mock).
 *
 * Routes:
 *   GET    /api/profiles            -> { profiles: [name, ...] }
 *   GET    /api/profiles/:name      -> profile JSON | 404
 *   PUT    /api/profiles/:name      -> save profile (JSON body) -> 200/201
 *   POST   /api/profiles/:name      -> alias of PUT
 *   GET    /api/logos               -> { logos: [{ name, url, size }, ...] }
 *   POST   /api/logos               -> upload image (multipart, or raw + ?name=)
 *   DELETE /api/logos/:file         -> delete image -> 200/404
 *   GET    /logos/:file             -> serve image bytes
 *   *                               -> static app (dist) with SPA fallback
 */

import { createProfileStore } from './profiles.js'
import { createLogoStore } from './logos.js'
import { createStaticHandler } from './static.js'
import { parseMultipart, boundaryFromContentType, firstFilePart } from './multipart.js'
import {
  assertProfileName,
  assertProfileBody,
  sanitizeLogoFilename,
  MAX_UPLOAD_BYTES,
  ValidationError,
} from './validation.js'
import { sendJson, sendError, readBody } from './respond.js'

const MAX_PROFILE_BYTES = 256 * 1024 // config JSON is a few KB; 256 KiB is ample
const UPLOAD_ENVELOPE_SLACK = 64 * 1024 // room for multipart headers/boundary

// Served logo assets are untrusted uploads. SVG is an active-content format, so a
// directly-navigated `/logos/evil.svg` could otherwise run script in this origin.
// `nosniff` + a locked-down CSP (no script, no fetch, sandboxed) neutralizes that
// while still allowing the images to render via `<img>` in the overlay.
const ASSET_SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
})

/** decodeURIComponent that maps malformed input to a 400 (not a 500). */
function safeDecode(segment) {
  try {
    return decodeURIComponent(segment)
  } catch {
    throw new ValidationError('malformed percent-encoding in path')
  }
}

export function createApp({ dataDir, distDir } = {}) {
  if (!dataDir) throw new Error('createApp requires a dataDir')
  const profiles = createProfileStore(dataDir)
  const logos = createLogoStore(dataDir)
  const serveStatic = createStaticHandler(distDir)

  async function handleProfiles(req, res, url) {
    if (url.pathname === '/api/profiles') {
      if (req.method !== 'GET') return methodNotAllowed(res, 'GET')
      return sendJson(res, 200, { profiles: await profiles.list() })
    }

    const name = assertProfileName(safeDecode(url.pathname.slice('/api/profiles/'.length)))

    if (req.method === 'GET') {
      const profile = await profiles.read(name)
      if (!profile) return sendError(res, 404, `no such profile "${name}"`)
      return sendJson(res, 200, profile)
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readBody(req, MAX_PROFILE_BYTES)
      let parsed
      try {
        parsed = JSON.parse(body.toString('utf8'))
      } catch {
        throw new ValidationError('profile body must be valid JSON')
      }
      assertProfileBody(parsed)
      const existed = await profiles.write(name, parsed)
      return sendJson(res, existed ? 200 : 201, { name, saved: true })
    }
    return methodNotAllowed(res, 'GET, PUT, POST')
  }

  async function handleLogosCollection(req, res, url) {
    if (req.method === 'GET') {
      return sendJson(res, 200, { logos: await logos.list() })
    }
    if (req.method !== 'POST') return methodNotAllowed(res, 'GET, POST')

    const contentType = req.headers['content-type'] || ''
    let filename
    let data

    if (contentType.toLowerCase().startsWith('multipart/form-data')) {
      const boundary = boundaryFromContentType(contentType)
      if (!boundary) throw new ValidationError('malformed multipart/form-data (no boundary)')
      const body = await readBody(req, MAX_UPLOAD_BYTES + UPLOAD_ENVELOPE_SLACK)
      const file = firstFilePart(parseMultipart(body, boundary))
      if (!file) throw new ValidationError('no file part in upload')
      filename = url.searchParams.get('name') || file.filename
      data = file.data
    } else {
      // Raw-body fallback: POST the image bytes directly with ?name=<file>.
      filename = url.searchParams.get('name')
      if (!filename) throw new ValidationError('raw upload requires a ?name=<filename> query param')
      data = await readBody(req, MAX_UPLOAD_BYTES + UPLOAD_ENVELOPE_SLACK)
    }

    const safe = sanitizeLogoFilename(filename)
    if (data.length > MAX_UPLOAD_BYTES) {
      return sendError(res, 413, `image exceeds the ${MAX_UPLOAD_BYTES}-byte limit`)
    }
    if (data.length === 0) throw new ValidationError('uploaded image is empty')

    const saved = await logos.save(safe, data)
    return sendJson(res, 201, saved)
  }

  async function handleLogoItem(req, res, url, rawName) {
    const name = sanitizeLogoFilename(safeDecode(rawName))
    if (req.method === 'DELETE') {
      const removed = await logos.remove(name)
      if (!removed) return sendError(res, 404, `no such logo "${name}"`)
      return sendJson(res, 200, { name, deleted: true })
    }
    return methodNotAllowed(res, 'DELETE')
  }

  async function handleLogoAsset(req, res, rawName) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return methodNotAllowed(res, 'GET')
    const name = sanitizeLogoFilename(safeDecode(rawName))
    const asset = await logos.read(name)
    if (!asset) return sendError(res, 404, `no such logo "${name}"`)
    res.writeHead(200, {
      'Content-Type': asset.contentType,
      'Content-Length': asset.data.length,
      'Cache-Control': 'no-cache',
      ...ASSET_SECURITY_HEADERS,
    })
    res.end(req.method === 'HEAD' ? undefined : asset.data)
  }

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost')
      const { pathname } = url

      if (pathname === '/api/profiles' || pathname.startsWith('/api/profiles/')) {
        return await handleProfiles(req, res, url)
      }
      if (pathname === '/api/logos') {
        return await handleLogosCollection(req, res, url)
      }
      const logoItem = /^\/api\/logos\/([^/]+)$/.exec(pathname)
      if (logoItem) return await handleLogoItem(req, res, url, logoItem[1])

      const logoAsset = /^\/logos\/([^/]+)$/.exec(pathname)
      if (logoAsset) return await handleLogoAsset(req, res, logoAsset[1])

      return await serveStatic(req, res, pathname)
    } catch (err) {
      if (err instanceof ValidationError) return sendError(res, 400, err.message)
      if (err && err.code === 'TOO_LARGE') return sendError(res, 413, 'payload too large')
      console.error('[battlecast serve] unhandled error:', err)
      return sendError(res, 500, 'internal server error')
    }
  }
}

function methodNotAllowed(res, allow) {
  res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', Allow: allow })
  res.end(JSON.stringify({ error: 'method not allowed' }))
}
