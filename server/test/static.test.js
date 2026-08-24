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

// ---- embedded assets (the packaged-binary path, see what/companion-server.md §9-10) ----

/** Build an embedded map the way packaging/embed-dist.mjs does: URL path -> base64. */
function embeddedFixture(files) {
  return Object.fromEntries(
    Object.entries(files).map(([p, body]) => [p, Buffer.from(body).toString('base64')]),
  )
}

test('static: serves embedded assets with SPA fallback when there is no dist on disk', async () => {
  const embedded = embeddedFixture({
    '/index.html': '<!doctype html><title>battlecast packaged</title>',
    '/assets/app.js': 'console.log("embedded app")',
    '/favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  })

  // No distDir at all — this is exactly the packaged binary's configuration.
  await withServer(async ({ base }) => {
    // Exact embedded file, correct content-type derived from the extension.
    let res = await fetch(`${base}/assets/app.js`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /javascript/)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.match(await res.text(), /embedded app/)

    res = await fetch(`${base}/favicon.svg`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /image\/svg\+xml/)

    // Extensionless client routes -> embedded index.html.
    for (const route of ['/all', '/tower', '/battle', '/onboard', '/config']) {
      res = await fetch(`${base}${route}`)
      assert.equal(res.status, 200, `${route} should fall back to the embedded index.html`)
      assert.match(await res.text(), /battlecast packaged/)
    }

    // A missing file WITH an extension is still a real 404.
    assert.equal((await fetch(`${base}/assets/missing.css`)).status, 404)

    // HEAD returns headers without a body.
    res = await fetch(`${base}/assets/app.js`, { method: 'HEAD' })
    assert.equal(res.status, 200)
    assert.equal(await res.text(), '')
  }, { embedded })
})

test('static: disk dist wins over an embedded asset at the same path', async () => {
  // A dev checkout with a freshly rebuilt app/dist must not be shadowed by a stale
  // generated map (how/server.md: resolve disk BEFORE embedded).
  const distDir = await makeDist()
  const embedded = embeddedFixture({
    '/index.html': '<!doctype html><title>STALE EMBEDDED</title>',
    '/assets/app.js': 'console.log("STALE EMBEDDED")',
  })
  try {
    await withServer(async ({ base }) => {
      let res = await fetch(`${base}/assets/app.js`)
      assert.equal(res.status, 200)
      const body = await res.text()
      assert.match(body, /console\.log\("app"\)/)
      assert.doesNotMatch(body, /STALE EMBEDDED/)

      // SPA fallback prefers the on-disk index too.
      res = await fetch(`${base}/all`)
      assert.match(await res.text(), /<title>battlecast<\/title>/)
    }, { distDir, embedded })
  } finally {
    await fs.rm(distDir, { recursive: true, force: true })
  }
})

test('static: embedded assets fill gaps the disk dist does not have', async () => {
  const distDir = await makeDist() // has /index.html and /assets/app.js only
  const embedded = embeddedFixture({ '/icons.svg': '<svg id="from-embedded"/>' })
  try {
    await withServer(async ({ base }) => {
      const res = await fetch(`${base}/icons.svg`)
      assert.equal(res.status, 200)
      assert.match(await res.text(), /from-embedded/)
    }, { distDir, embedded })
  } finally {
    await fs.rm(distDir, { recursive: true, force: true })
  }
})

test('static: an embedded map cannot be escaped by traversal or bad encoding', async () => {
  const embedded = embeddedFixture({
    '/index.html': '<!doctype html><title>packaged</title>',
    '/assets/app.js': 'ok',
  })
  await withServer(async ({ base }) => {
    // Traversal has no filesystem meaning here, and must not resolve to a key.
    assert.equal((await fetch(`${base}/${encodeURIComponent('../../package.json')}`)).status, 404)
    // Malformed percent-encoding with an extension is a 404, not a crash.
    assert.equal((await fetch(`${base}/bad%ZZ.css`)).status, 404)
    // Malformed percent-encoding without an extension still reaches the SPA fallback.
    const res = await fetch(`${base}/bad%ZZ`)
    assert.equal(res.status, 200)
    assert.match(await res.text(), /packaged/)
  }, { embedded })
})
