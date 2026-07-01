/* Thin client for the companion server's config/asset API (#34). The config UI is
 * the only writer of the overlay-config contract; the render pages only read. Each
 * call takes an injectable `fetchImpl` for testing. When the server isn't running
 * (pure-static deploy), `serverAvailable()` returns false and the UI degrades to
 * client-only authoring (export a config.json to commit). */

function resolveFetch(fetchImpl) {
  return fetchImpl || (typeof globalThis !== 'undefined' ? globalThis.fetch : undefined)
}

async function asJson(res, action) {
  if (!res.ok) throw new Error(`${action} failed (${res.status})`)
  return res.json()
}

/** True if the config/asset API is reachable (companion server running). */
export async function serverAvailable({ fetchImpl } = {}) {
  const doFetch = resolveFetch(fetchImpl)
  if (!doFetch) return false
  try {
    const res = await doFetch('/api/profiles')
    return res.ok
  } catch {
    return false
  }
}

export async function listProfiles({ fetchImpl } = {}) {
  const data = await asJson(await resolveFetch(fetchImpl)('/api/profiles'), 'list profiles')
  return data.profiles
}

/** Fetch a saved profile, or null if it doesn't exist. */
export async function getProfile(name, { fetchImpl } = {}) {
  const res = await resolveFetch(fetchImpl)(`/api/profiles/${encodeURIComponent(name)}`)
  if (res.status === 404) return null
  return asJson(res, 'get profile')
}

export async function saveProfile(name, config, { fetchImpl } = {}) {
  const res = await resolveFetch(fetchImpl)(`/api/profiles/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  return asJson(res, 'save profile')
}

export async function listLogos({ fetchImpl } = {}) {
  const data = await asJson(await resolveFetch(fetchImpl)('/api/logos'), 'list logos')
  return data.logos
}

/** Upload a File/Blob via multipart form-data; returns `{ name, url }`. */
export async function uploadLogo(file, { fetchImpl } = {}) {
  const form = new FormData()
  form.append('file', file, file.name)
  const res = await resolveFetch(fetchImpl)('/api/logos', { method: 'POST', body: form })
  return asJson(res, 'upload logo')
}

export async function deleteLogo(name, { fetchImpl } = {}) {
  const res = await resolveFetch(fetchImpl)(`/api/logos/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 404) throw new Error(`delete logo failed (${res.status})`)
  return res.ok
}
