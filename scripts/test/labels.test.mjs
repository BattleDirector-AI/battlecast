// .github/labels.yml against the skills that apply labels (#365 step 2). Zero dependencies:
// labels.yml is a flat list, so a line reader is enough.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const RETIRED = ['ready for human review', 'Spec-approved']

/** [{ name, lifecycle?, ... }] from the `- name:` entries of labels.yml. */
function declaredLabels() {
  const labels = []
  for (const line of readFileSync(join(ROOT, '.github', 'labels.yml'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*(-\s+)?(\w+):\s*(.*?)\s*$/.exec(line)
    if (!m || line.trimStart().startsWith('#')) continue
    const value = m[3].replace(/^"(.*)"$|^'(.*)'$/, '$1$2')
    if (m[1]) labels.push({})
    if (labels.length && m[2] !== 'labels') labels.at(-1)[m[2]] = value
  }
  return labels
}

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
