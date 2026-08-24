#!/usr/bin/env node
/* Compile the packaged Windows binary.
 *
 *   node packaging/build-exe.mjs [--out <file>] [--skip-app-build]
 *
 * Steps: build the overlay app -> embed app/dist as a JS module -> `bun build
 * --compile` the entry into a self-contained .exe.
 *
 * Bun is a BUILD-TIME tool only. Nothing shipped depends on it: `server/` and
 * `producers/mock/` stay zero-dependency Node, and `bun --compile` cross-targets
 * Windows from any host, so CI needs one Linux runner rather than a Windows one.
 */

import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { embedDist } from './embed-dist.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')
const BUILD = path.join(HERE, 'build')

const TARGET = 'bun-windows-x64'
const DEFAULT_OUT = path.join(BUILD, 'battlecast.exe')

function parseArgs(argv) {
  const opts = { out: DEFAULT_OUT, skipAppBuild: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') opts.out = path.resolve(argv[++i])
    else if (argv[i] === '--skip-app-build') opts.skipAppBuild = true
    else throw new Error(`unknown argument: ${argv[i]}`)
  }
  return opts
}

function run(cmd, args, cwd) {
  const label = `${cmd} ${args.join(' ')}`
  console.log(`[build-exe] ${label}`)
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (res.error) throw res.error
  if (res.status !== 0) throw new Error(`\`${label}\` exited ${res.status}`)
}

const opts = parseArgs(process.argv.slice(2))

if (!opts.skipAppBuild) {
  run('npm', ['--prefix', 'app', 'run', 'build'], REPO)
}

const embedded = await embedDist()
console.log(
  `[build-exe] embedded ${embedded.files} files (${(embedded.totalBytes / 1024).toFixed(1)} KiB)`,
)

await fs.mkdir(path.dirname(opts.out), { recursive: true })
run(
  'bun',
  [
    'build',
    path.relative(REPO, path.join(HERE, 'entry.js')).split(path.sep).join('/'),
    '--compile',
    `--target=${TARGET}`,
    '--outfile',
    opts.out,
  ],
  REPO,
)

const { size } = await fs.stat(opts.out)
console.log(`[build-exe] ${opts.out} (${(size / 1024 / 1024).toFixed(1)} MiB)`)
