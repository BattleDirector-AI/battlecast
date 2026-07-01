import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withServer, multipartBody } from './helpers.js'

const BOUNDARY = '----battlecastTestBoundary'
const mpHeaders = { 'Content-Type': `multipart/form-data; boundary=${BOUNDARY}` }
// Minimal PNG signature + a few bytes — enough to round-trip and prove serving.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

test('logos: upload → list → serve → delete lifecycle', async () => {
  await withServer(async ({ base }) => {
    const body = multipartBody(BOUNDARY, {
      filename: 'My Sponsor.PNG',
      contentType: 'image/png',
      bytes: PNG,
    })
    let res = await fetch(`${base}/api/logos`, { method: 'POST', headers: mpHeaders, body })
    assert.equal(res.status, 201)
    const saved = await res.json()
    // Sanitized: lowercased, spaces -> hyphen, extension preserved.
    assert.equal(saved.name, 'my-sponsor.png')
    assert.equal(saved.url, '/logos/my-sponsor.png')

    res = await fetch(`${base}/api/logos`)
    const { logos } = await res.json()
    assert.equal(logos.length, 1)
    assert.deepEqual(logos[0], { name: 'my-sponsor.png', url: '/logos/my-sponsor.png', size: PNG.length })

    // Served bytes are identical, with the right Content-Type.
    res = await fetch(`${base}/logos/my-sponsor.png`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'image/png')
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG)

    // Delete, then it's gone (both the API and the served asset).
    res = await fetch(`${base}/api/logos/my-sponsor.png`, { method: 'DELETE' })
    assert.equal(res.status, 200)
    assert.equal((await fetch(`${base}/api/logos/my-sponsor.png`, { method: 'DELETE' })).status, 404)
    assert.equal((await fetch(`${base}/logos/my-sponsor.png`)).status, 404)
    assert.deepEqual((await (await fetch(`${base}/api/logos`)).json()).logos, [])
  })
})

test('logos: raw-body upload with ?name= also works', async () => {
  await withServer(async ({ base }) => {
    const res = await fetch(`${base}/api/logos?name=raw.webp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: PNG,
    })
    assert.equal(res.status, 201)
    assert.equal((await res.json()).name, 'raw.webp')
  })
})

test('logos: rejects non-image, empty, and oversized uploads', async () => {
  await withServer(async ({ base }) => {
    // Non-image extension.
    let res = await fetch(`${base}/api/logos`, {
      method: 'POST',
      headers: mpHeaders,
      body: multipartBody(BOUNDARY, { filename: 'malware.exe', contentType: 'application/octet-stream', bytes: PNG }),
    })
    assert.equal(res.status, 400)

    // Empty file.
    res = await fetch(`${base}/api/logos`, {
      method: 'POST',
      headers: mpHeaders,
      body: multipartBody(BOUNDARY, { filename: 'blank.png', contentType: 'image/png', bytes: Buffer.alloc(0) }),
    })
    assert.equal(res.status, 400)

    // Oversized (just over the 5 MiB cap).
    res = await fetch(`${base}/api/logos?name=huge.png`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.alloc(5 * 1024 * 1024 + 1, 7),
    })
    assert.equal(res.status, 413)

    // Nothing was persisted by any of the rejected uploads.
    assert.deepEqual((await (await fetch(`${base}/api/logos`)).json()).logos, [])
  })
})

test('logos: filename path traversal is neutralized to a basename', async () => {
  await withServer(async ({ base }) => {
    // Upload declaring a traversal path; only the basename survives.
    const res = await fetch(`${base}/api/logos?name=${encodeURIComponent('../../escape.png')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: PNG,
    })
    assert.equal(res.status, 201)
    assert.equal((await res.json()).name, 'escape.png')

    // A traversal GET can't reach outside data/logos — the basename doesn't exist.
    assert.equal((await fetch(`${base}/logos/${encodeURIComponent('../../secret.png')}`)).status, 404)
  })
})
