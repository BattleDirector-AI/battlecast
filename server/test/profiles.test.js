import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withServer } from './helpers.js'

const putJson = (base, name, obj) =>
  fetch(`${base}/api/profiles/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  })

test('profiles: a saved profile round-trips byte-for-byte', async () => {
  await withServer(async ({ base }) => {
    let res = await fetch(`${base}/api/profiles`)
    assert.equal(res.status, 200)
    assert.deepEqual((await res.json()).profiles, [])

    const profile = {
      configVersion: '1',
      name: 'race',
      widgets: { tower: { visible: true, x: 24, y: 24, w: 360, h: 900, z: 1 } },
      logoRotation: { images: ['/logos/a.png'], perSlotSeconds: 6, order: 'sequential' },
    }

    res = await putJson(base, 'race', profile)
    assert.equal(res.status, 201, 'first write is a create')

    res = await fetch(`${base}/api/profiles`)
    assert.deepEqual((await res.json()).profiles, ['race'])

    res = await fetch(`${base}/api/profiles/race`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), profile, 'read equals what was written')

    res = await putJson(base, 'race', profile)
    assert.equal(res.status, 200, 'second write is an update')
  })
})

test('profiles: lists multiple names sorted', async () => {
  await withServer(async ({ base }) => {
    await putJson(base, 'zebra', { configVersion: '1' })
    await putJson(base, 'alpha', { configVersion: '1' })
    const res = await fetch(`${base}/api/profiles`)
    assert.deepEqual((await res.json()).profiles, ['alpha', 'zebra'])
  })
})

test('profiles: rejects missing, bad names, and bad bodies', async () => {
  await withServer(async ({ base }) => {
    assert.equal((await fetch(`${base}/api/profiles/ghost`)).status, 404)

    // Path-traversal-ish and illegal names are 400, never touch disk.
    assert.equal((await putJson(base, 'bad..name', { configVersion: '1' })).status, 400)
    assert.equal((await putJson(base, 'has%2Fslash', { configVersion: '1' })).status, 400)

    // Non-JSON and non-object bodies are 400.
    let res = await fetch(`${base}/api/profiles/ok`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json at all',
    })
    assert.equal(res.status, 400)

    res = await fetch(`${base}/api/profiles/ok`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '[]',
    })
    assert.equal(res.status, 400, 'array body rejected')

    // A rejected write leaves nothing behind.
    assert.deepEqual((await (await fetch(`${base}/api/profiles`)).json()).profiles, [])
  })
})

test('profiles: unsupported method is 405', async () => {
  await withServer(async ({ base }) => {
    const res = await fetch(`${base}/api/profiles/race`, { method: 'PATCH' })
    assert.equal(res.status, 405)
  })
})

test('profiles: DELETE removes a saved profile, 404 when absent', async () => {
  await withServer(async ({ base }) => {
    // Deleting something that was never saved is a 404.
    assert.equal((await fetch(`${base}/api/profiles/ghost`, { method: 'DELETE' })).status, 404)

    await putJson(base, 'race', { configVersion: '1' })
    assert.deepEqual((await (await fetch(`${base}/api/profiles`)).json()).profiles, ['race'])

    let res = await fetch(`${base}/api/profiles/race`, { method: 'DELETE' })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { name: 'race', deleted: true })

    assert.deepEqual((await (await fetch(`${base}/api/profiles`)).json()).profiles, [])
    // Deleting again is now a 404.
    assert.equal((await fetch(`${base}/api/profiles/race`, { method: 'DELETE' })).status, 404)
  })
})

test('profiles: API JSON responses are sent no-cache (#115)', async () => {
  await withServer(async ({ base }) => {
    // The config API is live state, not a cacheable asset — the browser must revalidate
    // so a Browser Source refresh picks up a just-saved profile.
    const list = await fetch(`${base}/api/profiles`)
    assert.equal(list.status, 200)
    assert.equal(list.headers.get('cache-control'), 'no-cache')

    await fetch(`${base}/api/profiles/race`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configVersion: '1', name: 'race', widgets: {} }),
    })
    const one = await fetch(`${base}/api/profiles/race`)
    assert.equal(one.headers.get('cache-control'), 'no-cache')
  })
})
