// .github/labels.yml against the skills that apply labels (#365 step 2), and the live-label
// diff (#379). Zero dependencies.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { applyPlan, declaredLabels as parseLabels, diffLabels, repoOf } from '../check-labels-live.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const RETIRED = ['ready for human review', 'Spec-approved']

/** [{ name, lifecycle?, ... }] from the `- name:` entries of labels.yml. */
const declaredLabels = () => parseLabels(readFileSync(join(ROOT, '.github', 'labels.yml'), 'utf8'))

/** Every Markdown file under .claude/skills (each SKILL.md and the shared files). */
function skillFiles() {
  return readdirSync(join(ROOT, '.claude', 'skills'), { recursive: true })
    .filter((rel) => rel.endsWith('.md'))
    .map((rel) => join(ROOT, '.claude', 'skills', rel))
    .map((path) => ({ path, text: readFileSync(path, 'utf8') }))
}

/** Every label a skill applies, removes or filters on: the `--add-label` / `--remove-label` /
 * `--label` / `-l` argument of a gh command. A label named only in prose is not seen, so the
 * skills give every label change as a command. */
function labelsAppliedBySkills() {
  const found = []
  for (const { path, text } of skillFiles()) {
    text.split(/\r?\n/).forEach((line, i) => {
      for (const m of line.matchAll(/(?:--(?:add-|remove-)?label|\s-l)[ =]+("([^"]+)"|'([^']+)'|([^\s`]+))/g)) {
        for (const name of (m[2] ?? m[3] ?? m[4]).split(',')) found.push({ name, at: `${path}:${i + 1}` })
      }
    })
  }
  return found
}

const LABELS = declaredLabels()
const NAMES = new Set(LABELS.map((l) => l.name))

test('labels.yml declares each label once, each with a name, a colour and a description', () => {
  assert.ok(LABELS.length > 0)
  for (const [i, l] of LABELS.entries()) {
    assert.ok(l.name, `entry ${i + 1} has no name`)
    assert.match(l.color ?? '', /^[0-9a-fA-F]{6}$/, `'${l.name}' has no 6-digit hex colour`)
    assert.ok(l.description, `'${l.name}' has no description`)
  }
  assert.equal(NAMES.size, LABELS.length, 'a label is declared twice')
})

test('the five lifecycle labels are declared, in order, plus fail-escalated', () => {
  const lifecycle = LABELS.filter((l) => l.lifecycle).sort((a, b) => a.lifecycle - b.lifecycle)
  assert.deepEqual(
    lifecycle.map((l) => l.name),
    ['ai-spec-review', 'spec-review', 'spec-approved', 'ai-code-review', 'ready-to-merge'],
  )
  assert.ok(NAMES.has('fail-escalated'))
})

test('every label a skill applies is declared in labels.yml', () => {
  const applied = labelsAppliedBySkills()
  assert.ok(applied.length > 0, 'no skill applies a label')
  for (const { name, at } of applied) assert.ok(NAMES.has(name), `${at} applies undeclared label '${name}'`)
})

test('every pipeline label is named in a skill', () => {
  const text = skillFiles().map((f) => f.text).join('\n')
  for (const l of LABELS.filter((l) => l.lifecycle || l.name === 'fail-escalated')) {
    assert.ok(text.includes('`' + l.name + '`'), `no skill names \`${l.name}\``)
  }
})

test('the retired label names are gone from labels.yml and the skills', () => {
  for (const name of RETIRED) {
    assert.ok(!NAMES.has(name), `labels.yml still declares '${name}'`)
    for (const { path, text } of skillFiles()) assert.ok(!text.includes(name), `${path} still names '${name}'`)
  }
})

test('the live-label diff names the missing, the differing and the undeclared labels', () => {
  const declared = [
    { name: 'a', color: 'aabbcc', description: 'A' },
    { name: 'b', color: '112233', description: 'B' },
    { name: 'c', color: '445566', description: 'C' },
    { name: 'd', color: '778899', description: 'D' },
  ]
  const live = [
    { name: 'b', color: '112233', description: 'B' }, // in sync
    { name: 'c', color: 'FFFFFF', description: 'C' }, // colour differs
    { name: 'd', color: '778899', description: null }, // description missing live
    { name: 'old', color: '000000', description: '' }, // not declared
  ]
  const { missing, differing, undeclared } = diffLabels(declared, live)
  assert.deepEqual(missing.map((l) => l.name), ['a'])
  assert.deepEqual(differing.map((l) => [l.name, l.fields]), [['c', ['color']], ['d', ['description']]])
  assert.deepEqual(undeclared.map((l) => l.name), ['old'])
})

test('the live-label diff ignores colour case, and is empty for an exact match', () => {
  const declared = [{ name: 'a', color: 'aabbcc', description: 'A' }]
  const { missing, differing, undeclared } = diffLabels(declared, [{ name: 'a', color: 'AABBCC', description: 'A' }])
  assert.deepEqual([missing, differing, undeclared], [[], [], []])
})

test('the repository comes from an https or ssh GitHub remote', () => {
  for (const url of ['https://github.com/BattleDirector-AI/battlecast.git', 'https://github.com/BattleDirector-AI/battlecast', 'git@github.com:BattleDirector-AI/battlecast.git\n']) {
    assert.equal(repoOf(url), 'BattleDirector-AI/battlecast', url)
  }
  assert.equal(repoOf('https://gitlab.com/a/b.git'), null)
})

test('names match case-insensitively: a case-only difference is a rename, not a missing label', () => {
  const declared = [{ name: 'bug', color: 'd73a4a', description: 'Broken' }]
  const { missing, differing, undeclared } = diffLabels(declared, [{ name: 'Bug', color: 'd73a4a', description: 'Broken' }])
  assert.deepEqual([missing, undeclared], [[], []])
  assert.deepEqual(differing.map((l) => [l.name, l.fields]), [['bug', ['name']]])
})

test('a label declared with no description matches an empty live one', () => {
  const { differing } = diffLabels([{ name: 'a', color: 'aabbcc' }], [{ name: 'a', color: 'aabbcc', description: '' }])
  assert.deepEqual(differing, [])
})

test('a double-quoted labels.yml value is read with its escapes undone', () => {
  const [l] = parseLabels('labels:\n  - name: a\n    description: "say \\"hi\\" \\\\ ok"\n    color: \'aabbcc\'\n')
  assert.equal(l.description, 'say "hi" \\ ok')
  assert.equal(l.color, 'aabbcc')
})

test('--apply plans a POST per missing label and a PATCH by live name per differing one', () => {
  const declared = [
    { name: 'new one', color: '111111', description: 'N' },
    { name: 'bug', color: '222222', description: 'B' },
  ]
  const plan = applyPlan(diffLabels(declared, [{ name: 'Bug', color: '999999', description: 'B' }]), 'o/r')
  assert.deepEqual(plan, [
    { done: 'created', name: 'new one', args: ['api', '-X', 'POST', 'repos/o/r/labels',
      '-f', 'name=new one', '-f', 'color=111111', '-f', 'description=N'] },
    { done: 'updated', name: 'bug', args: ['api', '-X', 'PATCH', 'repos/o/r/labels/Bug',
      '-f', 'new_name=bug', '-f', 'color=222222', '-f', 'description=B'] },
  ])
  assert.deepEqual(applyPlan(diffLabels(declared, declared), 'o/r'), [], 'nothing to do when in sync')
})
