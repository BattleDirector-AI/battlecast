#!/usr/bin/env node
/* `battlecast serve` — the companion server entry point.
 *
 * Serves the built app (app/dist) with SPA fallback plus the config/asset API, so
 * a broadcaster runs ONE local process and points OBS Browser Sources at
 * http://localhost:<port>/all?profile=<name>&src=<producer>. Binds to localhost by
 * default (public exposure is a footgun — see the #32 research); pass --host to
 * expose it for rF2-style remote/multi-client control.
 *
 * Usage:
 *   node serve.js [--host <ip>] [--port <n>] [--data-dir <path>] [--dist-dir <path>]
 * Env overrides: HOST, PORT, DATA_DIR, DIST_DIR.
 */

import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './lib/createApp.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const DEFAULTS = {
  host: process.env.HOST || '127.0.0.1',
  // 7397 stays in the sim control-panel "_397" family (rF2 :5397, LMU :6397) but
  // sits above both so we never collide with the game we run alongside — rF2 holds
  // :5397 itself, so binding there fails with EACCES on a real broadcast machine.
  port: Number(process.env.PORT) || 7397,
  dataDir: process.env.DATA_DIR || path.resolve(process.cwd(), 'data'),
  distDir: process.env.DIST_DIR || path.resolve(HERE, '..', 'app', 'dist'),
}

function parseArgs(argv, base) {
  const opts = { ...base }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--host') opts.host = argv[++i]
    else if (arg === '--port') opts.port = Number(argv[++i])
    else if (arg === '--data-dir') opts.dataDir = path.resolve(argv[++i])
    else if (arg === '--dist-dir') opts.distDir = path.resolve(argv[++i])
    else if (arg === '--help' || arg === '-h') opts.help = true
    else {
      console.error(`[battlecast serve] unknown argument: ${arg}`)
      opts.help = true
    }
  }
  return opts
}

const HELP = `battlecast serve — companion server (static app + config/asset API)

Options:
  --host <ip>        interface to bind (default 127.0.0.1; use 0.0.0.0 for remote)
  --port <n>         port to listen on (default 7397)
  --data-dir <path>  where profiles/ and logos/ are stored (default ./data)
  --dist-dir <path>  built app to serve (default ../app/dist)
  -h, --help         show this help

Point OBS at:  http://<host>:<port>/all?profile=<name>&src=<producerUrl>
Config UI:     http://<host>:<port>/config
`

export function startServer(options = {}) {
  const opts = { ...DEFAULTS, ...options }
  const server = http.createServer(createApp({ dataDir: opts.dataDir, distDir: opts.distDir }))
  server.listen(opts.port, opts.host, () => {
    const shown = opts.host === '0.0.0.0' ? 'localhost' : opts.host
    console.log(`[battlecast serve] listening on http://${shown}:${opts.port}`)
    console.log(`[battlecast serve] data dir: ${opts.dataDir}`)
    console.log(`[battlecast serve] serving:  ${opts.distDir}`)
    if (opts.host === '0.0.0.0') {
      console.log('[battlecast serve] WARNING: bound to 0.0.0.0 — reachable from the network.')
    }
  })
  return server
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2), DEFAULTS)
  if (opts.help) {
    console.log(HELP)
  } else {
    startServer(opts)
  }
}
