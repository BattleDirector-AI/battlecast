#!/usr/bin/env node
// Spec plain-English ratchet (#441). Runs the ASD-STE100 linter
// (.claude/skills/asd-ste100/scripts/ste-lint.py) on each spec file and compares the hard
// violation count with .ai/spec/ste-baseline.json.
//
//   node scripts/spec-lint.mjs            check: fail if a file's count is not equal to its baseline
//   node scripts/spec-lint.mjs --update   write the new, lower counts into the baseline
//   node scripts/spec-lint.mjs --reset    write the current counts, higher or lower. Use it only to
//                                         create the baseline or after you update the vendored linter.
//
// A count may only go down. A file that improved fails the check until you run --update, so each
// improvement is locked in by the PR that made it. A new spec file has a baseline of 0.
// Zero dependencies: Node built-ins plus a Python 3 interpreter on PATH.

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = join(fileURLToPath(import.meta.url), '..', '..')
const LINTER = join(repo, '.claude', 'skills', 'asd-ste100', 'scripts', 'ste-lint.py')
// SPEC_LINT_ROOT points the check at another tree. The tests use it. The linter stays this repo's.
const root = process.env.SPEC_LINT_ROOT || repo
const BASELINE = join(root, '.ai', 'spec', 'ste-baseline.json')
const args = process.argv.slice(2)
if (args.length > 1 || args.some((a) => a !== '--update' && a !== '--reset')) {
  console.error(`spec-lint: usage: node scripts/spec-lint.mjs [--update | --reset]. Got: ${args.join(' ')}`)
  process.exit(2)
}
const update = args[0] === '--update'
const reset = args[0] === '--reset'

function specFiles() {
  const out = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.md')) out.push(p)
    }
  }
  walk(join(root, '.ai', 'spec'))
  out.push(join(root, 'spec', 'v1', 'SPEC.md'))
  return out.map((p) => relative(root, p).split(sep).join('/')).sort()
}

function findPython() {
  for (const cmd of ['python3', 'python']) {
    const r = spawnSync(cmd, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' })
    if (r.status === 0 && r.stdout.trim() === '3') return cmd
  }
  console.error('spec-lint: needs Python 3 on PATH (python3 or python).')
  process.exit(2)
}

function hardCount(python, file) {
  // --baseline is huge so the linter itself never fails. This script makes the pass/fail call.
  const r = spawnSync(python, ['-I', LINTER, '--json', '--baseline', '1000000', file], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0) {
    console.error(`spec-lint: the linter failed on ${file}\n${r.error ?? ''}${r.stderr ?? ''}`)
    process.exit(2)
  }
  return JSON.parse(r.stdout).hard_count
}

const python = findPython()
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}
const files = specFiles()
const current = Object.fromEntries(files.map((f) => [f, hardCount(python, f)]))

const worse = files.filter((f) => current[f] > (baseline[f] ?? 0))
const better = files.filter((f) => current[f] < (baseline[f] ?? 0))
const gone = Object.keys(baseline).filter((f) => !(f in current))

if (reset) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n')
  console.log(`spec-lint: baseline reset (${Object.values(current).reduce((a, b) => a + b, 0)} total).`)
  process.exit(0)
}

for (const f of worse) {
  console.error(
    `MORE: ${f} has ${current[f]} hard violations, baseline ${baseline[f] ?? 0}. ` +
      `Rewrite the text you added or changed in ASD-STE100. ` +
      `See: ${python} ${relative(repo, LINTER).split(sep).join('/')} ${f}`,
  )
}

if (update) {
  if (worse.length) process.exit(1)
  const next = Object.fromEntries(files.map((f) => [f, current[f]]))
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n')
  for (const f of better) console.log(`lowered: ${f} ${baseline[f]} -> ${current[f]}`)
  for (const f of gone) console.log(`removed: ${f}`)
  console.log(`spec-lint: baseline written (${Object.values(next).reduce((a, b) => a + b, 0)} total).`)
  process.exit(0)
}

for (const f of better) {
  console.error(`LESS: ${f} dropped ${baseline[f]} -> ${current[f]}. Lock it in: make spec-lint-update`)
}
for (const f of gone) console.error(`GONE: ${f} is in the baseline but not on disk. Run: make spec-lint-update`)

const total = Object.values(current).reduce((a, b) => a + b, 0)
if (worse.length || better.length || gone.length) process.exit(1)
console.log(`spec-lint: ${files.length} spec files match the baseline (${total} hard violations left).`)
