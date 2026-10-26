// scripts/check-pr-shape.mjs against throwaway git repositories (#365 step 6).
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

const SCRIPT = join(import.meta.dirname, '..', 'check-pr-shape.mjs')

// Sealed off from the machine's git: no inherited GIT_* (git sets GIT_DIR inside hooks, which
// would send these commits to another repository), and no global or system config (a global
// core.hooksPath or signing setup would change what a commit does).
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
// An empty file rather than the null device, which Git for Windows can't open as config.
const CONFIG_DIR = mkdtempSync(join(tmpdir(), 'pr-shape-config-'))
const EMPTY_CONFIG = join(CONFIG_DIR, 'gitconfig')
writeFileSync(EMPTY_CONFIG, '')
after(() => rmSync(CONFIG_DIR, { recursive: true, force: true }))
Object.assign(ENV, { GIT_CONFIG_GLOBAL: EMPTY_CONFIG, GIT_CONFIG_NOSYSTEM: '1' })

/** A repo with one base commit on `base`, then `commits` on `head`: [{ subject, files }]. */
function repo(commits) {
  const dir = mkdtempSync(join(tmpdir(), 'pr-shape-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: ENV })
  const write = (files) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
  }
  git('init', '-q', '-b', 'base')
  git('config', 'user.email', 'test@example.invalid')
  git('config', 'user.name', 'test')
  git('config', 'commit.gpgsign', 'false')
  write({ 'README.md': 'base\n', '.ai/spec/what/widgets.md': 'rule 1\n', '.ai/spec/how/renderer.md': 'how\n' })
  git('add', '-A')
  git('commit', '-q', '-m', 'base')
  git('checkout', '-q', '-b', 'head')
  for (const { subject, files, mergeBase } of commits) {
    if (mergeBase) {
      // A commit on base, merged into head: what `gh pr update-branch` adds.
      git('checkout', '-q', 'base')
      write(mergeBase)
      git('add', '-A')
      git('commit', '-q', '-m', 'later work on base')
      git('checkout', '-q', 'head')
      git('merge', '-q', '--no-ff', '--no-edit', 'base')
      continue
    }
    write(files)
    git('add', '-A')
    git('commit', '-q', '-m', subject)
  }
  const run = (...args) => {
    const r = spawnSync(process.execPath, [SCRIPT, ...(args.length ? args : ['base', 'head'])], {
      cwd: dir,
      encoding: 'utf8',
      env: ENV,
    })
    return { code: r.status, out: r.stdout }
  }
  return { run, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

const SPEC = { subject: 'spec(tower): a rule', files: { '.ai/spec/what/widgets.md': 'rule 2\n', 'app/a.test.js': 't\n' } }
const IMPL = { subject: 'feat(tower): implement it', files: { 'app/a.js': 'code\n' } }

test('accepts a two-commit spec-first branch whose implementation leaves the spec alone', (t) => {
  const r = repo([SPEC, IMPL])
  t.after(r.cleanup)
  const { code, out } = r.run()
  assert.equal(code, 0, out)
  assert.match(out, /shape: spec-first \(2 commits, spec untouched\)/)
})

test('accepts a one-commit plain branch, and a spec commit alone', (t) => {
  for (const commits of [[IMPL], [SPEC]]) {
    const r = repo(commits)
    t.after(r.cleanup)
    const { code, out } = r.run()
    assert.equal(code, 0, out)
    assert.match(out, /shape: plain \(1 commit\)/)
  }
})

test('refuses a three-commit spec-first branch, naming the extra commit', (t) => {
  const r = repo([SPEC, IMPL, { subject: 'fix: review nit', files: { 'app/a.js': 'code 2\n' } }])
  t.after(r.cleanup)
  const { code, out } = r.run()
  assert.equal(code, 1)
  assert.match(out, /shape: BAD — 3 commits where 2 are allowed/)
  assert.match(out, /extra commit: [0-9a-f]{12} fix: review nit/)
  assert.doesNotMatch(out, /extra commit: .* feat\(tower\)/)
})

test('refuses a two-commit branch that is not spec-first, naming the second commit', (t) => {
  const r = repo([IMPL, { subject: 'chore: more', files: { 'app/b.js': 'b\n' } }])
  t.after(r.cleanup)
  const { code, out } = r.run()
  assert.equal(code, 1)
  assert.match(out, /2 commits where 1 is allowed/)
  assert.match(out, /extra commit: [0-9a-f]{12} chore: more/)
})

test('refuses an implementation commit that changes a what/ rule', (t) => {
  const r = repo([
    { subject: 'spec(x): how only', files: { '.ai/spec/how/renderer.md': 'how 2\n' } },
    { subject: 'feat(x): impl', files: { 'app/a.js': 'c\n', '.ai/spec/what/widgets.md': 'rule 9\n' } },
  ])
  t.after(r.cleanup)
  const { code, out } = r.run()
  assert.equal(code, 1)
  assert.match(out, /the implementation commit changes the spec/)
  assert.match(out, /spec path changed: \.ai\/spec\/what\/widgets\.md/)
})

test('refuses an implementation commit that rewrites a spec file the spec commit wrote', (t) => {
  const r = repo([
    { subject: 'spec(x): how', files: { '.ai/spec/how/renderer.md': 'how 2\n' } },
    { subject: 'feat(x): impl', files: { 'app/a.js': 'c\n', '.ai/spec/how/renderer.md': 'how 3\n' } },
  ])
  t.after(r.cleanup)
  const { code, out } = r.run()
  assert.equal(code, 1)
  assert.match(out, /spec path changed: \.ai\/spec\/how\/renderer\.md/)
})

test('refuses an empty branch', (t) => {
  const r = repo([])
  t.after(r.cleanup)
  const { code, out } = r.run()
  assert.equal(code, 1)
  assert.match(out, /the branch adds no commits/)
})

test('ignores a merge of base into the branch, as gh pr update-branch makes', (t) => {
  // The merge brings base's own commit too; base..head excludes it, --no-merges the merge.
  const r = repo([SPEC, IMPL, { mergeBase: { 'later.txt': 'later\n' } }])
  t.after(r.cleanup)
  const { code, out } = r.run('base~1', 'head')
  assert.match(out, /3 commits where 2 are allowed/, 'from the old base the base commit counts')
  assert.equal(code, 1)
  const fresh = r.run()
  assert.equal(fresh.code, 0, fresh.out)
  assert.match(fresh.out, /shape: spec-first/)
})

test('accepts an implementation that edits a spec file the spec commit did not write', (t) => {
  // Only what/ files and the spec commit's own spec files are frozen.
  const r = repo([SPEC, { subject: 'feat(x): impl', files: { 'app/a.js': 'c\n', '.ai/spec/how/renderer.md': 'how 9\n' } }])
  t.after(r.cleanup)
  const { code, out } = r.run()
  assert.equal(code, 0, out)
  assert.match(out, /shape: spec-first/)
})

test('only a `spec(...): ` or `spec: ` subject makes a branch spec-first', (t) => {
  for (const [subject, specFirst] of [
    ['spec: a rule', true],
    ['spec(tower): a rule', true],
    ['specs(tower): a rule', false],
    ['spec(tower):a rule', false],
    ['spectacle: a rule', false],
  ]) {
    const r = repo([{ ...SPEC, subject }, IMPL])
    t.after(r.cleanup)
    const { code, out } = r.run()
    assert.equal(code, specFirst ? 0 : 1, `${subject}: ${out}`)
  }
})

test('exits 2 on a usage error and on an unknown revision', (t) => {
  const r = repo([IMPL])
  t.after(r.cleanup)
  assert.equal(r.run('base').code, 2)
  assert.equal(r.run('base', 'no-such-branch').code, 2)
})
