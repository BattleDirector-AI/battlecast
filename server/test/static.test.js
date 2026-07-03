import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { withServer } from './helpers.js'

async function makeDist() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bc-dist-'))
  await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html><title>battlecast</title>')
  await fs.mkdir(path.join(dir, 'assets'), { recursive: true })
  await fs.writeFile(path.join(dir, 'assets', 'app.js'), 'console.log("app")')
  return dir
}

test('static: serves real files and SPA-falls-back for client routes', async () => {
  const distDir = await makeDist()
  try {
    await withServer(async ({ base }) => {
      // Exact asset with correct content-type.
      let res = await fetch(`${base}/assets/app.js`)
      assert.equal(res.status, 200)
      assert.match(res.headers.get('content-type'), /javascript/)
      assert.match(await res.text(), /console\.log/)

      // Extensionless client routes -> index.html (SPA fallback).
      for (const route of ['/all', '/tower', '/battle', '/logos', '/config']) {
        res = await fetch(`${base}${route}`)
        assert.equal(res.status, 200, `${route} should fall back to index.html`)
        assert.match(await res.text(), /<!doctype html>/)
      }

      // A missing file WITH an extension is a real 404 (not index.html).
      assert.equal((await fetch(`${base}/assets/missing.css`)).status, 404)

      // Traversal outside dist is blocked.
      assert.equal((await fetch(`${base}/${encodeURIComponent('../../package.json')}`)).status, 404)
    }, { distDir })
  } finally {
    await fs.rm(distDir, { recursive: true, force: true })
  }
})

test('static: a client route returns 503 when the app dir has no build', async () => {
  // dist dir exists but index.html was never built -> actionable 503, not a bare 404.
  const emptyDist = await fs.mkdtemp(path.join(os.tmpdir(), 'bc-nodist-'))
  try {
    await withServer(async ({ base }) => {
      const res = await fetch(`${base}/all`)
      assert.equal(res.status, 503)
      assert.match(await res.text(), /not built/)
    }, { distDir: emptyDist })
  } finally {
    await fs.rm(emptyDist, { recursive: true, force: true })
  }
})
