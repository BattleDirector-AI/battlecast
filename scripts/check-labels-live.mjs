#!/usr/bin/env node
// The repository's live GitHub labels against .github/labels.yml (#379). Zero dependencies:
// reads the live labels through `gh api` and prints the drift.
//
//   node scripts/check-labels-live.mjs           # exit 1 when a declared label is missing or differs
//   node scripts/check-labels-live.mjs --apply   # create the missing ones and fix the differing ones
//
// A live label that labels.yml does not declare is reported but never deleted, and does not fail
// the check: it may carry history on old issues. `--agent` runs every gh call through
// scripts/agent-gh.sh, so an agent's --apply writes as the App (CONTRIBUTING.md, "Agent identity").
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const ROOT = join(import.meta.dirname, '..')

/** [{ name, color, description, ... }] from the `- name:` entries of labels.yml's text.
 * labels.yml is a flat list, so a line reader is enough. A double-quoted value is read as a JSON
 * string, so \" and \ escapes work; a single-quoted one is taken as written. */
export function declaredLabels(text) {
  const labels = []
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(-\s+)?(\w+):\s*(.*?)\s*$/.exec(line)
    if (!m || line.trimStart().startsWith('#')) continue
    const raw = m[3]
    const value = /^".*"$/.test(raw) ? JSON.parse(raw) : raw.replace(/^'(.*)'$/, '$1')
    if (m[1]) labels.push({})
    if (labels.length && m[2] !== 'labels') labels.at(-1)[m[2]] = value
  }
  return labels
}

/** What differs between the declared labels and the live ones ([{ name, color, description }]).
 * Names and colours compare case-insensitively, as GitHub treats names: a live `Bug` is the
 * declared `bug` with a differing name, not a missing label. A missing description, live or
 * declared, counts as empty. */
export function diffLabels(declared, live) {
  const key = (name) => String(name).toLowerCase()
  const byName = new Map(live.map((l) => [key(l.name), l]))
  const missing = []
  const differing = []
  for (const d of declared) {
    const l = byName.get(key(d.name))
    if (!l) {
      missing.push(d)
      continue
    }
    const fields = []
    if (l.name !== d.name) fields.push('name')
    if (String(l.color).toLowerCase() !== String(d.color).toLowerCase()) fields.push('color')
    if ((l.description ?? '') !== (d.description ?? '')) fields.push('description')
    if (fields.length) differing.push({ ...d, fields, live: l })
  }
  const names = new Set(declared.map((d) => key(d.name)))
  const undeclared = live.filter((l) => !names.has(key(l.name)))
  return { missing, differing, undeclared }
}

let asAgent = false
let repo // owner/name, from the origin remote: gh's {owner}/{repo} placeholder fails under the App token from node

/** owner/name from a GitHub remote URL (https or ssh). */
export function repoOf(url) {
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(String(url).trim())
  return m ? `${m[1]}/${m[2]}` : null
}

/** The gh api calls ([{ done, name, args }]) that bring the live labels in line with a diff: a POST per missing label, a
 * PATCH per differing one (by its live name, renaming a case-only difference). Fields go as -f
 * arguments, so nothing is read from stdin. */
export function applyPlan({ missing, differing }, repo) {
  const fields = (o) => Object.entries(o).flatMap(([k, v]) => ['-f', `${k}=${v ?? ''}`])
  return [
    ...missing.map((d) => ({ done: 'created', name: d.name, args: ['api', '-X', 'POST', `repos/${repo}/labels`,
      ...fields({ name: d.name, color: d.color, description: d.description })] })),
    ...differing.map((d) => ({ done: 'updated', name: d.name, args: ['api', '-X', 'PATCH',
      `repos/${repo}/labels/${encodeURIComponent(d.live.name)}`,
      ...fields({ new_name: d.name, color: d.color, description: d.description })] })),
  ]
}

function gh(args) {
  const [cmd, pre] = asAgent ? ['bash', [join(ROOT, 'scripts', 'agent-gh.sh')]] : ['gh', []]
  return execFileSync(cmd, [...pre, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
}

function main(argv) {
  const apply = argv.includes('--apply')
  asAgent = argv.includes('--agent')
  repo = repoOf(execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' }))
  if (!repo) throw new Error('origin is not a GitHub remote')
  const declared = declaredLabels(readFileSync(join(ROOT, '.github', 'labels.yml'), 'utf8'))
  const live = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repo}/labels`])).flat()
  const diff = diffLabels(declared, live)
  const { missing, differing, undeclared } = diff

  for (const d of missing) console.log(`missing:    ${d.name}`)
  for (const d of differing) {
    console.log(`differs:    ${d.name} (${d.fields.map((f) => `${f} ${JSON.stringify(d.live[f] ?? '')} -> ${JSON.stringify(d[f])}`).join(', ')})`)
  }
  for (const l of undeclared) console.log(`undeclared: ${l.name} (left alone)`)
  if (!missing.length && !differing.length) {
    console.log(`labels: in sync (${declared.length} declared)`)
    return 0
  }
  if (!apply) {
    console.log('labels: drift; run with --apply to fix')
    return 1
  }
  for (const { done, name, args } of applyPlan(diff, repo)) {
    gh(args)
    console.log(`${done}:    ${name}`)
  }
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2))
