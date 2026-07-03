import { describe, it, expect } from 'vitest'
import {
  serverAvailable,
  listProfiles,
  getProfile,
  saveProfile,
  listLogos,
  uploadLogo,
  deleteLogo,
  deleteProfile,
} from './configApi.js'

/** A fake fetch driven by a { 'METHOD path': {status?, json?} } route map. */
function makeFetch(routes) {
  const calls = []
  const fn = async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase()
    calls.push({ url, method, body: opts.body })
    const entry = routes[`${method} ${url}`]
    if (!entry) return { ok: false, status: 404, json: async () => ({}) }
    const status = entry.status ?? 200
    return { ok: status >= 200 && status < 300, status, json: async () => entry.json }
  }
  fn.calls = calls
  return fn
}

describe('configApi', () => {
  it('reports server availability from /api/profiles', async () => {
    expect(await serverAvailable({ fetchImpl: makeFetch({ 'GET /api/profiles': { json: { profiles: [] } } }) })).toBe(true)
    expect(await serverAvailable({ fetchImpl: async () => { throw new Error('offline') } })).toBe(false)
  })

  it('lists profiles', async () => {
    const fetchImpl = makeFetch({ 'GET /api/profiles': { json: { profiles: ['a', 'b'] } } })
    expect(await listProfiles({ fetchImpl })).toEqual(['a', 'b'])
  })

  it('returns null for a missing profile and the object for an existing one', async () => {
    const fetchImpl = makeFetch({ 'GET /api/profiles/race': { json: { configVersion: '1', name: 'race' } } })
    expect(await getProfile('race', { fetchImpl })).toMatchObject({ name: 'race' })
    expect(await getProfile('ghost', { fetchImpl })).toBeNull()
  })

  it('saves a profile via PUT with the config as JSON body', async () => {
    const fetchImpl = makeFetch({ 'PUT /api/profiles/race': { status: 201, json: { name: 'race', saved: true } } })
    const config = { configVersion: '1', name: 'race' }
    const result = await saveProfile('race', config, { fetchImpl })
    expect(result).toEqual({ name: 'race', saved: true })
    const call = fetchImpl.calls.find((c) => c.method === 'PUT')
    expect(JSON.parse(call.body)).toEqual(config)
  })

  it('deletes a profile (true when deleted, false on 404)', async () => {
    const fetchImpl = makeFetch({ 'DELETE /api/profiles/race': { json: { name: 'race', deleted: true } } })
    expect(await deleteProfile('race', { fetchImpl })).toBe(true)
    // A missing profile (404) resolves false rather than throwing.
    expect(await deleteProfile('ghost', { fetchImpl })).toBe(false)
  })

  it('lists logos and deletes them', async () => {
    const fetchImpl = makeFetch({
      'GET /api/logos': { json: { logos: [{ name: 'a.png', url: '/logos/a.png', size: 1 }] } },
      'DELETE /api/logos/a.png': { json: { name: 'a.png', deleted: true } },
    })
    expect(await listLogos({ fetchImpl })).toHaveLength(1)
    expect(await deleteLogo('a.png', { fetchImpl })).toBe(true)
  })

  it('uploads a logo as multipart form-data', async () => {
    const fetchImpl = makeFetch({ 'POST /api/logos': { status: 201, json: { name: 'logo.png', url: '/logos/logo.png' } } })
    const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })
    const result = await uploadLogo(file, { fetchImpl })
    expect(result).toEqual({ name: 'logo.png', url: '/logos/logo.png' })
    const call = fetchImpl.calls.find((c) => c.method === 'POST')
    expect(call.body).toBeInstanceOf(FormData)
  })

  it('throws on a server error status', async () => {
    const fetchImpl = makeFetch({ 'GET /api/profiles': { status: 500, json: {} } })
    await expect(listProfiles({ fetchImpl })).rejects.toThrow(/list profiles failed/)
  })
})
