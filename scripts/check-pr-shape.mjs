#!/usr/bin/env node
// Print the commit shape of <head> against <base>, and exit non-zero on a bad one (#365 step 6,
// ported from BattleDirector's scripts/check_pr_shape.py). Zero dependencies.
//
// A branch whose first commit is a `spec(...)` commit is spec-first: exactly two commits, the
// spec + tests then the implementation, and the implementation changes no `.ai/spec/what/`
// file and no spec file the spec commit wrote. Any other branch is one commit.
//
// Usage: node scripts/check-pr-shape.mjs <base> <head>, run inside the repository to judge.
// Exit 0 good, 1 bad shape, 2 usage or git error. Unlike the Python original, an extra commit is
// named by short SHA as well as subject.
import { execFileSync } from 'node:child_process'

const SPEC_SUBJECT = /^spec(\([^)]*\))?: /
const WHAT_PREFIX = '.ai/spec/what/'
const SPEC_PREFIX = '.ai/spec/'

function git(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    process.stderr.write(err.stderr ?? String(err))
    process.exit(2) // nothing further to print: stop here
  }
}

/** [sha, subject] of the non-merge commits head adds to base, oldest first. */
const commits = (base, head) =>
  git('rev-list', '--reverse', '--no-merges', '--format=%H %s', `${base}..${head}`)
    .split('\n')
    .filter((line) => line && !line.startsWith('commit '))
    .map((line) => [line.slice(0, line.indexOf(' ')), line.slice(line.indexOf(' ') + 1)])

const changed = (sha) =>
  git('diff-tree', '-r', '--root', '--no-commit-id', '--name-only', '-z', sha).split('\0').filter(Boolean)

function bad(reason, ...details) {
  console.log(`shape: BAD — ${reason}`)
  for (const detail of details) console.log(detail)
  return 1
}

function main(argv) {
  if (argv.length !== 2) {
    process.stderr.write('usage: check-pr-shape.mjs <base> <head>\n')
    return 2
  }
  const list = commits(...argv)
  if (!list.length) return bad('the branch adds no commits')

  const allowed = SPEC_SUBJECT.test(list[0][1]) ? 2 : 1
  if (list.length > allowed) {
    return bad(
      `${list.length} commits where ${allowed} ${allowed === 1 ? 'is' : 'are'} allowed; ` +
        'squash the extras into the implementation commit',
      ...list.slice(allowed).map(([sha, subject]) => `  extra commit: ${sha.slice(0, 12)} ${subject}`),
    )
  }
  if (list.length === 1) {
    console.log('shape: plain (1 commit)')
    return 0
  }

  const specPaths = new Set(changed(list[0][0]))
  const touched = changed(list[1][0])
    .filter((p) => p.startsWith(WHAT_PREFIX) || (p.startsWith(SPEC_PREFIX) && specPaths.has(p)))
    .sort()
  if (touched.length) {
    return bad('the implementation commit changes the spec', ...touched.map((p) => `  spec path changed: ${p}`))
  }
  console.log('shape: spec-first (2 commits, spec untouched)')
  return 0
}

process.exitCode = main(process.argv.slice(2)) // exitCode, not exit(): lets stdout drain
