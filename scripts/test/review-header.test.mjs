// The review and merge steps the spec-first skills give (#365 steps 4-6): reviews are formal
// GitHub reviews opening with the shared header, every finding gets a disposition, and the merge
// is GitHub's auto-merge, armed at the reviewed commit after the PR-shape check.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8')
const HEADER = read('.claude', 'skills', '_shared', 'review-header.md')
const SKILLS = {
  'spec-first-pass': read('.claude', 'skills', 'spec-first-pass', 'SKILL.md'),
  'implement-spec': read('.claude', 'skills', 'implement-spec', 'SKILL.md'),
}
const DISPOSITIONS = ['fixed', 'wrong', 'intentional', 'not-worth-it']

/** The text of one `## ` section of a Markdown file, by heading prefix. */
function section(text, heading) {
  const start = text.indexOf(`\n## ${heading}`)
  assert.notEqual(start, -1, `no section '${heading}'`)
  const end = text.indexOf('\n## ', start + 1)
  return text.slice(start, end === -1 ? undefined : end)
}

test('the header template has every row', () => {
  for (const row of ['Verdict', 'Blocking', 'Findings', 'Reviewed at', 'CI']) {
    assert.match(HEADER, new RegExp(`\\| \\*\\*${row}\\*\\* \\|`), `no '${row}' row`)
  }
  assert.match(HEADER, /## Review — <spec\|implementation> — round N of M/)
})

test("the header's CI row counts the checks the next ruleset requires", () => {
  const ruleset = JSON.parse(read('.github', 'rulesets', 'next.json'))
  const checks = ruleset.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks
  assert.match(HEADER, new RegExp(`\\*\\*CI\\*\\* \\| n/${checks.length} `))
  for (const { context } of checks) assert.ok(HEADER.includes('`' + context + '`'), `the header omits '${context}'`)
})

test('the header says to post a formal review and gives a line for each disposition', () => {
  assert.match(HEADER, /gh pr review <n> --comment\s+--body-file/)
  for (const word of DISPOSITIONS) assert.match(HEADER, new RegExp(`- \\*\\*F\\d+\\*\\* ${word}:`), `no '${word}' line`)
})

for (const [name, text] of Object.entries(SKILLS)) {
  test(`${name}: its review step posts a formal review with the shared header and the dispositions`, () => {
    const review = section(text, 'Phase 6')
    assert.ok(review.includes('.claude/skills/_shared/review-header.md'), 'does not name the header file')
    // The review itself is a formal review; only the author's dispositions are plain comments.
    assert.match(review, /gh pr review <pr> --comment --body-file/, 'no formal-review command')
    for (const l of review.split(/\r?\n/).filter((l) => /gh pr comment/.test(l))) {
      assert.match(l, /disposition/i, `posts the review as a plain comment: '${l.trim()}'`)
    }
    for (const word of DISPOSITIONS) assert.ok(review.includes('`' + word + '`'), `does not name '${word}'`)
  })
}

test('implement-spec arms auto-merge at the reviewed commit, after checking it', () => {
  const phase = section(SKILLS['implement-spec'], 'Phase 7')
  // The arm block: the first fenced block in the phase, so a fetch elsewhere can't stand in.
  const open = phase.indexOf('```bash')
  const merge = phase.slice(open, phase.indexOf('\n```', open + 7))
  const at = (re, what) => {
    const i = merge.search(re)
    assert.notEqual(i, -1, `Phase 7 has no ${what}`)
    return i
  }
  const reviewed = at(/REVIEWED=<sha from the clean review's "Reviewed at" row>/, 'REVIEWED from the review header')
  const head = at(/test "\$\(gh pr view <pr> --json headRefOid --jq \.headRefOid\)" = "\$REVIEWED"/, 'head check')
  const shape = at(/node scripts\/check-pr-shape\.mjs origin\/next "\$REVIEWED"/, 'shape check of the reviewed commit')
  const ready = at(/gh pr ready <pr>/, 'gh pr ready')
  const arm = at(/gh pr merge <pr> --auto --merge --match-head-commit "\$REVIEWED"/, 'arm at REVIEWED')
  assert.ok(reviewed < head && head < shape && shape < arm, 'the checks run after arming')
  assert.ok(ready < arm, 'arms before marking ready: GitHub refuses to arm a draft')
  const fetch = at(/git fetch origin/, 'fetch')
  assert.ok(fetch < shape, 'checks the shape against an unfetched origin/next')
  assert.match(merge, /^set -e/m, 'a failed check would not stop the arm')
  assert.match(phase, /armed only while it carries `spec-approved`/)
  assert.match(phase, /gh pr merge <pr> --disable-auto\r?\ngh pr update-branch <pr>/, 'updates the branch while armed')
})

test('the spec-first skills never merge directly', () => {
  // release-cut merges its release-flow PRs directly, through the ruleset; it is not checked here.
  for (const [name, text] of Object.entries(SKILLS)) {
    for (const line of text.split(/\r?\n/)) {
      if (/gh pr merge\b/.test(line)) assert.match(line, /--auto|--disable-auto/, `${name}: '${line.trim()}' merges directly`)
    }
  }
})
