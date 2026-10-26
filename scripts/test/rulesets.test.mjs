// .github/rulesets/*.json against .github/workflows/ci.yml (#365 step 3). The rulesets are
// applied by the owner with `gh api`; these tests hold the files to exactly what they must say,
// and make sure every required check is a job CI reports on every PR, under that name (a missing
// one leaves a PR waiting forever; a skipped one counts as passing and proves nothing).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const DIR = join(ROOT, '.github', 'rulesets')
const GITHUB_ACTIONS_APP = 15368
const CI_JOBS = ['lint', 'test', 'compliance', 'server', 'mock']

const RULESETS = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((file) => ({ file, rs: JSON.parse(readFileSync(join(DIR, file), 'utf8')) }))
const byName = (name) => RULESETS.find((r) => r.rs.name === name)?.rs
const rule = (rs, type) => rs.rules.find((r) => r.type === type)

/** ci.yml read line by line: whether `on:` has a pull_request trigger, anything that filters it,
 * and, per job, its job-level keys. */
function readCi() {
  const lines = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8').split(/\r?\n/)
  const jobs = {}
  let section = null
  let job = null
  const pullRequest = []
  let inPullRequest = false
  let onPullRequest = false
  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const top = /^(\S[^:]*):\s*(.*)$/.exec(line)
    if (top) {
      section = top[1]
      inPullRequest = false
      // `on: [push, pull_request]` and `on: pull_request` are unfiltered triggers too.
      if (section === 'on' && /pull_request/.test(top[2])) onPullRequest = true
      continue
    }
    if (section === 'on') {
      const key = /^ {2}(\w+):\s*(.*)$/.exec(line)
      if (key) {
        inPullRequest = key[1] === 'pull_request'
        if (inPullRequest) {
          onPullRequest = true
          if (key[2].trim()) pullRequest.push(key[2].trim()) // an inline `{ branches: [...] }`
        }
      } else if (inPullRequest) pullRequest.push(line.trim())
    }
    if (section === 'jobs') {
      const name = /^ {2}([\w-]+):\s*$/.exec(line)
      if (name) jobs[(job = name[1])] = []
      else if (job) {
        const key = /^ {4}([\w-]+):/.exec(line)
        if (key) jobs[job].push(key[1])
      }
    }
  }
  return { jobs, onPullRequest, pullRequest }
}

test('there is a ruleset for next and one for prerelease + main', () => {
  assert.deepEqual(RULESETS.map((r) => r.rs.name).sort(), ['next', 'releases'])
  assert.deepEqual(byName('next').conditions.ref_name.include, ['refs/heads/next'])
  assert.deepEqual(byName('releases').conditions.ref_name.include.sort(), [
    'refs/heads/main',
    'refs/heads/prerelease',
  ])
})

for (const { file, rs } of RULESETS) {
  test(`${file}: active, no bypass, a PR required, no deletion or force-push`, () => {
    assert.equal(rs.target, 'branch')
    assert.equal(rs.enforcement, 'active')
    assert.deepEqual(rs.bypass_actors, [])
    assert.deepEqual(rs.conditions.ref_name.exclude, [])
    // Exactly these rules: an extra one (say required_linear_history, which refuses the release
    // flow's merge commits) is as wrong as a missing one.
    assert.deepEqual(rs.rules.map((r) => r.type).sort(), [
      'deletion',
      'non_fast_forward',
      'pull_request',
      'required_status_checks',
    ])
    // A PR is required, but no human approval: the owner's gate is the spec-approved label.
    assert.deepEqual(rule(rs, 'pull_request').parameters, {
      required_approving_review_count: 0,
      dismiss_stale_reviews_on_push: false,
      require_code_owner_review: false,
      require_last_push_approval: false,
      required_review_thread_resolution: false,
    })
  })

  test(`${file}: requires the five CI jobs, each pinned to the GitHub Actions app`, () => {
    const checks = rule(rs, 'required_status_checks')?.parameters.required_status_checks ?? []
    assert.deepEqual(checks.map((c) => c.context).sort(), [...CI_JOBS].sort())
    for (const c of checks) assert.equal(c.integration_id, GITHUB_ACTIONS_APP, `${c.context} is not pinned`)
  })
}

test('next is strict (up to date with next before merging); releases are not', () => {
  const strict = (name) => rule(byName(name), 'required_status_checks').parameters.strict_required_status_checks_policy
  assert.equal(strict('next'), true)
  assert.equal(strict('releases'), false)
})

test('every required check is a ci.yml job that runs on every pull request', () => {
  const { jobs, onPullRequest, pullRequest } = readCi()
  assert.ok(onPullRequest, 'ci.yml has no pull_request trigger')
  // A branch or path filter would leave some PR with a required check nobody reports.
  assert.deepEqual(pullRequest, [], 'the pull_request trigger is filtered')
  // The check name is the job's `name:` when it has one, and a matrix reports one check per
  // leg ('test (22)'), so either renames the check the ruleset waits for.
  for (const { file, rs } of RULESETS) {
    for (const { context } of rule(rs, 'required_status_checks').parameters.required_status_checks) {
      assert.ok(jobs[context], `${file} requires '${context}', which is not a ci.yml job`)
      for (const key of ['if', 'name', 'strategy']) {
        assert.ok(!jobs[context].includes(key), `ci.yml job '${context}' sets '${key}'`)
      }
    }
  }
})
