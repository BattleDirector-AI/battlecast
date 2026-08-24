#!/usr/bin/env node
/* Turn the built overlay app (`app/dist`) into a single JS module the packaged
 * binary can carry, so `battlecast.exe` needs no dist folder beside it.
 *
 * Emits `packaging/build/embedded-dist.generated.js`, exporting a plain object of
 * URL path -> base64 payload. Base64 (not a Buffer literal) keeps the generated
 * file valid, diffable-in-principle JS that any bundler can inline verbatim.
 *
 * Generated, gitignored, and rebuilt on every packaged build — never edited, and
 * never imported by `server/`, which must stay runnable under plain Node with no
 * generated files present (see .ai/spec/what/companion-server.md).
 *
 * Usage: node packaging/embed-dist.mjs [--dist <dir>] [--out <file>]
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')

const DEFAULT_DIST = path.join(REPO, 'app', 'dist')
const DEFAULT_OUT = path.join(HERE, 'build', 'embedded-dist.generated.js')

function parseArgs(argv) {
  const opts = { dist: DEFAULT_DIST, out: DEFAULT_OUT }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dist') opts.dist = path.resolve(argv[++i])
    else if (argv[i] === '--out') opts.out = path.resolve(argv[++i])
    else throw new Error(`unknown argument: ${argv[i]}`)
  }
  return opts
}

/** Walk `dir` and yield every file as a POSIX URL path relative to the root. */
async function* walk(root, current = root) {
  for (const entry of await fs.readdir(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name)
    if (entry.isDirectory()) yield* walk(root, full)
    else if (entry.isFile()) yield { full, url: `/${path.relative(root, full).split(path.sep).join('/')}` }
  }
}

export async function embedDist({ dist = DEFAULT_DIST, out = DEFAULT_OUT } = {}) {
  const index = path.join(dist, 'index.html')
  try {
    await fs.access(index)
  } catch {
    throw new Error(
      `no built app at ${dist} (missing index.html). Run \`npm --prefix app run build\` first.`,
    )
  }

  const files = []
  for await (const file of walk(dist)) files.push(file)
  files.sort((a, b) => a.url.localeCompare(b.url)) // stable output -> reproducible builds

  const lines = []
  let totalBytes = 0
  for (const { full, url } of files) {
    const bytes = await fs.readFile(full)
    totalBytes += bytes.length
    lines.push(`  ${JSON.stringify(url)}: ${JSON.stringify(bytes.toString('base64'))},`)
  }

  const source = `/* GENERATED FILE — do not edit.
 * Produced by packaging/embed-dist.mjs from app/dist.
 * ${files.length} files, ${totalBytes} bytes before base64.
 */
export const EMBEDDED_DIST = {
${lines.join('\n')}
}
`

  await fs.mkdir(path.dirname(out), { recursive: true })
  await fs.writeFile(out, source, 'utf8')
  return { out, files: files.length, totalBytes }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2))
  const { out, files, totalBytes } = await embedDist(opts)
  console.log(`[embed-dist] ${files} files (${(totalBytes / 1024).toFixed(1)} KiB) -> ${out}`)
}
