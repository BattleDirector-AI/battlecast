/* Entry point for the packaged single-file build (`battlecast.exe`).
 *
 * Same server as `node server/serve.js` — this file only supplies what a
 * double-clicked binary cannot discover for itself:
 *   - the built overlay app, carried as an embedded asset map (no dist folder);
 *   - a data dir resolved NEXT TO THE EXECUTABLE, not from the working directory,
 *     so profiles/ and logos/ don't scatter into whatever folder Explorer used;
 *   - `--demo`, which starts the bundled reference mock producer on :8080 so a
 *     fresh download renders a live race with no producer configured.
 *
 * It must not add behavior the plain-Node path lacks (spec: what/companion-server.md).
 */

import http from 'node:http'
import path from 'node:path'
import { createApp } from '../server/lib/createApp.js'
import { EMBEDDED_DIST } from './build/embedded-dist.generated.js'

// The app's built-in DEFAULT_SRC (app/src/lib/sseClient.js). Demo mode
// binds the mock here so `/all` needs no ?src= at all.
const DEMO_PRODUCER_PORT = 8080

/** Where the running executable lives. Under a Bun-compiled binary `execPath` IS
 *  the .exe; under `bun run` / `node` it's the interpreter, so fall back to cwd
 *  the way `server/serve.js` does rather than writing next to bun.exe. */
function defaultDataDir() {
  const exe = process.execPath
  const base = path.basename(exe).toLowerCase()
  const isCompiled = Boolean(process.versions.bun) && base !== 'bun.exe' && base !== 'bun'
  return isCompiled ? path.join(path.dirname(exe), 'data') : path.resolve(process.cwd(), 'data')
}

const DEFAULTS = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT) || 7397,
  dataDir: process.env.DATA_DIR || defaultDataDir(),
  demo: false,
}

const HELP = `battlecast — broadcast overlay renderer for sim racing

Usage: battlecast.exe [options]

Options:
  --demo             also run the built-in demo race producer on :${DEMO_PRODUCER_PORT}
  --host <ip>        interface to bind (default 127.0.0.1; use 0.0.0.0 for remote)
  --port <n>         port to listen on (default 7397)
  --data-dir <path>  where profiles/ and logos/ are stored (default: data/ beside the exe)
  -h, --help         show this help

Add these as OBS Browser Sources (1920x1080):
  http://localhost:7397/all       every widget on one canvas
  http://localhost:7397/tower     standings tower only
  http://localhost:7397/battle    battle box only

Configure layout and logos at  http://localhost:7397/config
Point at a producer with       http://localhost:7397/all?src=http://<producer>/events
`

function parseArgs(argv, base) {
  const opts = { ...base }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--demo') opts.demo = true
    else if (arg === '--host') opts.host = argv[++i]
    else if (arg === '--port') opts.port = Number(argv[++i])
    else if (arg === '--data-dir') opts.dataDir = path.resolve(argv[++i])
    else if (arg === '--help' || arg === '-h') opts.help = true
    else {
      console.error(`[battlecast] unknown argument: ${arg}`)
      opts.help = true
    }
  }
  return opts
}

const opts = parseArgs(process.argv.slice(2), DEFAULTS)

if (opts.help) {
  console.log(HELP)
} else {
  if (opts.demo) {
    // Loaded on demand: a normal broadcast never pays for the race simulator.
    const mock = await import('../producers/mock/server.js')
    mock.default.runSimulateMode({ port: DEMO_PRODUCER_PORT })
  }

  const server = http.createServer(createApp({ dataDir: opts.dataDir, embedded: EMBEDDED_DIST }))
  server.listen(opts.port, opts.host, () => {
    const shown = opts.host === '0.0.0.0' ? 'localhost' : opts.host
    const origin = `http://${shown}:${opts.port}`
    console.log('')
    console.log(`  battlecast is running at ${origin}`)
    console.log('')
    console.log('  OBS Browser Sources (1920x1080):')
    console.log(`    ${origin}/all      every widget on one canvas`)
    console.log(`    ${origin}/tower    standings tower only`)
    console.log(`    ${origin}/battle   battle box only`)
    console.log('')
    console.log(`  Config UI:  ${origin}/config`)
    console.log(`  Data dir:   ${opts.dataDir}`)
    if (opts.demo) {
      console.log('')
      console.log(`  DEMO: simulated race on http://localhost:${DEMO_PRODUCER_PORT}/events`)
      console.log(`  Open ${origin}/all — it connects to the demo feed by default.`)
    } else {
      console.log('')
      console.log('  No producer configured. Start one, then set it in /config,')
      console.log(`  or run with --demo to watch a simulated race.`)
    }
    if (opts.host === '0.0.0.0') {
      console.log('')
      console.log('  WARNING: bound to 0.0.0.0 — the config API is reachable from the network.')
    }
    console.log('')
    console.log('  Press Ctrl+C to stop.')
    console.log('')
  })

  // A double-clicked console window has no shell to report a bind failure, so say
  // it plainly instead of dumping an unhandled EADDRINUSE stack.
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  ERROR: port ${opts.port} is already in use.`)
      console.error(`  Another battlecast may be running. Try: battlecast.exe --port 7398\n`)
    } else {
      console.error(`\n  ERROR: ${err.message}\n`)
    }
    process.exit(1)
  })
}
