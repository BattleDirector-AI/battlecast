#!/usr/bin/env node
/* Dev-stack launcher — starts the three processes a broadcaster runs locally and
 * streams their output under labeled, colored prefixes:
 *
 *   server  companion server (config/asset API)   http://127.0.0.1:7397
 *   mock    reference SSE producer (simulated)     http://localhost:8080/events
 *   app     Vite dev server (overlays + /config)   http://localhost:5173
 *
 * Vite proxies /api and /logos/ to the companion server (see app/vite.config.js),
 * so /config's Save/upload work in dev. Ctrl+C tears the whole stack down; if any
 * child dies, the rest are stopped so you never end up with orphans.
 *
 * Zero dependencies — just Node's child_process, matching the repo's ethos. Run
 * via `make dev` or `node scripts/dev.mjs`.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'

// ANSI colors keep three interleaved logs readable.
const COLORS = { server: '\x1b[36m', mock: '\x1b[35m', app: '\x1b[32m' }
const RESET = '\x1b[0m'
const DIM = '\x1b[2m'

// Every child is a direct `node` process (no shell, no npm wrapper) so each is a
// first-class child we can reap cleanly — a shell/npm wrapper would leave Vite as
// an orphaned grandchild if the stack tears down while npm is still starting it.
const PROCS = [
  {
    name: 'server',
    args: ['server/serve.js'],
    // Keep dev profiles/logos out of the tree (server/.gitignore ignores data/).
    env: { DATA_DIR: path.join(ROOT, 'server', 'data') },
  },
  {
    name: 'mock',
    args: ['producers/mock/server.js', 'simulate'],
  },
  {
    name: 'app',
    // Run Vite straight from its bin so it's our direct child; absolute path since
    // cwd is app/ (so Vite finds app/vite.config.js), and the other procs' args are
    // relative to ROOT.
    args: [path.join(ROOT, 'app', 'node_modules', 'vite', 'bin', 'vite.js')],
    cwd: path.join(ROOT, 'app'),
  },
]

const children = []
let shuttingDown = false

function label(name) {
  return `${COLORS[name] || ''}${name.padEnd(6)}${RESET} ${DIM}|${RESET} `
}

/** Split a chunk into lines and re-emit each with the process's label prefix. */
function pipeLabeled(stream, name, out) {
  let buffer = ''
  stream.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) out.write(`${label(name)}${line}\n`)
  })
  stream.on('end', () => {
    if (buffer) out.write(`${label(name)}${buffer}\n`)
  })
}

function killChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  // Each child is a direct node process, so child.kill() reaps it — but on Windows
  // taskkill /T also cleans any descendants (e.g. Vite's esbuild service), which a
  // bare kill would leave behind.
  if (isWin) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).on('error', () => {})
  } else {
    child.kill()
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) killChild(child)
  // Give children a beat to exit on their own before we bail.
  setTimeout(() => process.exit(code), 300)
}

for (const proc of PROCS) {
  const child = spawn(process.execPath, proc.args, {
    cwd: proc.cwd ?? ROOT,
    env: { ...process.env, ...proc.env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  pipeLabeled(child.stdout, proc.name, process.stdout)
  pipeLabeled(child.stderr, proc.name, process.stderr)

  child.on('error', (err) => {
    process.stderr.write(`${label(proc.name)}failed to start: ${err.message}\n`)
    shutdown(1)
  })
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    process.stderr.write(`${label(proc.name)}exited (${signal || code}); stopping stack\n`)
    shutdown(code ?? 0)
  })
}

process.stdout.write(`${DIM}dev stack up — app http://localhost:5173  ·  Ctrl+C to stop${RESET}\n`)
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
