// scripts/spec-lint.mjs (#441): the plain-English ratchet, run against a throwaway spec tree.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = join(import.meta.dirname, '..', 'spec-lint.mjs')
const dirs = []
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

const CLEAN = 'The tower shows the gap.\n'
const ONE = 'The tower shows the gap; the box shows the battle.\n'
const TWO = 'The tower shows the gap; the box shows the battle; the HUD shows the speed.\n'

/** A spec tree with one `what/` file and a protocol SPEC.md. */
function tree(widgets, baseline) {
  const root = mkdtempSync(join(tmpdir(), 'spec-lint-'))
  dirs.push(root)
  mkdirSync(join(root, '.ai', 'spec', 'what'), { recursive: true })
  mkdirSync(join(root, 'spec', 'v1'), { recursive: true })
  writeFileSync(join(root, '.ai', 'spec', 'what', 'widgets.md'), widgets)
  writeFileSync(join(root, 'spec', 'v1', 'SPEC.md'), CLEAN)
  if (baseline) writeFileSync(join(root, '.ai', 'spec', 'ste-baseline.json'), JSON.stringify(baseline))
  return root
}

function run(root, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, SPEC_LINT_ROOT: root },
    encoding: 'utf8',
  })
  return { code: r.status, out: r.stdout + r.stderr }
}

const readBaseline = (root) => JSON.parse(readFileSync(join(root, '.ai', 'spec', 'ste-baseline.json'), 'utf8'))

test('counts that match the baseline pass', () => {
  const root = tree(ONE, { '.ai/spec/what/widgets.md': 1, 'spec/v1/SPEC.md': 0 })
  const r = run(root)
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /2 spec files match the baseline \(1 hard violations left\)/)
})

test('a file with more violations than its baseline fails, and --update refuses it', () => {
  const root = tree(TWO, { '.ai/spec/what/widgets.md': 1, 'spec/v1/SPEC.md': 0 })
  const r = run(root)
  assert.equal(r.code, 1)
  assert.match(r.out, /MORE: \.ai\/spec\/what\/widgets\.md has 2 hard violations, baseline 1/)
  assert.equal(run(root, '--update').code, 1)
  assert.equal(readBaseline(root)['.ai/spec/what/widgets.md'], 1, 'baseline must not rise')
})

test('a new spec file starts at 0, so any violation in it fails', () => {
  const root = tree(ONE, { 'spec/v1/SPEC.md': 0 })
  const r = run(root)
  assert.equal(r.code, 1)
  assert.match(r.out, /MORE: \.ai\/spec\/what\/widgets\.md has 1 hard violations, baseline 0/)
})

test('a file that improved fails until --update records the lower count', () => {
  const root = tree(CLEAN, { '.ai/spec/what/widgets.md': 2, 'spec/v1/SPEC.md': 0 })
  const r = run(root)
  assert.equal(r.code, 1)
  assert.match(r.out, /LESS: \.ai\/spec\/what\/widgets\.md dropped 2 -> 0/)
  assert.equal(run(root, '--update').code, 0)
  assert.equal(readBaseline(root)['.ai/spec/what/widgets.md'], 0)
  assert.equal(run(root).code, 0)
})

test('a baseline entry for a deleted file fails until --update removes it', () => {
  const root = tree(CLEAN, { '.ai/spec/what/widgets.md': 0, 'spec/v1/SPEC.md': 0, '.ai/spec/what/old.md': 3 })
  const r = run(root)
  assert.equal(r.code, 1)
  assert.match(r.out, /GONE: \.ai\/spec\/what\/old\.md/)
  assert.equal(run(root, '--update').code, 0)
  assert.equal('.ai/spec/what/old.md' in readBaseline(root), false)
})

test('--reset records the current counts, higher ones too', () => {
  const root = tree(TWO, { '.ai/spec/what/widgets.md': 0, 'spec/v1/SPEC.md': 0 })
  assert.equal(run(root, '--reset').code, 0)
  assert.deepEqual(readBaseline(root), { '.ai/spec/what/widgets.md': 2, 'spec/v1/SPEC.md': 0 })
})

test('--update records a new clean spec file at 0', () => {
  const root = tree(CLEAN, { 'spec/v1/SPEC.md': 0 })
  assert.equal(run(root, '--update').code, 0)
  assert.deepEqual(readBaseline(root), { '.ai/spec/what/widgets.md': 0, 'spec/v1/SPEC.md': 0 })
})

test('an unknown flag is a usage error, not a silent check', () => {
  const root = tree(TWO, { '.ai/spec/what/widgets.md': 0, 'spec/v1/SPEC.md': 0 })
  const r = run(root, '--udpate')
  assert.equal(r.code, 2)
  assert.match(r.out, /usage: .*Got: --udpate/)
  assert.equal(readBaseline(root)['.ai/spec/what/widgets.md'], 0, 'baseline untouched')
})
